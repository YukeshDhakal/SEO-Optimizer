import { beforeEach, describe, expect, it, vi } from "vitest";

// `"use step"`/`"use workflow"` are no-ops without the Workflow DevKit's
// compiler transform (per its own testing docs: "Steps are just functions;
// without the compiler ... Test them directly") — so this file exercises
// `contentPipelineWorkflow` as a plain async function, the same way Phase
// 3's `pipeline.test.ts` tested `runContentPipeline`. `createHook` from
// "workflow" is never reached in any test here (every fixture leaves
// `require_approval: false`), so the real workflow runtime never needs to
// be present.
//
// Only the network-touching step functions are mocked; `validateGeoSeoOutput`
// stays the real implementation (re-exported via `...actual`) so these tests
// prove the actual validation logic drives the retry loop, not a stand-in.
// Deliberately NOT using `importOriginal()`/`...actual` here: that would
// load the real `@repo/ai-engine/index.ts`, which re-exports `model.ts` —
// and `model.ts` has an `import "server-only"` guard that throws outside a
// Next.js RSC build (no bundler condition to make it a no-op in plain
// vitest). Importing `validateGeoSeoOutput` from its own submodule path
// instead avoids ever touching `model.ts`, matching Phase 3's own
// `pipeline.test.ts` precedent of mocking each step module individually
// rather than the package's barrel file.
vi.mock("@repo/ai-engine", async () => {
  const { validateContentGuidelines, validateGeoSeoOutput, validateSiteReference } =
    await import("@repo/ai-engine/validation");
  return {
    selectTopic: vi.fn(),
    research: vi.fn(),
    outline: vi.fn(),
    draft: vi.fn(),
    geoSeoOptimize: vi.fn(),
    runPolicyCheck: vi.fn(),
    validateGeoSeoOutput,
    // Real implementation — none of this file's fixture draft strings
    // contain any of content-guidelines.ts's BANNED_PHRASES, so this is a
    // no-op for every pre-existing test, same reasoning as
    // validateSiteReference below. The dedicated content-guidelines tests
    // further down are what actually exercise its failure path.
    validateContentGuidelines,
    // Real implementation, same reasoning as validateGeoSeoOutput above —
    // these tests should prove the actual site-reference gate drives the
    // retry loop, not a stand-in. `site.baseUrl` is null in every existing
    // fixture (the generic `makeBuilder` mock below returns no
    // `base_url`/`display_name` for `site_connections`), so the real
    // `validateSiteReference` falls back to its name-mention check — see
    // the dedicated `getSiteIdentity`/site-reference tests below for the
    // cases that actually exercise a non-null `baseUrl`.
    validateSiteReference,
    // Phase 5's `guardrails.ts` imports this for the duplicate-content
    // check — defaulting to `undefined` (not `null`) still exercises the
    // same "not configured, skip" branch (`!embedding` is true either way)
    // without every existing test needing to know this guardrail exists.
    generateEmbedding: vi.fn(),
  };
});

// A minimal fake of the chainable supabase-js query builder — every method
// used by db-steps.ts (`from/insert/update/select/eq/single/maybeSingle`)
// returns `this` for chaining, and is itself awaitable (`.then`) for the
// call sites that `await` an `update().eq()` without a terminal method.
// One shared `row` is returned everywhere: it carries both an `id` (for
// insert results) and `require_approval`/`paused` (for the tenant_settings
// read) since no test here needs per-table differentiation beyond what
// `tenantSettingsOverride` provides.
let tenantSettingsOverride: { require_approval: boolean; paused: boolean } = {
  require_approval: false,
  paused: false,
};

// Unset by default — every existing test's generic `.select().eq(...)`
// (no `.single()`) resolves via `.then` to a single `row` OBJECT, not an
// array, from `makeBuilder()` below. keyword-volume-check.ts's step guards
// non-array `data` with `Array.isArray` and treats it as "no cache data",
// which is exactly the fail-open branch of `evaluateKeywordVolume` — so
// every pre-existing test here exercises that branch automatically and
// never hits the keyword-volume gate, with no changes needed to keep
// passing. Only the one test below that explicitly sets this override
// exercises the gate's blocking path with real array-shaped rows.
let keywordVolumeOverride: {
  keywordRows: { keyword: string; avg_monthly_searches: number | null }[];
  gscRows: { query: string; clicks: number; impressions: number }[];
} | null = null;

