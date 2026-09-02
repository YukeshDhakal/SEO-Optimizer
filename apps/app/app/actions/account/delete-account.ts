"use server";

import { createClient } from "@repo/auth/server";
import { database } from "@repo/database";
import { writeAuditLog } from "@repo/workflows";
import { getCurrentOrganization } from "../../lib/organization";

export interface DeleteAccountResult {
  success: boolean;
  error?: string;
}

// Real, irreversible action - runs on the service-role client because
// auth.admin.deleteUser() isn't callable from a user-session client.
// Every organization_id foreign key in this schema is ON DELETE CASCADE
// (confirmed against every phase migration), so deleting an org the user
// solely owns is safe and complete. What's NOT safe is deleting a user
// who is the sole owner of an org that still has other members - that
// would silently orphan them, so that case is blocked outright rather
// than guessed at.
export const deleteAccount = async (): Promise<DeleteAccountResult> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in." };
  }

  const { data: ownedMemberships, error: ownedError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "owner");

  if (ownedError) {
    return { success: false, error: ownedError.message };
  }

  const ownedOrgIds = (ownedMemberships ?? []).map((m) => m.organization_id);

  if (ownedOrgIds.length > 0) {
    const { data: otherMembers, error: otherMembersError } = await database
      .from("organization_members")
      .select("organization_id")
      .in("organization_id", ownedOrgIds)
      .neq("user_id", user.id);

    if (otherMembersError) {
      return { success: false, error: otherMembersError.message };
    }

    if (otherMembers && otherMembers.length > 0) {
      return {
        success: false,
        error:
          "You own an organization that still has other members. Transfer ownership or remove the other members before deleting your account.",
      };
    }
  }

  const organization = await getCurrentOrganization();
  if (organization) {
    await writeAuditLog({
      organizationId: organization.id,
      actor: user.id,
      action: "account.deleted",
      entityType: "user",
      entityId: user.id,
      metadata: { email: user.email },
    });
  }

  if (ownedOrgIds.length > 0) {
    await database.from("organizations").delete().in("id", ownedOrgIds);
  }

  const { error: deleteError } = await database.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  return { success: true };
};
