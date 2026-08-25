import "server-only";

import type { Database } from "@repo/database";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { keys } from "./keys";

// Request-scoped Supabase client for Server Components, Route Handlers, and
// Server Actions. Uses the anon key + the caller's session cookie — this is
// NOT the service-role client (that's `@repo/database`, for backend-only
// admin access unscoped by a user session).
export const createClient = async () => {
  const cookieStore = await cookies();
  const env = keys();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component with no response to write to —
            // safe to ignore as long as the proxy/middleware refreshes the
            // session (see `./proxy.ts`).
          }
        },
      },
    }
  );
};

// `userId` only — there is no organization/tenant concept yet. Phase 1 adds
// the `organizations`/`organization_members` tables; until then, every call
// site that used to read Clerk's `orgId` should either gate on `userId`
// alone or explicitly acknowledge it has no org to scope to.
export const auth = async (): Promise<{ userId: string | null }> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { userId: user?.id ?? null };
};

export const currentUser = async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
};
