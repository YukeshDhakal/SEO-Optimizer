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
  } catch (error) {
    // Previously swallowed entirely, DB untouched - this and the RPC-error
    // branch below are silent early exits that never wrote to
    // google_ads_credentials, so a failure here looked identical on the
    // site page to a stale success/error from days earlier (the persisted
    // row just never got overwritten). Logging AND persisting the real
    // reason now, so a fresh failure is finally visible instead of
    // indistinguishable from stale state.
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[google-ads/callback] exchangeCodeForTokens failed for site ${siteConnectionId}:`,
      error
    );
    await supabase
      .from("google_ads_credentials")
      .upsert(
        { site_connection_id: siteConnectionId, status: "error", error_message: `Token exchange failed: ${message}` },
        { onConflict: "site_connection_id" }
      );
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
    console.error(
      `[google-ads/callback] set_google_ads_credentials RPC failed for site ${siteConnectionId}:`,
      rpcError
    );
    await supabase
      .from("google_ads_credentials")
      .upsert(
        { site_connection_id: siteConnectionId, status: "error", error_message: `Saving credentials failed: ${rpcError.message}` },
        { onConflict: "site_connection_id" }
      );
    return NextResponse.redirect(siteUrl(siteConnectionId, "error"));
  }

  // Tokens are saved either way even if this call fails — the site page's
  // picker can retry listAccessibleCustomers itself. But the failure reason
  // (e.g. an unset/invalid developer-token header, a 403 from a developer
  // token with no access to any customer) used to be discarded entirely
  // here, leaving status='error' with zero detail — indistinguishable from
  // "this Google account genuinely has zero accessible Ads accounts". Now
  // captured into `listError` and persisted below either way.
  let customers: Awaited<ReturnType<typeof listAccessibleCustomers>> = [];
  let listError: string | null = null;
  try {
    customers = await listAccessibleCustomers(tokens.accessToken);
  } catch (error) {
    listError = error instanceof Error ? error.message : String(error);
  }

  if (customers.length === 1) {
    await supabase
      .from("google_ads_credentials")
      .update({
        google_ads_customer_id: customers[0].customerId,
        status: "connected",
        error_message: null,
      })
      .eq("site_connection_id", siteConnectionId);
    return NextResponse.redirect(siteUrl(siteConnectionId, "connected"));
  }

  if (customers.length === 0) {
    await supabase
      .from("google_ads_credentials")
      .update({
        status: "error",
        error_message:
          listError ??
          "Google returned zero Ads accounts accessible to this Google login.",
      })
      .eq("site_connection_id", siteConnectionId);
    return NextResponse.redirect(siteUrl(siteConnectionId, "no-accounts"));
  }

  // >1 accessible customer on this Google account — leave status='pending',
  // google_ads_customer_id=null; the site page renders a picker that
  // re-calls listAccessibleCustomers live rather than persisting this
  // candidate list anywhere.
  return NextResponse.redirect(siteUrl(siteConnectionId, "pick"));
};
