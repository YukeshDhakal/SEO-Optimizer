import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),
    },
    runtimeEnv: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });
