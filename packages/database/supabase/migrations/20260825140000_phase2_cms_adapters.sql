-- Phase 2: CMS adapters — posts table (metadata-CRUD/manual-publish slice
-- only; pipeline_run_id, content_embedding, seo_score/geo_score belong to
-- Phase 3/4 and are intentionally not added yet) + Supabase Vault-backed
-- credential storage for cms_credentials.secret_ref.

create table posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  title text not null,
  slug text not null,
  content_html text not null,
  content_markdown text,
  meta_title text,
  meta_description text,
  status text not null default 'draft' check (status in ('draft','published','failed')),
  external_post_id text,
  published_url text,
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_posts_org on posts(organization_id);
create index idx_posts_site on posts(site_connection_id);
create unique index idx_posts_site_slug on posts(site_connection_id, slug);

alter table posts enable row level security;

create policy "org members can view posts"
  on posts for select
  using (is_org_member(organization_id));

create policy "org admins can insert posts"
  on posts for insert
  with check (is_org_admin(organization_id) and created_by = auth.uid());

create policy "org admins can update posts"
  on posts for update
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

create policy "org admins can delete posts"
  on posts for delete
  using (is_org_admin(organization_id));

-- Credential storage: `cms_credentials.secret_ref` holds a Supabase Vault
-- secret id (text-cast uuid), never the plaintext credential. The vault
-- schema's own tables/functions have no grants for `authenticated` at all,
-- so these two security-definer RPCs are the *only* way app code can read
-- or write a site's credentials — both re-check `is_org_admin_for_site`
-- themselves rather than relying solely on the `cms_credentials` RLS
-- policies (defense in depth, and required anyway since the vault schema
-- itself is bypassed by security definer).

create or replace function public.set_site_credentials(p_site_connection_id uuid, p_secret jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_secret_ref text;
  new_secret_id uuid;
  credentials_id uuid;
begin
  if not is_org_admin_for_site(p_site_connection_id) then
    raise exception 'not authorized for this site connection';
  end if;

  select secret_ref into existing_secret_ref
  from cms_credentials
  where site_connection_id = p_site_connection_id;

  if existing_secret_ref is not null then
    perform vault.update_secret(existing_secret_ref::uuid, p_secret::text);

    update cms_credentials
    set secret_ref = existing_secret_ref
    where site_connection_id = p_site_connection_id
    returning id into credentials_id;

    return credentials_id;
  end if;

  new_secret_id := vault.create_secret(p_secret::text, 'site_connection:' || p_site_connection_id::text);

  insert into cms_credentials (site_connection_id, secret_ref)
  values (p_site_connection_id, new_secret_id::text)
  returning id into credentials_id;

  return credentials_id;
end;
$$;

create or replace function public.get_site_credentials(p_site_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref text;
  decrypted text;
begin
  if not is_org_admin_for_site(p_site_connection_id) then
    raise exception 'not authorized for this site connection';
  end if;

  select secret_ref into ref
  from cms_credentials
  where site_connection_id = p_site_connection_id;

  if ref is null then
    return null;
  end if;

  select decrypted_secret into decrypted
  from vault.decrypted_secrets
  where id = ref::uuid;

  return decrypted::jsonb;
end;
$$;

revoke all on function public.set_site_credentials(uuid, jsonb) from public;
revoke all on function public.get_site_credentials(uuid) from public;
grant execute on function public.set_site_credentials(uuid, jsonb) to authenticated;
grant execute on function public.get_site_credentials(uuid) to authenticated;
