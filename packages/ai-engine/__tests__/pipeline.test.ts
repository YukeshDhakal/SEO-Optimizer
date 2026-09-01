import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../steps/topic-selection", () => ({
  selectTopic: vi.fn(),
}));
vi.mock("../steps/research", () => ({
  research: vi.fn(),
}));
vi.mock("../steps/outline", () => ({
  outline: vi.fn(),
}));
vi.mock("../steps/draft", () => ({
  draft: vi.fn(),
}));
vi.mock("../steps/geo-seo-optimize", () => ({
  geoSeoOptimize: vi.fn(),
}));

import { draft } from "../steps/draft";
import { geoSeoOptimize } from "../steps/geo-seo-optimize";
import { outline } from "../steps/outline";
import { research } from "../steps/research";
import { selectTopic } from "../steps/topic-selection";
// Import after the mocks above so pipeline.ts picks up the mocked modules.
import { PipelineValidationError, runContentPipeline } from "../pipeline";
import type { SiteIdentity } from "../schemas";

const selectTopicMock = vi.mocked(selectTopic);
const researchMock = vi.mocked(research);
const outlineMock = vi.mocked(outline);
const draftMock = vi.mocked(draft);
const geoSeoOptimizeMock = vi.mocked(geoSeoOptimize);

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

beforeEach(() => {
  vi.clearAllMocks();
  selectTopicMock.mockResolvedValue(TOPIC);
  researchMock.mockResolvedValue(RESEARCH);
  outlineMock.mockResolvedValue(OUTLINE);
  draftMock.mockResolvedValue("# Draft markdown\n\nSome content.");
});

describe("runContentPipeline retry loop", () => {
  it("succeeds on the first attempt when validation passes immediately", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await runContentPipeline({
      organizationId: "org-1",
      topicHint: "coffee gear",
    });

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(1);
    // First attempt has no prior feedback.
    expect(draftMock.mock.calls[0][0].feedback).toBeUndefined();
  });

  it("retries draft with corrective feedback when validation fails once, then succeeds", async () => {
    geoSeoOptimizeMock
      .mockResolvedValueOnce(INVALID_GEO_SEO)
      .mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await runContentPipeline({
      organizationId: "org-1",
      topicHint: "coffee gear",
    });

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(2);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(2);

    // Second draft attempt must carry feedback describing the FAQPage failure.
    const secondCallFeedback = draftMock.mock.calls[1][0].feedback;
    expect(secondCallFeedback).toBeDefined();
    expect(secondCallFeedback).toContain("FAQPage");
  });

  it("also carries feedback into the retried geo_seo_optimize call, not just draft", async () => {
    // Regression test: metaDescription length and schemaJsonLd shape are
    // entirely geo_seo_optimize's own output, invisible to draft — without
    // this, a retry could re-fail identically forever since the step that
    // actually produces the bad field never learned what was wrong.
    geoSeoOptimizeMock
      .mockResolvedValueOnce(INVALID_GEO_SEO)
      .mockResolvedValueOnce(VALID_GEO_SEO);

    await runContentPipeline({ organizationId: "org-1", topicHint: "coffee gear" });

    expect(geoSeoOptimizeMock.mock.calls[0][0].feedback).toBeUndefined();
    const secondCallFeedback = geoSeoOptimizeMock.mock.calls[1][0].feedback;
    expect(secondCallFeedback).toBeDefined();
    expect(secondCallFeedback).toContain("FAQPage");
  });

  it("stops after MAX_DRAFT_ATTEMPTS (3) and throws PipelineValidationError if never valid", async () => {
    geoSeoOptimizeMock.mockResolvedValue(INVALID_GEO_SEO);

    await expect(
      runContentPipeline({ organizationId: "org-1", topicHint: "coffee gear" })
    ).rejects.toThrow(PipelineValidationError);

    expect(draftMock).toHaveBeenCalledTimes(3);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(3);
  });

  it("returns status:'blocked' when policy_check trips, without retrying draft", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);
    draftMock.mockResolvedValueOnce(
      "This is a guaranteed cure for everything, no risk at all."
    );

    const result = await runContentPipeline({
      organizationId: "org-1",
      topicHint: "coffee gear",
    });

    expect(result.status).toBe("blocked");
    expect(draftMock).toHaveBeenCalledTimes(1);
  });

  it("invokes step callbacks in order with the right step names", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);
    const seen: string[] = [];

    await runContentPipeline(
      { organizationId: "org-1", topicHint: "coffee gear" },
      { onStepStart: (step) => void seen.push(step) }
    );

    expect(seen).toEqual([
      "topic_selection",
      "research",
      "outline",
      "draft",
      "content_guidelines_check",
      "geo_seo_optimize",
      "policy_check",
    ]);
  });
});

