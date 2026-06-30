-- ServSync FB-030 Slice 1B home membership invite/revoke RPC foundation.
-- Adds guarded membership lifecycle RPCs and an audit log for future household access.
-- This patch does not broaden existing homeowner access to service records,
-- storage objects, documents, reminders, messages, estimates, invoices, jobs,
-- notifications, workflow records, or contractor connections.

begin;

create extension if not exists pgcrypto;

create table if not exists public.home_membership_audit_events (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  membership_id uuid references public.home_memberships(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  old_role text,
  new_role text,
  old_status text,
  new_status text,
  created_at timestamptz not null default now(),
  constraint home_membership_audit_events_event_type_check
    check (event_type in ('invited', 'accepted', 'declined', 'revoked')),
  constraint home_membership_audit_events_old_role_check
    check (old_role is null or old_role in ('owner', 'admin', 'member', 'viewer')),
  constraint home_membership_audit_events_new_role_check
    check (new_role is null or new_role in ('owner', 'admin', 'member', 'viewer')),
  constraint home_membership_audit_events_old_status_check
    check (old_status is null or old_status in ('invited', 'active', 'removed', 'declined')),
  constraint home_membership_audit_events_new_status_check
    check (new_status is null or new_status in ('invited', 'active', 'removed', 'declined'))
);

comment on table public.home_membership_audit_events is
  'FB-030 home membership lifecycle audit events. Browser roles cannot mutate this table directly.';

create index if not exists home_membership_audit_events_home_created_idx
  on public.home_membership_audit_events(home_id, created_at desc);

create index if not exists home_membership_audit_events_membership_idx
  on public.home_membership_audit_events(membership_id);

create index if not exists home_membership_audit_events_actor_idx
  on public.home_membership_audit_events(actor_user_id);

create index if not exists home_membership_audit_events_target_idx
  on public.home_membership_audit_events(target_user_id);

alter table public.home_membership_audit_events enable row level security;

drop policy if exists "Home membership audit: managers read home events" on public.home_membership_audit_events;
create policy "Home membership audit: managers read home events"
  on public.home_membership_audit_events for select to authenticated
  using (public.current_user_can_manage_home(home_id));

drop policy if exists "Home membership audit: platform admin reads" on public.home_membership_audit_events;
create policy "Home membership audit: platform admin reads"
  on public.home_membership_audit_events for select to authenticated
  using (public.current_user_is_platform_admin());

revoke all on table public.home_membership_audit_events from public;
revoke all on table public.home_membership_audit_events from anon;
revoke all on table public.home_membership_audit_events from authenticated;
grant select on table public.home_membership_audit_events to authenticated;

create or replace function public.servsync_invite_home_member(
  p_home_id uuid,
  p_invitee_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_role, '')));
  v_home public.homes%rowtype;
  v_actor_role text;
  v_invitee_role text;
  v_membership public.home_memberships%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_home_id is null or p_invitee_user_id is null then
    raise exception 'Home and invitee are required.';
  end if;

  if v_role not in ('admin', 'member', 'viewer') then
    raise exception 'Home membership invite role must be admin, member, or viewer.';
  end if;

  select *
    into v_home
    from public.homes
   where id = p_home_id;

  if not found then
    raise exception 'Home not found.';
  end if;

  v_actor_role := public.current_user_home_role(p_home_id);

  if coalesce(v_actor_role, '') not in ('owner', 'admin') then
    raise exception 'You do not have permission to invite home members.';
  end if;

  if v_role = 'admin' and v_home.homeowner_user_id is distinct from v_actor_id then
    raise exception 'Only the primary homeowner can invite home admins.';
  end if;

  if p_invitee_user_id = v_home.homeowner_user_id then
    raise exception 'The primary homeowner already owns this home.';
  end if;

  select role
    into v_invitee_role
    from public.profiles
   where id = p_invitee_user_id;

  if not found then
    raise exception 'Invitee profile not found.';
  end if;

  if v_invitee_role <> 'homeowner' then
    raise exception 'Only homeowner accounts can be invited to home membership.';
  end if;

  if exists (
    select 1
      from public.home_memberships hm
     where hm.home_id = p_home_id
       and hm.user_id = p_invitee_user_id
       and hm.status in ('invited', 'active')
  ) then
    raise exception 'This user already has an open membership for this home.';
  end if;

  insert into public.home_memberships (
    home_id,
    user_id,
    role,
    status,
    invited_by_user_id,
    accepted_at,
    removed_at
  ) values (
    p_home_id,
    p_invitee_user_id,
    v_role,
    'invited',
    v_actor_id,
    null,
    null
  )
  returning * into v_membership;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status
  ) values (
    p_home_id,
    v_membership.id,
    v_actor_id,
    p_invitee_user_id,
    'invited',
    null,
    v_role,
    null,
    'invited'
  );

  return to_jsonb(v_membership);
