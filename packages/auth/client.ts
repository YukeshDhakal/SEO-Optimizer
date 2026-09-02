import type { Database } from "@repo/database";
import { createBrowserClient } from "@supabase/ssr";
import { keys } from "./keys";

export const createClient = () => {
  const env = keys();

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );
};

export type { Session, User, UserIdentity } from "@supabase/supabase-js";
