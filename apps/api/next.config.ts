import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { env } from "@/env";

let nextConfig: NextConfig = withLogging(config);

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

// Phase 4: enables the "use workflow"/"use step" directives used by
// @repo/workflows (imported from the cron dispatcher route).
export default withWorkflow(nextConfig);

// vercel-deploy-trigger: initial production deploy 2026-08-29
