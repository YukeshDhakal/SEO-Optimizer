"use server";

import { createClient } from "@repo/auth/server";
import { listSites, refreshAccessToken } from "@repo/search-console";
import type { GscSiteSummary, GscTokens } from "@repo/search-console";
import { revalidatePath } from "next/cache";
import { getCurrentOrganization } from "../../lib/organization";

export interface FetchSearchConsolePropertiesState {
  error?: string;
  properties?: GscSiteSummary[];
}

// Re-lists the connected Google account's verified properties live, for the
// ">1 property" picker the callback route falls back to — the candidate
// list is never persisted anywhere, it's just re-fetched on demand (same
// "cheap, don't persist" tradeoff as fetchShopifyBlogs/fetchWebflowFields).
export const fetchSearchConsoleProperties = async (
  _prevState: FetchSearchConsolePropertiesState,
  formData: FormData
): Promise<FetchSearchConsolePropertiesState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  if (!siteConnectionId) {
    return { error: "No site specified." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_search_console_credentials", {
    p_site_connection_id: siteConnectionId,
  });
  if (error || !data) {
    return { error: "No Google credentials saved for this site yet." };
  }

  const tokens = data as unknown as GscTokens;
  let accessToken = tokens.accessToken;

  if (Date.now() >= tokens.expiresAt) {
    try {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      accessToken = refreshed.accessToken;
      await supabase.rpc("set_search_console_credentials", {
        p_site_connection_id: siteConnectionId,
        p_secret: { ...tokens, accessToken, expiresAt: refreshed.expiresAt },
      });
    } catch {
      return { error: "Couldn't refresh the Google connection. Try reconnecting." };
    }
  }

  try {
    const properties = await listSites(accessToken);
    if (properties.length === 0) {
      return { error: "This Google account has no verified Search Console properties." };
    }
    return { properties };
  } catch {
    return { error: "Couldn't reach Google Search Console." };
  }
};

export interface SelectSearchConsolePropertyState {
  error?: string;
  success?: boolean;
}

export const selectSearchConsoleProperty = async (
  _prevState: SelectSearchConsolePropertyState,
  formData: FormData
): Promise<SelectSearchConsolePropertyState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const gscSiteUrl = String(formData.get("gsc_site_url") ?? "");
  if (!(siteConnectionId && gscSiteUrl)) {
    return { error: "Choose a property." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("search_console_credentials")
    .update({ gsc_site_url: gscSiteUrl, status: "connected" })
    .eq("site_connection_id", siteConnectionId);

  if (error) {
    return { error: "Couldn't save your selection. Please try again." };
  }

  revalidatePath(`/sites/${siteConnectionId}`);
  return { success: true };
};

export interface DisconnectSearchConsoleState {
  error?: string;
  success?: boolean;
}

export const disconnectSearchConsole = async (
  _prevState: DisconnectSearchConsoleState,
  formData: FormData
): Promise<DisconnectSearchConsoleState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  if (!siteConnectionId) {
    return { error: "No site specified." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_search_console_credentials", {
    p_site_connection_id: siteConnectionId,
  });
  if (error) {
    return { error: "Couldn't disconnect. Please try again." };
  }

  revalidatePath(`/sites/${siteConnectionId}`);
  return { success: true };
};
