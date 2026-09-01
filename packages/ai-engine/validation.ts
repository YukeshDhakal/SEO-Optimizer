import { BANNED_PHRASES } from "./content-guidelines";
import type { GeoSeoOutput, SiteIdentity } from "./schemas";

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

  if (output.metaTitle.length < 10 || output.metaTitle.length > 60) {
    issues.push(
      `metaTitle must be 10-60 characters (got ${output.metaTitle.length}) - 60 is the SERP display limit`
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

const stripWww = (hostname: string): string => hostname.replace(/^www\./, "");

// Deterministic, not prompt-only — matches the session's established
// pattern (buildSchemaJsonLd, text-sanitize.ts): a model instruction to
// "link back to the site" is exactly the kind of thing that slipped under
// retry pressure for the JSON-LD Article/FAQPage nodes, so this actually
// checks the draft's markdown for a real link (or, when the site has no
// base_url yet, a plain-text name mention) rather than trusting the prompt
// alone. Runs against `draftMarkdown` directly — independent of
// `validateGeoSeoOutput`, which only ever sees geo_seo_optimize's output —
// so callers can check it right after the `draft` step, before spending a
// geo_seo_optimize call on a draft that's already known to be missing it.
export const validateSiteReference = (
  draftMarkdown: string,
  site: SiteIdentity
): ValidationResult => {
  if (!site.baseUrl) {
    const mentioned = draftMarkdown
      .toLowerCase()
      .includes(site.displayName.toLowerCase());
    return mentioned
      ? { valid: true, issues: [] }
      : {
          valid: false,
          issues: [`draft must mention "${site.displayName}" by name at least once`],
        };
  }

  let targetHost: string;
  try {
    targetHost = stripWww(new URL(site.baseUrl).hostname);
  } catch {
    // An unparseable base_url shouldn't block every generation — degrade to
    // the no-URL name-mention rule rather than hard-failing on bad site data.
    return validateSiteReference(draftMarkdown, { ...site, baseUrl: null });
  }

  const linkTargets = [...draftMarkdown.matchAll(/\]\(([^)]+)\)/g)].map(
    (match) => match[1]
  );
  const hasSiteLink = linkTargets.some((href) => {
    try {
      return stripWww(new URL(href, site.baseUrl ?? undefined).hostname) === targetHost;
    } catch {
      return false;
    }
  });

  return hasSiteLink
    ? { valid: true, issues: [] }
    : {
        valid: false,
        issues: [`draft must include a markdown link back to ${targetHost}`],
      };
};

// Deterministic backstop for the SEO + GEO Content Guidelines' literal
// "never write X" phrases (content-guidelines.ts's BANNED_PHRASES) — the
// prompt already instructs the model not to use these, but per this
// pipeline's whole track record (JSON-LD nodes, em-dashes, the site link),
// a prompt instruction alone is not trusted for anything checkable in
// code. Deliberately narrow: only literal, unambiguous phrases the source
// spec calls a failure regardless of context (never a fuzzy heuristic like
// "flag the word 'many'", which would false-positive on legitimate uses
// like "many homeowners"). Runs against `draftMarkdown` directly, same as
// validateSiteReference, so it can be checked right after `draft` and
// before spending a geo_seo_optimize call on a draft already known to fail.
export const validateContentGuidelines = (draftMarkdown: string): ValidationResult => {
  const lower = draftMarkdown.toLowerCase();
  const issues = BANNED_PHRASES.filter((phrase) => lower.includes(phrase)).map(
    (phrase) => `draft must not contain the banned phrase "${phrase}"`
  );
  return { valid: issues.length === 0, issues };
};
