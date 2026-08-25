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
}

export interface ResearchResult {
  facts: string[];
  sources: ResearchSource[];
  candidateFaqs: string[];
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
export const geoSeoOutputSchema = z.object({
  metaTitle: z.string(),
  metaDescription: z.string(),
  schemaJsonLd: z.unknown(),
  keywordDensity: z.number(),
  citationCount: z.number().int(),
  readabilityScore: z.number(),
});
export type GeoSeoOutput = z.infer<typeof geoSeoOutputSchema>;
