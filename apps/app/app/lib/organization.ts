import "server-only";

import { createClient } from "@repo/auth/server";
import type { Tables } from "@repo/database";

export type CurrentOrganization = Tables<"organizations"> & {
  role: Tables<"organization_members">["role"];
};

// The signed-in user's organization, via RLS (not the service-role client —
// this only ever returns orgs the caller is actually a member of).
// Multiple orgs per user is schema-supported but not surfaced in the UI yet
// (no org switcher) — this returns the first membership, ordered by when
// they joined, as the simplest correct behavior for a single-org user.
export const getCurrentOrganization =
  async (): Promise<CurrentOrganization | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from("organization_members")
      .select("role, organizations(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.organizations) {
      return null;
    }

    return { ...data.organizations, role: data.role };
  };
