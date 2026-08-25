"use server";

import { createClient } from "@repo/auth/server";
import { revalidatePath } from "next/cache";
import { getCurrentOrganization } from "../../lib/organization";

export interface CreateSiteConnectionState {
  error?: string;
}

// `hosted_blog` needs no external credentials at all (its adapter's
// testConnection always reports ok) - go straight to 'connected' rather
// than making the user click a pointless "connect" step. `wordpress` stays
// at the schema default ('pending') until real credentials are saved via
// `connectWordPressSite`.
export const createSiteConnection = async (
  _prevState: CreateSiteConnectionState,
  formData: FormData
): Promise<CreateSiteConnectionState> => {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const cmsType = String(formData.get("cms_type") ?? "").trim();
  const baseUrl = String(formData.get("base_url") ?? "").trim();

  if (!displayName) {
    return { error: "Display name is required." };
  }

  if (!cmsType) {
    return { error: "CMS type is required." };
  }

  const organization = await getCurrentOrganization();

  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("site_connections").insert({
    organization_id: organization.id,
    display_name: displayName,
    cms_type: cmsType,
    base_url: baseUrl || null,
    status: cmsType === "hosted_blog" ? "connected" : "pending",
  });

  if (error) {
    return { error: "Couldn't add the site. Please try again." };
  }

  revalidatePath("/sites");
  return {};
};
