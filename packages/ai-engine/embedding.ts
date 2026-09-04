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

const RESEARCH_EMBEDDING_MODEL_OLLAMA = "nomic-embed-text"; // 768 dimensions - matches research_chunks.embedding
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

// A second, independent embedding path for the research knowledge base
// (Phase 11) - deliberately NOT shared with generateEmbedding above, which
// stays fixed to OpenAI/1536-dim for the live duplicate-content guardrail.
// Defaults to a local Ollama server via its OpenAI-compatible endpoint
// (reuses createOpenAI rather than adding a new provider dependency) -
// swap to a hosted provider with RESEARCH_EMBEDDING_PROVIDER, no code
// change needed. Same "never throws, null means skip" contract as
// generateEmbedding.
//
// Operational trap, not a bug: switching providers changes the output
// dimension (Ollama's nomic-embed-text is 768-dim, OpenAI's
// text-embedding-3-small is 1536-dim). research_chunks.embedding is fixed
// at vector(768) until a follow-up migration widens it - pointing this at
// OpenAI without that migration doesn't corrupt anything (pgvector rejects
// the mismatch), but both the insert and the retrieval RPC then fail on
// every call, and both call sites treat that failure as best-effort/skip -
// so the whole knowledge base goes silently inert with no visible error.
export const generateResearchEmbedding = async (
  text: string
): Promise<number[] | null> => {
  const provider = keys().RESEARCH_EMBEDDING_PROVIDER ?? "ollama";

  try {
    if (provider === "openai") {
      const apiKey = keys().OPENAI_API_KEY;
      if (!apiKey) {
        return null;
      }
      const openai = createOpenAI({ apiKey });
      const { embedding } = await embed({
        model: openai.textEmbeddingModel(EMBEDDING_MODEL),
        value: text.slice(0, 8000),
      });
      return embedding;
    }

    const baseURL = keys().OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
    // Ollama ignores the API key on its OpenAI-compatible endpoint, but the
    // AI SDK's client requires a non-empty string to construct.
    const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
    const { embedding } = await embed({
      model: ollama.textEmbeddingModel(RESEARCH_EMBEDDING_MODEL_OLLAMA),
      value: text.slice(0, 8000),
    });
    return embedding;
  } catch {
    // Same posture as generateEmbedding: a provider error degrades to
    // "skipped", never fails the run.
    return null;
  }
};
