-- Security fix: the old insert policy also allowed user_id = auth.uid(), so any
-- signed-in user could add themselves to any host, even as owner. Only owners
-- may add members now. New workspaces are created by create_host_workspace()
-- (security definer) and invitations will be accepted through their own RPC,
-- so neither needs the self-insert path.
drop policy if exists host_members_insert on public.host_members;
create policy host_members_insert on public.host_members for insert to authenticated
  with check (public.has_host_role(host_id, 'owner'));
