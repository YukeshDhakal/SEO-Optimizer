import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit-tests the dispatcher's app-level branching (skip when paused at the
// tenant or site level, still advance next_run_at either way, start a
// workflow run only when neither is paused) — not Supabase's own
// enabled/next_run_at filtering, which is a SQL concern the mocked
// `schedules` query result stands in for as "already due".
//
// `vi.mock` factories are hoisted above every top-level statement in this
// file (including `const`/`let` declarations) *and* run as soon as the
// static `import { GET } from "..."` below resolves its own module graph —
// which happens before any of this file's own top-level body code runs, not
// just before its textual position. So every value a factory closes over,
// including mutable per-test fixture state, has to live inside a single
// `vi.hoisted()` call rather than a plain top-level `const`/`let`.
const state = vi.hoisted(() => {
  interface FixtureSchedule {
    id: string;
    organization_id: string;
    site_connection_id: string;
    cadence: string;
    timezone: string;
    topic_hint: string;
    created_by: string;
    site_connections: { paused: boolean } | null;
  }

  return {
    startMock: vi.fn(() =>
      Promise.resolve({ returnValue: Promise.resolve({}) })
    ),
    computeNextRunAtMock: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")),
    // Phase 5: `checkRateLimit`/`writeAuditLog` come from `@repo/workflows`
    // just like `computeNextRunAt` — mocked at that boundary rather than
    // re-deriving their own DB-query behavior here, which
    // `guardrails.test.ts` already covers directly.
    checkRateLimitMock: vi.fn(() => Promise.resolve({ blocked: false })),
    writeAuditLogMock: vi.fn(() => Promise.resolve()),
    dueSchedules: [] as FixtureSchedule[],
    tenantPausedByOrg: {} as Record<string, boolean>,
    scheduleUpdates: [] as Array<{ id: string }>,
  };
});

// The real `@/env` runs full `@t3-oss/env-nextjs` validation across every
// `@repo/*` package's env schema (NEXT_PUBLIC_APP_URL etc.) — unrelated to
// this route, and unset in this test environment. Stub it rather than
// require a full `.env` for a unit test of pure branching logic.
vi.mock("@/env", () => ({ env: { CRON_SECRET: undefined } }));

vi.mock("workflow/api", () => ({ start: state.startMock }));
vi.mock("@repo/workflows", () => ({
  contentPipelineWorkflow: {},
  computeNextRunAt: state.computeNextRunAtMock,
  checkRateLimit: state.checkRateLimitMock,
  writeAuditLog: state.writeAuditLogMock,
}));

vi.mock("@repo/database", () => {
  const makeBuilder = (table: string) => {
    const context: { orgId?: string } = {};
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      vi.fn((...args: unknown[]) => {
        if (table === "tenant_settings" && method === "eq") {
          context.orgId = args[1] as string;
        }
        if (table === "schedules" && method === "eq" && args[0] === "id") {
          state.scheduleUpdates.push({ id: args[1] as string });
        }
        return builder;
      });
    for (const method of ["select", "eq", "update", "lte"]) {
      builder[method] = chain(method);
    }
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: { paused: state.tenantPausedByOrg[context.orgId ?? ""] ?? false },
        error: null,
      })
    );
    builder.returns = vi.fn(() => builder);
    builder.then = (
      resolve: (value: { data: unknown; error: null }) => unknown
    ) => resolve({ data: table === "schedules" ? state.dueSchedules : null, error: null });
    return builder;
  };

  return { database: { from: vi.fn((table: string) => makeBuilder(table)) } };
});

// Imported after the mocks above.
import { GET } from "../app/cron/dispatch-runs/route";

const schedule = (overrides: Partial<(typeof state.dueSchedules)[number]>) => ({
  id: "sched-1",
  organization_id: "org-1",
  site_connection_id: "site-1",
  cadence: "0 9 * * *",
  timezone: "UTC",
  topic_hint: "coffee gear",
  created_by: "user-1",
  site_connections: { paused: false },
  ...overrides,
});

const originalEmergencyStop = process.env.EMERGENCY_STOP;

