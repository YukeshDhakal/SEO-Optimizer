import { z } from "zod";

// Structural schemas only — these describe the *shape* `generateObject` must
// produce. Cross-field/business-rule enforcement (the actual GEO/SEO
// "hard blocker" behavior) lives in `validation.ts` as plain, model-free
// functions, deliberately kept separate so they're testable without ever
// touching the AI SDK. `outline`'s FAQ requirement is the one rule enforced
// at the schema level (`.min(1)`) since it's a pure shape constraint, not a
// judgment call.

export const topicSelectionSchema = z.object({
  topic: z.string().min(1),
  primaryKeyword: z.string().min(1),
});
export type TopicSelection = z.infer<typeof topicSelectionSchema>;

export const researchNotesSchema = z.object({
  facts: z.array(z.string().min(1)).min(1),
  candidateFaqs: z.array(z.string().min(1)),
});
export type ResearchNotes = z.infer<typeof researchNotesSchema>;

export interface ResearchSource {
  title: string | null;
  url: string;
  // Phase A: Tavily's raw extracted snippet, kept so steps/research.ts can
  // ground fact-extraction in real source text instead of its own prior
  // prose summary. Optional/additive - every existing consumer (outlineStep,
  // draftStep, geoSeoOptimizeStep) only reads .title/.url and is unaffected.
  content?: string;
}

export interface ResearchResult {
  facts: string[];
  sources: ResearchSource[];
  candidateFaqs: string[];
}

// Phase B: a chunk of previously-gathered research for this site, retrieved
// from research_chunks and passed into research() as grounding context for
// a new run. A typed interface (not a bare string[]) so the prompt can
// attribute each chunk back to its source - mirrors topic-selection.ts's
// TopicSelectionQuery, which keeps @repo/ai-engine DB-agnostic the same way.
export interface ResearchContextChunk {
  chunkText: string;
  sourceTitle: string | null;
  sourceUrl: string;
}

// The customer's own site identity (packages/workflows/db-steps.ts's
// getSiteIdentity reads this from site_connections.base_url/display_name —
// ai-engine itself stays DB-agnostic, same pattern as gscQueries in
// topic-selection.ts). Optional everywhere it's threaded through: a site
// that hasn't finished connecting has `baseUrl: null` (site_connections.
// base_url is nullable), and every caller that omits `site` entirely
// (existing tests, the legacy plain-function pipeline before this field
// existed) just skips the site-reference requirement rather than failing.
export interface SiteIdentity {
  baseUrl: string | null;
  displayName: string;
}

export const outlineSchema = z.object({
  leadAnswer: z
    .string()
    .min(20, "leadAnswer must be a real direct-answer paragraph, not a stub"),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        bullets: z.array(z.string().min(1)).min(1),
      })
    )
    .min(2),
  faqSection: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
      })
    )
    .min(1, "at least one FAQ entry is required"),
});
export type Outline = z.infer<typeof outlineSchema>;

// Permissive on purpose (see file header) — `validation.ts` is the real gate.
// `schemaJsonLd` is deliberately absent from what the model is asked to
// produce (see `geoSeoModelOutputSchema` below) — it's built deterministically
// in steps/geo-seo-optimize.ts from data the pipeline already has, not
// generated freehand, so this full-output type still carries it for
// downstream consumers even though no `generateObject` call targets it.
export const geoSeoOutputSchema = z.object({
  metaTitle: z.string(),
  metaDescription: z.string(),
  schemaJsonLd: z.unknown(),
  keywordDensity: z.number(),
  citationCount: z.number().int(),
  readabilityScore: z.number(),
});
export type GeoSeoOutput = z.infer<typeof geoSeoOutputSchema>;

// What the model actually generates for geo_seo_optimize — everything in
// `geoSeoOutputSchema` except `schemaJsonLd`. Asking a model to hand-
// construct nested JSON-LD (an Article node plus a FAQPage node built from
// the draft's own FAQ section) from a prose description proved unreliable
// in practice — even with an explicit shape example and feedback-driven
// retries, Gemini Flash failed to include both required nodes on 3 straight
// attempts in one real run. The FAQ content and headline this needs already
// exist elsewhere in the pipeline (outline.faqSection, this same object's
// own metaTitle/metaDescription), so there's no reason to regenerate them
// here at all — see `steps/geo-seo-optimize.ts`'s `buildSchemaJsonLd`.
export const geoSeoModelOutputSchema = geoSeoOutputSchema.omit({
  schemaJsonLd: true,
});
