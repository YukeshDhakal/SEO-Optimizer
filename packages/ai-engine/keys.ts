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
    },
    runtimeEnv: {
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    },
  });
