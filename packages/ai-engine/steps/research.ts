import { generateObject, generateText, NoObjectGeneratedError, stepCountIs } from "ai";
import { getModel } from "../model";
import { webSearchTool, type WebSearchResult } from "../search";
import {
  researchNotesSchema,
  type ResearchContextChunk,
  type ResearchNotes,
  type ResearchResult,
} from "../schemas";

export interface ResearchInput {
  organizationId: string;
  topic: string;
  primaryKeyword: string;
  // Phase B: prior research for this site, retrieved by
  // packages/workflows/ai-steps.ts's fetchResearchContextStep before this
  // step runs. Rendered as its own labeled prompt block, kept separate from
  // this run's own rawExcerpts - never folded into the returned `sources`,
  // so validateGeoSeoOutput's citationCount (checked against
  // researchResult.sources.length) stays scoped to this run's own live
  // Tavily results and reused research is never misrepresented as a fresh
  // citation.
  priorContext?: ResearchContextChunk[];
}

// Matches embedding.ts's slice(0, 8000) "stay well under the model's input
// token limit" convention, scaled down per-source since several sources go
// into one prompt.
const MAX_SOURCE_EXCERPT_CHARS = 1500;

const MAX_FALLBACK_FACTS = 8;

// Real production failure (2 of 3 live runs in one hard-test session):
// Gemini's generateObject call for researchNotesSchema throws
// NoObjectGeneratedError - "response did not match schema" - deterministically
// for some topics, so the Workflow DevKit step's own 3x retry (which reruns
// this whole function, including a fresh Tavily search, from the top each
// time) hit the same wall 3 times and killed the entire pipeline run before
// outline/draft/duplicate_check ever ran. generateObject succeeding or not
// is now treated as best-effort, same posture as storeResearchChunksStep -
// this line-splitting fallback derives usable facts straight from
// searchResult.text (the plain generateText call above, which is far more
// reliable than structured output) so a schema hiccup degrades research
// quality instead of failing the run outright.
const factsFromProse = (text: string): string[] =>
  text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter((line) => line.length > 20)
    .slice(0, MAX_FALLBACK_FACTS);

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
    .map((result) => ({ title: result.title, url: result.url, content: result.content }));

  // Phase A: ground fact-extraction in Tavily's own raw content, not in
  // searchResult.text (the model's own prior prose summary of that
  // content) - fixes a real double-hop lossy-summarization gap. Falls back
  // to searchResult.text alone when Tavily is unconfigured (sources is
  // empty, same degrade-gracefully posture as before this change).
  const rawExcerpts = sources
    .filter((source) => source.content)
    .map(
      (source, index) =>
        `[Source ${index + 1}: ${source.title ?? source.url}]\n${source.content!.slice(0, MAX_SOURCE_EXCERPT_CHARS)}`
    )
    .join("\n\n");

  // Phase B: prior research for this site, kept as its own block so it's
  // never mistaken for this run's own excerpts.
  const priorExcerpts = (input.priorContext ?? [])
    .map(
      (chunk, index) =>
        `[Prior research ${index + 1}: ${chunk.sourceTitle ?? chunk.sourceUrl}]\n${chunk.chunkText}`
    )
    .join("\n\n");

  let notes: ResearchNotes;
  try {
    const result = await generateObject({
      model,
      schema: researchNotesSchema,
      prompt: `Extract structured research notes. Only use facts actually stated in the source excerpts below — do not add anything you weren't told, and do not rely on your own prior knowledge of the topic.

Source excerpts from this search:
${rawExcerpts || "(no excerpts available)"}
${priorExcerpts ? `\nPrior research already gathered for this site (context only - do not treat as a citation for this run):\n${priorExcerpts}` : ""}

Model's own synthesized notes (context only — verify any fact taken from here against the excerpts above before using it):
${searchResult.text}`,
    });
    notes = result.object;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error("research: generateObject rejected by schema - falling back to prose-derived facts.", {
        cause: error.cause,
        text: error.text?.slice(0, 2000),
        finishReason: error.finishReason,
      });
    } else {
      console.error("research: generateObject threw unexpectedly - falling back to prose-derived facts.", error);
    }
    notes = { facts: [], candidateFaqs: [] };
  }

  // Whether generateObject succeeded with a genuinely empty facts array
  // (a legitimate outcome now that researchNotesSchema no longer requires
  // at least one) or failed outright above, never hand outlineStep/draftStep
  // zero facts to work from when the search itself actually found something.
  const proseFallback = notes.facts.length === 0 ? factsFromProse(searchResult.text) : [];
  const facts =
    notes.facts.length > 0
      ? notes.facts
      : proseFallback.length > 0
        ? proseFallback
        : [searchResult.text.trim()].filter(Boolean);

  return { facts, sources, candidateFaqs: notes.candidateFaqs };
};
