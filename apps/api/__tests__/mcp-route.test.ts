import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 10: the customer-facing MCP gateway is the only endpoint in this system
// that a person outside the operator's own organization is ever handed
// credentials for. What these tests protect is therefore not "does it work" but
// "can it be talked out of its tenancy" — an LLM sits on the other end of this
// connection and will send whatever its user, or a prompt injection in a page
// it read, asks it to.
//
// Same `vi.hoisted()` + `vi.mock` structure as `internal-routes.test.ts`.
const state = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  return {
    env: { N8N_INTERNAL_SECRET: "internal-secret" as string | undefined },
    rows: {} as Record<string, Row[]>,
    inserts: [] as Array<{ table: string; payload: Row }>,
    updates: [] as Array<{ table: string; payload: Row }>,
    // Every self-call the gateway makes to `/internal/*`.
    calls: [] as Array<{
      body: Record<string, unknown> | null;
      headers: Record<string, string>;
      method: string;
      url: string;
    }>,
    // What the next self-call should resolve with.
    nextResponse: {
      status: 200,
      body: {} as unknown,
    },
  };
});

vi.mock("@/env", () => ({ env: state.env }));

// Same in-memory PostgREST stand-in as internal-routes.test.ts, trimmed to the
// two tables this route touches.
vi.mock("@repo/database", () => {
  const makeBuilder = (table: string) => {
    const filters: [string, unknown][] = [];
    let writePayload: Record<string, unknown> | null = null;
    let mode: "read" | "insert" | "update" = "read";

    const matched = (): Record<string, unknown>[] =>
      (state.rows[table] ?? []).filter((row) =>
        filters.every(([col, val]) => row[col] === val)
      );

    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;

    builder.select = passthrough;
    builder.order = passthrough;
    builder.returns = passthrough;
    builder.limit = passthrough;
    builder.eq = (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    };
    builder.insert = (payload: Record<string, unknown>) => {
      mode = "insert";
      writePayload = payload;
      state.inserts.push({ table, payload });
      // Reflect the insert into the in-memory rows so a follow-up read in the
      // same test sees it, the way the real table would.
      state.rows[table] = [...(state.rows[table] ?? []), { ...payload }];
      return builder;
    };
    builder.update = (payload: Record<string, unknown>) => {
      mode = "update";
      writePayload = payload;
      state.updates.push({ table, payload });
      const [first] = matched();
      if (first) {
        Object.assign(first, payload);
      }
      return builder;
    };
    builder.maybeSingle = () => {
      if (mode === "insert") {
        return Promise.resolve({
          data: { id: `${table}-new`, ...(writePayload ?? {}) },
          error: null,
        });
      }
      return Promise.resolve({ data: matched()[0] ?? null, error: null });
    };
    builder.single = builder.maybeSingle;
    builder.then = (
      resolve: (value: { data: unknown; error: null }) => unknown
    ) => resolve({ data: matched(), error: null });

    return builder;
  };

  return { database: { from: vi.fn((table: string) => makeBuilder(table)) } };
});

// `@repo/workflows`' barrel reaches `@repo/ai-engine`, which is `server-only`
// and cannot be imported into a test environment — the same reason
// `internal-routes.test.ts` mocks this package wholesale. Here the three
// functions this route actually uses are wired to their *real* leaf modules,
// so the hashing and period arithmetic under test are the genuine ones.
vi.mock("@repo/workflows", async () => {
  const apiKeys = await vi.importActual<
    typeof import("../../../packages/workflows/api-keys")
  >("../../../packages/workflows/api-keys");
  const billing = await vi.importActual<
    typeof import("../../../packages/workflows/billing")
  >("../../../packages/workflows/billing");

  return {
    generateApiKey: apiKeys.generateApiKey,
    hashApiKey: apiKeys.hashApiKey,
    isApiKeyShape: apiKeys.isApiKeyShape,
    currentPeriodBounds: billing.currentPeriodBounds,
  };
});

// Imported after the mocks above.
import { hashApiKey } from "@repo/workflows";
import { POST as mcpPost } from "../app/mcp/route";

const VALID_KEY = `qr_live_${"a".repeat(32)}`;
const REVOKED_KEY = `qr_live_${"b".repeat(32)}`;
const UNKNOWN_KEY = `qr_live_${"c".repeat(32)}`;
const UNCAPPED_KEY = `qr_live_${"d".repeat(32)}`;

