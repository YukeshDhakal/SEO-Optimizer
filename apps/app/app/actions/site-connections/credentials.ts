"use server";

import { createClient } from "@repo/auth/server";
import { getCmsAdapter } from "@repo/cms-adapters";
import { revalidatePath } from "next/cache";
import { getCurrentOrganization } from "../../lib/organization";

export interface ConnectWordPressState {
  error?: string;
  success?: boolean;
}

// Saves WordPress Application Password credentials via the
// `set_site_credentials` RPC (Supabase Vault-backed — the plaintext
// password never lands in an ordinary table row) and immediately tests
// them, updating `site_connections.status` with the real result rather
// than optimistically marking it 'connected'.
export const connectWordPressSite = async (
  _prevState: ConnectWordPressState,
  formData: FormData
): Promise<ConnectWordPressState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const applicationPassword = String(
    formData.get("application_password") ?? ""
  ).trim();

  if (!(siteConnectionId && username && applicationPassword)) {
    return { error: "Username and application password are required." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("*")
    .eq("id", siteConnectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return { error: "Site not found." };
  }

  const adapter = getCmsAdapter(site.cms_type);
  if (!adapter) {
    return { error: `No adapter registered for "${site.cms_type}".` };
  }

  const { error: rpcError } = await supabase.rpc("set_site_credentials", {
    p_site_connection_id: siteConnectionId,
    p_secret: { username, applicationPassword },
  });

  if (rpcError) {
    return { error: "Couldn't save credentials. Please try again." };
  }

  const testResult = await adapter.testConnection({
    siteConnectionId,
    organizationSlug: organization.slug,
    baseUrl: site.base_url,
    credentials: { username, applicationPassword },
  });

  await supabase
    .from("site_connections")
    .update({ status: testResult.ok ? "connected" : "error" })
    .eq("id", siteConnectionId);

  revalidatePath("/sites");
  revalidatePath(`/sites/${siteConnectionId}`);

  if (!testResult.ok) {
    return {
      error: testResult.error ?? "Couldn't verify the WordPress connection.",
    };
  }

  return { success: true };
};
