import { generateObject } from "ai";
import { getModel } from "../model";
import {
  geoSeoModelOutputSchema,
  type GeoSeoOutput,
  type Outline,
  type SiteIdentity,
} from "../schemas";
import type { ResearchResult } from "../schemas";
import { stripAiDashes } from "../text-sanitize";

export interface GeoSeoOptimizeInput {
  organizationId: string;
  draftMarkdown: string;
  research: ResearchResult;
  // Only needed to build schemaJsonLd deterministically below (headline +
  // FAQ entries) — the model is no longer asked to produce schemaJsonLd
  // itself. See that field's own comment for why.
  outline: Outline;
  // Corrective feedback from a prior failed `validateGeoSeoOutput` pass —
  // see pipeline.ts's retry loop. Undefined on the first attempt. Critical
  // that this exists as its own parameter (not just threaded into `draft`'s
  // feedback): metaDescription length is entirely this step's own output,
  // invisible to and uninfluenced by the draft step, so a validation
  // failure on it specifically could never self-correct across retries
  // without this.
  feedback?: string;
  // Feeds schemaJsonLd's author/publisher fields (below) — entity fields
  // that strengthen citation eligibility for AI answer engines specifically
  // (per this session's SEO/GEO research pass), on top of the
  // Article/FAQPage nodes that already existed. Optional, same as `site` on
  // DraftInput.
  site?: SiteIdentity;
}

// Builds the FAQPage/Article JSON-LD deterministically from data the
// pipeline already has, rather than asking the model to hand-construct
// nested JSON-LD from a prose description. This used to be a model-
// generated field (with an explicit shape example in the prompt as a
// pattern to copy) and was, in practice, the single most unreliable part
// of this step: even Claude occasionally dropped a node, and Gemini
// Flash failed to include both nodes on 3 straight attempts in one real
// run — feedback-driven retries couldn't fix it because the model kept
// making the same structural mistake independent of the prose telling it
// not to. The FAQ content this needs already exists, validated, from the
// `outline` step (`outlineSchema.faqSection` requires >= 1 entry), so
// there's no reason to regenerate it here at all — every retry attempt
// now gets a guaranteed-correct schemaJsonLd for free, and the SEO/GEO
// gate's Article/FAQPage checks (validation.ts) can never fail on shape
// again, regardless of which model is in getModel().
// Exported for direct unit testing (see __tests__/geo-seo-optimize.test.ts)
// — everything else in this file makes a real `generateObject` call, so
// this pure function is the one piece of the reliability fix that's
// practical to test without mocking the AI SDK.
//
// author/publisher/datePublished/dateModified added per this session's
// SEO/GEO research pass: these entity fields strengthen citation
// eligibility for AI answer engines (Gemini/AI Overviews) specifically, on
// top of the Article/FAQPage nodes that already existed. Deliberately
// `Organization`, never `Person`, for both fields — this is AI-generated
// content with no named human author, and asserting one would misrepresent
// it. `now` defaults to the real current time but is an explicit parameter
// so tests can assert an exact value instead of a moving target.
export const buildSchemaJsonLd = (
  outline: Outline,
  headline: string,
  description: string,
  site?: SiteIdentity,
  now: Date = new Date()
): unknown => {
  const publishedAt = now.toISOString();
  const organization = site
    ? {
        "@type": "Organization",
        name: site.displayName,
        ...(site.baseUrl ? { url: site.baseUrl } : {}),
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline,
        description,
        datePublished: publishedAt,
        dateModified: publishedAt,
        ...(organization ? { author: organization, publisher: organization } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: outline.faqSection.map((entry) => ({
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
        })),
      },
    ],
  };
};

// Produces the candidate output for `validateGeoSeoOutput` (validation.ts)
// to actually gate on — this step itself does not decide pass/fail, it only
// generates the structured metadata the orchestrator's pure validator then
// judges. Keeping the model call and the judgment separate is what makes
// the retry loop unit-testable.
export const geoSeoOptimize = async (
  input: GeoSeoOptimizeInput
): Promise<GeoSeoOutput> => {
  const feedbackBlock = input.feedback
    ? `\n\nThe previous attempt at this exact task was REJECTED for these reasons — you must fix every one of them this time:\n${input.feedback}\n`
    : "";

  const { object } = await generateObject({
    model: getModel(input.organizationId),
    schema: geoSeoModelOutputSchema,
    prompt: `Given this article draft, produce SEO/GEO metadata. These are hard, machine-checked constraints — count characters yourself before answering, do not estimate:

- metaTitle: PLAIN TEXT, between 10 and 60 characters (60 is the SERP display limit — a longer title just gets truncated). Count the characters. If your first draft of the title is outside that range, shorten or lengthen it before answering.
- metaDescription: PLAIN TEXT, between 50 and 160 characters — not "around" 160, not "roughly" 50. Count the characters in the exact string you are about to output. If it is 161+ or under 50, rewrite it shorter/longer until it fits, then count again.
- keywordDensity: the primary keyword's frequency as a 0-1 fraction of total words
- citationCount: how many of the ${input.research.sources.length} available source(s) below the draft actually cites or draws on (0 if none) — never more than ${input.research.sources.length}
- readabilityScore: 0-100 (Flesch-reading-ease-style estimate; higher = easier to read)${feedbackBlock}

Available sources:
${input.research.sources.map((s) => `- ${s.title ?? s.url} (${s.url})`).join("\n") || "(none)"}

Draft:
${input.draftMarkdown}

Before answering, re-check: is metaDescription's length strictly between 50 and 160? Fix it if not, then answer.`,
  });

  // Sanitize before anything downstream sees these strings — both the
  // returned metaTitle/metaDescription AND schemaJsonLd's Article
  // headline/description (built from them below) must be dash-free, and
  // validateGeoSeoOutput's length check runs on this same sanitized string,
  // so a dash-for-comma swap that nudges length is caught by the normal
  // retry loop rather than slipping through unchecked.
  const metaTitle = stripAiDashes(object.metaTitle);
  const metaDescription = stripAiDashes(object.metaDescription);

  return {
    ...object,
    metaTitle,
    metaDescription,
    schemaJsonLd: buildSchemaJsonLd(input.outline, metaTitle, metaDescription, input.site),
  };
};
