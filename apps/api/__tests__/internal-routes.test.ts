import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase B: covers the two things that actually matter about these routes.
//
// 1. The auth gate is present and correct on every one of them. There are
//    eight route files behind a single shared secret; a route that forgot to
//    call `isAuthorized()` would be an unauthenticated door into a live
//    tenant's data, and nothing else in the system would notice.
// 2. `/internal/generate` runs the kill-switch → rate-limit → quota sequence
//    before `start()`, and refuses on each. That sequence is the only thing
//    standing between an external AI agent and an unbounded generation loop.
//
// Same `vi.hoisted()` + `vi.mock` structure as `dispatch-runs.test.ts` — see
// that file's comment for why every value the factories close over has to live
// inside the hoisted block.
const state = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  return {
    env: { N8N_INTERNAL_SECRET: undefined as string | undefined },
    rows: {} as Record<string, Row[]>,
    inserts: [] as Array<{ table: string; payload: Row }>,
    updates: [] as Array<{ table: string; payload: Row }>,
    deletes: [] as string[],
    guardrailOrder: [] as string[],
    startMock: vi.fn(() => Promise.resolve({ runId: "wf-run-1" })),
    writeAuditLogMock: vi.fn((_entry: Row) => Promise.resolve()),
    checkKillSwitchMock: vi.fn(
      (): Promise<{ blocked: boolean; reason?: string }> =>
        Promise.resolve({ blocked: false })
    ),
    checkRateLimitMock: vi.fn(
      (): Promise<{ blocked: boolean; reason?: string }> =>
        Promise.resolve({ blocked: false })
    ),
    checkQuotaMock: vi.fn(
      (): Promise<{ blocked: boolean; reason?: string }> =>
        Promise.resolve({ blocked: false })
    ),
    publishPostMock: vi.fn(() =>
      Promise.resolve({
        externalPostId: "ext-1",
        publishedUrl: "https://acme.ourapp.com/blog/hello",
      })
    ),
  };
});

vi.mock("@/env", () => ({ env: state.env }));

vi.mock("workflow/api", () => ({ start: state.startMock }));

vi.mock("@repo/workflows", () => ({
  contentPipelineWorkflow: {},
  writeAuditLog: state.writeAuditLogMock,
  checkKillSwitch: (...args: unknown[]) => {
    state.guardrailOrder.push("kill_switch");
    return state.checkKillSwitchMock(...(args as []));
  },
  checkRateLimit: (...args: unknown[]) => {
    state.guardrailOrder.push("rate_limit");
    return state.checkRateLimitMock(...(args as []));
  },
  checkQuota: (...args: unknown[]) => {
    state.guardrailOrder.push("quota");
    return state.checkQuotaMock(...(args as []));
  },
  computeNextRunAt: () => new Date("2026-01-01T00:00:00.000Z"),
  validateCadence: (cadence: string) => {
    if (cadence === "not-a-cron") {
      throw new Error("invalid cadence");
    }
  },
}));

// Mirrors the real registry: every CMS type in `packages/cms-adapters` has an
// adapter, so an unknown type is the only null case. That distinction matters
// for the publish route, which returns 400 for "no adapter" but 501 for
// "adapter exists, but service-role can't decrypt its credentials".
vi.mock("@repo/cms-adapters", () => ({
  getCmsAdapter: (cmsType: string) =>
    ["hosted_blog", "wordpress", "shopify", "webflow"].includes(cmsType)
      ? { id: cmsType, publishPost: state.publishPostMock }
      : null,
}));

