import { authMiddleware } from "@repo/auth/proxy";
import { keys as cmsAdaptersKeys } from "@repo/cms-adapters/keys";
import { internationalizationMiddleware } from "@repo/internationalization/proxy";
import { parseError } from "@repo/observability/error";
import { secure } from "@repo/security";
import {
  noseconeOptions,
  noseconeOptionsWithToolbar,
  securityMiddleware,
} from "@repo/security/proxy";
import { createNEMO } from "@rescale/nemo";
import { type NextProxy, type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";

const { NEXT_PUBLIC_ROOT_DOMAIN } = cmsAdaptersKeys();

// A hosted-blog post at https://{orgSlug}.{ROOT_DOMAIN}/blog/{postSlug}
// rewrites internally to /tenant-blog/{orgSlug}/{postSlug} — a route
// outside the [locale] tree, since tenant content isn't localized in this
// MVP. Runs before i18n/arcjet, and returns early: none of that machinery
// (locale negotiation, bot detection tuned for the marketing site) applies
// to a customer's own published post.
const rewriteTenantBlogRequest = (
  request: NextRequest
): NextResponse | undefined => {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  if (
    !hostname.endsWith(`.${NEXT_PUBLIC_ROOT_DOMAIN}`) ||
    hostname === `www.${NEXT_PUBLIC_ROOT_DOMAIN}`
  ) {
    return;
  }

  const orgSlug = hostname.slice(
    0,
    hostname.length - `.${NEXT_PUBLIC_ROOT_DOMAIN}`.length
  );
  const match = request.nextUrl.pathname.match(/^\/blog\/([^/]+)\/?$/);

  if (!(orgSlug && match)) {
    return;
  }

  const [, postSlug] = match;
  const url = request.nextUrl.clone();
  url.pathname = `/tenant-blog/${orgSlug}/${postSlug}`;
  return NextResponse.rewrite(url);
};

export const config = {
  // matcher tells Next.js which routes to run the middleware on. This runs the
  // middleware on all routes except for static assets and Posthog ingest
  matcher: [
    "/((?!_next/static|_next/image|ingest|favicon.ico|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};

const securityHeaders = env.FLAGS_SECRET
  ? securityMiddleware(noseconeOptionsWithToolbar)
  : securityMiddleware(noseconeOptions);

// Custom middleware for Arcjet security checks
const arcjetMiddleware = async (request: NextRequest) => {
  if (!env.ARCJET_KEY) {
    return;
  }

  try {
    await secure(
      [
        // See https://docs.arcjet.com/bot-protection/identifying-bots
        "CATEGORY:SEARCH_ENGINE", // Allow search engines
        "CATEGORY:PREVIEW", // Allow preview links to show OG images
        "CATEGORY:MONITOR", // Allow uptime monitoring services
      ],
      request
    );
  } catch (error) {
    const message = parseError(error);
    return NextResponse.json({ error: message }, { status: 403 });
  }
};

// Compose the marketing site's non-auth middleware with Nemo
const composedMiddleware = createNEMO(
  {},
  {
    before: [internationalizationMiddleware, arcjetMiddleware],
  }
);

export default authMiddleware(async (_userId, request, event) => {
  const tenantBlogResponse = rewriteTenantBlogRequest(request);
  if (tenantBlogResponse) {
    return tenantBlogResponse;
  }

  // Run security headers first
  const headersResponse = securityHeaders();

  // Then run composed middleware (i18n + arcjet)
  const middlewareResponse = await composedMiddleware(
    request as unknown as NextRequest,
    event
  );

  // Return middleware response if it exists, otherwise headers response
  return middlewareResponse || headersResponse;
}) as unknown as NextProxy;
