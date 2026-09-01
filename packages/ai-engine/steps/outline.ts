import { generateObject } from "ai";
import { buildGuidelineBlock, type ContentType } from "../content-guidelines";
import { getModel } from "../model";
import { type Outline, outlineSchema, type ResearchResult, type TopicSelection } from "../schemas";
import { stripAiDashes } from "../text-sanitize";

export interface OutlineInput {
  organizationId: string;
  topic: TopicSelection;
  research: ResearchResult;
  // "blog" (default) or "faq" — see content-guidelines.ts's
  // CONTENT_TYPE_STRUCTURE. Optional so existing callers/tests that
  // predate this field keep defaulting to the standard blog structure.
  contentType?: ContentType;
}

// leadAnswer/heading/bullets/faqSection text all flow straight into the
// final article (and, for faqSection specifically, straight into the
// customer-facing FAQPage JSON-LD via buildSchemaJsonLd in
// steps/geo-seo-optimize.ts) — sanitize every free-text field here so no
// em-dash survives regardless of which downstream step consumes it.
const sanitizeOutline = (object: Outline): Outline => ({
  leadAnswer: stripAiDashes(object.leadAnswer),
  sections: object.sections.map((section) => ({
    heading: stripAiDashes(section.heading),
    bullets: section.bullets.map(stripAiDashes),
  })),
  faqSection: object.faqSection.map((entry) => ({
    question: stripAiDashes(entry.question),
    answer: stripAiDashes(entry.answer),
  })),
});

export const outline = async (input: OutlineInput): Promise<Outline> => {
  const contentType = input.contentType ?? "blog";

  const { object } = await generateObject({
    model: getModel(input.organizationId),
    schema: outlineSchema,
    prompt: `Produce an article outline for "${input.topic.topic}" (primary keyword: "${input.topic.primaryKeyword}"), optimized for both traditional SEO and generative-engine/AI-answer-engine retrieval (GEO/AEO), following the SEO + GEO Content Guidelines below.

${buildGuidelineBlock(contentType)}

leadAnswer must be the 40-60 word direct-answer block described above — quotable standalone, no preamble. Each outline section's bullets should sketch the concrete facts/figures that section's eventual 130-160 word passage will state, not vague talking points. faqSection questions must be sourced from real reader demand (the candidate questions below, or genuine follow-on questions the topic implies) — never invented to fill a count, and no two questions should share an answer.

Known facts:
${input.research.facts.map((f) => `- ${f}`).join("\n")}

Candidate FAQ questions:
${input.research.candidateFaqs.map((q) => `- ${q}`).join("\n")}`,
  });
  return sanitizeOutline(object);
};
