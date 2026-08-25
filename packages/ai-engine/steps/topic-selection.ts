import { generateObject } from "ai";
import { getModel } from "../model";
import { type TopicSelection, topicSelectionSchema } from "../schemas";

export interface TopicSelectionInput {
  organizationId: string;
  topicHint: string;
}

// No GSC integration yet (Phase 7) — the user supplies a niche/keyword hint
// manually, and the model turns it into a concrete topic + primary keyword.
export const selectTopic = async (
  input: TopicSelectionInput
): Promise<TopicSelection> => {
  const { object } = await generateObject({
    model: getModel(input.organizationId),
    schema: topicSelectionSchema,
    prompt: `Given this content hint from the customer: "${input.topicHint}", propose one specific, narrow blog topic (not a broad category) and its single primary target keyword. The topic should be answerable in one article and worth ranking for.`,
  });
  return object;
};
