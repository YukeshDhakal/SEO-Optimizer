import { generateObject } from "ai";
import { getModel } from "../model";
import { type GeoSeoOutput, geoSeoOutputSchema } from "../schemas";
import type { ResearchResult } from "../schemas";

export interface GeoSeoOptimizeInput {
  organizationId: string;
  draftMarkdown: string;
  research: ResearchResult;
}

// Produces the candidate output for `validateGeoSeoOutput` (validation.ts)
// to actually gate on — this step itself does not decide pass/fail, it only
// generates the structured metadata the orchestrator's pure validator then
// judges. Keeping the model call and the judgment separate is what makes
// the retry loop unit-testable.
export const geoSeoOptimize = async (
  input: GeoSeoOptimizeInput
): Promise<GeoSeoOutput> => {
  const { object } = await generateObject({
    model: getModel(input.organizationId),
    schema: geoSeoOutputSchema,
    prompt: `Given this article draft, produce SEO/GEO metadata:
- metaTitle: 10-70 characters
- metaDescription: 50-160 characters
- schemaJsonLd: valid JSON-LD, an array or @graph containing BOTH an "Article" node and a "FAQPage" node (built from the article's own FAQ section)
- keywordDensity: the primary keyword's frequency as a 0-1 fraction of total words
- citationCount: how many of the ${input.research.sources.length} available source(s) below the draft actually cites or draws on (0 if none)
- readabilityScore: 0-100 (Flesch-reading-ease-style estimate; higher = easier to read)

Available sources:
${input.research.sources.map((s) => `- ${s.title ?? s.url} (${s.url})`).join("\n") || "(none)"}

Draft:
${input.draftMarkdown}`,
  });
  return object;
};
