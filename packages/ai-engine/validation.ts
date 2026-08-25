import type { GeoSeoOutput } from "./schemas";

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

const hasJsonLdType = (node: unknown, type: string): boolean => {
  if (Array.isArray(node)) {
    return node.some((entry) => hasJsonLdType(entry, type));
  }
  if (!node || typeof node !== "object") {
    return false;
  }
  const record = node as Record<string, unknown>;
  const nodeType = record["@type"];
  const matchesHere =
    nodeType === type || (Array.isArray(nodeType) && nodeType.includes(type));
  if (matchesHere) {
    return true;
  }
  const graph = record["@graph"];
  return graph !== undefined && hasJsonLdType(graph, type);
};

// The `geo_seo_optimize` gate, as plain data-in/data-out logic — no model
// call here, which is what makes the retry loop around this actually
// testable without a live Anthropic key. This is a hard blocker: every rule
// below must pass, not just "mostly" pass.
export const validateGeoSeoOutput = (
  output: GeoSeoOutput,
  researchSourceCount: number
): ValidationResult => {
  const issues: string[] = [];

  if (output.metaTitle.length < 10 || output.metaTitle.length > 70) {
    issues.push(
      `metaTitle must be 10-70 characters (got ${output.metaTitle.length})`
    );
  }

  if (output.metaDescription.length < 50 || output.metaDescription.length > 160) {
    issues.push(
      `metaDescription must be 50-160 characters (got ${output.metaDescription.length})`
    );
  }

  if (!hasJsonLdType(output.schemaJsonLd, "Article")) {
    issues.push("schemaJsonLd must include an Article node");
  }
  if (!hasJsonLdType(output.schemaJsonLd, "FAQPage")) {
    issues.push("schemaJsonLd must include a FAQPage node");
  }

  if (researchSourceCount > 0 && output.citationCount <= 0) {
    issues.push(
      `citationCount must be > 0 when research found ${researchSourceCount} source(s)`
    );
  }
  if (output.citationCount > researchSourceCount) {
    issues.push(
      `citationCount (${output.citationCount}) exceeds the ${researchSourceCount} source(s) research actually found`
    );
  }

  if (output.keywordDensity < 0 || output.keywordDensity > 1) {
    issues.push(
      `keywordDensity must be a 0-1 fraction (got ${output.keywordDensity})`
    );
  }

  if (output.readabilityScore < 0 || output.readabilityScore > 100) {
    issues.push(
      `readabilityScore must be 0-100 (got ${output.readabilityScore})`
    );
  }

  return { valid: issues.length === 0, issues };
};
