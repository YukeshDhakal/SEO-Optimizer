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
  const { validateGeoSeoOutput } = await import("@repo/ai-engine/validation");
  return {
    selectTopic: vi.fn(),
    research: vi.fn(),
    outline: vi.fn(),
    draft: vi.fn(),
    geoSeoOptimize: vi.fn(),
    runPolicyCheck: vi.fn(),
    validateGeoSeoOutput,
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

const makeBuilder = () => {
  const row = { id: "row-id", ...tenantSettingsOverride };
  const result = { data: row, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["insert", "update", "select", "eq", "order"]) {
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
    from: vi.fn(() => makeBuilder()),
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
import { contentPipelineWorkflow } from "../content-pipeline";

const selectTopicMock = vi.mocked(selectTopic);
const researchMock = vi.mocked(research);
const outlineMock = vi.mocked(outline);
const draftMock = vi.mocked(draft);
const geoSeoOptimizeMock = vi.mocked(geoSeoOptimize);
const policyCheckMock = vi.mocked(runPolicyCheck);

const TOPIC = { topic: "Espresso machine buying guide", primaryKeyword: "espresso machine" };
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
});
