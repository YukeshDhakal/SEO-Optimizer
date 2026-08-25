import { NextResponse } from "next/server";

// This was a Clerk webhook handler (user/organization created/updated/
// deleted events, verified via svix). Supabase Auth doesn't use svix-signed
// webhooks for these events — user lifecycle can be observed via Supabase
// Auth Hooks (Postgres functions invoked on auth events) or by listening to
// `auth.users` changes directly, which is a Phase 1 concern once there's a
// real `organizations`/`organization_members` schema to sync into. Stubbed
// to a no-op for now rather than left calling a nonexistent Clerk API.
export const POST = async (): Promise<Response> =>
  NextResponse.json({ message: "Not configured", ok: false });
