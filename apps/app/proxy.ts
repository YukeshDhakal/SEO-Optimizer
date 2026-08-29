import { authMiddleware } from "@repo/auth/proxy";
import {
  noseconeOptions,
  noseconeOptionsWithToolbar,
  securityMiddleware,
} from "@repo/security/proxy";
import { type NextProxy, NextResponse } from "next/server";
import { env } from "./env";

const securityHeaders = env.FLAGS_SECRET
  ? securityMiddleware(noseconeOptionsWithToolbar)
  : securityMiddleware(noseconeOptions);

// Clerk middleware wraps other middleware in its callback
// For apps using Clerk, compose middleware inside authMiddleware callback
// For apps without Clerk, use createNEMO for composition (see apps/web)
export default authMiddleware(async (_userId, request) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const securityResponse = await securityHeaders();

  for (const [name, value] of securityResponse.headers) {
    response.headers.set(name, value);
  }

  return response;
}) as unknown as NextProxy;

export const config = {
  matcher: [
    // Skip Next.js internals, all static files (unless found in search
    // params), and Workflow DevKit's internal `.well-known/workflow/*`
    // resumption endpoint (Phase 4) — this proxy running on that path
    // corrupts in-flight workflow suspend/resume requests.
    "/((?!_next|\\.well-known/workflow|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
