-- ServSync FB-030 Slice 1C pending email home membership invite foundation.
-- Adds backend-only email invite scaffolding for future household access UI.
-- This patch does not send email/SMS/push, add UI, broaden existing homeowner
-- access to app records, or change storage policies.

begin;

create extension if not exists pgcrypto;

alter table public.home_membership_audit_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.home_membership_audit_events
  drop constraint if exists home_membership_audit_events_event_type_check;
alter table public.home_membership_audit_events
  add constraint home_membership_audit_events_event_type_check
  check (event_type in (
    'invited',
    'accepted',
    'declined',
    'revoked',
    'email_invite_created',
    'email_invite_accepted',
    'email_invite_declined',
    'email_invite_revoked'
  ));

alter table public.home_membership_audit_events
  drop constraint if exists home_membership_audit_events_old_status_check;
alter table public.home_membership_audit_events
  add constraint home_membership_audit_events_old_status_check
  check (old_status is null or old_status in (
    'invited',
    'active',
    'removed',
    'declined',
    'pending',
    'accepted',
    'revoked',
    'expired'
  ));

alter table public.home_membership_audit_events
  drop constraint if exists home_membership_audit_events_new_status_check;
alter table public.home_membership_audit_events
  add constraint home_membership_audit_events_new_status_check
  check (new_status is null or new_status in (
    'invited',
    'active',
    'removed',
    'declined',
    'pending',
    'accepted',
    'revoked',
    'expired'
  ));

