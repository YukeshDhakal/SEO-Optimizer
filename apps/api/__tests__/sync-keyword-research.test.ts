import { beforeEach, describe, expect, it, vi } from "vitest";

// Same reasoning as sync-search-console.test.ts: stub `@/env` rather than
// require a full `.env` for a unit test of pure branching logic, and hoist
// all mutable fixture state since `vi.mock` factories run before this
// file's own top-level body.
const state = vi.hoisted(() => ({
  connectedRows: [] as {
    site_connection_id: string;
    google_ads_customer_id: string | null;
  }[],
  gscQueriesBySite: {} as Record<string, { query: string }[]>,
  secretsBySite: {} as Record<
    string,
    { accessToken: string; refreshToken: string; expiresAt: number } | undefined
  >,
  deletedSites: [] as string[],
  insertedRows: [] as Record<string, unknown>[],
  erroredSites: [] as string[],
  generateKeywordHistoricalMetricsMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { CRON_SECRET: undefined } }));

vi.mock("@repo/google-ads", () => ({
  generateKeywordHistoricalMetrics: state.generateKeywordHistoricalMetricsMock,
  refreshAccessToken: state.refreshAccessTokenMock,
}));

vi.mock("@repo/database", () => {
  const makeBuilder = (table: string) => {
    const ctx: {
      siteId?: string;
      pendingUpdate?: Record<string, unknown>;
      pendingDelete?: boolean;
    } = {};
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
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
    // once `.eq` runs — committed here, not in update()/delete() themselves.
    builder.eq = vi.fn((column: string, value: string) => {
      if (column === "site_connection_id") {
        ctx.siteId = value;
      }
      if (ctx.pendingDelete && table === "keyword_research" && ctx.siteId) {
        state.deletedSites.push(ctx.siteId);
        ctx.pendingDelete = false;
      }
      if (
        ctx.pendingUpdate &&
        table === "google_ads_credentials" &&
        ctx.siteId
      ) {
        if (ctx.pendingUpdate.status === "error") {
          state.erroredSites.push(ctx.siteId);
        }
        ctx.pendingUpdate = undefined;
      }
      return builder;
    });
    builder.then = (
      resolve: (v: { data: unknown; error: null }) => unknown
    ) => {
      if (table === "google_ads_credentials") {
        return resolve({ data: state.connectedRows, error: null });
      }
      if (table === "search_console_queries") {
        return resolve({
          data: state.gscQueriesBySite[ctx.siteId ?? ""] ?? [],
          error: null,
        });
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
        if (name === "get_google_ads_credentials_for_sync") {
          return Promise.resolve({
            data: state.secretsBySite[siteId] ?? null,
            error: null,
          });
        }
        if (name === "set_google_ads_credentials_for_sync") {
          state.secretsBySite[siteId] =
            args.p_secret as (typeof state.secretsBySite)[string];
          return Promise.resolve({ data: "credentials-id", error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

// Imported after the mocks above.
import { GET } from "../app/cron/sync-keyword-research/route";

const request = () =>
  new Request("https://example.com/cron/sync-keyword-research");

beforeEach(() => {
  vi.clearAllMocks();
  state.connectedRows = [];
  state.gscQueriesBySite = {};
  state.secretsBySite = {};
  state.deletedSites = [];
  state.insertedRows = [];
  state.erroredSites = [];
  state.generateKeywordHistoricalMetricsMock.mockResolvedValue([
    {
      keyword: "best coffee grinder",
      avgMonthlySearches: 8100,
      competition: "MEDIUM",
      competitionIndex: 42,
    },
  ]);
  state.refreshAccessTokenMock.mockResolvedValue({
    accessToken: "refreshed-access",
    expiresAt: Date.now() + 3_600_000,
  });
});

describe("GET /cron/sync-keyword-research", () => {
  it("syncs a connected site with a still-valid token, replacing its keyword cache", async () => {
    state.connectedRows = [
      { site_connection_id: "site-1", google_ads_customer_id: "1234567890" },
    ];
    state.gscQueriesBySite["site-1"] = [{ query: "best coffee grinder" }];
    state.secretsBySite["site-1"] = {
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: Date.now() + 3_600_000, // not expired
    };

    const response = await GET(request());
    const body = await response.json();

    expect(state.refreshAccessTokenMock).not.toHaveBeenCalled();
    expect(state.generateKeywordHistoricalMetricsMock).toHaveBeenCalledWith(
      "access-1",
      expect.objectContaining({
        customerId: "1234567890",
        keywords: ["best coffee grinder"],
      })
    );
    expect(state.deletedSites).toEqual(["site-1"]);
    expect(state.insertedRows).toEqual([
      expect.objectContaining({
        site_connection_id: "site-1",
        keyword: "best coffee grinder",
        avg_monthly_searches: 8100,
      }),
    ]);
    expect(body).toEqual({
      checked: 1,
      results: [{ siteConnectionId: "site-1", action: "synced" }],
    });
  });

  it("refreshes an expired access token before querying, and persists the refreshed token", async () => {
    state.connectedRows = [
      { site_connection_id: "site-1", google_ads_customer_id: "1234567890" },
    ];
    state.gscQueriesBySite["site-1"] = [{ query: "best coffee grinder" }];
    state.secretsBySite["site-1"] = {
      accessToken: "stale-access",
      refreshToken: "refresh-1",
      expiresAt: Date.now() - 1000, // already expired
    };

    await GET(request());

    expect(state.refreshAccessTokenMock).toHaveBeenCalledWith("refresh-1");
    expect(state.generateKeywordHistoricalMetricsMock).toHaveBeenCalledWith(
      "refreshed-access",
      expect.anything()
    );
    expect(state.secretsBySite["site-1"]?.accessToken).toBe("refreshed-access");
  });

  it("skips a connected row with no google_ads_customer_id chosen yet", async () => {
    state.connectedRows = [
      { site_connection_id: "site-1", google_ads_customer_id: null },
    ];

    const response = await GET(request());
    const body = await response.json();

    expect(state.generateKeywordHistoricalMetricsMock).not.toHaveBeenCalled();
    expect(body.results).toEqual([
      { siteConnectionId: "site-1", action: "skipped:no_account" },
    ]);
  });

  it("skips a site with no cached GSC queries yet (keyword universe empty)", async () => {
    state.connectedRows = [
      { site_connection_id: "site-1", google_ads_customer_id: "1234567890" },
    ];
    state.gscQueriesBySite["site-1"] = [];

    const response = await GET(request());
    const body = await response.json();

    expect(state.generateKeywordHistoricalMetricsMock).not.toHaveBeenCalled();
    expect(body.results).toEqual([
      { siteConnectionId: "site-1", action: "skipped:no_gsc_queries" },
    ]);
  });

  it("marks a site status='error' and continues the sweep when one site's sync throws", async () => {
    state.connectedRows = [
      { site_connection_id: "site-broken", google_ads_customer_id: "111" },
      { site_connection_id: "site-2", google_ads_customer_id: "222" },
    ];
    state.gscQueriesBySite["site-broken"] = [{ query: "broken query" }];
    state.gscQueriesBySite["site-2"] = [{ query: "ok query" }];
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
    state.generateKeywordHistoricalMetricsMock.mockImplementation(
      (token: string) => {
        if (token === "access-broken") {
          throw new Error("revoked");
        }
        return Promise.resolve([]);
      }
    );

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
    const { GET: getWithSecret } = await import(
      "../app/cron/sync-keyword-research/route"
    );

    const response = await getWithSecret(request());

    expect(response.status).toBe(401);
  });
});
