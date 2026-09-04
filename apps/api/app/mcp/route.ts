import {
  type CallToolResult,
  createMcpHandler,
  McpServer,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { env } from "@/env";
import {
  type ApiKeyContext,
  authenticateApiKey,
  isBlocked,
} from "./_lib/mcp-auth";

// Phase 10: the customer-facing MCP server.
//
// Unlike `/internal/*` (one shared secret, `organizationId` supplied by the
// caller, only ever held by the operator's own n8n instance), this endpoint is
// meant to be handed to customers. Each one presents their own `qr_live_` key;
// the organization is resolved from that key server-side and closed over by
// every tool handler below. **No tool's input schema contains `organizationId`
// or `createdBy`**, so there is no argument an AI client could send — honestly
// or under prompt injection — that would move a call to another tenant.
//
// Tools dispatch by self-calling the existing `/internal/*` routes over HTTP
// rather than importing their handlers. That keeps those routes' HTTP contract
// as the only coupling surface: they stay free to change internally, and every
// guardrail, org-scoping check and audit write they already perform runs
// unchanged and un-bypassed on this path too. The extra hop is a loopback
// request inside the same deployment.
//
// SDK note: `@modelcontextprotocol/server` v2 (not the v1 `.../sdk` package).
// v1's `StreamableHTTPServerTransport` is built on Node's
// `IncomingMessage`/`ServerResponse`, which a Next.js App Router route handler
// never has — it receives a web `Request` and must return a web `Response`.
// v2's `createMcpHandler` is web-standard (`{ fetch(request) }`) and stateless
// per request, which is exactly the shape a Vercel function needs.

export const dynamic = "force-dynamic";

const SERVER_INFO = { name: "quillrun", version: "1.0.0" } as const;

// Shared bounds, matching `/internal/_lib/internal-auth.ts`'s own parseLimit.
// Restated here so the *schema* advertises the ceiling to the model rather than
// silently clamping after the fact — an LLM that can see `max: 200` asks for a
// legal value; one that can't asks for 10,000 and gets quietly truncated.
const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(200)
  .optional()
  .describe("Maximum number of records to return (default 50, max 200).");

const siteConnectionIdSchema = z
  .string()
  .describe("The id of a site connection in this organization.");

const ok = (body: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(body) }],
});

// A failed internal call surfaces as a tool-level error (`isError`) carrying
// the route's own message, not as a thrown exception. That distinction is the
// whole point: a guardrail block ("this site is paused", "daily post limit
// reached") is information the AI client should read and relay to its user, not
// a transport failure it should retry blindly.
const fail = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

// Routes that accept an explicit `createdBy` and validate it against org
// membership themselves (via `resolveActingUser`), so the key's creator can be
// passed through and the run/schedule attributed to a real person rather than
// defaulting to the org owner.
const ATTRIBUTABLE_POSTS = new Set([
  "/internal/generate",
  "/internal/schedules",
]);

const internalHeaders = (auth: ApiKeyContext): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    // Phase 10 audit attribution. `/internal/_lib/internal-auth.ts`'s
    // `resolveAuditSource`/`resolveAuditActorId` read these; n8n sends neither,
    // so its own audit rows are untouched.
    "x-mcp-source": "customer_mcp",
    "x-mcp-actor": auth.createdBy,
  };
  if (env.N8N_INTERNAL_SECRET) {
    headers.authorization = `Bearer ${env.N8N_INTERNAL_SECRET}`;
  }
  return headers;
};

