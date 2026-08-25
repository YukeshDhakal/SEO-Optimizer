import { generateText } from "ai";
import { getModel } from "../model";
import type { Outline, ResearchResult, TopicSelection } from "../schemas";

export interface DraftInput {
  organizationId: string;
  topic: TopicSelection;
  outline: Outline;
  research: ResearchResult;
  // Corrective feedback from a prior failed `geo_seo_optimize` pass — see
  // `pipeline.ts`'s retry loop. Undefined on the first attempt.
  feedback?: string;
}

const SYSTEM_PROMPT = `You write in a clear, direct, trustworthy voice for a business blog. Every article must be genuinely useful on its own — write for a human reader first, in a way that also happens to read cleanly for an AI answer engine (GEO/AEO): a quotable direct-answer opening, well-labeled sections, and a real FAQ block. Never fabricate a fact, statistic, or source that wasn't provided to you.`;

export const draft = async (input: DraftInput): Promise<string> => {
  const feedbackBlock = input.feedback
    ? `\n\nThe previous draft was rejected by SEO/GEO validation for these reasons — fix them explicitly in this rewrite:\n${input.feedback}`
    : "";

  const { text } = await generateText({
    model: getModel(input.organizationId),
    system: SYSTEM_PROMPT,
    prompt: `Write the full article as Markdown for "${input.topic.topic}" (primary keyword: "${input.topic.primaryKeyword}"), following this outline exactly (lead answer, each section, then the FAQ section):

${JSON.stringify(input.outline, null, 2)}

Ground every factual claim in these known facts — do not introduce new facts:
${input.research.facts.map((f) => `- ${f}`).join("\n")}${feedbackBlock}`,
  });

  return text;
};
