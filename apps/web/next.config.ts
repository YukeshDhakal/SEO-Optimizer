// touch: force rebuild after BASEHUB_TOKEN was replaced with a token for the new blueprint-based repo
import { withCMS } from "@repo/cms/next-config";
import { withToolbar } from "@repo/feature-flags/lib/toolbar";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

let nextConfig: NextConfig = withToolbar(withLogging(config));

nextConfig.turbopack = {
  ...nextConfig.turbopack,
  root: workspaceRoot,
};

nextConfig.images?.remotePatterns?.push({
  protocol: "https",
  hostname: "assets.basehub.com",
});

const redirects: NextConfig["redirects"] = async () => [
  {
    source: "/legal",
    destination: "/legal/privacy",
    statusCode: 301,
  },
];

nextConfig.redirects = redirects;

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

export default withCMS(nextConfig);

// vercel-deploy-trigger: initial production deploy 2026-08-29
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
