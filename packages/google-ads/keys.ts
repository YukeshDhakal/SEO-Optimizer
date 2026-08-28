import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      // Reused from the Search Console setup — the same Google Cloud OAuth
      // client can request additional scopes across multiple Google APIs, no
      // need for a second client id/secret pair as long as both live under
      // the same GCP project (see GOOGLE_ADS_OAUTH_STATE_SECRET below for why
      // the state-signing secret must still be distinct).
      GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
      GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
      // Separate from GSC_OAUTH_STATE_SECRET on purpose — never reuse the
      // same HMAC secret across two OAuth flows.
      GOOGLE_ADS_OAUTH_STATE_SECRET: z.string().optional(),
      // Approved by Google (Developer Token application) against a Google
      // Ads manager (MCC) account — not just a Cloud Console credential.
      GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
      // The MCC (manager) account's customer id, sent as the
      // `login-customer-id` header on every Ads API call.
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),
      // No per-site locale field exists yet (see site_connections schema) —
      // v1 keyword-volume lookups use one global geo/language target.
      // Resource names, e.g. "geoTargetConstants/2840" (US),
      // "languageConstants/1000" (English). Left unset, oauth defaults apply.
      GOOGLE_ADS_DEFAULT_GEO_TARGET_CONSTANT: z.string().optional(),
      GOOGLE_ADS_DEFAULT_LANGUAGE_CONSTANT: z.string().optional(),
    },
    runtimeEnv: {
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_ADS_OAUTH_STATE_SECRET: process.env.GOOGLE_ADS_OAUTH_STATE_SECRET,
      GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      GOOGLE_ADS_DEFAULT_GEO_TARGET_CONSTANT:
        process.env.GOOGLE_ADS_DEFAULT_GEO_TARGET_CONSTANT,
      GOOGLE_ADS_DEFAULT_LANGUAGE_CONSTANT:
        process.env.GOOGLE_ADS_DEFAULT_LANGUAGE_CONSTANT,
    },
  });
