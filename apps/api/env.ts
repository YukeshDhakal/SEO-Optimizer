import { keys as analytics } from "@repo/analytics/keys";
import { keys as auth } from "@repo/auth/keys";
import { keys as database } from "@repo/database/keys";
import { keys as email } from "@repo/email/keys";
import { keys as googleAds } from "@repo/google-ads/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as payments } from "@repo/payments/keys";
import { keys as searchConsole } from "@repo/search-console/keys";
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
    googleAds(),
    observability(),
    payments(),
    searchConsole(),
  ],
  server: {
    // Phase 4: checked against the cron dispatcher route's Authorization
    // header. Unlike the pre-existing `/cron/keep-alive` route (read-only,
    // no real cost), `/cron/dispatch-runs` starts real AI-generation
    // workflow runs — worth gating even though this app has no other
    // unauthenticated-by-design cron route to match convention against.
    CRON_SECRET: z.string().min(1).optional(),
    // Phase 5: platform-wide safety valve, off by default. Read directly
    // via `process.env.EMERGENCY_STOP` at the call sites that actually
    // check it (`@repo/workflows`' `checkKillSwitch`, this app's dispatcher
    // route) rather than through this typed `env` object — it needs to
    // keep working even if something about env validation itself is what's
    // broken. Declared here anyway so it shows up in this app's env schema
    // for discoverability/`.env.example` generation.
    EMERGENCY_STOP: z.enum(["true", "false"]).optional(),
  },
  client: {},
  runtimeEnv: {
    CRON_SECRET: process.env.CRON_SECRET,
    EMERGENCY_STOP: process.env.EMERGENCY_STOP,
  },
});
