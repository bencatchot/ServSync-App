-- ServSync contractor team access.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Adds contractor team seats/invites so a contractor can add staff users to
-- their account. Billing is not charged here; this only creates the seat
-- tracking foundation that billing can use later.

begin;

create extension if not exists pgcrypto;

alter table public.contractor_profiles
  add column if not exists logo_url text not null default '';

create table if not exists public.contractor_team_members (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  email         text not null default '',
  display_name  text not null default '',
  role          text not null default 'field_tech'
                check (role in ('admin', 'office', 'field_tech', 'viewer')),
  status        text not null default 'active'
                check (status in ('active', 'disabled')),
  invited_by    uuid references public.profiles(id) on delete set null,
  accepted_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (contractor_id, user_id)
);

create table if not exists public.contractor_team_invites (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  email         text not null,
  display_name  text not null default '',
  role          text not null default 'field_tech'
                check (role in ('admin', 'office', 'field_tech', 'viewer')),
  invite_code   text not null unique,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by    uuid not null references public.profiles(id) on delete cascade,
  accepted_by   uuid references public.profiles(id) on delete set null,
  accepted_at   timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists contractor_team_members_contractor_idx
  on public.contractor_team_members(contractor_id, status, role);

create index if not exists contractor_team_members_user_idx
  on public.contractor_team_members(user_id, status);

create index if not exists contractor_team_invites_contractor_idx
  on public.contractor_team_invites(contractor_id, status, created_at desc);

drop trigger if exists contractor_team_members_touch_updated_at on public.contractor_team_members;
create trigger contractor_team_members_touch_updated_at
  before update on public.contractor_team_members
  for each row execute function public.touch_updated_at();

drop trigger if exists contractor_team_invites_touch_updated_at on public.contractor_team_invites;
create trigger contractor_team_invites_touch_updated_at
  before update on public.contractor_team_invites
  for each row execute function public.touch_updated_at();

create or replace function public.current_user_can_access_contractor(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.contractor_profiles cp
     where cp.id = p_contractor_id
       and cp.owner_user_id = auth.uid()
  )
  or exists (
    select 1
      from public.contractor_team_members tm
     where tm.contractor_id = p_contractor_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
  )
  or public.current_user_is_platform_admin();
$$;

create or replace function public.current_user_can_manage_contractor_team(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.contractor_profiles cp
     where cp.id = p_contractor_id
       and cp.owner_user_id = auth.uid()
  )
  or exists (
    select 1
      from public.contractor_team_members tm
     where tm.contractor_id = p_contractor_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
       and tm.role = 'admin'
  )
  or public.current_user_is_platform_admin();
$$;

drop function if exists public.servsync_current_contractor_profile();
create function public.servsync_current_contractor_profile()
returns table (
  id uuid,
  owner_user_id uuid,
  business_name text,
  slug text,
  contact_name text,
  email text,
  phone text,
  website_url text,
  logo_url text,
  city text,
  state text,
  zip_code text,
  service_categories text[],
  service_zip_codes text[],
  license_number text,
  insurance_status text,
  bonded_status text,
  business_summary text,
  public_profile_enabled boolean,
  account_status text,
  subscription_status text,
  monthly_price_cents integer,
  subscription_notes text,
  admin_notes text,
  permanent_invite_code text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with candidates as (
    select cp.*, 0 as priority
      from public.contractor_profiles cp
     where cp.owner_user_id = auth.uid()
    union all
    select cp.*, 1 as priority
      from public.contractor_team_members tm
      join public.contractor_profiles cp on cp.id = tm.contractor_id
     where tm.user_id = auth.uid()
       and tm.status = 'active'
       and cp.account_status = 'active'
  )
  select id, owner_user_id, business_name, slug, contact_name, email, phone,
         website_url, logo_url, city, state, zip_code, service_categories, service_zip_codes,
         license_number, insurance_status, bonded_status, business_summary,
         public_profile_enabled, account_status, subscription_status,
         monthly_price_cents, subscription_notes, admin_notes, permanent_invite_code,
         created_at, updated_at
    from candidates
   order by priority asc, created_at asc
   limit 1;
$$;

create or replace function public.servsync_contractor_team()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with current_contractor as (
    select id
      from public.servsync_current_contractor_profile()
     limit 1
  ),
  seat_counts as (
    select
      1 + count(*) filter (where tm.status = 'active') as active_seat_count
    from current_contractor cc
    left join public.contractor_team_members tm on tm.contractor_id = cc.id
  )
  select jsonb_build_object(
    'contractor_id', (select id from current_contractor),
    'can_manage', coalesce(public.current_user_can_manage_contractor_team((select id from current_contractor)), false),
    'included_seats', 1,
    'active_seat_count', coalesce((select active_seat_count from seat_counts), 0),
    'extra_seat_count', greatest(coalesce((select active_seat_count from seat_counts), 0) - 1, 0),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tm.id,
        'contractor_id', tm.contractor_id,
        'user_id', tm.user_id,
        'email', tm.email,
        'display_name', tm.display_name,
        'role', tm.role,
        'status', tm.status,
        'accepted_at', tm.accepted_at,
        'created_at', tm.created_at,
        'updated_at', tm.updated_at
      ) order by tm.created_at desc)
      from current_contractor cc
      join public.contractor_team_members tm on tm.contractor_id = cc.id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ti.id,
        'contractor_id', ti.contractor_id,
        'email', ti.email,
        'display_name', ti.display_name,
        'role', ti.role,
        'invite_code', ti.invite_code,
        'status', ti.status,
        'expires_at', ti.expires_at,
        'accepted_at', ti.accepted_at,
        'created_at', ti.created_at,
        'updated_at', ti.updated_at
      ) order by ti.created_at desc)
      from current_contractor cc
      join public.contractor_team_invites ti on ti.contractor_id = cc.id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.servsync_create_contractor_team_invite(
  p_email text,
  p_role text default 'field_tech',
  p_display_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_email text;
  v_role text;
  v_code text;
  v_invite public.contractor_team_invites;
begin
  select id into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if v_contractor_id is null or not public.current_user_can_manage_contractor_team(v_contractor_id) then
    raise exception 'You do not have permission to manage this contractor team.';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address.';
  end if;

  v_role := coalesce(nullif(trim(p_role), ''), 'field_tech');
  if v_role not in ('admin', 'office', 'field_tech', 'viewer') then
    raise exception 'Invalid team role.';
  end if;

  if exists (
    select 1 from public.contractor_team_members
     where contractor_id = v_contractor_id
       and lower(email) = v_email
       and status = 'active'
  ) then
    raise exception 'That email is already an active team member.';
  end if;

  update public.contractor_team_invites
     set status = 'revoked'
   where contractor_id = v_contractor_id
     and lower(email) = v_email
     and status = 'pending';

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.contractor_team_invites (
    contractor_id, email, display_name, role, invite_code, invited_by, expires_at
  )
  values (
    v_contractor_id, v_email, trim(coalesce(p_display_name, '')), v_role, v_code, auth.uid(), now() + interval '14 days'
  )
  returning * into v_invite;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'invite_code', v_invite.invite_code,
    'email', v_invite.email,
    'role', v_invite.role,
    'expires_at', v_invite.expires_at
  );
