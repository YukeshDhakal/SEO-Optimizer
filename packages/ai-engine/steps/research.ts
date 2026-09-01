import { generateObject, generateText, stepCountIs } from "ai";
import { getModel } from "../model";
import { webSearchTool, type WebSearchResult } from "../search";
import { researchNotesSchema, type ResearchResult } from "../schemas";

export interface ResearchInput {
  organizationId: string;
  topic: string;
  primaryKeyword: string;
}

// Tavily's `webSearchTool` is a plain client-side tool (unlike Anthropic's
// old provider-executed `webSearch_20260209`), so citations don't arrive
// via `generateText`'s own `.sources` — they're collected from the tool's
// own results across every step of the tool-calling loop instead (hence
// `stopWhen: stepCountIs(4)`, letting the model call the tool more than
// once before it has to produce a final text answer). Two calls, not one:
// `generateObject` cannot itself use tools+schema together reliably, so
// this gathers raw findings with the search tool first, then structures
// the *text* (facts/FAQs only — never sources, which stay exactly what
// Tavily actually returned).
export const research = async (
  input: ResearchInput
): Promise<ResearchResult> => {
  const model = getModel(input.organizationId);

  const searchResult = await generateText({
    model,
    tools: { web_search: webSearchTool },
    stopWhen: stepCountIs(4),
    prompt: `Research "${input.topic}" (primary keyword: "${input.primaryKeyword}") using the web_search tool. Gather concrete, citable facts and note questions a reader would want answered (candidate FAQs). Write up your findings in plain prose.`,
  });

  const seenUrls = new Set<string>();
  const sources = searchResult.toolResults
    .filter(
      (result): result is typeof result & { output: { results: WebSearchResult[] } } =>
        !result.dynamic && result.toolName === "web_search"
    )
    .flatMap((result) => result.output.results)
    .filter((result) => {
      if (seenUrls.has(result.url)) {
        return false;
      }
      seenUrls.add(result.url);
      return true;
    })
    .map((result) => ({ title: result.title, url: result.url }));

  const { object: notes } = await generateObject({
    model,
    schema: researchNotesSchema,
    prompt: `Extract structured research notes from these findings. Only use facts actually stated below — do not add anything you weren't told.\n\nFindings:\n${searchResult.text}`,
  });

  return { facts: notes.facts, sources, candidateFaqs: notes.candidateFaqs };
};
