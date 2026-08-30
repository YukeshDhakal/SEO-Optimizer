import { createClient } from "@repo/auth/server";
import { NextResponse } from "next/server";

// Supabase's own hosted OAuth callback (https://{project}.supabase.co/
// auth/v1/callback - configured in the Google Cloud OAuth Client's
// Authorized redirect URIs) exchanges the code with Google, then
// redirects the browser here (the redirectTo passed to
// signInWithOAuth()) with a Supabase-issued `code` to exchange for a
// session. Two different callbacks in this flow - don't confuse this
// route with Google Cloud's own redirect URI setting.
const safeNextUrl = (next: string | null) => {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
};

export const GET = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextUrl(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL(`/sign-in?next=${encodeURIComponent(next)}`, url.origin)
  );
};
