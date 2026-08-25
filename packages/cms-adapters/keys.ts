import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The domain hosted-blog posts render under: https://{org-slug}.{ROOT_DOMAIN}/blog/{slug}.
// Public-safe (not a secret) — placeholder default until a real domain is
// bought/configured. See apps/web's tenant-blog route for the reader side.
export const keys = () =>
  createEnv({
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
    client: {
      NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1).default("ourapp.com"),
    },
    runtimeEnv: {
      NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    },
  });