// A small in-memory stand-in for the PostgREST builder: enough of `.eq()`
// filtering, `.limit()`, `.maybeSingle()`/`.single()` and thenable resolution
// to exercise the routes' own branching, without pretending to be Postgres.
vi.mock("@repo/database", () => {
  const makeBuilder = (table: string) => {
    const filters: [string, unknown][] = [];
    let rowLimit = Number.POSITIVE_INFINITY;
    let writePayload: Record<string, unknown> | null = null;
    let mode: "read" | "insert" | "update" | "delete" = "read";

    const matched = (): Record<string, unknown>[] =>
      (state.rows[table] ?? [])
        .filter((row) => filters.every(([col, val]) => row[col] === val))
        .slice(0, rowLimit);

    const resolveOne = (): Record<string, unknown> | null => {
      if (mode === "insert") {
        return { id: `${table}-new`, ...(writePayload ?? {}) };
      }
      const [first] = matched();
      if (!first) {
        return null;
      }
      return mode === "update" ? { ...first, ...(writePayload ?? {}) } : first;
    };

    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;

    builder.select = passthrough;
    builder.order = passthrough;
    builder.returns = passthrough;
    builder.in = passthrough;
    builder.eq = (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    };
    builder.limit = (n: number) => {
      rowLimit = n;
      return builder;
    };
    builder.insert = (payload: Record<string, unknown>) => {
      mode = "insert";
      writePayload = payload;
      state.inserts.push({ table, payload });
      return builder;
    };
    builder.update = (payload: Record<string, unknown>) => {
      mode = "update";
      writePayload = payload;
      state.updates.push({ table, payload });
      return builder;
    };
    builder.delete = () => {
      mode = "delete";
      state.deletes.push(table);
      return builder;
    };
    builder.maybeSingle = () =>
      Promise.resolve({ data: resolveOne(), error: null });
    builder.single = () => Promise.resolve({ data: resolveOne(), error: null });
    builder.then = (
      resolve: (value: { data: unknown; error: null }) => unknown
    ) =>
      resolve({
        data: mode === "read" ? matched() : resolveOne(),
        error: null,
      });

    return builder;
  };

  return { database: { from: vi.fn((table: string) => makeBuilder(table)) } };
});

// Imported after the mocks above.
import { POST as generatePost } from "../app/internal/generate/route";
import { GET as getPosts } from "../app/internal/posts/route";
import { POST as publishPost } from "../app/internal/publish/route";
import { POST as dismissRecommendation } from "../app/internal/recommendations/dismiss/route";
import { GET as getRecommendations } from "../app/internal/recommendations/route";
import { GET as getRuns } from "../app/internal/runs/route";
import {
  POST as createSchedule,
  DELETE as deleteSchedule,
  GET as getSchedules,
  PATCH as patchSchedule,
} from "../app/internal/schedules/route";
import { GET as getSites } from "../app/internal/sites/route";

const SECRET = "internal-secret";

const url = (path: string, query = "organizationId=org-1") =>
  `https://api.example.com${path}${query ? `?${query}` : ""}`;

const authed = (
  path: string,
  init: RequestInit & { query?: string } = {}
): Request => {
  const { query, ...rest } = init;
  return new Request(url(path, query ?? "organizationId=org-1"), {
    ...rest,
    headers: {
      authorization: `Bearer ${SECRET}`,
      "content-type": "application/json",
      ...(rest.headers as Record<string, string> | undefined),
    },
  });
};

const generateBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    organizationId: "org-1",
    siteConnectionId: "site-1",
    topicHint: "espresso machines",
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.env.N8N_INTERNAL_SECRET = SECRET;
  state.inserts.length = 0;
  state.updates.length = 0;
  state.deletes.length = 0;
  state.guardrailOrder.length = 0;
  state.checkKillSwitchMock.mockResolvedValue({ blocked: false });
  state.checkRateLimitMock.mockResolvedValue({ blocked: false });
  state.checkQuotaMock.mockResolvedValue({ blocked: false });
  state.publishPostMock.mockResolvedValue({
    externalPostId: "ext-1",
    publishedUrl: "https://acme.ourapp.com/blog/hello",
  });
  state.rows = {
    organizations: [{ id: "org-1", slug: "acme", status: "active" }],
    organization_members: [
      { organization_id: "org-1", user_id: "user-1", role: "owner" },
    ],
    site_connections: [
      {
        id: "site-1",
        organization_id: "org-1",
        cms_type: "hosted_blog",
        base_url: null,
        paused: false,
        status: "connected",
        consecutive_publish_failures: 0,
        display_name: "Acme blog",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    posts: [
      {
        id: "post-1",
        organization_id: "org-1",
        site_connection_id: "site-1",
        title: "Hello",
        slug: "hello",
        status: "draft",
        content_html: "<p>hi</p>",
        meta_title: null,
        meta_description: null,
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    content_recommendations: [
      {
        id: "rec-1",
        organization_id: "org-1",
        site_connection_id: "site-1",
        recommendation_type: "indexing_problem",
        subject_key: "post-1",
        status: "new",
        title: "Fix indexing",
        description: "Not indexed",
        priority: "high",
        metrics: {},
        created_at: "2026-01-03T00:00:00.000Z",
        updated_at: "2026-01-03T00:00:00.000Z",
        dismissed_at: null,
        actioned_at: null,
        post_id: "post-1",
      },
    ],
    pipeline_runs: [
      {
        id: "run-1",
        organization_id: "org-1",
        site_connection_id: "site-1",
        status: "succeeded",
        trigger_type: "manual",
        started_at: "2026-01-04T00:00:00.000Z",
        finished_at: null,
        current_step: null,
        error: null,
        input: {},
        post_id: null,
        schedule_id: null,
      },
    ],
    pipeline_run_steps: [
      {
        id: "step-1",
        pipeline_run_id: "run-1",
        step_name: "draft",
        status: "succeeded",
        output: {},
        error: null,
        started_at: "2026-01-04T00:00:01.000Z",
        finished_at: "2026-01-04T00:00:02.000Z",
      },
    ],
    schedules: [
      {
        id: "sched-1",
        organization_id: "org-1",
        site_connection_id: "site-1",
        cadence: "0 9 * * 1",
        timezone: "UTC",
        enabled: true,
        next_run_at: "2026-01-05T09:00:00.000Z",
        topic_hint: "coffee",
        topic_source: "manual",
        created_by: "user-1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
});

// Each entry is [name, handler, request-with-no-Authorization-header].
const ROUTES: [
  string,
  (request: Request) => Promise<Response>,
  () => Request,
][] = [
  ["GET /internal/sites", getSites, () => new Request(url("/internal/sites"))],
  ["GET /internal/posts", getPosts, () => new Request(url("/internal/posts"))],
  [
    "GET /internal/recommendations",
    getRecommendations,
    () => new Request(url("/internal/recommendations")),
  ],
  [
    "POST /internal/recommendations/dismiss",
    dismissRecommendation,
    () =>
      new Request(url("/internal/recommendations/dismiss", ""), {
        method: "POST",
        body: JSON.stringify({ id: "rec-1", organizationId: "org-1" }),
      }),
  ],
  [
    "POST /internal/generate",
    generatePost,
    () =>
      new Request(url("/internal/generate", ""), {
        method: "POST",
        body: generateBody(),
      }),
  ],
  ["GET /internal/runs", getRuns, () => new Request(url("/internal/runs"))],
  [
    "POST /internal/publish",
    publishPost,
    () =>
      new Request(url("/internal/publish", ""), {
        method: "POST",
        body: JSON.stringify({ organizationId: "org-1", postId: "post-1" }),
      }),
  ],
  [
    "GET /internal/schedules",
    getSchedules,
    () => new Request(url("/internal/schedules")),
  ],
  [
    "POST /internal/schedules",
    createSchedule,
    () =>
      new Request(url("/internal/schedules", ""), {
        method: "POST",
        body: JSON.stringify({
          organizationId: "org-1",
          siteConnectionId: "site-1",
          cadence: "0 9 * * 1",
          topicHint: "coffee",
        }),
      }),
  ],
  [
    "PATCH /internal/schedules",
    patchSchedule,
    () =>
      new Request(url("/internal/schedules", ""), {
        method: "PATCH",
        body: JSON.stringify({
          organizationId: "org-1",
          id: "sched-1",
          enabled: false,
        }),
      }),
  ],
  [
    "DELETE /internal/schedules",
    deleteSchedule,
    () =>
      new Request(
        url("/internal/schedules", "organizationId=org-1&id=sched-1"),
        {
          method: "DELETE",
        }
      ),
  ],
];

describe("internal route auth gate", () => {
  it.each(
    ROUTES
  )("%s rejects a request with no bearer token", async (_name, handler, makeRequest) => {
    const response = await handler(makeRequest());
    expect(response.status).toBe(401);
  });

  it.each(
    ROUTES
  )("%s rejects a request with the wrong bearer token", async (_name, handler, makeRequest) => {
    const original = makeRequest();
    const response = await handler(
      new Request(original, { headers: { authorization: "Bearer nope" } })
    );
    expect(response.status).toBe(401);
  });

  it.each(
    ROUTES
  )("%s accepts a correctly authenticated request", async (_name, handler, makeRequest) => {
    const original = makeRequest();
    const response = await handler(
      new Request(original, {
        headers: {
          authorization: `Bearer ${SECRET}`,
          "content-type": "application/json",
        },
      })
    );
    expect(response.status).not.toBe(401);
  });

  it("falls open when N8N_INTERNAL_SECRET is not configured, matching the cron routes", async () => {
    state.env.N8N_INTERNAL_SECRET = undefined;
    const response = await getSites(new Request(url("/internal/sites")));
    expect(response.status).toBe(200);
  });
});

describe("/internal/generate guardrail sequence", () => {
  it("runs kill switch, then rate limit, then quota, before starting the workflow", async () => {
    const response = await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );

    expect(response.status).toBe(202);
    expect(state.guardrailOrder).toEqual([
      "kill_switch",
      "rate_limit",
      "quota",
    ]);
    expect(state.startMock).toHaveBeenCalledTimes(1);
  });

  it("blocks on the kill switch without checking rate limit or quota, and without starting", async () => {
    state.checkKillSwitchMock.mockResolvedValue({
      blocked: true,
      reason: "This site is paused.",
    });

    const response = await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.reason).toBe("This site is paused.");
    expect(state.guardrailOrder).toEqual(["kill_switch"]);
    expect(state.startMock).not.toHaveBeenCalled();
  });

  it("blocks on the rate limit without checking quota, and without starting", async () => {
    state.checkRateLimitMock.mockResolvedValue({
      blocked: true,
      reason: "Daily post limit reached (5/day).",
    });

    const response = await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );

    expect(response.status).toBe(429);
    expect(state.guardrailOrder).toEqual(["kill_switch", "rate_limit"]);
    expect(state.startMock).not.toHaveBeenCalled();
  });

  it("blocks on quota without starting", async () => {
    state.checkQuotaMock.mockResolvedValue({
      blocked: true,
      reason: "Monthly post quota reached.",
    });

    const response = await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );

    expect(response.status).toBe(429);
    expect(state.guardrailOrder).toEqual([
      "kill_switch",
      "rate_limit",
      "quota",
    ]);
    expect(state.startMock).not.toHaveBeenCalled();
  });

  it("refuses a past_due organization even when every guardrail passes", async () => {
    state.rows.organizations = [
      { id: "org-1", slug: "acme", status: "past_due" },
    ];

    const response = await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );

    expect(response.status).toBe(402);
    expect(state.startMock).not.toHaveBeenCalled();
  });

  it("writes an audit entry with actor n8n_mcp for a blocked run", async () => {
    state.checkQuotaMock.mockResolvedValue({ blocked: true, reason: "nope" });

    await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "run.blocked.quota",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("writes an audit entry with actor n8n_mcp for a started run", async () => {
    await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "run.started",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("attributes the run to the organization's owner, since created_by is a real auth.users FK", async () => {
    await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        query: "",
      })
    );

    expect(state.startMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ createdBy: "user-1", triggerType: "manual" }),
    ]);
  });

  it("refuses a createdBy that is not a member of the organization", async () => {
    const response = await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody({ createdBy: "outsider" }),
        query: "",
      })
    );

    expect(response.status).toBe(400);
    expect(state.startMock).not.toHaveBeenCalled();
  });

  it("404s a site that belongs to another organization", async () => {
    const response = await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody({ siteConnectionId: "site-other" }),
        query: "",
      })
    );

    expect(response.status).toBe(404);
    expect(state.startMock).not.toHaveBeenCalled();
  });
});

