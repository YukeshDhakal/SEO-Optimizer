import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { keys } from "./keys";

export interface WebSearchResult {
  title: string | null;
  url: string;
  content: string;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

// Replaces Anthropic's old provider-executed `webSearch_20260209` tool now
// that model.ts is on Gemini, which has no equivalent wired up here.
// Unlike a provider-executed tool, results don't show up in `generateText`'s
// own `.sources` automatically — callers collect them from `result
// .toolResults` themselves (see steps/research.ts).
export const webSearchTool = tool({
  description:
    "Search the web for current, citable information on a topic. Returns a list of results with title, URL, and a content snippet.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
  }),
  execute: async ({ query }): Promise<{ results: WebSearchResult[] }> => {
    const apiKey = keys().TAVILY_API_KEY;
    if (!apiKey) {
      // Same "degrade, don't throw" posture as every other unconfigured
      // key in this package — the model still gets a (empty) tool result
      // back and can fall through to its own knowledge, same as Anthropic's
      // web search tool returning zero sources.
      return { results: [] };
    }

    const response = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        search_depth: "advanced",
      }),
    });

    if (!response.ok) {
      // Unlike a missing key, a live call actually failing is not
      // best-effort here — research quality feeds the SEO/GEO gate, so
      // this throws and lets the Workflow step's own retry handle it
      // (same as every generateText/generateObject call in this package).
      throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results: { title: string; url: string; content: string }[];
    };

    return {
      results: data.results.map((result) => ({
        title: result.title ?? null,
        url: result.url,
        content: result.content,
      })),
    };
  },
});
