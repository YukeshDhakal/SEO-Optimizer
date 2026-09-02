import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Vercel's own Upstash-for-Redis marketplace integration (installed
// 2026-09-02 via `vercel integration add upstash/upstash-kv`) injects
// KV_REST_API_URL/KV_REST_API_TOKEN, not the older UPSTASH_REDIS_REST_*
// names @upstash/redis's own docs lead with - the client library reads
// either equally well (Redis.fromEnv() checks both), so this just needs
// to declare and validate whichever pair is actually present.
export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      KV_REST_API_URL: z.url().optional(),
      KV_REST_API_TOKEN: z.string().optional(),
    },
    runtimeEnv: {
      KV_REST_API_URL: process.env.KV_REST_API_URL,
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    },
  });
