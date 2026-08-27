import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
      GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
      // Signs/verifies the OAuth `state` param (see oauth.ts's
      // signState/verifyState) — required in production so the connect flow
      // isn't forgeable, but optional here (like every other not-yet-set
      // secret in this repo) so the rest of the app still builds/typechecks
      // before it's configured.
      GSC_OAUTH_STATE_SECRET: z.string().optional(),
    },
    runtimeEnv: {
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      GSC_OAUTH_STATE_SECRET: process.env.GSC_OAUTH_STATE_SECRET,
    },
  });
