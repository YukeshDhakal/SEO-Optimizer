import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { keys } from "./keys";
import type { Database } from "./types";

const env = keys();

const globalForSupabase = global as unknown as {
  supabase?: SupabaseClient<Database>;
};

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./types";

// Backend, service-role Supabase client — bypasses RLS, never expose to the
// browser. Request-scoped, session-cookie-bound access (respecting RLS)
// belongs in `@repo/auth/server`'s `createClient()` instead.
//
// `SUPABASE_SERVICE_ROLE_KEY` isn't set yet in this environment (Phase 0 —
// the Supabase MCP tooling used to provision the project can't read secret
// keys back out). Building a lazy proxy instead of throwing at import time
// so the rest of the app can still typecheck/build; anything that actually
// touches the database will throw a clear error until the key is pasted in
// from the Supabase dashboard (Project Settings > API) into `.env`.
const createDatabaseClient = (): SupabaseClient<Database> => {
  if (!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) {
    return new Proxy({} as SupabaseClient<Database>, {
      get() {
        throw new Error(
          "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured — set them in packages/database/.env (see .env.example)."
        );
      },
    });
  }

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
};

export const database = globalForSupabase.supabase ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.supabase = database;
}
