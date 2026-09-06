import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { keys } from "./keys";

// Phase 14: both embedding paths moved off OpenAI (its account ran out of
// billing credits in production - confirmed via Vercel runtime error logs,
// "AI_APICallError: insufficient_quota" - which had been silently degrading
// duplicate-content detection AND the research knowledge base to
// "skipped" this whole time) onto Gemini's gemini-embedding-001, requested
// at 1536 output dimensions to match the existing posts.content_embedding/
// research_chunks.embedding columns exactly - no migration needed. Reuses
// GOOGLE_GENERATIVE_AI_API_KEY, already funded and already carrying every
// other model call in this package, so zero new configuration anywhere.
const GOOGLE_EMBEDDING_MODEL = "gemini-embedding-001";
const GOOGLE_EMBEDDING_DIMENSIONS = 1536; // matches posts.content_embedding / research_chunks.embedding

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions - kept as a manual fallback only
const RESEARCH_EMBEDDING_MODEL_OLLAMA = "nomic-embed-text"; // 768 dimensions - local/offline use only
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

// Generates an embedding for duplicate-content similarity checks. Returns
// `null` (never throws) when GOOGLE_GENERATIVE_AI_API_KEY isn't configured
// or the call fails - callers must treat `null` as "duplicate check
// skipped, not evaluated", never as "confirmed not a duplicate".
export const generateEmbedding = async (
  text: string
): Promise<number[] | null> => {
  const apiKey = keys().GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const { embedding } = await embed({
      model: google.embedding(GOOGLE_EMBEDDING_MODEL),
      value: text.slice(0, 8000), // stay well under the model's input token limit
      providerOptions: {
        google: {
          outputDimensionality: GOOGLE_EMBEDDING_DIMENSIONS,
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
    });
    return embedding;
  } catch (error) {
    // A transient provider error shouldn't fail the whole pipeline run over
    // a best-effort guardrail - the duplicate check step treats this the
    // same as "not configured": skip, don't block. Logged (not just
    // swallowed) so a real, ongoing failure is actually diagnosable via
    // Vercel runtime logs instead of looking identical to "unconfigured"
    // forever - this exact silence was the reason the OpenAI billing lapse
    // went unnoticed for days.
    console.error("generateEmbedding failed:", error);
    return null;
  }
};

const resolveResearchEmbeddingProvider = (): "google" | "ollama" | "openai" =>
  keys().RESEARCH_EMBEDDING_PROVIDER ?? "google";

export const getResearchEmbeddingModel = (): string => {
  const provider = resolveResearchEmbeddingProvider();
  if (provider === "openai") return OPENAI_EMBEDDING_MODEL;
  if (provider === "ollama") return RESEARCH_EMBEDDING_MODEL_OLLAMA;
  return GOOGLE_EMBEDDING_MODEL;
};

// A second, independent embedding path for the research knowledge base
// (Phase 11), switchable via RESEARCH_EMBEDDING_PROVIDER - same
// "never throws, null means skip" contract as generateEmbedding.
//
// Operational trap, not a bug: switching providers can change the output
// dimension (Ollama's nomic-embed-text is 768-dim; Google and OpenAI here
// are both requested/native at 1536-dim, matching research_chunks.embedding
// as of Phase 12). A provider/column dimension mismatch doesn't corrupt
// anything (pgvector rejects it outright), but both the insert
// (storeResearchChunksStep) and the retrieval RPC then fail on every call,
// and both call sites treat that failure as best-effort/skip - so the whole
// knowledge base goes silently inert with no visible error. Stick to
// "google" (the default) unless you have a specific reason to run Ollama
// locally.
export const generateResearchEmbedding = async (
  text: string
): Promise<number[] | null> => {
  const provider = resolveResearchEmbeddingProvider();

  try {
    if (provider === "openai") {
      const apiKey = keys().OPENAI_API_KEY;
      if (!apiKey) {
        return null;
      }
      const openai = createOpenAI({ apiKey });
      const { embedding } = await embed({
        model: openai.textEmbeddingModel(OPENAI_EMBEDDING_MODEL),
        value: text.slice(0, 8000),
      });
      return embedding;
    }

    if (provider === "ollama") {
      const baseURL = keys().OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
      // Ollama ignores the API key on its OpenAI-compatible endpoint, but
      // the AI SDK's client requires a non-empty string to construct.
      const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
      const { embedding } = await embed({
        model: ollama.textEmbeddingModel(RESEARCH_EMBEDDING_MODEL_OLLAMA),
        value: text.slice(0, 8000),
      });
      return embedding;
    }

    const apiKey = keys().GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return null;
    }
    const google = createGoogleGenerativeAI({ apiKey });
    const { embedding } = await embed({
      model: google.embedding(GOOGLE_EMBEDDING_MODEL),
      value: text.slice(0, 8000),
      providerOptions: {
        google: {
          outputDimensionality: GOOGLE_EMBEDDING_DIMENSIONS,
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
    });
    return embedding;
  } catch (error) {
    // Same posture as generateEmbedding: a provider error degrades to
    // "skipped", never fails the run - but logged, not silent, so a real
    // failure (bad key, wrong model, provider outage) is distinguishable
    // from "just not configured" in Vercel's runtime logs instead of both
    // looking identical forever.
    console.error(`generateResearchEmbedding failed (provider: ${provider}):`, error);
    return null;
  }
};
