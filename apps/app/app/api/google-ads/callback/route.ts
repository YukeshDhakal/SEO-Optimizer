import { createClient } from "@repo/auth/server";
import {
  exchangeCodeForTokens,
  listAccessibleCustomers,
  verifyState,
} from "@repo/google-ads";
import { NextResponse } from "next/server";
import { env } from "@/env";

// Not nested under (authenticated)/sites/[id]/ — the target site comes from
// the signed `state` param (see connect.ts), not the URL path, since Google
// redirects here with no knowledge of our routing. Mirrors
// api/search-console/callback/route.ts exactly.
const CALLBACK_PATH = "/api/google-ads/callback";

const siteUrl = (siteConnectionId: string, query: string): URL =>
  new URL(`/sites/${siteConnectionId}?ads=${query}`, env.NEXT_PUBLIC_APP_URL);

export const GET = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // Google echoes `state` back even when the user denies consent, so this
  // can still redirect to the right site instead of a generic page.
  const payload = state ? verifyState(state) : null;

  if (oauthError) {
    return NextResponse.redirect(
      payload
        ? siteUrl(payload.siteConnectionId, "denied")
        : new URL("/sites", env.NEXT_PUBLIC_APP_URL)
    );
  }

  if (!(code && state)) {
    return new Response("Missing code or state.", { status: 400 });
  }

  if (!payload) {
    return new Response(
      "Invalid or expired OAuth state — please try connecting again.",
      {
        status: 400,
      }
    );
  }

  const { siteConnectionId } = payload;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const target = `/sites/${siteConnectionId}`;
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(target)}`, env.NEXT_PUBLIC_APP_URL)
    );
  }

  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  try {
    tokens = await exchangeCodeForTokens(
      code,
      `${env.NEXT_PUBLIC_APP_URL}${CALLBACK_PATH}`
    );
  } catch {
    return NextResponse.redirect(siteUrl(siteConnectionId, "error"));
  }

  // `set_google_ads_credentials` is the actual authorization boundary here
  // (it re-checks is_org_admin_for_site itself) — not re-duplicated as a
  // separate lookup first, same as every other Vault-backed RPC call site in
  // this codebase trusts the RPC's own gate for the real enforcement.
  const { error: rpcError } = await supabase.rpc("set_google_ads_credentials", {
    p_site_connection_id: siteConnectionId,
    p_secret: tokens,
  });
  if (rpcError) {
    return NextResponse.redirect(siteUrl(siteConnectionId, "error"));
  }

  let customers: Awaited<ReturnType<typeof listAccessibleCustomers>> = [];
  try {
    customers = await listAccessibleCustomers(tokens.accessToken);
  } catch {
    // Tokens are saved either way — the site page's picker can retry
    // listAccessibleCustomers itself; no need to fail the whole connect over this.
  }

  if (customers.length === 1) {
    await supabase
      .from("google_ads_credentials")
      .update({
        google_ads_customer_id: customers[0].customerId,
        status: "connected",
      })
      .eq("site_connection_id", siteConnectionId);
    return NextResponse.redirect(siteUrl(siteConnectionId, "connected"));
  }

  if (customers.length === 0) {
    await supabase
      .from("google_ads_credentials")
      .update({ status: "error" })
      .eq("site_connection_id", siteConnectionId);
    return NextResponse.redirect(siteUrl(siteConnectionId, "no-accounts"));
  }

  // >1 accessible customer on this Google account — leave status='pending',
  // google_ads_customer_id=null; the site page renders a picker that
  // re-calls listAccessibleCustomers live rather than persisting this
  // candidate list anywhere.
  return NextResponse.redirect(siteUrl(siteConnectionId, "pick"));
};
