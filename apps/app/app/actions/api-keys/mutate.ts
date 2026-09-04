"use server";

import { createClient } from "@repo/auth/server";
import { generateApiKey } from "@repo/workflows";
import { revalidatePath } from "next/cache";

const PATH = "/guardrails/api-keys";

export interface ApiKeyFormState {
  error?: string;
  /**
   * The generated secret, returned in this one response and never again. It is
   * deliberately not persisted anywhere — `api_keys` stores only the hash and
   * the 12-character display prefix — so if the user closes the dialog without
   * copying it, the only remedy is to revoke the key and issue another.
   */
  plaintextKey?: string;
  prefix?: string;
}

// Same posture as `schedules/mutate.ts`: RLS (api_keys_insert/update, applied
// in this phase's migration) is what actually enforces owner/admin-only writes.
// The `canManage` gate on the page only hides the UI.
export const createApiKey = async (
  _prevState: ApiKeyFormState,
  formData: FormData
): Promise<ApiKeyFormState> => {
  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const rawLimit = String(formData.get("monthly_call_limit") ?? "").trim();

  if (!(organizationId && name)) {
    return { error: "A name for this key is required." };
  }

  // Empty means "no cap" (the column is nullable). A supplied value has to be a
  // positive integer — a zero or negative cap would create a key that can never
  // be used, which is a confusing way to spell "revoked".
  let monthlyCallLimit: number | null = null;
  if (rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "Monthly call limit must be a positive whole number." };
    }
    monthlyCallLimit = parsed;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { plaintext, prefix, hash } = generateApiKey();

  const { error } = await supabase.from("api_keys").insert({
    organization_id: organizationId,
    name,
    key_prefix: prefix,
    key_hash: hash,
    created_by: user.id,
    monthly_call_limit: monthlyCallLimit,
  });

  if (error) {
    return { error: "Couldn't create the key. Please try again." };
  }

  revalidatePath(PATH);
  return { plaintextKey: plaintext, prefix };
};

// Lets an admin raise or lower a key's cap without rotating it — the whole
// point of the cap is cost control, and forcing a customer to re-paste a new
// key into every AI client they own just to raise a limit would make them
// reach for "unlimited" instead.
export const updateApiKeyLimit = async (formData: FormData): Promise<void> => {
  const id = String(formData.get("id") ?? "");
  const rawLimit = String(formData.get("monthly_call_limit") ?? "").trim();

  if (!id) {
    return;
  }

  let monthlyCallLimit: number | null = null;
  if (rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    monthlyCallLimit = parsed;
  }

  const supabase = await createClient();
  await supabase
    .from("api_keys")
    .update({ monthly_call_limit: monthlyCallLimit })
    .eq("id", id);

  revalidatePath(PATH);
};

// Revocation is an update, not a delete: the row has to survive so the audit
// entries this key produced stay attributable to it. There is deliberately no
// delete RLS policy on `api_keys` at all.
export const revokeApiKey = async (formData: FormData): Promise<void> => {
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(PATH);
};
