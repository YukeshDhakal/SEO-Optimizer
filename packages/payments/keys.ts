import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    server: {
      // Accepts a restricted key (rk_, preferred - least-privilege, scoped
      // to only customers/checkout.sessions/billing_portal.sessions/
      // subscriptions read) as well as a full secret key (sk_) for
      // backwards compatibility.
      STRIPE_SECRET_KEY: z
        .string()
        .regex(/^[sr]k_/, "must start with sk_ or rk_")
        .optional(),
      STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    },
    runtimeEnv: {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    },
  });
