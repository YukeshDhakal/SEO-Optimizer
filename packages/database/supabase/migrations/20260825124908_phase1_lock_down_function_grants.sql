-- New functions default to EXECUTE granted to PUBLIC (includes anon), which
-- needlessly exposes internal RLS-helper functions and the auth trigger as
-- public RPC endpoints (flagged by the Supabase security advisor). Lock down
-- to only what's actually needed:
--   - handle_new_user: trigger-only, never called directly by any role.
--   - is_org_member / is_org_admin / is_org_owner / is_org_admin_for_site:
--     needed by `authenticated` so RLS policies referencing them evaluate
--     correctly for signed-in users; not needed by anon or as a direct RPC.
--   - create_organization_with_owner: legitimately callable by authenticated
--     users (that's its purpose), just not by anon.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid) from public, anon;
revoke execute on function public.is_org_owner(uuid) from public, anon;
revoke execute on function public.is_org_admin_for_site(uuid) from public, anon;

revoke execute on function public.create_organization_with_owner(text, text) from public, anon;
