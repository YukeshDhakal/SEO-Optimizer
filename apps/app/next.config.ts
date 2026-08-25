import { withToolbar } from "@repo/feature-flags/lib/toolbar";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { env } from "@/env";

let nextConfig: NextConfig = withToolbar(withLogging(config));

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

// Phase 4: enables the "use workflow"/"use step" directives used by
// @repo/workflows (imported from the "Generate post" server action).
export default withWorkflow(nextConfig);
