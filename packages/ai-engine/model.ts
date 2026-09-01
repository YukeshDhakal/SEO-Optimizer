import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { keys } from "./keys";

// Was Anthropic's Claude; swapped to Google's Gemini so a fresh deploy can
// actually run the pipeline on Gemini's free tier instead of needing paid
// Anthropic credits before the very first call. Constructing the provider
// never throws when the key is unset (same posture as every other
// optional key in this package) — only an actual `generateText`/
// `generateObject` call against it will, with a clear upstream API error.
const google = createGoogleGenerativeAI({
  apiKey: keys().GOOGLE_GENERATIVE_AI_API_KEY,
});

// `organizationId` is currently unused — it's the seam for a future
// per-org/BYO-key swap or Vercel AI Gateway routing (per the build plan),
// so that change is a one-function edit here rather than a pipeline
// rearchitect. Every call site already threads an org through, so nothing
// upstream needs to change when this actually does something.
//
// gemini-3.6-flash: supports object generation and tool usage (both used
// across this package's steps), and is the tier with the genuinely-free
// quota — gemini-3.6-pro would cost real money like Claude did.
// gemini-2.5-flash (an earlier choice here) was retired: the API now
// returns 404 "no longer available to new users" for it, confirmed via a
// direct curl test against generativelanguage.googleapis.com before this
// was set — verify the model id still resolves the same way if this ever
// 404s again, Google's free-tier model names move fast.
export const getModel = (_organizationId?: string) =>
  google("gemini-3.6-flash");
