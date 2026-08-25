create or replace function public.create_organization_with_owner(org_name text, org_slug text)
returns organizations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_org organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into organizations (name, slug)
  values (org_name, org_slug)
  returning * into new_org;

  insert into organization_members (organization_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  -- Phase 4: every org gets a default tenant_settings row atomically, so
  -- callers never have to special-case "no row yet" (require_approval/paused
  -- default to false/false as the column defaults already say).
  insert into tenant_settings (organization_id)
  values (new_org.id);

  return new_org;
end;
$function$;
