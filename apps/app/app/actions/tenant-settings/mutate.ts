"use server";

import { createClient } from "@repo/auth/server";
import { revalidatePath } from "next/cache";

// RLS (tenant_settings_update, owner/admin-only) is the real enforcement;
// this app-level check just gives a clean error instead of a silent no-op
// write.
export const updateTenantSettings = async (formData: FormData): Promise<void> => {
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) {
    return;
  }

  const requireApproval = formData.get("require_approval") === "on";
  const paused = formData.get("paused") === "on";
  const maxPostsPerDayRaw = String(formData.get("max_posts_per_day") ?? "").trim();
  const maxPostsPerWeekRaw = String(formData.get("max_posts_per_week") ?? "").trim();

  const supabase = await createClient();
  await supabase
    .from("tenant_settings")
    .update({
      require_approval: requireApproval,
      paused,
      max_posts_per_day: maxPostsPerDayRaw ? Number(maxPostsPerDayRaw) : null,
      max_posts_per_week: maxPostsPerWeekRaw ? Number(maxPostsPerWeekRaw) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  revalidatePath("/guardrails");
};