end;
$$;

create or replace function public.servsync_accept_home_membership_invite(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.home_memberships%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_membership_id is null then
    raise exception 'Membership is required.';
  end if;

  select *
    into v_membership
    from public.home_memberships
   where id = p_membership_id
   for update;

  if not found then
    raise exception 'Membership invite not found.';
  end if;

  if v_membership.user_id <> v_actor_id then
    raise exception 'You can only accept your own home membership invite.';
  end if;

  if v_membership.status <> 'invited' then
    raise exception 'Only pending home membership invites can be accepted.';
  end if;

  update public.home_memberships
     set status = 'active',
         accepted_at = now(),
         removed_at = null
   where id = p_membership_id
  returning * into v_membership;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status
  ) values (
    v_membership.home_id,
    v_membership.id,
    v_actor_id,
    v_membership.user_id,
    'accepted',
    v_membership.role,
    v_membership.role,
    'invited',
    'active'
  );

  return to_jsonb(v_membership);
end;
$$;

create or replace function public.servsync_decline_home_membership_invite(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.home_memberships%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_membership_id is null then
    raise exception 'Membership is required.';
  end if;

  select *
    into v_membership
    from public.home_memberships
   where id = p_membership_id
   for update;

  if not found then
    raise exception 'Membership invite not found.';
  end if;

  if v_membership.user_id <> v_actor_id then
    raise exception 'You can only decline your own home membership invite.';
  end if;

  if v_membership.status <> 'invited' then
    raise exception 'Only pending home membership invites can be declined.';
  end if;

  update public.home_memberships
     set status = 'declined',
         accepted_at = null,
         removed_at = now()
   where id = p_membership_id
  returning * into v_membership;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status
  ) values (
    v_membership.home_id,
    v_membership.id,
    v_actor_id,
    v_membership.user_id,
    'declined',
    v_membership.role,
    v_membership.role,
    'invited',
    'declined'
  );

  return to_jsonb(v_membership);
end;
$$;

create or replace function public.servsync_revoke_home_membership(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.home_memberships%rowtype;
  v_home public.homes%rowtype;
  v_actor_role text;
  v_old_status text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_membership_id is null then
    raise exception 'Membership is required.';
  end if;

  select *
    into v_membership
    from public.home_memberships
   where id = p_membership_id
   for update;

  if not found then
    raise exception 'Membership not found.';
  end if;

  select *
    into v_home
    from public.homes
   where id = v_membership.home_id;

  if not found then
    raise exception 'Home not found.';
  end if;

  v_actor_role := public.current_user_home_role(v_membership.home_id);

  if coalesce(v_actor_role, '') not in ('owner', 'admin') then
    raise exception 'You do not have permission to revoke home members.';
  end if;

  if v_membership.user_id = v_home.homeowner_user_id then
    raise exception 'Primary homeowner membership cannot be revoked.';
  end if;

  if v_membership.status not in ('invited', 'active') then
    raise exception 'Only invited or active memberships can be revoked.';
  end if;

  if v_membership.role = 'admin' and v_home.homeowner_user_id is distinct from v_actor_id then
    raise exception 'Only the primary homeowner can revoke home admins.';
  end if;

  v_old_status := v_membership.status;

  update public.home_memberships
     set status = 'removed',
         removed_at = now()
   where id = p_membership_id
  returning * into v_membership;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status
  ) values (
    v_membership.home_id,
    v_membership.id,
    v_actor_id,
    v_membership.user_id,
    'revoked',
    v_membership.role,
    v_membership.role,
    v_old_status,
    'removed'
  );

  return to_jsonb(v_membership);
end;
$$;

revoke execute on function public.servsync_invite_home_member(uuid, uuid, text) from public;
revoke execute on function public.servsync_invite_home_member(uuid, uuid, text) from anon;
grant execute on function public.servsync_invite_home_member(uuid, uuid, text) to authenticated;

revoke execute on function public.servsync_accept_home_membership_invite(uuid) from public;
revoke execute on function public.servsync_accept_home_membership_invite(uuid) from anon;
grant execute on function public.servsync_accept_home_membership_invite(uuid) to authenticated;

revoke execute on function public.servsync_decline_home_membership_invite(uuid) from public;
revoke execute on function public.servsync_decline_home_membership_invite(uuid) from anon;
grant execute on function public.servsync_decline_home_membership_invite(uuid) to authenticated;

revoke execute on function public.servsync_revoke_home_membership(uuid) from public;
revoke execute on function public.servsync_revoke_home_membership(uuid) from anon;
grant execute on function public.servsync_revoke_home_membership(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
