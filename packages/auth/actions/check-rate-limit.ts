"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { headers } from "next/headers";

export interface RateLimitCheck {
  allowed: boolean;
  error?: string;
}

// sign-in.tsx/sign-up.tsx call supabase.auth.signInWithPassword/signUp
// directly from the browser - there's no existing server hop to hang a
// rate limit on, and the client can't see its own IP. This is called
// first, from the client, purely to gate on IP before the real Supabase
// call proceeds. Degrades open (allowed: true) when Upstash isn't
// configured, same posture as every other optional integration in this
// codebase - a missing rate limiter should never be the reason sign-in
// itself breaks. Lives in @repo/auth (not the app that happens to use it
// today) so any app consuming SignIn/SignUp gets the same protection.
const limiter = createRateLimiter({
  limiter: slidingWindow(10, "60 s"),
  prefix: "quillrun:auth",
});

export const checkAuthRateLimit = async (
  action: "sign-in" | "sign-up"
): Promise<RateLimitCheck> => {
  if (!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)) {
    return { allowed: true };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const { success } = await limiter.limit(`${action}:${ip}`);

  if (!success) {
    return {
      allowed: false,
      error: "Too many attempts. Wait a minute and try again.",
    };
  }

  return { allowed: true };
};
