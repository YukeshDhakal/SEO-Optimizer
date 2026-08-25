import { generateObject } from "ai";
import { getModel } from "../model";
import { type Outline, outlineSchema, type ResearchResult, type TopicSelection } from "../schemas";

export interface OutlineInput {
  organizationId: string;
  topic: TopicSelection;
  research: ResearchResult;
}

export const outline = async (input: OutlineInput): Promise<Outline> => {
  const { object } = await generateObject({
    model: getModel(input.organizationId),
    schema: outlineSchema,
    prompt: `Produce an article outline for "${input.topic.topic}" (primary keyword: "${input.topic.primaryKeyword}"), optimized for both traditional SEO and generative-engine/AI-answer-engine retrieval (GEO/AEO): it MUST open with a direct-answer lead paragraph a reader (or an AI summarizer) can quote standalone, and MUST include an FAQ section answering real reader questions.

Known facts:
${input.research.facts.map((f) => `- ${f}`).join("\n")}

Candidate FAQ questions:
${input.research.candidateFaqs.map((q) => `- ${q}`).join("\n")}`,
  });
  return object;
};
