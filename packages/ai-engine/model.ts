import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { keys } from "./keys";

// `ANTHROPIC_API_KEY` isn't set yet in this environment (same situation as
// `SUPABASE_SERVICE_ROLE_KEY` was in Phase 0) — constructing the provider
// never throws, only an actual `generateText`/`generateObject` call against
// it will, with a clear upstream API error. That's the desired failure mode:
// the rest of the app still typechecks/builds without a key configured.
const anthropic = createAnthropic({ apiKey: keys().ANTHROPIC_API_KEY });

// `organizationId` is currently unused — it's the seam for a future
// per-org/BYO-key swap or Vercel AI Gateway routing (per the build plan),
// so that change is a one-function edit here rather than a pipeline
// rearchitect. Every call site already threads an org through, so nothing
// upstream needs to change when this actually does something.
export const getModel = (_organizationId?: string) =>
  anthropic("claude-sonnet-5");

export const getSearchTool = (maxUses = 5) =>
  anthropic.tools.webSearch_20260209({ maxUses });
