-- Supabase grants EXECUTE to anon/authenticated/service_role by default at
-- CREATE FUNCTION time (ALTER DEFAULT PRIVILEGES on the public schema) —
-- `revoke ... from public` in the previous migration only stripped the
-- PUBLIC pseudo-role, not those already-materialized per-role grants.
-- These two RPCs touch decrypted secrets; anon should never be able to call
-- them at all (they're safe either way, since is_org_admin_for_site()
-- returns false for a null auth.uid() and the function raises, but there is
-- no reason to leave that as reachable surface).
revoke execute on function public.set_site_credentials(uuid, jsonb) from anon;
revoke execute on function public.get_site_credentials(uuid) from anon;
