"use server";

// See get.ts — organization-member search needs Phase 1's `organizations`/
// `organization_members` tables. Stubbed to an empty result for now.
export const searchUsers = async (
  _query: string
): Promise<
  | {
      data: string[];
    }
  | {
      error: unknown;
    }
> => Promise.resolve({ data: [] });
