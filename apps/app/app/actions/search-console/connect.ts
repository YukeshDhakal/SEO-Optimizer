"use server";

import { createClient } from "@repo/auth/server";
import { buildAuthorizeUrl, signState } from "@repo/search-console";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { getCurrentOrganization } from "../../lib/organization";

export interface ConnectSearchConsoleState {
  error?: string;
}

const CALLBACK_PATH = "/api/search-console/callback";

// Kicks off the Google OAuth consent flow for a site's Search Console
// connection. Nothing is written to the DB here — `state` carries the
// siteConnectionId (HMAC-signed, see @repo/search-console's signState) so
// the callback route can trust it without a server-side pending-request
// row. Tokens only get saved once Google redirects back with a `code`.
export const connectSearchConsole = async (
  _prevState: ConnectSearchConsoleState,
  formData: FormData
): Promise<ConnectSearchConsoleState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  if (!siteConnectionId) {
    return { error: "No site specified." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }
  if (!(organization.role === "owner" || organization.role === "admin")) {
    return { error: "Only owners and admins can connect Search Console." };
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("id")
    .eq("id", siteConnectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return { error: "Site not found." };
  }

  let authorizeUrl: string;
  try {
    const state = signState({ siteConnectionId, issuedAt: Date.now() });
    authorizeUrl = buildAuthorizeUrl({
      state,
      redirectUri: `${env.NEXT_PUBLIC_APP_URL}${CALLBACK_PATH}`,
    });
  } catch {
    return {
      error: "Search Console isn't configured yet (missing Google OAuth credentials).",
    };
  }

  redirect(authorizeUrl);
};
