"use server";

import { createClient } from "@repo/auth/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const toggleSitePaused = async (formData: FormData): Promise<void> => {
  const id = String(formData.get("id") ?? "");
  const paused = formData.get("paused") === "true";

  if (!id) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("site_connections")
    .update({ paused: !paused })
    .eq("id", id);

  revalidatePath("/sites");
  revalidatePath(`/sites/${id}`);
};

export const deleteSiteConnection = async (
  formData: FormData
): Promise<void> => {
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("site_connections").delete().eq("id", id);

  revalidatePath("/sites");
  redirect("/sites");
};

export interface UpdateSiteConnectionState {
  error?: string;
}

export const updateSiteConnection = async (
  _prevState: UpdateSiteConnectionState,
  formData: FormData
): Promise<UpdateSiteConnectionState> => {
  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const baseUrl = String(formData.get("base_url") ?? "").trim();

  if (!id) {
    return { error: "Missing site id." };
  }

  if (!displayName) {
    return { error: "Display name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_connections")
    .update({ display_name: displayName, base_url: baseUrl || null })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save changes. Please try again." };
  }

  revalidatePath("/sites");
  revalidatePath(`/sites/${id}`);
  return {};
};
