import { describe, expect, it, vi } from "vitest";

// buildSchemaJsonLd is a pure function, but it lives in the same module as
// geoSeoOptimize(), which imports `../model` (guarded by `server-only`) and
// `generateObject` from "ai". Mock both so importing the module for the one
// pure function we want doesn't drag in that server-only guard — matching
// the pattern __tests__/pipeline.test.ts already uses for sibling steps.
vi.mock("../model", () => ({ getModel: vi.fn() }));
vi.mock("ai", () => ({ generateObject: vi.fn() }));

import { buildSchemaJsonLd } from "../steps/geo-seo-optimize";
import { validateGeoSeoOutput } from "../validation";
import type { Outline, SiteIdentity } from "../schemas";

// Regression coverage for the reliability fix: schemaJsonLd used to be
// model-generated and, in practice, unreliable (a real production run
// failed 3 straight attempts because the model kept omitting the FAQPage
// node). It's now built deterministically from `outline.faqSection` — this
// file proves that construction is correct on its own, and that it always
// satisfies validateGeoSeoOutput's Article/FAQPage checks regardless of
// what the model itself produces, since the model is no longer involved.
const OUTLINE: Outline = {
  leadAnswer: "A direct answer a reader wants immediately.",
  sections: [{ heading: "Section 1", bullets: ["a"] }],
  faqSection: [
    { question: "What is an espresso machine?", answer: "A device that brews espresso." },
    { question: "How much do they cost?", answer: "Anywhere from $50 to $2000+." },
  ],
};

describe("buildSchemaJsonLd", () => {
  it("includes exactly one Article node and one FAQPage node", () => {
    const jsonLd = buildSchemaJsonLd(OUTLINE, "Headline", "Description") as {
      "@graph": { "@type": string }[];
    };

    const types = jsonLd["@graph"].map((node) => node["@type"]);
    expect(types).toContain("Article");
    expect(types).toContain("FAQPage");
  });

  it("builds one mainEntity Question per outline FAQ entry, preserving question/answer text", () => {
    const jsonLd = buildSchemaJsonLd(OUTLINE, "Headline", "Description") as {
      "@graph": { "@type": string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[];
    };

    const faqPage = jsonLd["@graph"].find((node) => node["@type"] === "FAQPage");
    expect(faqPage?.mainEntity).toHaveLength(OUTLINE.faqSection.length);
    expect(faqPage?.mainEntity?.[0].name).toBe(OUTLINE.faqSection[0].question);
    expect(faqPage?.mainEntity?.[0].acceptedAnswer.text).toBe(OUTLINE.faqSection[0].answer);
  });

  it("carries the given headline/description onto the Article node", () => {
    const jsonLd = buildSchemaJsonLd(OUTLINE, "My Headline", "My Description") as {
      "@graph": { "@type": string; headline?: string; description?: string }[];
    };

    const article = jsonLd["@graph"].find((node) => node["@type"] === "Article");
    expect(article?.headline).toBe("My Headline");
    expect(article?.description).toBe("My Description");
  });

  it("always satisfies validateGeoSeoOutput's Article/FAQPage checks, regardless of model output", () => {
    const schemaJsonLd = buildSchemaJsonLd(OUTLINE, "Headline", "Description");

    const result = validateGeoSeoOutput(
      {
        metaTitle: "A Valid Title",
        metaDescription:
          "A valid meta description that sits comfortably inside the fifty to one hundred sixty character window.",
        schemaJsonLd,
        keywordDensity: 0.02,
        citationCount: 0,
        readabilityScore: 60,
      },
      0
    );

    expect(result.issues).not.toContain("schemaJsonLd must include an Article node");
    expect(result.issues).not.toContain("schemaJsonLd must include a FAQPage node");
  });

  it("stamps datePublished/dateModified using the given `now`, not the real clock", () => {
    const now = new Date("2026-08-31T00:00:00.000Z");
    const jsonLd = buildSchemaJsonLd(
      OUTLINE,
      "Headline",
      "Description",
      undefined,
      now
    ) as { "@graph": { "@type": string; datePublished?: string; dateModified?: string }[] };

    const article = jsonLd["@graph"].find((node) => node["@type"] === "Article");
    expect(article?.datePublished).toBe("2026-08-31T00:00:00.000Z");
    expect(article?.dateModified).toBe("2026-08-31T00:00:00.000Z");
  });

  it("omits author/publisher when no site is given", () => {
    const jsonLd = buildSchemaJsonLd(OUTLINE, "Headline", "Description") as {
      "@graph": { "@type": string; author?: unknown; publisher?: unknown }[];
    };
    const article = jsonLd["@graph"].find((node) => node["@type"] === "Article");
    expect(article?.author).toBeUndefined();
    expect(article?.publisher).toBeUndefined();
  });

  it("sets author/publisher to an Organization (never a Person) matching the site's identity", () => {
    const site: SiteIdentity = { baseUrl: "https://quoteengine.dev", displayName: "Quote Engine" };
    const jsonLd = buildSchemaJsonLd(OUTLINE, "Headline", "Description", site) as {
      "@graph": {
        "@type": string;
        author?: { "@type": string; name: string; url?: string };
        publisher?: { "@type": string; name: string; url?: string };
      }[];
    };

    const article = jsonLd["@graph"].find((node) => node["@type"] === "Article");
    expect(article?.author).toEqual({
      "@type": "Organization",
      name: "Quote Engine",
      url: "https://quoteengine.dev",
    });
    expect(article?.publisher).toEqual(article?.author);
  });

  it("omits the publisher/author url when the site has no base_url yet", () => {
    const site: SiteIdentity = { baseUrl: null, displayName: "Quote Engine" };
    const jsonLd = buildSchemaJsonLd(OUTLINE, "Headline", "Description", site) as {
      "@graph": { "@type": string; author?: { url?: string } }[];
    };

    const article = jsonLd["@graph"].find((node) => node["@type"] === "Article");
    expect(article?.author?.url).toBeUndefined();
  });
});
