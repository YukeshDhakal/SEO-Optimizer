import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      // Swapped from Anthropic (Claude) to Google's Gemini for text
      // generation — Gemini Flash has a genuinely free tier, unlike a
      // fresh Anthropic key which needs paid credits before its first
      // real call. Same env-var-name convention Google's own SDK expects,
      // so a bare `google(...)` import (no explicit apiKey) would also work
      // — kept explicit via keys() for consistency with every other
      // provider key in this file.
      GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
      // Tavily replaces Anthropic's old provider-executed web search tool
      // for the research step, now that model.ts is on Gemini (which has
      // no equivalent wired up here). Free tier: 1,000 searches/month.
      TAVILY_API_KEY: z.string().startsWith("tvly-").optional(),
      // Anthropic doesn't serve an embeddings endpoint - duplicate-content
      // detection (Phase 5) needs a separate provider. Optional/unset is a
      // real, expected state here (same posture as every other key in this
      // file): `embedding.ts` degrades to skipping the duplicate check
      // rather than throwing when this is absent.
      OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
      // Phase 11: swappable embedding provider for the research knowledge
      // base (distinct from OPENAI_API_KEY above, which stays
      // generateEmbedding's fixed provider for duplicate-content - see
      // embedding.ts). Defaults to "ollama" (a local, free, already-running
      // server) when unset, so this feature works with zero configuration
      // in dev; production needs either a network-reachable Ollama host or
      // RESEARCH_EMBEDDING_PROVIDER="openai".
      RESEARCH_EMBEDDING_PROVIDER: z.enum(["ollama", "openai"]).optional(),
      // Defaults to http://localhost:11434/v1 when unset (embedding.ts).
      OLLAMA_BASE_URL: z.string().url().optional(),
    },
    runtimeEnv: {
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      RESEARCH_EMBEDDING_PROVIDER: process.env.RESEARCH_EMBEDDING_PROVIDER,
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    },
  });