// `null` (the default) makes `getSiteIdentity` return `{ baseUrl: null,
// displayName: "" }` — `validateSiteReference` then checks for an empty
// string, which every draft trivially "contains", so the new
// site_reference_check gate is a no-op for every pre-existing test in this
// file (same reasoning as `keywordVolumeOverride`'s unset-by-default
// fail-open pattern above). Only the dedicated site-reference tests below
// set this to exercise the gate's actual pass/fail/retry behavior.
let siteIdentityOverride: { baseUrl: string | null; displayName: string } | null = null;

const makeBuilder = (table?: string) => {
  const row = { id: "row-id", ...tenantSettingsOverride };
  let result: { data: unknown; error: null } = { data: row, error: null };
  if (keywordVolumeOverride && table === "keyword_research") {
    result = { data: keywordVolumeOverride.keywordRows, error: null };
  } else if (keywordVolumeOverride && table === "search_console_queries") {
    result = { data: keywordVolumeOverride.gscRows, error: null };
  } else if (table === "site_connections") {
    result = {
      data: {
        base_url: siteIdentityOverride?.baseUrl ?? null,
        display_name: siteIdentityOverride?.displayName ?? "",
      },
      error: null,
    };
  }
  const builder: Record<string, unknown> = {};
  for (const method of ["insert", "update", "select", "eq", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: typeof result) => unknown) =>
    resolve(result);
  return builder;
};

vi.mock("@repo/database", () => ({
  database: {
    from: vi.fn((table: string) => makeBuilder(table)),
    // Only reached by `checkDuplicateContent` when `generateEmbedding`
    // returns a real embedding — every test here leaves it `undefined`
    // (see the `@repo/ai-engine` mock above), so this never actually gets
    // called; present so nothing throws if that assumption ever changes.
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
  },
}));

// Imported after the mocks above so both pick up the mocked modules.
import {
  draft,
  geoSeoOptimize,
  research,
  runPolicyCheck,
  selectTopic,
  outline,
} from "@repo/ai-engine";
import { database } from "@repo/database";
import { contentPipelineWorkflow } from "../content-pipeline";

const selectTopicMock = vi.mocked(selectTopic);
const researchMock = vi.mocked(research);
const outlineMock = vi.mocked(outline);
const draftMock = vi.mocked(draft);
const geoSeoOptimizeMock = vi.mocked(geoSeoOptimize);
const policyCheckMock = vi.mocked(runPolicyCheck);

const TOPIC = {
  topic: "Espresso machine buying guide",
  primaryKeyword: "espresso machine",
};
const RESEARCH = {
  facts: ["Fact one", "Fact two"],
  sources: [{ title: "Source A", url: "https://example.com/a" }],
  candidateFaqs: ["What's a good starter machine?"],
};
const OUTLINE = {
  leadAnswer: "Here's the direct answer a reader wants immediately.",
  sections: [{ heading: "Section 1", bullets: ["a"] }],
  faqSection: [{ question: "Q?", answer: "A." }],
};

const VALID_GEO_SEO = {
  metaTitle: "Espresso Machine Buying Guide",
  metaDescription:
    "Everything you need to know before buying your first espresso machine, explained clearly and concisely for beginners.",
  schemaJsonLd: [{ "@type": "Article" }, { "@type": "FAQPage" }],
  keywordDensity: 0.02,
  citationCount: 1,
  readabilityScore: 60,
};

const INVALID_GEO_SEO = {
  ...VALID_GEO_SEO,
  schemaJsonLd: [{ "@type": "Article" }], // missing FAQPage -> fails validateGeoSeoOutput
};

