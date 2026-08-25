import { database } from "@repo/database";

// Previously pinged the DB by creating/deleting a stub Prisma row. With no
// schema yet (Phase 1 adds one), ping the Supabase Auth admin API instead —
// it exercises the same service-role connection without depending on any
// table existing.
export const GET = async () => {
  const { error } = await database.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response("OK", { status: 200 });
};
