import { describe, expect, it } from "vitest";
import type { GeoSeoOutput, SiteIdentity } from "../schemas";
import {
  validateContentGuidelines,
  validateGeoSeoOutput,
  validateSiteReference,
} from "../validation";

const validOutput: GeoSeoOutput = {
  metaTitle: "A perfectly reasonable title",
  metaDescription:
    "A meta description that is comfortably within the fifty to one hundred sixty character window required by the gate.",
  schemaJsonLd: [
    { "@type": "Article", headline: "x" },
    { "@type": "FAQPage", mainEntity: [] },
  ],
  keywordDensity: 0.02,
  citationCount: 2,
  readabilityScore: 65,
};

describe("validateGeoSeoOutput", () => {
  it("passes a well-formed output with matching source count", () => {
    const result = validateGeoSeoOutput(validOutput, 3);
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("rejects a metaTitle that's too short", () => {
    const result = validateGeoSeoOutput({ ...validOutput, metaTitle: "Hi" }, 3);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("metaTitle"))).toBe(true);
  });

  it("rejects a metaTitle over 60 characters (the SERP display limit per the SEO+GEO guidelines)", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, metaTitle: "A".repeat(65) },
      3
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("metaTitle"))).toBe(true);
  });

  it("accepts a metaTitle right at the 60 character ceiling", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, metaTitle: "A".repeat(60) },
      3
    );
    expect(result.issues.some((i) => i.includes("metaTitle"))).toBe(false);
  });

  it("rejects schemaJsonLd missing the FAQPage node", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, schemaJsonLd: [{ "@type": "Article" }] },
      3
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("FAQPage"))).toBe(true);
  });

  it("rejects schemaJsonLd missing the Article node", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, schemaJsonLd: [{ "@type": "FAQPage" }] },
      3
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("Article"))).toBe(true);
  });

  it("accepts an @graph-shaped schemaJsonLd", () => {
    const result = validateGeoSeoOutput(
      {
        ...validOutput,
        schemaJsonLd: {
          "@graph": [{ "@type": "Article" }, { "@type": "FAQPage" }],
        },
      },
      3
    );
    expect(result.valid).toBe(true);
  });

  it("rejects citationCount of 0 when sources exist", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, citationCount: 0 },
      3
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("citationCount"))).toBe(true);
  });

  it("accepts citationCount of 0 when there are no sources", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, citationCount: 0 },
      0
    );
    expect(result.valid).toBe(true);
  });

  it("rejects citationCount exceeding the available source count", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, citationCount: 5 },
      2
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("citationCount"))).toBe(true);
  });

  it("rejects an out-of-range keywordDensity", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, keywordDensity: 1.5 },
      3
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an out-of-range readabilityScore", () => {
    const result = validateGeoSeoOutput(
      { ...validOutput, readabilityScore: 150 },
      3
    );
    expect(result.valid).toBe(false);
  });

  it("collects every violated rule, not just the first", () => {
    const result = validateGeoSeoOutput(
      {
        metaTitle: "x",
        metaDescription: "too short",
        schemaJsonLd: {},
        keywordDensity: 5,
        citationCount: 9,
        readabilityScore: -1,
      },
      2
    );
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(3);
  });
});

describe("validateSiteReference", () => {
  const site: SiteIdentity = {
    baseUrl: "https://quoteengine.dev",
    displayName: "Quote Engine",
  };

  it("passes a draft with a markdown link to the site's base_url", () => {
    const result = validateSiteReference(
      "Start by comparing rates with [Quote Engine](https://quoteengine.dev).",
      site
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("passes a link to a subpath, not just the exact homepage", () => {
    const result = validateSiteReference(
      "Get a [free quote](https://quoteengine.dev/get-started) in minutes.",
      site
    );
    expect(result.valid).toBe(true);
  });

  it("passes regardless of http/https and www variance", () => {
    const result = validateSiteReference(
      "Try it at [Quote Engine](http://www.quoteengine.dev/).",
      site
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a draft with no link to the site at all", () => {
    const result = validateSiteReference(
      "This draft never mentions where to go next.",
      site
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("quoteengine.dev");
  });

  it("rejects a link to an unrelated domain", () => {
    const result = validateSiteReference(
      "Read more on [Wikipedia](https://en.wikipedia.org/wiki/Insurance).",
      site
    );
    expect(result.valid).toBe(false);
  });

  it("falls back to a plain name-mention check when base_url is null", () => {
    const noUrlSite: SiteIdentity = { baseUrl: null, displayName: "Quote Engine" };

    const withMention = validateSiteReference(
      "Quote Engine makes this easy.",
      noUrlSite
    );
    expect(withMention.valid).toBe(true);

    const withoutMention = validateSiteReference(
      "This draft never names the brand.",
      noUrlSite
    );
    expect(withoutMention.valid).toBe(false);
    expect(withoutMention.issues[0]).toContain("Quote Engine");
  });

  it("name-mention fallback is case-insensitive", () => {
    const noUrlSite: SiteIdentity = { baseUrl: null, displayName: "Quote Engine" };
    const result = validateSiteReference("try quote engine today", noUrlSite);
    expect(result.valid).toBe(true);
  });

  it("degrades to the name-mention rule when base_url is unparseable, rather than throwing", () => {
    const badSite: SiteIdentity = { baseUrl: "not-a-real-url", displayName: "Quote Engine" };
    expect(() => validateSiteReference("Quote Engine helps here.", badSite)).not.toThrow();
    expect(validateSiteReference("Quote Engine helps here.", badSite).valid).toBe(true);
  });
});

describe("validateContentGuidelines", () => {
  it("passes a draft with none of the banned phrases", () => {
    const result = validateContentGuidelines(
      "Wind and hail account for 38-48% of all homeowners insurance claims annually, according to the Insurance Information Institute's 2025 data."
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("rejects a draft containing a banned cross-referential phrase", () => {
    const result = validateContentGuidelines(
      "As mentioned above, the deductible rate applies to all claims."
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("as mentioned above");
  });

  it("rejects an FAQ answer opening with 'It depends'", () => {
    const result = validateContentGuidelines("It depends on your specific policy terms.");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("it depends"))).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = validateContentGuidelines("AS MENTIONED ABOVE, rates vary by state.");
    expect(result.valid).toBe(false);
  });

  it("collects every banned phrase present, not just the first", () => {
    const result = validateContentGuidelines(
      "It depends on the policy. As mentioned above, many experts agree this varies."
    );
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(1);
  });

  it("does not false-positive on legitimate uses of common words within banned phrases", () => {
    // "depends" and "mentioned" appear legitimately without forming a
    // banned construction - only the exact phrases should trip the check.
    const result = validateContentGuidelines(
      "The premium depends on your coverage level. The policy mentioned three exclusions."
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });
});
