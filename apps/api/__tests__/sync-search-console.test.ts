import { beforeEach, describe, expect, it, vi } from "vitest";

// Same reasoning as dispatch-runs.test.ts: stub `@/env` rather than require
// a full `.env` for a unit test of pure branching logic, and hoist all
// mutable fixture state since `vi.mock` factories run before this file's
// own top-level body.
const state = vi.hoisted(() => ({
  connectedRows: [] as { site_connection_id: string; gsc_site_url: string | null }[],
  secretsBySite: {} as Record<
    string,
    { accessToken: string; refreshToken: string; expiresAt: number } | undefined
  >,
  deletedSites: [] as string[],
  insertedRows: [] as Record<string, unknown>[],
  erroredSites: [] as string[],
  queryTopQueriesMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { CRON_SECRET: undefined } }));

vi.mock("@repo/search-console", () => ({
  queryTopQueries: state.queryTopQueriesMock,
  refreshAccessToken: state.refreshAccessTokenMock,
}));

vi.mock("@repo/database", () => {
  const makeBuilder = (table: string) => {
    const ctx: { siteId?: string; pendingUpdate?: Record<string, unknown>; pendingDelete?: boolean } = {};
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.returns = vi.fn(() => builder); // supabase-js's `.returns<T>()` is a type-only no-op at runtime
    builder.delete = vi.fn(() => {
      ctx.pendingDelete = true;
      return builder;
    });
    builder.insert = vi.fn((rows: Record<string, unknown>[]) => {
      state.insertedRows.push(...rows);
      return builder;
    });
    builder.update = vi.fn((patch: Record<string, unknown>) => {
      ctx.pendingUpdate = patch;
      return builder;
    });
    // `.update(patch).eq(...)`/`.delete().eq(...)` both only resolve the row
    // once `.eq` runs — committed here, not in update()/delete()
    // themselves, matching the fix already applied to
    // webhooks-payments.test.ts's mock for the same reason.
    builder.eq = vi.fn((column: string, value: string) => {
      if (column === "site_connection_id") {
        ctx.siteId = value;
      }
      if (ctx.pendingDelete && table === "search_console_queries" && ctx.siteId) {
        state.deletedSites.push(ctx.siteId);
        ctx.pendingDelete = false;
      }
      if (ctx.pendingUpdate && table === "search_console_credentials" && ctx.siteId) {
        if (ctx.pendingUpdate.status === "error") {
          state.erroredSites.push(ctx.siteId);
        }
        ctx.pendingUpdate = undefined;
      }
      return builder;
    });
    builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (table === "search_console_credentials") {
        return resolve({ data: state.connectedRows, error: null });
      }
      return resolve({ data: null, error: null });
    };
    return builder;
  };

  return {
    database: {
      from: vi.fn((table: string) => makeBuilder(table)),
      rpc: vi.fn((name: string, args: Record<string, unknown>) => {
        const siteId = args.p_site_connection_id as string;
        if (name === "get_search_console_credentials_for_sync") {
          return Promise.resolve({ data: state.secretsBySite[siteId] ?? null, error: null });
        }
        if (name === "set_search_console_credentials_for_sync") {
          state.secretsBySite[siteId] = args.p_secret as (typeof state.secretsBySite)[string];
          return Promise.resolve({ data: "credentials-id", error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

// Imported after the mocks above.
import { GET } from "../app/cron/sync-search-console/route";

const request = () => new Request("https://example.com/cron/sync-search-console");

beforeEach(() => {
  vi.clearAllMocks();
  state.connectedRows = [];
  state.secretsBySite = {};
  state.deletedSites = [];
  state.insertedRows = [];
  state.erroredSites = [];
  state.queryTopQueriesMock.mockResolvedValue([
    { query: "best coffee grinder", clicks: 10, impressions: 100, ctr: 0.1, position: 3 },
  ]);
  state.refreshAccessTokenMock.mockResolvedValue({
    accessToken: "refreshed-access",
    expiresAt: Date.now() + 3_600_000,
  });
});

describe("GET /cron/sync-search-console", () => {
  it("syncs a connected site with a still-valid token, replacing its query cache", async () => {
    state.connectedRows = [{ site_connection_id: "site-1", gsc_site_url: "https://example.com/" }];
    state.secretsBySite["site-1"] = {
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: Date.now() + 3_600_000, // not expired
    };

    const response = await GET(request());
    const body = await response.json();

    expect(state.refreshAccessTokenMock).not.toHaveBeenCalled();
    expect(state.queryTopQueriesMock).toHaveBeenCalledWith(
      "access-1",
      "https://example.com/",
      expect.objectContaining({ rowLimit: 250 })
    );
    expect(state.deletedSites).toEqual(["site-1"]);
    expect(state.insertedRows).toEqual([
      expect.objectContaining({ site_connection_id: "site-1", query: "best coffee grinder" }),
    ]);
    expect(body).toEqual({ checked: 1, results: [{ siteConnectionId: "site-1", action: "synced" }] });
  });

  it("refreshes an expired access token before querying, and persists the refreshed token", async () => {
    state.connectedRows = [{ site_connection_id: "site-1", gsc_site_url: "https://example.com/" }];
    state.secretsBySite["site-1"] = {
      accessToken: "stale-access",
      refreshToken: "refresh-1",
      expiresAt: Date.now() - 1000, // already expired
    };

    await GET(request());

    expect(state.refreshAccessTokenMock).toHaveBeenCalledWith("refresh-1");
    expect(state.queryTopQueriesMock).toHaveBeenCalledWith(
      "refreshed-access",
      "https://example.com/",
      expect.anything()
    );
    expect(state.secretsBySite["site-1"]?.accessToken).toBe("refreshed-access");
  });

  it("skips a connected row with no gsc_site_url chosen yet", async () => {
    state.connectedRows = [{ site_connection_id: "site-1", gsc_site_url: null }];

    const response = await GET(request());
    const body = await response.json();

    expect(state.queryTopQueriesMock).not.toHaveBeenCalled();
    expect(body.results).toEqual([{ siteConnectionId: "site-1", action: "skipped:no_property" }]);
  });

  it("marks a site status='error' and continues the sweep when one site's sync throws", async () => {
    state.connectedRows = [
      { site_connection_id: "site-broken", gsc_site_url: "https://broken.example.com/" },
      { site_connection_id: "site-2", gsc_site_url: "https://ok.example.com/" },
    ];
    state.secretsBySite["site-broken"] = {
      accessToken: "access-broken",
      refreshToken: "refresh-broken",
      expiresAt: Date.now() + 3_600_000,
    };
    state.secretsBySite["site-2"] = {
      accessToken: "access-2",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + 3_600_000,
    };
    state.queryTopQueriesMock.mockImplementation((_token: string, siteUrl: string) => {
      if (siteUrl === "https://broken.example.com/") {
        throw new Error("revoked");
      }
      return Promise.resolve([]);
    });

    const response = await GET(request());
    const body = await response.json();

    expect(state.erroredSites).toEqual(["site-broken"]);
    expect(body.results).toEqual(
      expect.arrayContaining([
        { siteConnectionId: "site-broken", action: "error:revoked" },
        { siteConnectionId: "site-2", action: "synced" },
      ])
    );
  });

  it("rejects requests missing the bearer token when CRON_SECRET is configured", async () => {
    vi.doMock("@/env", () => ({ env: { CRON_SECRET: "secret-123" } }));
    vi.resetModules();
    const { GET: getWithSecret } = await import("../app/cron/sync-search-console/route");

    const response = await getWithSecret(request());

    expect(response.status).toBe(401);
  });
});