beforeEach(() => {
  vi.clearAllMocks();
  state.dueSchedules = [];
  state.tenantPausedByOrg = {};
  state.scheduleUpdates.length = 0;
  state.checkRateLimitMock.mockResolvedValue({ blocked: false });
  delete process.env.EMERGENCY_STOP;
});

afterEach(() => {
  if (originalEmergencyStop === undefined) {
    delete process.env.EMERGENCY_STOP;
  } else {
    process.env.EMERGENCY_STOP = originalEmergencyStop;
  }
});

describe("dispatch-runs cron route", () => {
  it("starts a workflow run for a due, unpaused schedule and advances next_run_at", async () => {
    state.dueSchedules = [schedule({})];

    const response = await GET(new Request("https://example.com/cron/dispatch-runs"));
    const body = await response.json();

    expect(state.startMock).toHaveBeenCalledTimes(1);
    expect(body.results).toEqual([{ scheduleId: "sched-1", action: "started" }]);
    expect(state.scheduleUpdates).toEqual([{ id: "sched-1" }]);
  });

  it("skips a schedule whose organization has tenant_settings.paused = true, but still advances next_run_at", async () => {
    state.dueSchedules = [schedule({ organization_id: "org-paused" })];
    state.tenantPausedByOrg["org-paused"] = true;

    const response = await GET(new Request("https://example.com/cron/dispatch-runs"));
    const body = await response.json();

    expect(state.startMock).not.toHaveBeenCalled();
    expect(body.results).toEqual([
      { scheduleId: "sched-1", action: "skipped:tenant_paused" },
    ]);
    expect(state.scheduleUpdates).toEqual([{ id: "sched-1" }]);
  });

  it("skips a schedule whose site_connection is paused, but still advances next_run_at", async () => {
    state.dueSchedules = [schedule({ site_connections: { paused: true } })];

    const response = await GET(new Request("https://example.com/cron/dispatch-runs"));
    const body = await response.json();

    expect(state.startMock).not.toHaveBeenCalled();
    expect(body.results).toEqual([
      { scheduleId: "sched-1", action: "skipped:site_paused" },
    ]);
    expect(state.scheduleUpdates).toEqual([{ id: "sched-1" }]);
  });

  it("processes multiple due schedules independently", async () => {
    state.dueSchedules = [
      schedule({ id: "sched-a", organization_id: "org-a" }),
      schedule({ id: "sched-b", organization_id: "org-paused" }),
    ];
    state.tenantPausedByOrg["org-paused"] = true;

    const response = await GET(new Request("https://example.com/cron/dispatch-runs"));
    const body = await response.json();

    expect(state.startMock).toHaveBeenCalledTimes(1);
    expect(body.checked).toBe(2);
    expect(body.results).toEqual([
      { scheduleId: "sched-a", action: "started" },
      { scheduleId: "sched-b", action: "skipped:tenant_paused" },
    ]);
  });

  it("short-circuits entirely when EMERGENCY_STOP is set, without querying schedules at all", async () => {
    process.env.EMERGENCY_STOP = "true";
    state.dueSchedules = [schedule({})]; // present but must never be reached

    const response = await GET(new Request("https://example.com/cron/dispatch-runs"));
    const body = await response.json();

    expect(state.startMock).not.toHaveBeenCalled();
    expect(body.checked).toBe(0);
    expect(body.skipped).toBe("emergency_stop");
  });

  it("skips a schedule that would exceed its organization's rate limit, but still advances next_run_at", async () => {
    state.dueSchedules = [schedule({})];
    state.checkRateLimitMock.mockResolvedValue({
      blocked: true,
      reason: "Daily post limit reached (5/day).",
    });

    const response = await GET(new Request("https://example.com/cron/dispatch-runs"));
    const body = await response.json();

    expect(state.startMock).not.toHaveBeenCalled();
    expect(body.results).toEqual([
      { scheduleId: "sched-1", action: "skipped:rate_limited" },
    ]);
    expect(state.scheduleUpdates).toEqual([{ id: "sched-1" }]);
  });
});