create table if not exists public.home_membership_email_invites (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  invited_email text not null,
  invited_email_normalized text not null,
  role text not null,
  status text not null default 'pending',
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  membership_id uuid references public.home_memberships(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_membership_email_invites_role_check
    check (role in ('admin', 'member', 'viewer')),
  constraint home_membership_email_invites_status_check
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  constraint home_membership_email_invites_email_normalized_check
    check (
      invited_email_normalized = lower(btrim(invited_email_normalized))
      and invited_email_normalized <> ''
      and invited_email_normalized !~ '\s'
      and invited_email_normalized like '%@%'
      and invited_email_normalized like '%.%'
    ),
  constraint home_membership_email_invites_lifecycle_check
    check (
      (status = 'pending'
        and accepted_by_user_id is null
        and membership_id is null
        and accepted_at is null
        and declined_at is null
        and revoked_at is null)
      or (status = 'accepted'
        and accepted_by_user_id is not null
        and membership_id is not null
        and accepted_at is not null
        and declined_at is null
        and revoked_at is null)
      or (status = 'declined'
        and accepted_by_user_id is null
        and accepted_at is null
        and declined_at is not null
        and revoked_at is null)
      or (status = 'revoked'
        and accepted_by_user_id is null
        and accepted_at is null
        and revoked_at is not null)
      or (status = 'expired'
        and accepted_by_user_id is null
        and accepted_at is null)
    )
);

comment on table public.home_membership_email_invites is
  'FB-030 pending email home membership invites. Backend-only foundation; email delivery and shared record access are deferred.';

comment on column public.home_membership_email_invites.invited_email_normalized is
  'Lowercase trimmed email used for matching the signed-in user auth email. Do not expose account-existence lookup results.';

create index if not exists home_membership_email_invites_home_idx
  on public.home_membership_email_invites(home_id);

create index if not exists home_membership_email_invites_email_idx
  on public.home_membership_email_invites(invited_email_normalized);

create index if not exists home_membership_email_invites_invited_by_idx
  on public.home_membership_email_invites(invited_by_user_id);

create index if not exists home_membership_email_invites_accepted_by_idx
  on public.home_membership_email_invites(accepted_by_user_id);

create index if not exists home_membership_email_invites_status_idx
  on public.home_membership_email_invites(status);

create unique index if not exists home_membership_email_invites_home_email_pending_unique
  on public.home_membership_email_invites(home_id, invited_email_normalized)
  where status = 'pending';

drop trigger if exists home_membership_email_invites_touch_updated_at
  on public.home_membership_email_invites;
create trigger home_membership_email_invites_touch_updated_at
  before update on public.home_membership_email_invites
  for each row execute function public.touch_updated_at();

create or replace function public.servsync_create_home_membership_email_invite(
  p_home_id uuid,
  p_invited_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_home public.homes%rowtype;
  v_actor_role text;
  v_invite public.home_membership_email_invites%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_home_id is null then
    raise exception 'Home is required.';
  end if;

  if v_email = ''
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid invited email is required.';
  end if;

  if v_role not in ('admin', 'member', 'viewer') then
    raise exception 'Home membership email invite role must be admin, member, or viewer.';
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

  if exists (
    select 1
      from public.home_membership_email_invites ei
     where ei.home_id = p_home_id
       and ei.invited_email_normalized = v_email
       and ei.status = 'pending'
  ) then
    raise exception 'A pending invite already exists for this email and home.';
  end if;

  insert into public.home_membership_email_invites (
    home_id,
    invited_email,
    invited_email_normalized,
    role,
    status,
    invited_by_user_id
  ) values (
    p_home_id,
    btrim(p_invited_email),
    v_email,
    v_role,
    'pending',
    v_actor_id
  )
  returning * into v_invite;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status,
    metadata
  ) values (
    p_home_id,
    null,
    v_actor_id,
    null,
    'email_invite_created',
    null,
    v_role,
    null,
    'pending',
    jsonb_build_object(
      'email_invite_id', v_invite.id,
      'target_email', v_email
    )
  );

  return jsonb_build_object(
    'id', v_invite.id,
    'home_id', v_invite.home_id,
    'invited_email', v_invite.invited_email,
    'invited_email_normalized', v_invite.invited_email_normalized,
    'role', v_invite.role,
    'status', v_invite.status,
    'created_at', v_invite.created_at
  );
end;
$$;

create or replace function public.servsync_list_my_home_membership_email_invites()
returns table (
  id uuid,
  home_id uuid,
  home_nickname text,
  home_city text,
  home_state text,
  role text,
  status text,
  invited_email text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if v_actor_email = '' then
    raise exception 'Authenticated email is required.';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = v_actor_id;

  if coalesce(v_actor_role, '') <> 'homeowner' then
    return;
  end if;

  return query
  select
    ei.id,
    ei.home_id,
    h.nickname as home_nickname,
    h.city as home_city,
    h.state as home_state,
    ei.role,
    ei.status,
    ei.invited_email,
    ei.expires_at,
    ei.created_at
  from public.home_membership_email_invites ei
  join public.homes h on h.id = ei.home_id
  where ei.invited_email_normalized = v_actor_email
    and ei.status = 'pending'
    and (ei.expires_at is null or ei.expires_at > now())
  order by ei.created_at desc;
end;
$$;

create or replace function public.servsync_list_home_membership_email_invites(p_home_id uuid)
returns table (
  id uuid,
  home_id uuid,
  invited_email text,
  invited_email_normalized text,
  role text,
  status text,
  invited_by_user_id uuid,
  accepted_by_user_id uuid,
  membership_id uuid,
  expires_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_home_id is null then
    raise exception 'Home is required.';
  end if;

  if not public.current_user_can_manage_home(p_home_id) then
    raise exception 'You do not have permission to view home membership email invites.';
  end if;

  return query
  select
    ei.id,
    ei.home_id,
    ei.invited_email,
    ei.invited_email_normalized,
    ei.role,
    ei.status,
    ei.invited_by_user_id,
    ei.accepted_by_user_id,
    ei.membership_id,
    ei.expires_at,
    ei.accepted_at,
    ei.declined_at,
    ei.revoked_at,
    ei.created_at,
    ei.updated_at
  from public.home_membership_email_invites ei
  where ei.home_id = p_home_id
  order by ei.created_at desc;
end;
$$;

create or replace function public.servsync_accept_home_membership_email_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_actor_role text;
  v_invite public.home_membership_email_invites%rowtype;
  v_existing_membership public.home_memberships%rowtype;
  v_membership public.home_memberships%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_invite_id is null then
    raise exception 'Invite is required.';
  end if;

  if v_actor_email = '' then
    raise exception 'Authenticated email is required.';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = v_actor_id;

  if coalesce(v_actor_role, '') <> 'homeowner' then
    raise exception 'Only homeowner accounts can accept home membership email invites.';
  end if;

  select *
    into v_invite
    from public.home_membership_email_invites
   where id = p_invite_id
   for update;

  if not found then
    raise exception 'Home membership email invite not found.';
  end if;

  if v_invite.invited_email_normalized <> v_actor_email then
    raise exception 'You can only accept home membership email invites addressed to your authenticated email.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Only pending home membership email invites can be accepted.';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'Home membership email invite has expired.';
  end if;

  select *
    into v_existing_membership
    from public.home_memberships hm
   where hm.home_id = v_invite.home_id
     and hm.user_id = v_actor_id
   order by case hm.status
     when 'active' then 1
     when 'invited' then 2
     when 'removed' then 3
     when 'declined' then 4
     else 5
   end
   limit 1
   for update;

  if found and v_existing_membership.status = 'active' then
    raise exception 'You already have active membership for this home.';
  end if;

  if found then
    update public.home_memberships
       set role = v_invite.role,
           status = 'active',
           invited_by_user_id = v_invite.invited_by_user_id,
           accepted_at = now(),
           removed_at = null
     where id = v_existing_membership.id
    returning * into v_membership;
  else
    insert into public.home_memberships (
      home_id,
      user_id,
      role,
      status,
      invited_by_user_id,
      accepted_at,
      removed_at
    ) values (
      v_invite.home_id,
      v_actor_id,
      v_invite.role,
      'active',
      v_invite.invited_by_user_id,
      now(),
      null
    )
    returning * into v_membership;
  end if;

  update public.home_membership_email_invites
     set status = 'accepted',
         accepted_by_user_id = v_actor_id,
         membership_id = v_membership.id,
         accepted_at = now()
   where id = v_invite.id
  returning * into v_invite;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status,
    metadata
  ) values (
    v_invite.home_id,
    v_membership.id,
    v_actor_id,
    v_actor_id,
    'email_invite_accepted',
    v_invite.role,
    v_invite.role,
    'pending',
    'accepted',
    jsonb_build_object(
      'email_invite_id', v_invite.id,
      'target_email', v_invite.invited_email_normalized
    )
  );

  return jsonb_build_object(
    'id', v_invite.id,
    'home_id', v_invite.home_id,
    'role', v_invite.role,
    'status', v_invite.status,
    'membership_id', v_membership.id,
    'accepted_by_user_id', v_invite.accepted_by_user_id,
    'accepted_at', v_invite.accepted_at
  );
end;
$$;

create or replace function public.servsync_decline_home_membership_email_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_invite public.home_membership_email_invites%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_invite_id is null then
    raise exception 'Invite is required.';
  end if;

  if v_actor_email = '' then
    raise exception 'Authenticated email is required.';
  end if;

  select *
    into v_invite
    from public.home_membership_email_invites
   where id = p_invite_id
   for update;

  if not found then
    raise exception 'Home membership email invite not found.';
  end if;

  if v_invite.invited_email_normalized <> v_actor_email then
    raise exception 'You can only decline home membership email invites addressed to your authenticated email.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Only pending home membership email invites can be declined.';
  end if;

  update public.home_membership_email_invites
     set status = 'declined',
         declined_at = now()
   where id = v_invite.id
  returning * into v_invite;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status,
    metadata
  ) values (
    v_invite.home_id,
    null,
    v_actor_id,
    v_actor_id,
    'email_invite_declined',
    v_invite.role,
    v_invite.role,
    'pending',
    'declined',
    jsonb_build_object(
      'email_invite_id', v_invite.id,
      'target_email', v_invite.invited_email_normalized
    )
  );

  return jsonb_build_object(
    'id', v_invite.id,
    'home_id', v_invite.home_id,
    'role', v_invite.role,
    'status', v_invite.status,
    'declined_at', v_invite.declined_at
  );
end;
$$;

create or replace function public.servsync_revoke_home_membership_email_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_invite public.home_membership_email_invites%rowtype;
  v_home public.homes%rowtype;
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_invite_id is null then
    raise exception 'Invite is required.';
  end if;

  select *
    into v_invite
    from public.home_membership_email_invites
   where id = p_invite_id
   for update;

  if not found then
    raise exception 'Home membership email invite not found.';
  end if;

  select *
    into v_home
    from public.homes
   where id = v_invite.home_id;

  if not found then
    raise exception 'Home not found.';
  end if;

  v_actor_role := public.current_user_home_role(v_invite.home_id);

  if coalesce(v_actor_role, '') not in ('owner', 'admin') then
    raise exception 'You do not have permission to revoke home membership email invites.';
  end if;

  if v_invite.role = 'admin' and v_home.homeowner_user_id is distinct from v_actor_id then
    raise exception 'Only the primary homeowner can revoke home admin email invites.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Only pending home membership email invites can be revoked.';
  end if;

  update public.home_membership_email_invites
     set status = 'revoked',
         revoked_at = now()
   where id = v_invite.id
  returning * into v_invite;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status,
    metadata
  ) values (
    v_invite.home_id,
    null,
    v_actor_id,
    null,
    'email_invite_revoked',
    v_invite.role,
    v_invite.role,
    'pending',
    'revoked',
    jsonb_build_object(
      'email_invite_id', v_invite.id,
      'target_email', v_invite.invited_email_normalized
    )
  );

  return jsonb_build_object(
    'id', v_invite.id,
    'home_id', v_invite.home_id,
    'role', v_invite.role,
    'status', v_invite.status,
    'revoked_at', v_invite.revoked_at
  );
