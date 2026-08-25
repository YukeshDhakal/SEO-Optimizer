"use server";

// Clerk's organization-membership lookup (`clerkClient().organizations...`)
// doesn't have a Supabase equivalent yet — Phase 1's `organizations` /
// `organization_members` tables will back this for real. Stubbed to an
// empty result for now so `CollaborationProvider` (see
// components/collaboration-provider.tsx) still compiles and degrades
// gracefully rather than throwing.
export const getUsers = async (
  _userIds: string[]
): Promise<
  | {
      data: Liveblocks["UserMeta"]["info"][];
    }
  | {
      error: unknown;
    }
> => Promise.resolve({ data: [] });
