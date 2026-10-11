-- Each person's own name and photo, shown on team cards. Only the person
-- edits theirs; teammates see them through host_team().

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  avatar_path text,
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists user_profiles_own on public.user_profiles;
create policy user_profiles_own on public.user_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Everyone shares the demo account, so its profile stays as it is.
drop trigger if exists shared_demo_read_only on public.user_profiles;
create trigger shared_demo_read_only before insert or update or delete on public.user_profiles
  for each row execute function public.block_shared_demo_writes();

-- The team list gains names, photos and when each person last signed in.
drop function if exists public.host_team(uuid);
create function public.host_team(_host_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz,
  display_name text,
  avatar_path text,
  last_sign_in_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role::text, m.created_at, p.display_name, p.avatar_path, u.last_sign_in_at
  from public.host_members m
  join auth.users u on u.id = m.user_id
  left join public.user_profiles p on p.user_id = m.user_id
  where m.host_id = _host_id and public.is_host_member(_host_id)
  order by m.created_at
$$;
revoke all on function public.host_team(uuid) from public, anon;
grant execute on function public.host_team(uuid) to authenticated;