describe("internal read routes", () => {
  it("scopes sites to the requested organization", async () => {
    const response = await getSites(authed("/internal/sites"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.sites).toHaveLength(1);
    expect(json.sites[0].id).toBe("site-1");
  });

  it("404s an unknown organization rather than returning an empty list", async () => {
    const response = await getSites(
      authed("/internal/sites", { query: "organizationId=org-missing" })
    );
    expect(response.status).toBe(404);
  });

  it("returns a run with its step timeline", async () => {
    const response = await getRuns(
      authed("/internal/runs", { query: "organizationId=org-1&runId=run-1" })
    );
    const json = await response.json();

    expect(json.run.id).toBe("run-1");
    expect(json.steps).toHaveLength(1);
    expect(json.steps[0].stepName).toBe("draft");
  });

  it("404s a run belonging to another organization", async () => {
    const response = await getRuns(
      authed("/internal/runs", {
        query: "organizationId=org-1&runId=run-other",
      })
    );
    expect(response.status).toBe(404);
  });

  it("lists recommendations for a site", async () => {
    const response = await getRecommendations(
      authed("/internal/recommendations", {
        query: "organizationId=org-1&siteConnectionId=site-1",
      })
    );
    const json = await response.json();

    expect(json.recommendations).toHaveLength(1);
    expect(json.recommendations[0].recommendationType).toBe("indexing_problem");
  });
});

describe("/internal/recommendations/dismiss", () => {
  it("sets status and dismissed_at, matching the dashboard action's update shape", async () => {
    const response = await dismissRecommendation(
      authed("/internal/recommendations/dismiss", {
        method: "POST",
        body: JSON.stringify({ id: "rec-1", organizationId: "org-1" }),
        query: "",
      })
    );

    expect(response.status).toBe(200);
    const [update] = state.updates.filter(
      (u) => u.table === "content_recommendations"
    );
    expect(update.payload.status).toBe("dismissed");
    expect(update.payload.dismissed_at).toEqual(expect.any(String));
    // Never touches actioned_at, and never deletes — the Phase A cron's upsert
    // relies on those columns surviving regeneration.
    expect(update.payload).not.toHaveProperty("actioned_at");
    expect(state.deletes).not.toContain("content_recommendations");
  });

  it("writes an audit entry with actor n8n_mcp", async () => {
    await dismissRecommendation(
      authed("/internal/recommendations/dismiss", {
        method: "POST",
        body: JSON.stringify({ id: "rec-1", organizationId: "org-1" }),
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "recommendation.dismissed",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("404s a recommendation from another organization", async () => {
    const response = await dismissRecommendation(
      authed("/internal/recommendations/dismiss", {
        method: "POST",
        body: JSON.stringify({ id: "rec-1", organizationId: "org-2" }),
        query: "",
      })
    );
    expect(response.status).toBe(404);
  });
});

describe("/internal/publish", () => {
  const publishRequest = (body: Record<string, unknown>) =>
    authed("/internal/publish", {
      method: "POST",
      body: JSON.stringify(body),
      query: "",
    });

  it("publishes a hosted_blog draft and records the result on the post row", async () => {
    const response = await publishPost(
      publishRequest({ organizationId: "org-1", postId: "post-1" })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.publishedUrl).toBe("https://acme.ourapp.com/blog/hello");

    const postUpdate = state.updates.find((u) => u.table === "posts");
    expect(postUpdate?.payload).toMatchObject({
      status: "published",
      external_post_id: "ext-1",
      published_url: "https://acme.ourapp.com/blog/hello",
    });
    expect(postUpdate?.payload.published_at).toEqual(expect.any(String));

    expect(
      state.updates.find((u) => u.table === "site_connections")?.payload
    ).toEqual({ consecutive_publish_failures: 0 });

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "post.published",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("re-checks the kill switch immediately before publishing and leaves the draft intact when blocked", async () => {
    state.checkKillSwitchMock.mockResolvedValue({
      blocked: true,
      reason: "This site is paused.",
    });

    const response = await publishPost(
      publishRequest({ organizationId: "org-1", postId: "post-1" })
    );

    expect(response.status).toBe(409);
    expect(state.publishPostMock).not.toHaveBeenCalled();
    expect(state.updates.find((u) => u.table === "posts")).toBeUndefined();
    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "publish.blocked.kill_switch",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("marks the post failed and increments the site's failure counter when the adapter throws", async () => {
    state.publishPostMock.mockRejectedValue(new Error("CMS said no"));

    const response = await publishPost(
      publishRequest({ organizationId: "org-1", postId: "post-1" })
    );

    expect(response.status).toBe(500);
    expect(state.updates.find((u) => u.table === "posts")?.payload).toEqual({
      status: "failed",
    });
    expect(
      state.updates.find((u) => u.table === "site_connections")?.payload
    ).toEqual({ consecutive_publish_failures: 1 });
    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "post.publish_failed" })
    );
  });

  it("writes the auto-pause receipt on the third consecutive failure", async () => {
    state.rows.site_connections = [
      {
        ...(state.rows.site_connections[0] as Record<string, unknown>),
        consecutive_publish_failures: 2,
      },
    ];
    state.publishPostMock.mockRejectedValue(new Error("CMS said no"));

    await publishPost(
      publishRequest({ organizationId: "org-1", postId: "post-1" })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "site.auto_paused",
        metadata: { consecutiveFailures: 3 },
      })
    );
  });

  it("refuses an already-published post", async () => {
    state.rows.posts = [
      {
        ...(state.rows.posts[0] as Record<string, unknown>),
        status: "published",
      },
    ];

    const response = await publishPost(
      publishRequest({ organizationId: "org-1", postId: "post-1" })
    );
    expect(response.status).toBe(409);
    expect(state.publishPostMock).not.toHaveBeenCalled();
  });

  it("returns 501 for a CMS type whose credentials service-role cannot decrypt", async () => {
    state.rows.site_connections = [
      {
        ...(state.rows.site_connections[0] as Record<string, unknown>),
        cms_type: "wordpress",
      },
    ];

    const response = await publishPost(
      publishRequest({ organizationId: "org-1", postId: "post-1" })
    );
    expect(response.status).toBe(501);
    expect(state.publishPostMock).not.toHaveBeenCalled();
  });
});

describe("/internal/schedules", () => {
  const scheduleRequest = (
    method: string,
    body: Record<string, unknown>,
    query = ""
  ) =>
    authed("/internal/schedules", {
      method,
      body: method === "DELETE" ? undefined : JSON.stringify(body),
      query,
    });

  it("creates a schedule with a computed next_run_at and the org owner as created_by", async () => {
    const response = await createSchedule(
      scheduleRequest("POST", {
        organizationId: "org-1",
        siteConnectionId: "site-1",
        cadence: "0 9 * * 1",
        topicHint: "coffee",
      })
    );

    expect(response.status).toBe(201);
    const insert = state.inserts.find((i) => i.table === "schedules");
    expect(insert?.payload).toMatchObject({
      organization_id: "org-1",
      site_connection_id: "site-1",
      cadence: "0 9 * * 1",
      timezone: "UTC",
      topic_source: "manual",
      created_by: "user-1",
    });
    expect(insert?.payload.next_run_at).toBe("2026-01-01T00:00:00.000Z");
    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "schedule.created",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("rejects an invalid cron expression before inserting anything", async () => {
    const response = await createSchedule(
      scheduleRequest("POST", {
        organizationId: "org-1",
        siteConnectionId: "site-1",
        cadence: "not-a-cron",
        topicHint: "coffee",
      })
    );

    expect(response.status).toBe(400);
    expect(state.inserts.find((i) => i.table === "schedules")).toBeUndefined();
  });

  it("sets enabled to the requested value on PATCH", async () => {
    const response = await patchSchedule(
      scheduleRequest("PATCH", {
        organizationId: "org-1",
        id: "sched-1",
        enabled: false,
      })
    );

    expect(response.status).toBe(200);
    expect(state.updates.find((u) => u.table === "schedules")?.payload).toEqual(
      {
        enabled: false,
      }
    );
    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "schedule.disabled",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("flips the current value when PATCH omits enabled, matching the dashboard toggle", async () => {
    const response = await patchSchedule(
      scheduleRequest("PATCH", { organizationId: "org-1", id: "sched-1" })
    );

    expect(response.status).toBe(200);
    expect(state.updates.find((u) => u.table === "schedules")?.payload).toEqual(
      {
        enabled: false,
      }
    );
  });

  it("deletes a schedule and audits it", async () => {
    const response = await deleteSchedule(
      scheduleRequest("DELETE", {}, "organizationId=org-1&id=sched-1")
    );

    expect(response.status).toBe(200);
    expect(state.deletes).toContain("schedules");
    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action: "schedule.deleted",
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });

  it("404s a schedule from another organization instead of deleting it", async () => {
    const response = await deleteSchedule(
      scheduleRequest("DELETE", {}, "organizationId=org-2&id=sched-1")
    );

    expect(response.status).toBe(404);
    expect(state.deletes).not.toContain("schedules");
  });
});

// Phase 10. These routes now serve two callers: n8n (which sends neither
// header) and the customer-facing MCP gateway (which sends both on every
// self-call). The first describe below is the backward-compatibility proof for
// the existing n8n integration — it asserts the *absence* of any change, which
// is the only thing that makes editing eight production routes at once safe.
const MCP_HEADERS = {
  "x-mcp-source": "customer_mcp",
  "x-mcp-actor": "user-1",
};

describe("audit attribution with no MCP headers (n8n's existing calls)", () => {
  const cases: [string, () => Promise<unknown>, string][] = [
    [
      "/internal/generate",
      () =>
        generatePost(
          authed("/internal/generate", {
            method: "POST",
            body: generateBody(),
            query: "",
          })
        ),
      "run.started",
    ],
    [
      "/internal/publish",
      () =>
        publishPost(
          authed("/internal/publish", {
            method: "POST",
            body: JSON.stringify({ organizationId: "org-1", postId: "post-1" }),
            query: "",
          })
        ),
      "post.published",
    ],
    [
      "/internal/schedules",
      () =>
        createSchedule(
          authed("/internal/schedules", {
            method: "POST",
            body: JSON.stringify({
              organizationId: "org-1",
              siteConnectionId: "site-1",
              cadence: "0 9 * * 1",
              topicHint: "coffee",
            }),
            query: "",
          })
        ),
      "schedule.created",
    ],
    [
      "/internal/recommendations/dismiss",
      () =>
        dismissRecommendation(
          authed("/internal/recommendations/dismiss", {
            method: "POST",
            body: JSON.stringify({ id: "rec-1", organizationId: "org-1" }),
            query: "",
          })
        ),
      "recommendation.dismissed",
    ],
  ];

  it.each(
    cases
  )("%s still writes actor null and source n8n_mcp", async (_path, run, action) => {
    await run();

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        action,
        metadata: expect.objectContaining({ source: "n8n_mcp" }),
      })
    );
  });
});

describe("audit attribution with MCP headers (the customer gateway's calls)", () => {
  it("attributes a started run to the API key's creator", async () => {
    await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        headers: MCP_HEADERS,
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-1",
        action: "run.started",
        metadata: expect.objectContaining({ source: "customer_mcp" }),
      })
    );
  });

  it("attributes a blocked run too, so a guardrail block is traceable to the customer", async () => {
    state.checkQuotaMock.mockResolvedValue({ blocked: true, reason: "nope" });

    await generatePost(
      authed("/internal/generate", {
        method: "POST",
        body: generateBody(),
        headers: MCP_HEADERS,
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-1",
        action: "run.blocked.quota",
        metadata: expect.objectContaining({ source: "customer_mcp" }),
      })
    );
  });

  it("attributes a publish", async () => {
    await publishPost(
      authed("/internal/publish", {
        method: "POST",
        body: JSON.stringify({ organizationId: "org-1", postId: "post-1" }),
        headers: MCP_HEADERS,
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-1",
        action: "post.published",
        metadata: expect.objectContaining({ source: "customer_mcp" }),
      })
    );
  });

  it("attributes a schedule creation", async () => {
    await createSchedule(
      authed("/internal/schedules", {
        method: "POST",
        body: JSON.stringify({
          organizationId: "org-1",
          siteConnectionId: "site-1",
          cadence: "0 9 * * 1",
          topicHint: "coffee",
        }),
        headers: MCP_HEADERS,
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-1",
        action: "schedule.created",
        metadata: expect.objectContaining({ source: "customer_mcp" }),
      })
    );
  });

  it("attributes a recommendation dismissal", async () => {
    await dismissRecommendation(
      authed("/internal/recommendations/dismiss", {
        method: "POST",
        body: JSON.stringify({ id: "rec-1", organizationId: "org-1" }),
        headers: MCP_HEADERS,
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-1",
        action: "recommendation.dismissed",
        metadata: expect.objectContaining({ source: "customer_mcp" }),
      })
    );
  });

  it("leaves the auto-pause receipt's metadata shape alone, since it records the DB trigger rather than the caller", async () => {
    state.rows.site_connections = [
      {
        ...(state.rows.site_connections[0] as Record<string, unknown>),
        consecutive_publish_failures: 2,
      },
    ];
    state.publishPostMock.mockRejectedValue(new Error("CMS said no"));

    await publishPost(
      authed("/internal/publish", {
        method: "POST",
        body: JSON.stringify({ organizationId: "org-1", postId: "post-1" }),
        headers: MCP_HEADERS,
        query: "",
      })
    );

    expect(state.writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-1",
        action: "site.auto_paused",
        metadata: { consecutiveFailures: 3 },
      })
    );
  });
});
