import { generateObject } from "ai";
import { getModel } from "../model";
import { type TopicSelection, topicSelectionSchema } from "../schemas";

export interface TopicSelectionQuery {
  query: string;
  clicks: number;
  impressions: number;
}

export interface TopicSelectionInput {
  organizationId: string;
  topicHint: string;
  // Phase 7: this site's cached top Search Console queries (see
  // packages/workflows/ai-steps.ts's topicSelectionStep, which fetches
  // these — ai-engine itself stays DB-agnostic). Optional and defaults to
  // "absent" for any site that hasn't connected GSC yet (or whose sync
  // hasn't run), which keeps the original pure-topicHint prompt unchanged.
  gscQueries?: TopicSelectionQuery[];
}

const MAX_GROUNDING_QUERIES = 10;

const buildGroundingBlock = (queries: TopicSelectionQuery[]): string => {
  const top = [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, MAX_GROUNDING_QUERIES);
  const lines = top
    .map((q) => `- "${q.query}" (${q.clicks} clicks, ${q.impressions} impressions)`)
    .join("\n");
  return `\n\nThis site's real Google Search Console data shows people are already finding it for these queries (ranked by clicks):\n${lines}\nPrefer a topic that builds on this real demand over inventing something unrelated, when a good fit exists.`;
};

export const selectTopic = async (
  input: TopicSelectionInput
): Promise<TopicSelection> => {
  const grounding =
    input.gscQueries && input.gscQueries.length > 0 ? buildGroundingBlock(input.gscQueries) : "";

  const { object } = await generateObject({
    model: getModel(input.organizationId),
    schema: topicSelectionSchema,
    prompt: `Given this content hint from the customer: "${input.topicHint}", propose one specific, narrow blog topic (not a broad category) and its single primary target keyword. The topic should be answerable in one article and worth ranking for.${grounding}`,
  });
  return object;
};
