"use server";

import { createClient } from "@repo/auth/server";
import { revalidatePath } from "next/cache";

// RLS (content_recommendations_update, applied in this phase's migration) is
// what actually enforces owner/admin-only writes — the "canManage" gate on
// the page just hides the UI, matching this app's established pattern (see
// the schedules mutations).
//
// Neither of these deletes the row: the generate-content-recommendations
// cron's upsert deliberately never touches status/dismissed_at/actioned_at,
// so a decision made here survives every regeneration, and the row disappears
// on its own once the underlying condition actually resolves.

export const dismissRecommendation = async (
  formData: FormData
): Promise<void> => {
  const id = String(formData.get("id") ?? "");
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");

  if (!id) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("content_recommendations")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/sites/${siteConnectionId}/recommendations`);
};

export const markRecommendationActioned = async (
  formData: FormData
): Promise<void> => {
  const id = String(formData.get("id") ?? "");
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");

  if (!id) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("content_recommendations")
    .update({ status: "actioned", actioned_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/sites/${siteConnectionId}/recommendations`);
};
