import { generateObject, generateText, type ToolSet } from "ai";
import { getModel, getSearchTool } from "../model";
import { researchNotesSchema, type ResearchResult } from "../schemas";

export interface ResearchInput {
  organizationId: string;
  topic: string;
  primaryKeyword: string;
}

// Real web-search-tool support: `@ai-sdk/anthropic`'s `webSearch_20260209`
// is a provider-executed tool, so `generateText`'s own `.sources` are real
// citations Claude actually found — not something a later `generateObject`
// call is asked to invent. Two calls, not one: `generateObject` cannot
// itself use tools+schema together reliably, so this gathers raw findings
// with the search tool first, then structures the *text* (facts/FAQs only —
// never sources, which stay exactly what the search tool returned).
export const research = async (
  input: ResearchInput
): Promise<ResearchResult> => {
  const model = getModel(input.organizationId);

  // Cast: the Anthropic provider's server-executed search tool has a more
  // specific generic shape than `ToolSet`'s structural type can express
  // cleanly (its `inputSchema` generic doesn't unify with `FlexibleSchema
  // <never>`) — this is a real, runtime-correct provider tool, not an `any`
  // escape hatch for our own code.
  const searchResult = await generateText({
    model,
    tools: { web_search: getSearchTool() } as ToolSet,
    prompt: `Research "${input.topic}" (primary keyword: "${input.primaryKeyword}") using web search. Gather concrete, citable facts and note questions a reader would want answered (candidate FAQs). Write up your findings in plain prose.`,
  });

  const sources = searchResult.sources
    .filter(
      (source): source is Extract<(typeof searchResult.sources)[number], { sourceType: "url" }> =>
        source.sourceType === "url"
    )
    .map((source) => ({ title: source.title ?? null, url: source.url }));

  const { object: notes } = await generateObject({
    model,
    schema: researchNotesSchema,
    prompt: `Extract structured research notes from these findings. Only use facts actually stated below — do not add anything you weren't told.\n\nFindings:\n${searchResult.text}`,
  });

  return { facts: notes.facts, sources, candidateFaqs: notes.candidateFaqs };
};