const parseBody = (text: string): unknown => {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

// Relays the route's own wording verbatim — `error` for the 4xx/5xx helpers,
// `reason` for the guardrail blocks in `/internal/generate`.
const errorMessage = (parsed: unknown, status: number): string => {
  const record = (parsed ?? {}) as Record<string, unknown>;
  if (typeof record.reason === "string" && record.reason) {
    return record.reason;
  }
  if (typeof record.error === "string" && record.error) {
    return record.error;
  }
  return `Request failed with status ${status}.`;
};

// Every tool goes through here. `organizationId` and `createdBy` are injected
// from the authenticated key at this single choke point, *after* the model's
// arguments have been spread — so a crafted `organizationId` in a tool call is
// overwritten rather than honoured, and even a carelessly-written tool handler
// could not let a caller-supplied org through.
const callInternal = async (
  request: Request,
  auth: ApiKeyContext,
  path: string,
  method: "DELETE" | "GET" | "PATCH" | "POST",
  params: Record<string, unknown>
): Promise<CallToolResult> => {
  const url = new URL(path, request.url);

  const payload: Record<string, unknown> = {
    ...params,
    organizationId: auth.organizationId,
  };
  if (method === "POST" && ATTRIBUTABLE_POSTS.has(path)) {
    payload.createdBy = auth.createdBy;
  }

  const sendsQueryString = method === "GET" || method === "DELETE";
  if (sendsQueryString) {
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: internalHeaders(auth),
      ...(sendsQueryString ? {} : { body: JSON.stringify(payload) }),
    });
  } catch (error) {
    return fail(
      `Couldn't reach Quillrun's internal API: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const parsed = parseBody(await response.text());

  return response.ok ? ok(parsed) : fail(errorMessage(parsed, response.status));
};

// The 11 tools. Note what is absent from every one of these schemas:
// `organizationId` and `createdBy`.
const buildServer = (request: Request, auth: ApiKeyContext): McpServer => {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
  });

  const tool = (
    name: string,
    description: string,
    inputSchema: z.ZodObject,
    path: string,
    method: "DELETE" | "GET" | "PATCH" | "POST"
  ) => {
    server.registerTool(
      name,
      { description, inputSchema },
      async (args: Record<string, unknown>) =>
        callInternal(request, auth, path, method, args ?? {})
    );
  };

  tool(
    "list_sites",
    "List the websites connected to this Quillrun organization, with their CMS type, connection status and whether they're paused.",
    z.object({ limit: limitSchema }),
    "/internal/sites",
    "GET"
  );

  tool(
    "list_posts",
    "List posts (drafts and published) for this organization, newest first. Optionally filter to one site or one status.",
    z.object({
      siteConnectionId: siteConnectionIdSchema.optional(),
      status: z
        .string()
        .optional()
        .describe("Filter by post status, e.g. 'draft' or 'published'."),
      limit: limitSchema,
    }),
    "/internal/posts",
    "GET"
  );

  tool(
    "get_recommendations",
    "List the SEO recommendations Quillrun has generated for this organization's published content.",
    z.object({
      siteConnectionId: siteConnectionIdSchema.optional(),
      status: z
        .string()
        .optional()
        .describe("Filter by status: 'new', 'dismissed' or 'actioned'."),
      recommendationType: z
        .string()
        .optional()
        .describe(
          "Filter by type: 'title_meta_rewrite', 'keyword_gap', 'indexing_problem' or 'zero_traction'."
        ),
      limit: limitSchema,
    }),
    "/internal/recommendations",
    "GET"
  );

  tool(
    "dismiss_recommendation",
    "Dismiss a recommendation so it stops appearing as outstanding. The dismissal survives future recommendation regeneration.",
    z.object({
      id: z.string().describe("The id of the recommendation to dismiss."),
    }),
    "/internal/recommendations/dismiss",
    "POST"
  );

  tool(
    "generate_content",
    "Start a content generation run for one site. Returns once the run is dispatched — poll get_run_status for progress. Subject to this organization's kill switch, rate limits and monthly quota, which may refuse the request.",
    z.object({
      siteConnectionId: siteConnectionIdSchema,
      topicHint: z
        .string()
        .describe("The topic or niche the generated post should cover."),
      contentType: z
        .enum(["blog", "faq"])
        .optional()
        .describe("The kind of content to produce. Defaults to 'blog'."),
    }),
    "/internal/generate",
    "POST"
  );

  tool(
    "get_run_status",
    "Check the status of content generation runs, including the per-step timeline when a single runId is given.",
    z.object({
      runId: z
        .string()
        .optional()
        .describe(
          "A specific pipeline run id to fetch, with its step timeline."
        ),
      siteConnectionId: siteConnectionIdSchema.optional(),
      limit: limitSchema,
    }),
    "/internal/runs",
    "GET"
  );

  tool(
    "publish_post",
    "Publish an existing draft post to its site's CMS. Only posts Quillrun's own pipeline produced can be published this way.",
    z.object({
      postId: z.string().describe("The id of the draft post to publish."),
    }),
    "/internal/publish",
    "POST"
  );

  tool(
    "list_schedules",
    "List the recurring content schedules for this organization.",
    z.object({
      siteConnectionId: siteConnectionIdSchema.optional(),
      limit: limitSchema,
    }),
    "/internal/schedules",
    "GET"
  );

  tool(
    "create_schedule",
    "Create a recurring content schedule for one site.",
    z.object({
      siteConnectionId: siteConnectionIdSchema,
      cadence: z
        .string()
        .describe(
          "A cron expression, e.g. '0 9 * * 1' for every Monday at 9am."
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone the cadence is interpreted in. Defaults to UTC."
        ),
      topicHint: z
        .string()
        .describe(
          "The topic or niche reused for every run this schedule triggers."
        ),
      topicSource: z
        .enum(["manual", "auto"])
        .optional()
        .describe(
          "Whether the topic is fixed ('manual') or chosen per run ('auto')."
        ),
    }),
    "/internal/schedules",
    "POST"
  );

  tool(
    "update_schedule",
    "Enable or disable an existing schedule. Omit 'enabled' to toggle its current value.",
    z.object({
      id: z.string().describe("The id of the schedule to update."),
      enabled: z
        .boolean()
        .optional()
        .describe("The desired state. Omit to flip the current value."),
    }),
    "/internal/schedules",
    "PATCH"
  );

  tool(
    "delete_schedule",
    "Delete a schedule permanently. Its already-generated posts are unaffected.",
    z.object({
      id: z.string().describe("The id of the schedule to delete."),
    }),
    "/internal/schedules",
    "DELETE"
  );

  return server;
};

// JSON-RPC-shaped rejections, so an MCP client surfaces something readable
// rather than an opaque transport failure. -32001 is the SDK's own convention
// for a server-defined error in this range.
const rpcError = (status: number, message: string): Response =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32_001, message }, id: null },
    {
      status,
      headers: {
        // Tells a spec-compliant client where to authenticate. Quillrun issues
        // keys from its dashboard rather than over OAuth, so this points at the
        // page that mints them.
        "www-authenticate": 'Bearer realm="quillrun"',
      },
    }
  );

export const POST = async (request: Request): Promise<Response> => {
  // Authentication reads headers only, never the body — so the request stream
  // is still intact for the transport below.
  const auth = await authenticateApiKey(request);

  if (auth === null) {
    return rpcError(
      401,
      "Invalid or revoked Quillrun API key. Create one under Guardrails → API keys in the Quillrun dashboard and send it as 'Authorization: Bearer <key>'."
    );
  }

  if (isBlocked(auth)) {
    // Refused before any tool is registered, let alone dispatched — the cap is
    // a cost bound, so it has to stop the request before it can spend anything.
    return rpcError(429, auth.blocked);
  }

  // One handler per request, with the resolved organization captured in the
  // closure. Deliberately not a module-level handler reading the org back out
  // of a context object: a closure makes cross-tenant leakage structurally
  // impossible rather than merely unlikely, and this endpoint's entire reason
  // for existing is that guarantee.
  const handler = createMcpHandler(() => buildServer(request, auth));

  return handler.fetch(request);
};