const ORG = "org-1";
const OTHER_ORG = "org-2";
const CREATOR = "user-1";

// The 2025-era stateless leg of `createMcpHandler` answers a bare JSON-RPC POST
// per request, which is what a serverless deployment needs and what this route
// is built on.
const rpc = (
  method: string,
  params: Record<string, unknown> = {},
  key: string | null = VALID_KEY
): Request =>
  new Request("https://api.example.com/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

// Streamable HTTP may answer with either JSON or an SSE frame; unwrap both.
const readRpc = async (
  response: Response
): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  if (text.startsWith("event:") || text.includes("\ndata: ")) {
    const line = text.split("\n").find((l) => l.startsWith("data: "));
    return line ? JSON.parse(line.slice("data: ".length)) : {};
  }
  return JSON.parse(text);
};

const callTool = async (
  name: string,
  args: Record<string, unknown> = {},
  key = VALID_KEY
) => readRpc(await mcpPost(rpc("tools/call", { name, arguments: args }, key)));

beforeEach(() => {
  vi.clearAllMocks();
  state.env.N8N_INTERNAL_SECRET = "internal-secret";
  state.inserts.length = 0;
  state.updates.length = 0;
  state.calls.length = 0;
  state.nextResponse = { status: 200, body: { ok: true } };

  state.rows = {
    api_keys: [
      {
        id: "key-1",
        organization_id: ORG,
        created_by: CREATOR,
        key_hash: hashApiKey(VALID_KEY),
        monthly_call_limit: 5,
        revoked_at: null,
      },
      {
        id: "key-revoked",
        organization_id: ORG,
        created_by: CREATOR,
        key_hash: hashApiKey(REVOKED_KEY),
        monthly_call_limit: null,
        revoked_at: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "key-uncapped",
        organization_id: OTHER_ORG,
        created_by: "user-2",
        key_hash: hashApiKey(UNCAPPED_KEY),
        monthly_call_limit: null,
        revoked_at: null,
      },
    ],
    mcp_usage_counters: [],
  };

  // Stand in for the loopback call to `/internal/*`, recording exactly what the
  // gateway sent so the assertions below can inspect the org it chose.
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      state.calls.push({
        url,
        method: init?.method ?? "GET",
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      return Promise.resolve(
        new Response(JSON.stringify(state.nextResponse.body), {
          status: state.nextResponse.status,
          headers: { "content-type": "application/json" },
        })
      );
    })
  );
});

describe("authentication", () => {
  it.each([
    ["no Authorization header at all", null],
    ["a key that doesn't exist", UNKNOWN_KEY],
    ["a revoked key", REVOKED_KEY],
  ])("rejects %s with 401 and dispatches nothing", async (_label, key) => {
    const response = await mcpPost(
      rpc("tools/call", { name: "list_sites" }, key)
    );

    expect(response.status).toBe(401);
    // The critical half: no internal call was made, so nothing was read or
    // mutated on any tenant's behalf.
    expect(state.calls).toHaveLength(0);
  });

  it.each([
    ["a non-bearer scheme", "Basic abc123"],
    ["a bearer token of the wrong shape", "Bearer not-a-quillrun-key"],
    [
      "a key with the right prefix but wrong length",
      `Bearer qr_live_${"a".repeat(10)}`,
    ],
    ["a key with non-hex characters", `Bearer qr_live_${"z".repeat(32)}`],
  ])("rejects %s with 401", async (_label, header) => {
    const response = await mcpPost(
      new Request("https://api.example.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: header,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_sites" },
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });

  it("does not distinguish an unknown key from a revoked one", async () => {
    const unknown = await mcpPost(rpc("tools/list", {}, UNKNOWN_KEY));
    const revoked = await mcpPost(rpc("tools/list", {}, REVOKED_KEY));

    // A difference here would be an oracle telling an attacker whether a
    // leaked key was ever real.
    expect(unknown.status).toBe(revoked.status);
    expect(await unknown.text()).toBe(await revoked.text());
  });

  it("never queries the database with the plaintext key", async () => {
    await mcpPost(rpc("tools/call", { name: "list_sites" }));

    const { database } = await import("@repo/database");
    const calls = (database.from as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([table]) => table === "api_keys")).toBe(true);
    // The lookup is by hash; the secret itself must never appear in a filter.
    expect(JSON.stringify(calls)).not.toContain(VALID_KEY);
  });
});

