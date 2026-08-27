import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same `fromMock` pattern `guardrails.test.ts` uses — independent per test
// file, tailored to this module's own query shapes (subscriptions, plans,
// usage_counters) rather than reusing guardrails' generic single-row
// builder.
const fromMock = vi.fn();
vi.mock("@repo/database", () => ({
  database: { from: (...args: unknown[]) => fromMock(...args) },
}));

// Imported after the mock above.
import { checkQuota, currentPeriodBounds, incrementUsage } from "../billing";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("currentPeriodBounds", () => {
  it("returns the first-of-month UTC boundaries for the given date", () => {
    const { periodStart, periodEnd } = currentPeriodBounds(new Date("2026-08-15T13:45:00Z"));

    expect(periodStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rolls over correctly across a year boundary", () => {
    const { periodStart, periodEnd } = currentPeriodBounds(new Date("2026-12-31T23:59:00Z"));

    expect(periodStart.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("checkQuota", () => {
  it("allows through when the organization has no subscription row at all", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await checkQuota("org-1");

    expect(result.blocked).toBe(false);
  });

  it("allows through when the subscription has no plan_id set", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { plan_id: null, status: "active" }, error: null }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await checkQuota("org-1");

    expect(result.blocked).toBe(false);
  });

  it("blocks once posts_generated reaches the plan's monthly_post_quota", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { plan_id: "plan-1", status: "active" }, error: null }) }),
          }),
        };
      }
      if (table === "plans") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { name: "Starter", monthly_post_quota: 8 }, error: null }),
            }),
          }),
        };
      }
      if (table === "usage_counters") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { posts_generated: 8 }, error: null }) }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await checkQuota("org-1");

    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/8\/8/);
    expect(result.reason).toMatch(/Starter/);
  });

  it("does not block when usage is under the plan's quota", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { plan_id: "plan-1", status: "active" }, error: null }) }),
          }),
        };
      }
      if (table === "plans") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { name: "Growth", monthly_post_quota: 30 }, error: null }),
            }),
          }),
        };
      }
      if (table === "usage_counters") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { posts_generated: 3 }, error: null }) }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await checkQuota("org-1");

    expect(result.blocked).toBe(false);
  });

  it("treats no usage_counters row yet this period as zero used, not blocked", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { plan_id: "plan-1", status: "active" }, error: null }) }),
          }),
        };
      }
      if (table === "plans") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { name: "Starter", monthly_post_quota: 8 }, error: null }),
            }),
          }),
        };
      }
      if (table === "usage_counters") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await checkQuota("org-1");

    expect(result.blocked).toBe(false);
  });
});

describe("incrementUsage", () => {
  it("creates a new usage_counters row when this period has none yet", async () => {
    const inserted: unknown[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table !== "usage_counters") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        }),
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    });

    await incrementUsage("org-1");

    expect(inserted).toEqual([
      expect.objectContaining({ organization_id: "org-1", posts_generated: 1 }),
    ]);
  });

  it("increments the existing row's posts_generated rather than inserting a second one", async () => {
    const updates: Array<{ id: string; patch: unknown }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table !== "usage_counters") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "row-1", posts_generated: 4 }, error: null }),
            }),
          }),
        }),
        update: (patch: unknown) => ({
          eq: (_column: string, id: string) => {
            updates.push({ id, patch });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    });

    await incrementUsage("org-1");

    expect(updates).toEqual([{ id: "row-1", patch: { posts_generated: 5 } }]);
  });
});
