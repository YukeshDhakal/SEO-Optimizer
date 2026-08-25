import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),
      // Anthropic doesn't serve an embeddings endpoint - duplicate-content
      // detection (Phase 5) needs a separate provider. Optional/unset is a
      // real, expected state here (same posture as ANTHROPIC_API_KEY
      // itself in this environment): `embedding.ts` degrades to skipping
      // the duplicate check rather than throwing when this is absent.
      OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
    },
    runtimeEnv: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    },
  });
