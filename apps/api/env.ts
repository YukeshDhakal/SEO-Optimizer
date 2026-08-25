import { keys as analytics } from "@repo/analytics/keys";
import { keys as auth } from "@repo/auth/keys";
import { keys as database } from "@repo/database/keys";
import { keys as email } from "@repo/email/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as payments } from "@repo/payments/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  extends: [
    auth(),
    analytics(),
    core(),
    database(),
    email(),
    observability(),
    payments(),
  ],
  server: {
    // Phase 4: checked against the cron dispatcher route's Authorization
    // header. Unlike the pre-existing `/cron/keep-alive` route (read-only,
    // no real cost), `/cron/dispatch-runs` starts real AI-generation
    // workflow runs — worth gating even though this app has no other
    // unauthenticated-by-design cron route to match convention against.
    CRON_SECRET: z.string().min(1).optional(),
  },
  client: {},
  runtimeEnv: {
    CRON_SECRET: process.env.CRON_SECRET,
  },
});