const BASE_INPUT = {
  organizationId: "org-1",
  siteConnectionId: "site-1",
  createdBy: "user-1",
  topicHint: "coffee gear",
  triggerType: "manual" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  tenantSettingsOverride = { require_approval: false, paused: false };
  keywordVolumeOverride = null;
  siteIdentityOverride = null;
  selectTopicMock.mockResolvedValue(TOPIC);
  researchMock.mockResolvedValue(RESEARCH);
  outlineMock.mockResolvedValue(OUTLINE);
  draftMock.mockResolvedValue("# Draft markdown\n\nSome content.");
  policyCheckMock.mockReturnValue({ blocked: false, reasons: [] });
});

describe("contentPipelineWorkflow retry loop", () => {
  it("succeeds on the first attempt when validation passes immediately", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("succeeded");
    expect(result.postId).toBeDefined();
    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(1);
    expect(draftMock.mock.calls[0][0].feedback).toBeUndefined();
  });

  // Phase 7: topicSelectionStep (not mocked here — only @repo/ai-engine's
  // selectTopic is) reads search_console_queries for the run's own
  // siteConnectionId before calling selectTopic.
  it("looks up search_console_queries scoped to the run's siteConnectionId before selecting a topic", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    await contentPipelineWorkflow(BASE_INPUT);

    const fromMock = vi.mocked(database.from);
    const queriesCallIndex = fromMock.mock.calls.findIndex(
      (call) => call[0] === "search_console_queries"
    );
    expect(queriesCallIndex).toBeGreaterThanOrEqual(0);

    const queriesBuilder = fromMock.mock.results[queriesCallIndex].value;
    expect(queriesBuilder.eq).toHaveBeenCalledWith(
      "site_connection_id",
      "site-1"
    );

    expect(selectTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        topicHint: "coffee gear",
      })
    );
  });

  it("retries draft with corrective feedback when validation fails once, then succeeds", async () => {
    geoSeoOptimizeMock
      .mockResolvedValueOnce(INVALID_GEO_SEO)
      .mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(2);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(2);

    const secondCallFeedback = draftMock.mock.calls[1][0].feedback;
    expect(secondCallFeedback).toBeDefined();
    expect(secondCallFeedback).toContain("FAQPage");
  });

  it("also carries feedback and the outline into the retried geo_seo_optimize call, not just draft", async () => {
    // Regression test: metaDescription length is entirely geo_seo_optimize's
    // own output, invisible to draft — without threading feedback into it
    // too, a retry could re-fail identically forever (this happened for
    // real in production before this fix, 3 straight identical failures).
    // `outline` is threaded through separately so geo_seo_optimize can build
    // schemaJsonLd's FAQPage node deterministically instead of generating it.
    geoSeoOptimizeMock
      .mockResolvedValueOnce(INVALID_GEO_SEO)
      .mockResolvedValueOnce(VALID_GEO_SEO);

    await contentPipelineWorkflow(BASE_INPUT);

    expect(geoSeoOptimizeMock.mock.calls[0][0].feedback).toBeUndefined();
    expect(geoSeoOptimizeMock.mock.calls[0][0].outline).toEqual(OUTLINE);
    const secondCallFeedback = geoSeoOptimizeMock.mock.calls[1][0].feedback;
    expect(secondCallFeedback).toBeDefined();
    expect(secondCallFeedback).toContain("FAQPage");
  });

  it("stops after 3 attempts and returns status:'failed' if never valid (no throw — a run row always exists to redirect to)", async () => {
    geoSeoOptimizeMock.mockResolvedValue(INVALID_GEO_SEO);

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("FAQPage");
    expect(draftMock).toHaveBeenCalledTimes(3);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(3);
  });

  it("returns status:'blocked' when policy_check trips, without retrying draft", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);
    policyCheckMock.mockReturnValueOnce({
      blocked: true,
      reasons: ["banned claim matched"],
    });

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("blocked");
    expect(draftMock).toHaveBeenCalledTimes(1);
  });

  it("returns status:'blocked' immediately when the tenant is paused, without calling any AI step", async () => {
    tenantSettingsOverride = { require_approval: false, paused: true };

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("blocked");
    expect(selectTopicMock).not.toHaveBeenCalled();
  });

  // Phase 8: keyword_volume_check runs after duplicate_check, using
  // keyword_research (Google Ads) + search_console_queries (GSC) cache data.
  it("returns status:'blocked' when the keyword-volume check trips, after drafting has already run", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);
    keywordVolumeOverride = {
      keywordRows: [{ keyword: "espresso machine", avg_monthly_searches: 3 }],
      gscRows: [],
    };

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("espresso machine");
    // The gate runs after drafting, not before — draft/geo_seo_optimize
    // already completed by the time it fires.
    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(1);
  });

  it("does not block when the keyword has low volume but the site already has real GSC performance for it", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);
    keywordVolumeOverride = {
      keywordRows: [{ keyword: "espresso machine", avg_monthly_searches: 3 }],
      gscRows: [{ query: "espresso machine", clicks: 5, impressions: 200 }],
    };

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("succeeded");
  });
});

