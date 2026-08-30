"use server";

import { createClient } from "@repo/auth/server";
import { revalidatePath } from "next/cache";

// One-click platform-wide stop/resume for the persistent status bar
// (every screen, per the Quillrun Design handoff) - distinct from
// updateTenantSettings' full form submit in settings/page.tsx, which
// covers the same `paused` field alongside require_approval and the
// posting limits. RLS (tenant_settings_update, owner/admin-only) is the
// real enforcement.
export const toggleGlobalPause = async (
  organizationId: string,
  paused: boolean
): Promise<{ error?: string }> => {
  if (!organizationId) {
    return { error: "No organization." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_settings")
    .update({ paused, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);

  if (error) {
    return { error: error.message };
  }

  // The status bar renders on every authenticated screen (layout.tsx),
  // so revalidate broadly rather than one route.
  revalidatePath("/", "layout");
  return {};
};
