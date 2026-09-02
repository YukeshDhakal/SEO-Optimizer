"use server";

import { createClient } from "@repo/auth/server";
import { writeAuditLog } from "@repo/workflows";
import { getCurrentOrganization } from "../../lib/organization";

// The identity-manager client component calls this right after a
// link/unlink/password-add succeeds - the actual Supabase Auth call
// (linkIdentity/unlinkIdentity/updateUser) happens client-side (it's the
// only place signInWithOAuth-style redirects and the live session can run
// from), but audit_log.organization_id is NOT NULL and writeAuditLog is
// meant for exactly this "direct use from a normal server action" case
// (see packages/workflows/index.ts's re-export comment) - same pattern
// every other guardrail/billing action in this app already uses.
export type IdentityAuditAction =
  | "account.identity.linked"
  | "account.identity.unlinked"
  | "account.password.added"
  | "account.password.changed";

export const logIdentityEvent = async (
  action: IdentityAuditAction,
  provider: string
): Promise<void> => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await writeAuditLog({
    organizationId: organization.id,
    actor: user?.id ?? null,
    action,
    entityType: "user",
    entityId: user?.id ?? null,
    metadata: { provider },
  });
};