describe("runContentPipeline site reference gate", () => {
  const SITE: SiteIdentity = { baseUrl: "https://quoteengine.dev", displayName: "Quote Engine" };

  it("skips the site_reference_check entirely when no site is given (existing/legacy callers)", async () => {
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);
    const seen: string[] = [];

    await runContentPipeline(
      { organizationId: "org-1", topicHint: "coffee gear" },
      { onStepStart: (step) => void seen.push(step) }
    );

    expect(seen).not.toContain("site_reference_check");
  });

  it("retries draft (skipping geo_seo_optimize) when the draft has no link back to the site, then succeeds", async () => {
    draftMock
      .mockResolvedValueOnce("# Draft markdown\n\nNo link here.")
      .mockResolvedValueOnce(
        "# Draft markdown\n\nSee [get a quote](https://quoteengine.dev) today."
      );
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await runContentPipeline({
      organizationId: "org-1",
      topicHint: "coffee gear",
      site: SITE,
    });

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(2);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(1);
    expect(draftMock.mock.calls[1][0].feedback).toContain("quoteengine.dev");
  });

  it("throws PipelineValidationError after 3 attempts if the draft never references the site, without ever calling geo_seo_optimize", async () => {
    draftMock.mockResolvedValue("# Draft markdown\n\nStill no link.");

    await expect(
      runContentPipeline({
        organizationId: "org-1",
        topicHint: "coffee gear",
        site: SITE,
      })
    ).rejects.toThrow(PipelineValidationError);

    expect(draftMock).toHaveBeenCalledTimes(3);
    expect(geoSeoOptimizeMock).not.toHaveBeenCalled();
  });

  it("succeeds immediately when the draft already links back to the site", async () => {
    draftMock.mockResolvedValueOnce(
      "# Draft markdown\n\nStart at [Quote Engine](https://quoteengine.dev/get-started)."
    );
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await runContentPipeline({
      organizationId: "org-1",
      topicHint: "coffee gear",
      site: SITE,
    });

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(1);
  });
});

describe("runContentPipeline content guidelines gate", () => {
  it("retries draft (skipping geo_seo_optimize) when the draft contains a banned phrase, then succeeds", async () => {
    draftMock
      .mockResolvedValueOnce("# Draft markdown\n\nIt depends on your policy.")
      .mockResolvedValueOnce("# Draft markdown\n\nMost insurers require notice within 30 days.");
    geoSeoOptimizeMock.mockResolvedValueOnce(VALID_GEO_SEO);

    const result = await runContentPipeline({
      organizationId: "org-1",
      topicHint: "coffee gear",
    });

    expect(result.status).toBe("succeeded");
    expect(draftMock).toHaveBeenCalledTimes(2);
    expect(geoSeoOptimizeMock).toHaveBeenCalledTimes(1);
    expect(draftMock.mock.calls[1][0].feedback).toContain("it depends");
  });

  it("throws PipelineValidationError after 3 attempts if the draft always contains a banned phrase, without ever calling geo_seo_optimize", async () => {
    draftMock.mockResolvedValue("# Draft markdown\n\nAs mentioned above, rates vary.");

    await expect(
      runContentPipeline({ organizationId: "org-1", topicHint: "coffee gear" })
    ).rejects.toThrow(PipelineValidationError);

    expect(draftMock).toHaveBeenCalledTimes(3);
    expect(geoSeoOptimizeMock).not.toHaveBeenCalled();
  });

  it("checked unconditionally, unlike the site-reference gate — runs even when no site is given", async () => {
    draftMock.mockResolvedValue("# Draft markdown\n\nThat's a great question, honestly.");

    await expect(
      runContentPipeline({ organizationId: "org-1", topicHint: "coffee gear" })
    ).rejects.toThrow(PipelineValidationError);
  });
});