describe("tool schemas", () => {
  it("exposes all 11 tools", async () => {
    const body = await readRpc(await mcpPost(rpc("tools/list")));
    const tools = (body.result as { tools: { name: string }[] }).tools;

    expect(tools).toHaveLength(11);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_schedule",
      "delete_schedule",
      "dismiss_recommendation",
      "generate_content",
      "get_recommendations",
      "get_run_status",
      "list_posts",
      "list_schedules",
      "list_sites",
      "publish_post",
      "update_schedule",
    ]);
  });

  it("never advertises organizationId or createdBy as a parameter on any tool", async () => {
    const body = await readRpc(await mcpPost(rpc("tools/list")));
    const tools = (
      body.result as {
        tools: { inputSchema: Record<string, unknown>; name: string }[];
      }
    ).tools;

    expect(tools.length).toBeGreaterThan(0);

    for (const tool of tools) {
      const properties = (tool.inputSchema?.properties ?? {}) as Record<
        string,
        unknown
      >;
      // If either of these ever appears, an AI client gains a parameter it can
      // be persuaded to fill in with another tenant's id.
      expect(Object.keys(properties)).not.toContain("organizationId");
      expect(Object.keys(properties)).not.toContain("createdBy");
      expect(JSON.stringify(tool.inputSchema)).not.toContain("organizationId");
    }
  });
});

describe("tenancy", () => {
  it("sources organizationId from the API key's row, not from the request", async () => {
    await callTool("list_sites");

    expect(state.calls).toHaveLength(1);
    expect(new URL(state.calls[0].url).searchParams.get("organizationId")).toBe(
      ORG
    );
  });

  it("ignores an organizationId crafted into the tool arguments", async () => {
    await callTool("list_sites", { organizationId: OTHER_ORG });

    expect(state.calls).toHaveLength(1);
    const sent = new URL(state.calls[0].url).searchParams.get("organizationId");
    expect(sent).toBe(ORG);
    expect(sent).not.toBe(OTHER_ORG);
  });

  it("ignores a crafted organizationId on a mutating tool too", async () => {
    await callTool("publish_post", {
      postId: "post-1",
      organizationId: OTHER_ORG,
    });

    expect(state.calls[0].body?.organizationId).toBe(ORG);
  });

  it("ignores a crafted createdBy and uses the key's own creator", async () => {
    await callTool("generate_content", {
      siteConnectionId: "site-1",
      topicHint: "coffee",
      createdBy: "attacker-uuid",
    });

    expect(state.calls[0].body?.createdBy).toBe(CREATOR);
    expect(state.calls[0].body?.organizationId).toBe(ORG);
  });

  it("scopes a second key to its own organization", async () => {
    await callTool("list_sites", {}, UNCAPPED_KEY);

    expect(new URL(state.calls[0].url).searchParams.get("organizationId")).toBe(
      OTHER_ORG
    );
  });
});

describe("audit attribution headers", () => {
  it("sends x-mcp-source and x-mcp-actor on every self-call", async () => {
    await callTool("publish_post", { postId: "post-1" });

    expect(state.calls[0].headers["x-mcp-source"]).toBe("customer_mcp");
    expect(state.calls[0].headers["x-mcp-actor"]).toBe(CREATOR);
  });

  it("authenticates its self-call with the internal secret", async () => {
    await callTool("list_sites");

    expect(state.calls[0].headers.authorization).toBe("Bearer internal-secret");
  });
});

