import { withToolbar } from "@repo/feature-flags/lib/toolbar";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { env } from "@/env";

let nextConfig: NextConfig = withToolbar(withLogging(config));

// /settings -> /guardrails and posts/new -> posts/publish: the nav label
// and page H1 always said "Guardrails"/"Publish now" - only the URL still
// said otherwise. Renamed to match (2026-09-02); these 301s keep any
// existing bookmark, saved link, or outbound email working.
nextConfig.redirects = async () => [
  { source: "/settings", destination: "/guardrails", permanent: true },
  { source: "/settings/audit", destination: "/guardrails/audit", permanent: true },
  { source: "/settings/billing", destination: "/guardrails/billing", permanent: true },
  {
    source: "/sites/:id/posts/new",
    destination: "/sites/:id/posts/publish",
    permanent: true,
  },
];

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

// Phase 4: enables the "use workflow"/"use step" directives used by
// @repo/workflows (imported from the "Generate post" server action).
export default withWorkflow(nextConfig);

// vercel-deploy-trigger: initial production deploy 2026-08-29
