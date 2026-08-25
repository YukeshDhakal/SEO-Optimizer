import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { keys } from "./keys";

// Anthropic doesn't serve embeddings, so this is a second provider,
// constructed lazily (only when actually called) so a missing
// OPENAI_API_KEY never breaks module import/typecheck the same way
// `model.ts`'s Anthropic client tolerates a missing key at construction
// time - the difference here is `generateEmbedding` itself degrades to
// `null` rather than letting the call throw, because duplicate-content
// detection is a best-effort guardrail, not a step whose absence should
// fail an otherwise-valid pipeline run.
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions - matches posts.content_embedding

// Generates an embedding for duplicate-content similarity checks. Returns
// `null` (never throws) when OPENAI_API_KEY isn't configured or the call
// fails - callers must treat `null` as "duplicate check skipped, not
// evaluated", never as "confirmed not a duplicate".
export const generateEmbedding = async (
  text: string
): Promise<number[] | null> => {
  const apiKey = keys().OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const openai = createOpenAI({ apiKey });
    const { embedding } = await embed({
      model: openai.textEmbeddingModel(EMBEDDING_MODEL),
      value: text.slice(0, 8000), // stay well under the model's input token limit
    });
    return embedding;
  } catch {
    // A transient provider error shouldn't fail the whole pipeline run over
    // a best-effort guardrail - the duplicate check step treats this the
    // same as "not configured": skip, don't block.
    return null;
  }
};
