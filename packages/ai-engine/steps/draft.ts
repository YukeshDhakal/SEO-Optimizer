import { generateText } from "ai";
import { buildGuidelineBlock, type ContentType } from "../content-guidelines";
import { getModel } from "../model";
import type { Outline, ResearchResult, SiteIdentity, TopicSelection } from "../schemas";
import { stripAiDashes } from "../text-sanitize";

export interface DraftInput {
  organizationId: string;
  topic: TopicSelection;
  outline: Outline;
  research: ResearchResult;
  // Corrective feedback from a prior failed `geo_seo_optimize` pass — see
  // `pipeline.ts`'s retry loop. Undefined on the first attempt.
  feedback?: string;
  // The site this post is being written for. Optional so existing callers
  // that predate this field (tests, the legacy plain-function pipeline)
  // keep working — when present, the prompt asks for a link/mention back to
  // it, and `validation.ts`'s `validateSiteReference` deterministically
  // checks the result actually contains one; the prompt instruction alone
  // is not trusted to be enough, same reasoning as every other
  // model-reliability fix this pipeline has needed.
  site?: SiteIdentity;
  // "blog" (default) or "faq" — see content-guidelines.ts. Must match
  // whatever contentType the outline step was given, since the outline's
  // own section count/shape already reflects it; passed separately here
  // (not derived from outline.sections.length) so the draft prompt's
  // structure guidance and the outline's actual structure never disagree.
  contentType?: ContentType;
}

const SYSTEM_PROMPT = `You write in a clear, direct, trustworthy voice for a business blog, following the SEO + GEO Content Guidelines given in the prompt below. Every article must be genuinely useful on its own — write for a human reader first, in a way that also happens to read cleanly for an AI answer engine (GEO/AEO). Never fabricate a fact, statistic, or source that wasn't provided to you. Never use an em dash or en dash (—, –); write a plain comma, period, or new sentence instead.`;

export const draft = async (input: DraftInput): Promise<string> => {
  const contentType = input.contentType ?? "blog";

  const feedbackBlock = input.feedback
    ? `\n\nThe previous draft was rejected by SEO/GEO validation for these reasons — fix them explicitly in this rewrite:\n${input.feedback}`
    : "";

  const siteBlock = input.site
    ? input.site.baseUrl
      ? `\n\nSomewhere natural in the body, include exactly one markdown link back to the site this post is for: [descriptive anchor text](${input.site.baseUrl}) — the anchor text must describe what the reader will find there, never "click here" or "learn more".`
      : `\n\nMention "${input.site.displayName}" by name at least once in the body — no link is needed.`
    : "";

  const { text } = await generateText({
    model: getModel(input.organizationId),
    system: SYSTEM_PROMPT,
    prompt: `Write the full article as Markdown for "${input.topic.topic}" (primary keyword: "${input.topic.primaryKeyword}"), following this outline exactly (lead answer, each section, then the FAQ section) and the SEO + GEO Content Guidelines below.

${buildGuidelineBlock(contentType)}

Outline to follow:
${JSON.stringify(input.outline, null, 2)}

Ground every factual claim in these known facts — do not introduce new facts:
${input.research.facts.map((f) => `- ${f}`).join("\n")}${siteBlock}${feedbackBlock}`,
  });

  return stripAiDashes(text);
};
