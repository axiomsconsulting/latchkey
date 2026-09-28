create or replace function public.create_host_workspace(_business_name text, _contact_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _host_id uuid;
begin
  if _uid is null then
    raise exception 'Not authenticated';
  end if;
  select host_id into _host_id from public.host_members where user_id = _uid order by created_at limit 1;
  if _host_id is not null then
    return _host_id;
  end if;
  insert into public.hosts (business_name, contact_email)
    values (coalesce(nullif(_business_name, ''), 'My rooms'), _contact_email)
    returning id into _host_id;
  insert into public.host_members (host_id, user_id, role) values (_host_id, _uid, 'owner');
  return _host_id;
end $$;

revoke all on function public.create_host_workspace(text, text) from public, anon;
grant execute on function public.create_host_workspace(text, text) to authenticated;