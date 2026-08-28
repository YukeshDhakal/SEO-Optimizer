import { keys as aiEngine } from "@repo/ai-engine/keys";
import { keys as analytics } from "@repo/analytics/keys";
import { keys as auth } from "@repo/auth/keys";
import { keys as cmsAdapters } from "@repo/cms-adapters/keys";
import { keys as collaboration } from "@repo/collaboration/keys";
import { keys as database } from "@repo/database/keys";
import { keys as email } from "@repo/email/keys";
import { keys as flags } from "@repo/feature-flags/keys";
import { keys as googleAds } from "@repo/google-ads/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as notifications } from "@repo/notifications/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as payments } from "@repo/payments/keys";
import { keys as searchConsole } from "@repo/search-console/keys";
import { keys as security } from "@repo/security/keys";
import { keys as webhooks } from "@repo/webhooks/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  extends: [
    aiEngine(),
    auth(),
    analytics(),
    cmsAdapters(),
    collaboration(),
    core(),
    database(),
    email(),
    flags(),
    googleAds(),
    notifications(),
    observability(),
    payments(),
    searchConsole(),
    security(),
    webhooks(),
  ],
  server: {
    // Phase 5: mirrors apps/api/env.ts — see the comment there. Same env
    // var, declared per-app since this app's publish/generate actions also
    // need `checkKillSwitch` to see it, and next-forge's env pattern is
    // per-app throughout, not shared across apps.
    EMERGENCY_STOP: z.enum(["true", "false"]).optional(),
  },
  client: {},
  runtimeEnv: {
    EMERGENCY_STOP: process.env.EMERGENCY_STOP,
  },
});
