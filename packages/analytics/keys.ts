import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    client: {
      NEXT_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
      NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
      NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),
      // Google Ads conversion tag id (not GA4) - separate gtag.js config,
      // only meaningful on the marketing site apps/web actually deploys to
      // (where ad-click landing happens), left unset elsewhere.
      NEXT_PUBLIC_GOOGLE_ADS_ID: z.string().startsWith("AW-").optional(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
      NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    },
  });
