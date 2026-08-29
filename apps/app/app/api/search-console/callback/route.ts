import { createClient } from "@repo/auth/server";
import { exchangeCodeForTokens, listSites, verifyState } from "@repo/search-console";
import { NextResponse } from "next/server";
import { env } from "@/env";

// Not nested under (authenticated)/sites/[id]/ — the target site comes from
// the signed `state` param (see connect.ts), not the URL path, since Google
// redirects here with no knowledge of our routing.
const CALLBACK_PATH = "/api/search-console/callback";

const siteUrl = (siteConnectionId: string, query: string): URL =>
  new URL(`/sites/${siteConnectionId}?gsc=${query}`, env.NEXT_PUBLIC_APP_URL);

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
      payload ? siteUrl(payload.siteConnectionId, "denied") : new URL("/sites", env.NEXT_PUBLIC_APP_URL)
    );
  }

  if (!(code && state)) {
    return new Response("Missing code or state.", { status: 400 });
  }

  if (!payload) {
    return new Response("Invalid or expired OAuth state — please try connecting again.", {
      status: 400,
    });
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
    tokens = await exchangeCodeForTokens(code, `${env.NEXT_PUBLIC_APP_URL}${CALLBACK_PATH}`);
  } catch {
    return NextResponse.redirect(siteUrl(siteConnectionId, "error"));
  }

  // `set_search_console_credentials` is the actual authorization boundary
  // here (it re-checks is_org_admin_for_site itself, reading this request's
  // session via the RLS-respecting client above) — not re-duplicated as a
  // separate lookup first, same as every other Vault-backed RPC call site
  // in this codebase trusts the RPC's own gate for the real enforcement.
  const { error: rpcError } = await supabase.rpc("set_search_console_credentials", {
    p_site_connection_id: siteConnectionId,
    p_secret: tokens,
  });
  if (rpcError) {
    return NextResponse.redirect(siteUrl(siteConnectionId, "error"));
  }

  let sites: Awaited<ReturnType<typeof listSites>> = [];
  try {
    sites = await listSites(tokens.accessToken);
  } catch {
    // Tokens are saved either way — the site page's picker can retry
    // listSites itself; no need to fail the whole connect over this.
  }

  if (sites.length === 1) {
    await supabase
      .from("search_console_credentials")
      .update({ gsc_site_url: sites[0].siteUrl, status: "connected" })
      .eq("site_connection_id", siteConnectionId);
    return NextResponse.redirect(siteUrl(siteConnectionId, "connected"));
  }

  if (sites.length === 0) {
    await supabase
      .from("search_console_credentials")
      .update({ status: "error" })
      .eq("site_connection_id", siteConnectionId);
    return NextResponse.redirect(siteUrl(siteConnectionId, "no-properties"));
  }

  // >1 verified property on this Google account — leave status='pending',
  // gsc_site_url=null; the site page renders a picker that re-calls
  // listSites live rather than persisting this candidate list anywhere.
  return NextResponse.redirect(siteUrl(siteConnectionId, "pick"));
};