describe("error relay", () => {
  it("surfaces a guardrail block as a tool-level error carrying the route's reason", async () => {
    state.nextResponse = {
      status: 409,
      body: { status: "blocked", reason: "This site is paused." },
    };

    const body = await callTool("generate_content", {
      siteConnectionId: "site-1",
      topicHint: "coffee",
    });

    const result = body.result as {
      content: { text: string }[];
      isError: boolean;
    };
    // A tool-level error, not a JSON-RPC error and not a thrown exception —
    // the AI client has to be able to read and relay *why* it was blocked.
    expect(body.error).toBeUndefined();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("This site is paused.");
  });

  it("surfaces a 404 with the route's own error text", async () => {
    state.nextResponse = {
      status: 404,
      body: { error: "Post not found for this organization." },
    };

    const body = await callTool("publish_post", { postId: "nope" });
    const result = body.result as {
      content: { text: string }[];
      isError: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Post not found for this organization."
    );
  });

  it("returns a successful body as a non-error tool result", async () => {
    state.nextResponse = { status: 200, body: { sites: [{ id: "site-1" }] } };

    const body = await callTool("list_sites");
    const result = body.result as {
      content: { text: string }[];
      isError?: boolean;
    };

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({
      sites: [{ id: "site-1" }],
    });
  });
});

describe("monthly call limit", () => {
  it("counts every call, reads included", async () => {
    await callTool("list_sites");

    expect(state.inserts).toContainEqual(
      expect.objectContaining({
        table: "mcp_usage_counters",
        payload: expect.objectContaining({
          api_key_id: "key-1",
          organization_id: ORG,
          calls_count: 1,
        }),
      })
    );
  });

  it("increments an existing counter rather than inserting a second row", async () => {
    state.rows.mcp_usage_counters = [
      {
        id: "counter-1",
        api_key_id: "key-1",
        organization_id: ORG,
        period_start: new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
        ).toISOString(),
        calls_count: 2,
      },
    ];

    await callTool("list_sites");

    expect(
      state.inserts.filter((i) => i.table === "mcp_usage_counters")
    ).toHaveLength(0);
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        table: "mcp_usage_counters",
        payload: { calls_count: 3 },
      })
    );
  });

  it("refuses a key that has reached its cap, before any tool is dispatched", async () => {
    state.rows.mcp_usage_counters = [
      {
        id: "counter-1",
        api_key_id: "key-1",
        organization_id: ORG,
        period_start: new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
        ).toISOString(),
        calls_count: 5,
      },
    ];

    const response = await mcpPost(rpc("tools/call", { name: "list_sites" }));

    expect(response.status).toBe(429);
    // The whole point of a cost cap: nothing was spent.
    expect(state.calls).toHaveLength(0);
  });

  it("does not let calls_count climb past the cap once it is reached", async () => {
    const periodStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    ).toISOString();
    state.rows.mcp_usage_counters = [
      {
        id: "counter-1",
        api_key_id: "key-1",
        organization_id: ORG,
        period_start: periodStart,
        calls_count: 5,
      },
    ];

    await mcpPost(rpc("tools/call", { name: "list_sites" }));
    await mcpPost(rpc("tools/call", { name: "list_sites" }));

    expect(
      state.updates.filter((u) => u.table === "mcp_usage_counters")
    ).toHaveLength(0);
    expect(state.rows.mcp_usage_counters[0].calls_count).toBe(5);
  });

  it("explains the limit in the refusal so the customer can act on it", async () => {
    state.rows.mcp_usage_counters = [
      {
        id: "counter-1",
        api_key_id: "key-1",
        organization_id: ORG,
        period_start: new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
        ).toISOString(),
        calls_count: 5,
      },
    ];

    const body = await readRpc(
      await mcpPost(rpc("tools/call", { name: "list_sites" }))
    );

    expect((body.error as { message: string }).message).toContain("5/5");
  });

  it("never blocks a key with no cap set, however many calls it has made", async () => {
    state.rows.mcp_usage_counters = [
      {
        id: "counter-2",
        api_key_id: "key-uncapped",
        organization_id: OTHER_ORG,
        period_start: new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
        ).toISOString(),
        calls_count: 999_999,
      },
    ];

    const body = await callTool("list_sites", {}, UNCAPPED_KEY);

    expect(body.error).toBeUndefined();
    expect(state.calls).toHaveLength(1);
    // Still counted, so the dashboard can show usage for an uncapped key.
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        table: "mcp_usage_counters",
        payload: { calls_count: 1_000_000 },
      })
    );
  });

  it("records last_used_at on a successful authentication", async () => {
    await callTool("list_sites");

    expect(state.updates).toContainEqual(
      expect.objectContaining({
        table: "api_keys",
        payload: expect.objectContaining({
          last_used_at: expect.any(String),
        }),
      })
    );
  });
});