// The site-reference-back requirement: every generated post must reference
// the site it's for. Deterministic (validateSiteReference, not a prompt
// instruction alone) for the same reason every other reliability fix in
// this pipeline is deterministic — see validation.ts's own comment.
describe("contentPipelineWorkflow site reference gate", () => {
  it("retries draft (skipping geo_seo_optimize) when the draft has no link back to the site, then succeeds", async () => {
    siteIdentityOverride = { baseUrl: "https://quoteengine.dev", displayName: "Quote Engine" };
    draftMock
      .mockResolvedValueOnce("# Draft markdown\n\nNo link here.")
      .mockResolvedValueOnce(
        "# Draft markdown\n\nSee [get a quote](https://quoteengine.dev) today."
      );
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(2);
    // The whole point of checking site-reference before geo_seo_optimize:
    // the first (failing) draft never reaches it at all.
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(1);
    const retryFeedback = draftMock.mock.calls[1][0].feedback;
    expect(retryFeedback).toContain("quoteengine.dev");
  });

  it("accepts a link to a subpath of the site's base_url, not just the exact homepage URL", async () => {
    siteIdentityOverride = { baseUrl: "https://quoteengine.dev", displayName: "Quote Engine" };
    draftMock.mockResolvedValueOnce(
      "# Draft markdown\n\nStart with a [free quote](https://quoteengine.dev/get-started)."
    );
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain name mention (no link required) when the site has no base_url yet", async () => {
    siteIdentityOverride = { baseUrl: null, displayName: "Quote Engine" };
    draftMock.mockResolvedValueOnce(
      "# Draft markdown\n\nQuote Engine can help you compare rates."
    );
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(1);
  });

  it("returns status:'failed' after 3 attempts if the draft never references the site, without ever calling geo_seo_optimize", async () => {
    siteIdentityOverride = { baseUrl: "https://quoteengine.dev", displayName: "Quote Engine" };
    draftMock.mockResolvedValue("# Draft markdown\n\nStill no link.");

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("quoteengine.dev");
    expect(draftMock).toHaveBeenCalledTimes(3);
    expect(geoSeoOptimizeMock).not.toHaveBeenCalled();
  });
});

describe("contentPipelineWorkflow content guidelines gate", () => {
  it("retries draft (skipping geo_seo_optimize) when the draft contains a banned phrase, then succeeds", async () => {
    draftMock
      .mockResolvedValueOnce("# Draft markdown\n\nIt depends on your policy.")
      .mockResolvedValueOnce("# Draft markdown\n\nMost insurers require notice within 30 days.");
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(2);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(1);
    expect(draftMock.mock.calls[1][0].feedback).toContain("it depends");
  });

  it("returns status:'failed' after 3 attempts if the draft always contains a banned phrase, without ever calling geo_seo_optimize", async () => {
    draftMock.mockResolvedValue("# Draft markdown\n\nAs mentioned above, rates vary.");

    const result = await contentPipelineWorkflow(BASE_INPUT);

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("as mentioned above");
    expect(draftMock).toHaveBeenCalledTimes(3);
    expect(geoSeoOptimizeMock).not.toHaveBeenCalled();
  });
});
