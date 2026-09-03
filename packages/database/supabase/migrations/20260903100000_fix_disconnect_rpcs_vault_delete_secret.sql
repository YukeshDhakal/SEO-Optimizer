-- vault.delete_secret(uuid) has never existed in Supabase Vault's actual function
-- surface (only create_secret/update_secret do — confirmed via pg_proc against this
-- project's vault schema). Both disconnect RPCs below have called it since they were
-- written, so every "Disconnect" click for Search Console or Google Ads has been
-- throwing a Postgres error and failing. The correct removal is a direct delete
-- against vault.secrets, which is what Supabase's own docs use for secret deletion.

create or replace function public.delete_search_console_credentials(p_site_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref text;
begin
  if not is_org_admin_for_site(p_site_connection_id) then
    raise exception 'not authorized for this site connection';
  end if;

  select secret_ref into ref
  from search_console_credentials
  where site_connection_id = p_site_connection_id;

  if ref is not null then
    delete from vault.secrets where id = ref::uuid;
  end if;

  delete from search_console_credentials where site_connection_id = p_site_connection_id;
end;
$$;

create or replace function public.delete_google_ads_credentials(p_site_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref text;
begin
  if not is_org_admin_for_site(p_site_connection_id) then
    raise exception 'not authorized for this site connection';
  end if;

  select secret_ref into ref
  from google_ads_credentials
  where site_connection_id = p_site_connection_id;

  if ref is not null then
    delete from vault.secrets where id = ref::uuid;
  end if;

  delete from google_ads_credentials where site_connection_id = p_site_connection_id;
end;
$$;
