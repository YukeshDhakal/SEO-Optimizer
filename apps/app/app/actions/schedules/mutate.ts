"use server";

import { createClient } from "@repo/auth/server";
import { computeNextRunAt, validateCadence } from "@repo/workflows";
import { revalidatePath } from "next/cache";

export interface ScheduleFormState {
  error?: string;
}

// RLS (schedules_insert/update/delete, applied in this phase's migration)
// is what actually enforces owner/admin-only writes — the "canManage" gate
// on the page just hides the UI, matching this app's established pattern
// (see Phase 2's site-connection mutations).
export const createSchedule = async (
  _prevState: ScheduleFormState,
  formData: FormData
): Promise<ScheduleFormState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");
  const cadence = String(formData.get("cadence") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC").trim() || "UTC";
  const topicHint = String(formData.get("topic_hint") ?? "").trim();
  const topicSource =
    formData.get("topic_source") === "auto" ? "auto" : "manual";

  if (!(siteConnectionId && organizationId && cadence && topicHint)) {
    return { error: "Cadence and a topic/niche hint are required." };
  }

  let nextRunAt: string;
  try {
    validateCadence(cadence, timezone);
    nextRunAt = computeNextRunAt(cadence, timezone).toISOString();
  } catch {
    return { error: "That doesn't look like a valid cron expression." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { error } = await supabase.from("schedules").insert({
    organization_id: organizationId,
    site_connection_id: siteConnectionId,
    cadence,
    timezone,
    topic_hint: topicHint,
    topic_source: topicSource,
    next_run_at: nextRunAt,
    created_by: user.id,
  });

  if (error) {
    return { error: "Couldn't create the schedule. Please try again." };
  }

  revalidatePath(`/sites/${siteConnectionId}/schedule`);
  return {};
};

export const toggleScheduleEnabled = async (formData: FormData): Promise<void> => {
  const id = String(formData.get("id") ?? "");
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const enabled = formData.get("enabled") === "true";

  if (!id) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("schedules").update({ enabled: !enabled }).eq("id", id);

  revalidatePath(`/sites/${siteConnectionId}/schedule`);
};

export const deleteSchedule = async (formData: FormData): Promise<void> => {
  const id = String(formData.get("id") ?? "");
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");

  if (!id) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("schedules").delete().eq("id", id);

  revalidatePath(`/sites/${siteConnectionId}/schedule`);
};