end;
$$;

alter table public.home_membership_email_invites enable row level security;

drop policy if exists "Home membership email invites: invitee reads own pending"
  on public.home_membership_email_invites;
drop policy if exists "Home membership email invites: invitee reads own rows"
  on public.home_membership_email_invites;
create policy "Home membership email invites: invitee reads own rows"
  on public.home_membership_email_invites for select to authenticated
  using (
    invited_email_normalized = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  );

drop policy if exists "Home membership email invites: managers read home rows"
  on public.home_membership_email_invites;
create policy "Home membership email invites: managers read home rows"
  on public.home_membership_email_invites for select to authenticated
  using (public.current_user_can_manage_home(home_id));

drop policy if exists "Home membership email invites: platform admin reads"
  on public.home_membership_email_invites;
create policy "Home membership email invites: platform admin reads"
  on public.home_membership_email_invites for select to authenticated
  using (public.current_user_is_platform_admin());

revoke all on table public.home_membership_email_invites from public;
revoke all on table public.home_membership_email_invites from anon;
revoke all on table public.home_membership_email_invites from authenticated;
grant select on table public.home_membership_email_invites to authenticated;

revoke execute on function public.servsync_create_home_membership_email_invite(uuid, text, text) from public;
revoke execute on function public.servsync_create_home_membership_email_invite(uuid, text, text) from anon;
grant execute on function public.servsync_create_home_membership_email_invite(uuid, text, text) to authenticated;

revoke execute on function public.servsync_list_my_home_membership_email_invites() from public;
revoke execute on function public.servsync_list_my_home_membership_email_invites() from anon;
grant execute on function public.servsync_list_my_home_membership_email_invites() to authenticated;

revoke execute on function public.servsync_list_home_membership_email_invites(uuid) from public;
revoke execute on function public.servsync_list_home_membership_email_invites(uuid) from anon;
grant execute on function public.servsync_list_home_membership_email_invites(uuid) to authenticated;

revoke execute on function public.servsync_accept_home_membership_email_invite(uuid) from public;
revoke execute on function public.servsync_accept_home_membership_email_invite(uuid) from anon;
grant execute on function public.servsync_accept_home_membership_email_invite(uuid) to authenticated;

revoke execute on function public.servsync_decline_home_membership_email_invite(uuid) from public;
revoke execute on function public.servsync_decline_home_membership_email_invite(uuid) from anon;
grant execute on function public.servsync_decline_home_membership_email_invite(uuid) to authenticated;

revoke execute on function public.servsync_revoke_home_membership_email_invite(uuid) from public;
revoke execute on function public.servsync_revoke_home_membership_email_invite(uuid) from anon;
grant execute on function public.servsync_revoke_home_membership_email_invite(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
