"use server";

import { createClient } from "@repo/auth/server";
import { writeAuditLog } from "@repo/workflows";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const toggleSitePaused = async (formData: FormData): Promise<void> => {
  const id = String(formData.get("id") ?? "");
  const paused = formData.get("paused") === "true";
  const organizationId = String(formData.get("organization_id") ?? "");

  if (!id) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nowUnpausing = paused; // current `paused` is true -> this action flips it to false
  await supabase
    .from("site_connections")
    .update({
      paused: !paused,
      // Resuming clears the failure count too, not just the pause flag —
      // otherwise `auto_pause_site_on_repeated_failures`'s trigger (which
      // only fires on a crossing from below 3 to 3+) would never re-arm:
      // a site left at, say, 4 failures would silently never auto-pause
      // again no matter how many further publishes fail.
      ...(nowUnpausing ? { consecutive_publish_failures: 0 } : {}),
    })
    .eq("id", id);

  if (organizationId) {
    await writeAuditLog({
      organizationId,
      actor: user?.id ?? null,
      action: nowUnpausing ? "site.unpaused" : "site.paused",
      entityType: "site_connection",
      entityId: id,
    });
  }

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