end;
$$;

create or replace function public.servsync_accept_contractor_team_invite(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_invite public.contractor_team_invites;
  v_profile public.profiles;
  v_member public.contractor_team_members;
begin
  v_code := upper(trim(coalesce(p_invite_code, '')));

  select * into v_profile
    from public.profiles
   where id = auth.uid();

  if v_profile.id is null then
    raise exception 'Sign in before accepting a team invite.';
  end if;

  select * into v_invite
    from public.contractor_team_invites
   where invite_code = v_code
     and status = 'pending'
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_invite.id is null then
    raise exception 'Invite not found or expired.';
  end if;

  if lower(v_profile.email) <> lower(v_invite.email) then
    raise exception 'This invite is for a different email address.';
  end if;

  insert into public.contractor_team_members (
    contractor_id, user_id, email, display_name, role, status, invited_by, accepted_at
  )
  values (
    v_invite.contractor_id,
    auth.uid(),
    v_profile.email,
    coalesce(nullif(v_invite.display_name, ''), v_profile.full_name),
    v_invite.role,
    'active',
    v_invite.invited_by,
    now()
  )
  on conflict (contractor_id, user_id) do update
     set email = excluded.email,
         display_name = excluded.display_name,
         role = excluded.role,
         status = 'active',
         accepted_at = now()
  returning * into v_member;

  update public.contractor_team_invites
     set status = 'accepted',
         accepted_by = auth.uid(),
         accepted_at = now()
   where id = v_invite.id;

  return jsonb_build_object(
    'contractor_id', v_member.contractor_id,
    'member_id', v_member.id,
    'status', v_member.status
  );
end;
$$;

create or replace function public.servsync_update_contractor_team_member(
  p_member_id uuid,
  p_role text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.contractor_team_members;
  v_role text;
  v_status text;
begin
  select * into v_member
    from public.contractor_team_members
   where id = p_member_id;

  if v_member.id is null then
    raise exception 'Team member not found.';
  end if;

  if not public.current_user_can_manage_contractor_team(v_member.contractor_id) then
    raise exception 'You do not have permission to manage this team.';
  end if;

  v_role := coalesce(nullif(trim(p_role), ''), v_member.role);
  v_status := coalesce(nullif(trim(p_status), ''), v_member.status);

  if v_role not in ('admin', 'office', 'field_tech', 'viewer') then
    raise exception 'Invalid team role.';
  end if;
  if v_status not in ('active', 'disabled') then
    raise exception 'Invalid team status.';
  end if;

  update public.contractor_team_members
     set role = v_role,
         status = v_status
   where id = v_member.id;

  return jsonb_build_object('member_id', v_member.id, 'role', v_role, 'status', v_status);
end;
$$;

create or replace function public.servsync_revoke_contractor_team_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.contractor_team_invites;
begin
  select * into v_invite
    from public.contractor_team_invites
   where id = p_invite_id;

  if v_invite.id is null then
    raise exception 'Invite not found.';
  end if;

  if not public.current_user_can_manage_contractor_team(v_invite.contractor_id) then
    raise exception 'You do not have permission to manage this team.';
  end if;

  update public.contractor_team_invites
     set status = 'revoked'
   where id = v_invite.id
     and status = 'pending';

  return jsonb_build_object('invite_id', v_invite.id, 'status', 'revoked');
end;
$$;

alter table public.contractor_team_members enable row level security;
alter table public.contractor_team_invites enable row level security;

drop policy if exists "Team members: visible to contractor account" on public.contractor_team_members;
create policy "Team members: visible to contractor account"
  on public.contractor_team_members for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

drop policy if exists "Team invites: visible to contractor account" on public.contractor_team_invites;
create policy "Team invites: visible to contractor account"
  on public.contractor_team_invites for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

drop policy if exists "Team invites: managers create" on public.contractor_team_invites;
create policy "Team invites: managers create"
  on public.contractor_team_invites for insert to authenticated
  with check (public.current_user_can_manage_contractor_team(contractor_id));

drop policy if exists "Team invites: managers update" on public.contractor_team_invites;
create policy "Team invites: managers update"
  on public.contractor_team_invites for update to authenticated
  using (public.current_user_can_manage_contractor_team(contractor_id))
  with check (public.current_user_can_manage_contractor_team(contractor_id));

drop policy if exists "Contractor profiles: public read enabled" on public.contractor_profiles;
create policy "Contractor profiles: public read enabled"
  on public.contractor_profiles for select to authenticated
  using (
    public_profile_enabled = true
    or owner_user_id = auth.uid()
    or public.current_user_can_access_contractor(id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Contractor invites: contractors read own" on public.contractor_invites;
create policy "Contractor invites: contractors read own"
  on public.contractor_invites for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id) or public.current_user_is_platform_admin());

drop policy if exists "Contractor invites: contractors create own" on public.contractor_invites;
create policy "Contractor invites: contractors create own"
  on public.contractor_invites for insert to authenticated
  with check (public.current_user_can_manage_contractor_team(contractor_id) or public.current_user_is_platform_admin());

drop policy if exists "Contractor invites: contractors update own" on public.contractor_invites;
create policy "Contractor invites: contractors update own"
  on public.contractor_invites for update to authenticated
  using (public.current_user_can_manage_contractor_team(contractor_id) or public.current_user_is_platform_admin())
  with check (public.current_user_can_manage_contractor_team(contractor_id) or public.current_user_is_platform_admin());

drop function if exists public.servsync_contractor_connected_homeowners();
create function public.servsync_contractor_connected_homeowners()
returns table (
  connection_id uuid,
  homeowner_user_id uuid,
  display_name text,
  phone text,
  city text,
  state text,
  zip_code text,
  status text,
  permissions jsonb,
  home jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  source text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.homeowner_user_id,
    case when coalesce(p.share_contact, false) then hp.display_name else 'Homeowner' end as display_name,
    case when coalesce(p.share_contact, false) then hp.phone else '' end as phone,
    case when coalesce(p.share_contact, false) then hp.city else '' end as city,
    case when coalesce(p.share_contact, false) then hp.state else '' end as state,
    case when coalesce(p.share_contact, false) then hp.zip_code else '' end as zip_code,
    c.status,
    jsonb_build_object(
      'share_contact', coalesce(p.share_contact, false),
      'share_home_overview', coalesce(p.share_home_overview, false),
      'share_address', coalesce(p.share_address, false),
      'share_preferred_vendors', coalesce(p.share_preferred_vendors, false),
      'share_photos', coalesce(p.share_photos, false)
    ) as permissions,
    case
      when coalesce(p.share_home_overview, false) then jsonb_build_object(
        'nickname', h.nickname,
        'address_line1', case when coalesce(p.share_address, false) then h.address_line1 else '' end,
        'address_line2', case when coalesce(p.share_address, false) then h.address_line2 else '' end,
        'city', h.city,
        'state', h.state,
        'zip_code', h.zip_code,
        'home_type', h.home_type,
        'year_built', h.year_built,
        'square_feet', h.square_feet,
        'notes', h.notes
      )
      else null
    end as home,
    c.created_at,
    c.updated_at,
    c.source
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = c.homeowner_user_id
  left join public.connection_permissions p on p.connection_id = c.id
  left join lateral (
    select *
      from public.homes h
     where h.homeowner_user_id = c.homeowner_user_id
     order by h.created_at asc
     limit 1
  ) h on true
  where public.current_user_can_access_contractor(cp.id)
    and c.status = 'active'
  order by c.created_at desc;
$$;

grant select, insert, update, delete on public.contractor_team_members to authenticated;
grant select, insert, update, delete on public.contractor_team_invites to authenticated;
grant execute on function public.current_user_can_access_contractor(uuid) to authenticated;
grant execute on function public.current_user_can_manage_contractor_team(uuid) to authenticated;
grant execute on function public.servsync_current_contractor_profile() to authenticated;
grant execute on function public.servsync_contractor_team() to authenticated;
grant execute on function public.servsync_create_contractor_team_invite(text, text, text) to authenticated;
grant execute on function public.servsync_accept_contractor_team_invite(text) to authenticated;
grant execute on function public.servsync_update_contractor_team_member(uuid, text, text) to authenticated;
grant execute on function public.servsync_revoke_contractor_team_invite(uuid) to authenticated;
grant execute on function public.servsync_contractor_connected_homeowners() to authenticated;

notify pgrst, 'reload schema';

commit;
