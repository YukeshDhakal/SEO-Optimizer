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
      // Phase 14: OpenAI's embeddings stopped working in production (account
      // ran out of billing credits, confirmed via Vercel runtime error logs
      // - AI_APICallError "insufficient_quota"), silently degrading BOTH
      // generateEmbedding (duplicate-check) and generateResearchEmbedding to
      // "skipped" the whole time. Kept here, optional, as a manual fallback
      // if credits are ever restored - no longer the default for either path.
      OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
      // Phase 14: swappable embedding provider for the research knowledge
      // base. "google" (Gemini's gemini-embedding-001, requested at 1536
      // dimensions to match research_chunks.embedding/posts.content_embedding
      // with zero migration) is now the default - reuses
      // GOOGLE_GENERATIVE_AI_API_KEY, already funded and already carrying
      // every other model call in this package, so this feature needs zero
      // extra configuration in every environment including production.
      // "ollama" stays available for local/offline use (Vercel functions
      // can't reach localhost); "openai" stays available if credits are
      // ever restored.
      RESEARCH_EMBEDDING_PROVIDER: z.enum(["google", "ollama", "openai"]).optional(),
      // Defaults to http://localhost:11434/v1 when unset (embedding.ts).
      OLLAMA_BASE_URL: z.string().url().optional(),
      // A locally-running Ollama has no auth, so the literal string
      // "ollama" was fine as a placeholder bearer token. A publicly
      // reachable one (e.g. ollama-host/ in the WorkFlow-Automation repo,
      // fronted by nginx requiring a real bearer token) needs this set to
      // the same secret the host expects - see that repo's README.
      OLLAMA_API_KEY: z.string().optional(),
    },
    runtimeEnv: {
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      RESEARCH_EMBEDDING_PROVIDER: process.env.RESEARCH_EMBEDDING_PROVIDER,
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    },
  });
