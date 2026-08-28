"use server";

import { createClient } from "@repo/auth/server";
import { listAccessibleCustomers, refreshAccessToken } from "@repo/google-ads";
import type {
  GoogleAdsAccessibleCustomer,
  GoogleAdsTokens,
} from "@repo/google-ads";
import { revalidatePath } from "next/cache";
import { getCurrentOrganization } from "../../lib/organization";

export interface FetchGoogleAdsAccountsState {
  error?: string;
  accounts?: GoogleAdsAccessibleCustomer[];
}

// Re-lists the connected Google account's accessible Ads customers live, for
// the ">1 account" picker the callback route falls back to — mirrors
// fetchSearchConsoleProperties exactly, same "cheap, don't persist" tradeoff.
export const fetchGoogleAdsAccounts = async (
  _prevState: FetchGoogleAdsAccountsState,
  formData: FormData
): Promise<FetchGoogleAdsAccountsState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  if (!siteConnectionId) {
    return { error: "No site specified." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_google_ads_credentials", {
    p_site_connection_id: siteConnectionId,
  });
  if (error || !data) {
    return { error: "No Google credentials saved for this site yet." };
  }

  const tokens = data as unknown as GoogleAdsTokens;
  let accessToken = tokens.accessToken;

  if (Date.now() >= tokens.expiresAt) {
    try {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      accessToken = refreshed.accessToken;
      await supabase.rpc("set_google_ads_credentials", {
        p_site_connection_id: siteConnectionId,
        p_secret: { ...tokens, accessToken, expiresAt: refreshed.expiresAt },
      });
    } catch {
      return {
        error: "Couldn't refresh the Google connection. Try reconnecting.",
      };
    }
  }

  try {
    const accounts = await listAccessibleCustomers(accessToken);
    if (accounts.length === 0) {
      return { error: "This Google account has no accessible Ads accounts." };
    }
    return { accounts };
  } catch {
    return { error: "Couldn't reach Google Ads." };
  }
};

export interface SelectGoogleAdsAccountState {
  error?: string;
  success?: boolean;
}

export const selectGoogleAdsAccount = async (
  _prevState: SelectGoogleAdsAccountState,
  formData: FormData
): Promise<SelectGoogleAdsAccountState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const customerId = String(formData.get("google_ads_customer_id") ?? "");
  if (!(siteConnectionId && customerId)) {
    return { error: "Choose an account." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("google_ads_credentials")
    .update({ google_ads_customer_id: customerId, status: "connected" })
    .eq("site_connection_id", siteConnectionId);

  if (error) {
    return { error: "Couldn't save your selection. Please try again." };
  }

  revalidatePath(`/sites/${siteConnectionId}`);
  return { success: true };
};

export interface DisconnectGoogleAdsState {
  error?: string;
  success?: boolean;
}

export const disconnectGoogleAds = async (
  _prevState: DisconnectGoogleAdsState,
  formData: FormData
): Promise<DisconnectGoogleAdsState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  if (!siteConnectionId) {
    return { error: "No site specified." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_google_ads_credentials", {
    p_site_connection_id: siteConnectionId,
  });
  if (error) {
    return { error: "Couldn't disconnect. Please try again." };
  }

  revalidatePath(`/sites/${siteConnectionId}`);
  return { success: true };
};
