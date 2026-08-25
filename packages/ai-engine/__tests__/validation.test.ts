import { describe, expect, it } from "vitest";
import type { GeoSeoOutput } from "../schemas";
import { validateGeoSeoOutput } from "../validation";

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
