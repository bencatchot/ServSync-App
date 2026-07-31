-- ServSync local customer multi-property claim foundation.
-- Run after:
--   - servsync-local-customer-claim-invites.sql
--   - servsync-local-customer-claim-token-fix.sql
--   - servsync-local-customer-claim-invite-token-containment.sql
--
-- This additive slice lets one claim invitation contain an explicit, stable set
-- of contractor-selected local properties. It preserves token-free ordinary
-- reads and keeps guarded prepare delivery as the only raw-token release path.

begin;

create table if not exists public.contractor_local_customer_claim_invite_homes (
  id uuid primary key default gen_random_uuid(),
  claim_invite_id uuid not null references public.contractor_local_customer_claim_invites(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  claimed_home_id uuid references public.homes(id) on delete set null,
  snapshot_nickname text not null default '',
  snapshot_address_line1 text not null default '',
  snapshot_address_line2 text not null default '',
  snapshot_city text not null default '',
  snapshot_state text not null default '',
  snapshot_zip_code text not null default '',
  snapshot_home_type text not null default '',
  snapshot_year_built text not null default '',
  snapshot_square_feet text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claim_invite_id, local_home_id),
  unique (claim_invite_id, sort_order)
);

create index if not exists local_claim_invite_homes_invite_idx
  on public.contractor_local_customer_claim_invite_homes(claim_invite_id, sort_order);

create index if not exists local_claim_invite_homes_local_home_idx
  on public.contractor_local_customer_claim_invite_homes(local_home_id);

create index if not exists local_claim_invite_homes_contractor_contact_idx
  on public.contractor_local_customer_claim_invite_homes(contractor_id, local_contact_id);

create index if not exists local_claim_invite_homes_claimed_home_idx
  on public.contractor_local_customer_claim_invite_homes(claimed_home_id)
  where claimed_home_id is not null;

drop trigger if exists contractor_local_customer_claim_invite_homes_touch_updated_at
  on public.contractor_local_customer_claim_invite_homes;
create trigger contractor_local_customer_claim_invite_homes_touch_updated_at
  before update on public.contractor_local_customer_claim_invite_homes
  for each row execute function public.touch_updated_at();

alter table public.contractor_local_customer_claim_invite_homes enable row level security;

drop policy if exists "Local claim invite homes: contractor reads own" on public.contractor_local_customer_claim_invite_homes;
create policy "Local claim invite homes: contractor reads own"
  on public.contractor_local_customer_claim_invite_homes for select to authenticated
  using (
    public.current_user_can_manage_contractor_team(contractor_id)
    or exists (
      select 1
        from public.contractor_team_members tm
       where tm.contractor_id = contractor_local_customer_claim_invite_homes.contractor_id
         and tm.user_id = auth.uid()
         and tm.status = 'active'
         and tm.role = 'office'
    )
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Local claim invite homes: contractor creates own" on public.contractor_local_customer_claim_invite_homes;
create policy "Local claim invite homes: contractor creates own"
  on public.contractor_local_customer_claim_invite_homes for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_team(contractor_id)
    or exists (
      select 1
        from public.contractor_team_members tm
       where tm.contractor_id = contractor_local_customer_claim_invite_homes.contractor_id
         and tm.user_id = auth.uid()
         and tm.status = 'active'
         and tm.role = 'office'
    )
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Local claim invite homes: contractor updates own" on public.contractor_local_customer_claim_invite_homes;
create policy "Local claim invite homes: contractor updates own"
  on public.contractor_local_customer_claim_invite_homes for update to authenticated
  using (
    public.current_user_can_manage_contractor_team(contractor_id)
    or exists (
      select 1
        from public.contractor_team_members tm
       where tm.contractor_id = contractor_local_customer_claim_invite_homes.contractor_id
         and tm.user_id = auth.uid()
         and tm.status = 'active'
         and tm.role = 'office'
    )
    or public.current_user_is_platform_admin()
  )
  with check (
    public.current_user_can_manage_contractor_team(contractor_id)
    or exists (
      select 1
        from public.contractor_team_members tm
       where tm.contractor_id = contractor_local_customer_claim_invite_homes.contractor_id
         and tm.user_id = auth.uid()
         and tm.status = 'active'
         and tm.role = 'office'
    )
    or public.current_user_is_platform_admin()
  );

revoke all on public.contractor_local_customer_claim_invite_homes from public;
revoke all on public.contractor_local_customer_claim_invite_homes from anon;
revoke all on public.contractor_local_customer_claim_invite_homes from authenticated;

insert into public.contractor_local_customer_claim_invite_homes (
  claim_invite_id,
  contractor_id,
  local_contact_id,
  local_home_id,
  claimed_home_id,
  snapshot_nickname,
  snapshot_address_line1,
  snapshot_address_line2,
  snapshot_city,
  snapshot_state,
  snapshot_zip_code,
  snapshot_home_type,
  snapshot_year_built,
  snapshot_square_feet,
  sort_order
)
select
  invite.id,
  invite.contractor_id,
  invite.local_contact_id,
  home.id,
  invite.claimed_home_id,
  coalesce(home.nickname, ''),
  coalesce(home.address_line1, ''),
  coalesce(home.address_line2, ''),
  coalesce(home.city, ''),
  coalesce(home.state, ''),
  coalesce(home.zip_code, ''),
  coalesce(home.home_type, ''),
  coalesce(home.year_built, ''),
  coalesce(home.square_feet, ''),
  0
from public.contractor_local_customer_claim_invites invite
join public.contractor_local_homes home
  on home.id = invite.local_home_id
 and home.contractor_id = invite.contractor_id
 and home.local_contact_id = invite.local_contact_id
where invite.local_home_id is not null
on conflict (claim_invite_id, local_home_id) do nothing;

create or replace function public.servsync_list_local_customer_claim_invites_v2(p_contractor_id uuid)
returns table (
  id uuid,
  contractor_id uuid,
  local_contact_id uuid,
  local_home_id uuid,
  local_home_ids uuid[],
  property_count integer,
  properties jsonb,
  invited_email text,
  invited_phone text,
  status text,
  created_by uuid,
  claimed_by_homeowner_user_id uuid,
  claimed_home_id uuid,
  connection_id uuid,
  expires_at timestamptz,
  used_at timestamptz,
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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_contractor_id is null
     or not public.servsync_private_can_prepare_local_customer_claim_invites(p_contractor_id) then
    return;
  end if;

  return query
  select
    invite.id,
    invite.contractor_id,
    invite.local_contact_id,
    invite.local_home_id,
    coalesce(home_meta.local_home_ids, array[]::uuid[]) as local_home_ids,
    coalesce(home_meta.property_count, 0)::integer as property_count,
    coalesce(home_meta.properties, '[]'::jsonb) as properties,
    invite.invited_email,
    invite.invited_phone,
    invite.status,
    invite.created_by,
    invite.claimed_by_homeowner_user_id,
    invite.claimed_home_id,
    invite.connection_id,
    invite.expires_at,
    invite.used_at,
    invite.declined_at,
    invite.revoked_at,
    invite.created_at,
    invite.updated_at
  from public.contractor_local_customer_claim_invites invite
  left join lateral (
    select
      array_agg(member.local_home_id order by member.sort_order, member.local_home_id) as local_home_ids,
      count(*)::integer as property_count,
      jsonb_agg(
        jsonb_build_object(
          'local_home_id', member.local_home_id,
          'claimed_home_id', member.claimed_home_id,
          'nickname', member.snapshot_nickname,
          'address_line1', member.snapshot_address_line1,
          'address_line2', member.snapshot_address_line2,
          'city', member.snapshot_city,
          'state', member.snapshot_state,
          'zip_code', member.snapshot_zip_code,
          'home_type', member.snapshot_home_type,
          'year_built', member.snapshot_year_built,
          'square_feet', member.snapshot_square_feet,
          'sort_order', member.sort_order
        )
        order by member.sort_order, member.local_home_id
      ) as properties
    from public.contractor_local_customer_claim_invite_homes member
    where member.claim_invite_id = invite.id
  ) home_meta on true
  where invite.contractor_id = p_contractor_id
  order by invite.created_at desc;
end;
$$;

revoke execute on function public.servsync_list_local_customer_claim_invites_v2(uuid) from public;
revoke execute on function public.servsync_list_local_customer_claim_invites_v2(uuid) from anon;
grant execute on function public.servsync_list_local_customer_claim_invites_v2(uuid) to authenticated;

create or replace function public.servsync_create_local_customer_claim_invite_v2(
  p_local_contact_id uuid,
  p_local_home_ids uuid[],
  p_expires_days int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contractor_local_contacts;
  v_invite public.contractor_local_customer_claim_invites;
  v_existing_invite public.contractor_local_customer_claim_invites;
  v_home_ids uuid[];
  v_existing_home_ids uuid[];
  v_expires_days int;
  v_home_count int;
  v_input_count int;
  v_pending_overlap_count int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = p_local_contact_id
   for update;

  if v_contact.id is null then
    raise exception 'Local customer not found.';
  end if;

  if not public.servsync_private_can_prepare_local_customer_claim_invites(v_contact.contractor_id) then
    raise exception 'You do not have permission to invite this customer.';
  end if;

  if v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null then
    raise exception 'This customer is linked to a homeowner profile and cannot receive a new claim invite.';
  end if;

  select count(*)::int
    into v_input_count
    from unnest(coalesce(p_local_home_ids, array[]::uuid[])) raw_home_id
   where raw_home_id is not null;

  select coalesce(array_agg(distinct raw_home_id order by raw_home_id), array[]::uuid[])
    into v_home_ids
    from unnest(coalesce(p_local_home_ids, array[]::uuid[])) raw_home_id
   where raw_home_id is not null;

  if coalesce(array_length(v_home_ids, 1), 0) = 0 then
    raise exception 'Choose at least one property for this claim invite.';
  end if;

  if v_input_count <> array_length(v_home_ids, 1) then
    raise exception 'A property can only be included once in a claim invite.';
  end if;

  perform 1
    from public.contractor_local_homes home
   where home.id = any(v_home_ids)
     and home.contractor_id = v_contact.contractor_id
     and home.local_contact_id = v_contact.id
     and home.home_id is null
     and home.claimed_at is null
   order by home.id
   for update;

  select count(*)::int
    into v_home_count
    from public.contractor_local_homes home
   where home.id = any(v_home_ids)
     and home.contractor_id = v_contact.contractor_id
     and home.local_contact_id = v_contact.id
     and home.home_id is null
     and home.claimed_at is null;

  if v_home_count <> array_length(v_home_ids, 1) then
    raise exception 'Every selected property must belong to this unclaimed local customer.';
  end if;

  v_expires_days := greatest(1, least(coalesce(p_expires_days, 14), 90));

  update public.contractor_local_customer_claim_invites invite
     set status = 'expired',
         updated_at = now()
   where invite.contractor_id = v_contact.contractor_id
     and invite.local_contact_id = v_contact.id
     and invite.status = 'pending'
     and invite.expires_at <= now();

  select count(*)::int
    into v_pending_overlap_count
    from public.contractor_local_customer_claim_invites invite
    join public.contractor_local_customer_claim_invite_homes member
      on member.claim_invite_id = invite.id
   where invite.contractor_id = v_contact.contractor_id
     and invite.local_contact_id = v_contact.id
     and invite.status = 'pending'
     and invite.expires_at > now()
     and member.local_home_id = any(v_home_ids);

  select *
    into v_existing_invite
    from public.contractor_local_customer_claim_invites invite
   where invite.contractor_id = v_contact.contractor_id
     and invite.local_contact_id = v_contact.id
     and invite.status = 'pending'
     and invite.expires_at > now()
   order by invite.created_at desc
   limit 1
   for update;

  if v_existing_invite.id is not null then
    select coalesce(array_agg(member.local_home_id order by member.local_home_id), array[]::uuid[])
      into v_existing_home_ids
      from public.contractor_local_customer_claim_invite_homes member
     where member.claim_invite_id = v_existing_invite.id;

    if v_existing_home_ids = v_home_ids then
      if v_existing_invite.invited_email is distinct from nullif(trim(v_contact.email), '')
         or v_existing_invite.invited_phone is distinct from nullif(trim(v_contact.phone), '') then
        raise exception 'The pending claim invite is stale. Revoke it before creating a new one.';
      end if;

      return jsonb_build_object(
        'id', v_existing_invite.id,
        'status', v_existing_invite.status,
        'expires_at', v_existing_invite.expires_at,
        'local_contact_id', v_existing_invite.local_contact_id,
        'local_home_id', v_existing_invite.local_home_id,
        'local_home_ids', v_existing_home_ids,
        'property_count', array_length(v_existing_home_ids, 1),
        'reused_existing', true
      );
    end if;

    raise exception 'This customer already has a different pending claim invite. Revoke it before creating a new one.';
  end if;

  if v_pending_overlap_count > 0 then
    raise exception 'One of these properties already has a pending claim invite.';
  end if;

  insert into public.contractor_local_customer_claim_invites (
    contractor_id,
    local_contact_id,
    local_home_id,
    invite_token,
    invited_email,
    invited_phone,
    status,
    created_by,
    expires_at
  ) values (
    v_contact.contractor_id,
    v_contact.id,
    case when array_length(v_home_ids, 1) = 1 then v_home_ids[1] else null end,
    public.servsync_generate_local_customer_claim_token(),
    nullif(trim(v_contact.email), ''),
    nullif(trim(v_contact.phone), ''),
    'pending',
    auth.uid(),
    now() + make_interval(days => v_expires_days)
  )
  returning * into v_invite;

  insert into public.contractor_local_customer_claim_invite_homes (
    claim_invite_id,
    contractor_id,
    local_contact_id,
    local_home_id,
    snapshot_nickname,
    snapshot_address_line1,
    snapshot_address_line2,
    snapshot_city,
    snapshot_state,
    snapshot_zip_code,
    snapshot_home_type,
    snapshot_year_built,
    snapshot_square_feet,
    sort_order
  )
  select
    v_invite.id,
    home.contractor_id,
    home.local_contact_id,
    home.id,
    coalesce(home.nickname, ''),
    coalesce(home.address_line1, ''),
    coalesce(home.address_line2, ''),
    coalesce(home.city, ''),
    coalesce(home.state, ''),
    coalesce(home.zip_code, ''),
    coalesce(home.home_type, ''),
    coalesce(home.year_built, ''),
    coalesce(home.square_feet, ''),
    row_number() over (order by home.id)::int - 1
  from public.contractor_local_homes home
  where home.id = any(v_home_ids)
  order by home.id;

  return jsonb_build_object(
    'id', v_invite.id,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'local_contact_id', v_invite.local_contact_id,
    'local_home_id', v_invite.local_home_id,
    'local_home_ids', v_home_ids,
    'property_count', array_length(v_home_ids, 1),
    'reused_existing', false
  );
end;
$$;

revoke execute on function public.servsync_create_local_customer_claim_invite_v2(uuid, uuid[], int) from public;
revoke execute on function public.servsync_create_local_customer_claim_invite_v2(uuid, uuid[], int) from anon;
grant execute on function public.servsync_create_local_customer_claim_invite_v2(uuid, uuid[], int) to authenticated;

create or replace function public.servsync_create_local_customer_claim_invite(
  p_local_contact_id uuid,
  p_local_home_id uuid default null,
  p_expires_days int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_local_home_id is null then
    raise exception 'Choose at least one property for this claim invite.';
  end if;

  return public.servsync_create_local_customer_claim_invite_v2(
    p_local_contact_id,
    array[p_local_home_id],
    p_expires_days
  );
end;
$$;

revoke execute on function public.servsync_create_local_customer_claim_invite(uuid, uuid, int) from public;
revoke execute on function public.servsync_create_local_customer_claim_invite(uuid, uuid, int) from anon;
grant execute on function public.servsync_create_local_customer_claim_invite(uuid, uuid, int) to authenticated;

create or replace function public.servsync_lookup_local_customer_claim(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.contractor_local_customer_claim_invites;
  v_contact public.contractor_local_contacts;
  v_contractor public.contractor_profiles;
  v_homes jsonb := '[]'::jsonb;
  v_home_count int := 0;
begin
  select *
    into v_invite
    from public.contractor_local_customer_claim_invites invite
   where invite.invite_token = lower(trim(coalesce(p_token, '')))
   limit 1;

  if v_invite.id is null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'Claim link not found or no longer active.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = v_invite.local_contact_id
     and contractor_id = v_invite.contractor_id
   limit 1;

  if v_contact.id is null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  if v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  select count(*)::int,
         coalesce(jsonb_agg(
           jsonb_build_object(
             'local_home_id', member.local_home_id,
             'nickname', member.snapshot_nickname,
             'address_line1', member.snapshot_address_line1,
             'address_line2', member.snapshot_address_line2,
             'city', member.snapshot_city,
             'state', member.snapshot_state,
             'zip_code', member.snapshot_zip_code,
             'home_type', member.snapshot_home_type,
             'year_built', member.snapshot_year_built,
             'square_feet', member.snapshot_square_feet,
             'sort_order', member.sort_order
           )
           order by member.sort_order, member.local_home_id
         ), '[]'::jsonb)
    into v_home_count, v_homes
    from public.contractor_local_customer_claim_invite_homes member
    join public.contractor_local_homes home
      on home.id = member.local_home_id
     and home.contractor_id = member.contractor_id
     and home.local_contact_id = member.local_contact_id
   where member.claim_invite_id = v_invite.id
     and home.home_id is null
     and home.claimed_at is null;

  if v_home_count = 0 and v_invite.local_home_id is not null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  if exists (
    select 1
      from public.contractor_local_customer_claim_invite_homes member
      left join public.contractor_local_homes home
        on home.id = member.local_home_id
       and home.contractor_id = member.contractor_id
       and home.local_contact_id = member.local_contact_id
     where member.claim_invite_id = v_invite.id
       and (home.id is null or home.home_id is not null or home.claimed_at is not null)
  ) then
    raise exception 'Claim link not found or no longer active.';
  end if;

  select *
    into v_contractor
    from public.contractor_profiles
   where id = v_invite.contractor_id
     and account_status = 'active'
   limit 1;

  if v_contractor.id is null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'property_count', v_home_count,
    'contractor', jsonb_build_object(
      'id', v_contractor.id,
      'business_name', v_contractor.business_name,
      'city', v_contractor.city,
      'state', v_contractor.state
    ),
    'contact', jsonb_build_object(
      'display_name', v_contact.display_name,
      'email', v_contact.email,
      'phone', v_contact.phone
    ),
    'homes', v_homes,
    'home', case
      when v_home_count = 1 then v_homes->0
      else null
    end
  );
end;
$$;

grant execute on function public.servsync_lookup_local_customer_claim(text) to anon, authenticated;

create or replace function public.servsync_prepare_local_customer_claim_invite_delivery(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.contractor_local_customer_claim_invites;
  v_contact public.contractor_local_contacts;
  v_invite_contractor_id uuid;
  v_invite_local_contact_id uuid;
  v_home_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select invite.contractor_id,
         invite.local_contact_id
    into v_invite_contractor_id,
         v_invite_local_contact_id
    from public.contractor_local_customer_claim_invites invite
   where id = p_invite_id
   limit 1;

  if v_invite_contractor_id is null then
    raise exception 'Claim invite not found or no longer available.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = v_invite_local_contact_id
     and contractor_id = v_invite_contractor_id
   for update;

  if v_contact.id is null
     or v_contact.homeowner_user_id is not null
     or v_contact.claimed_at is not null then
    raise exception 'Claim invite not found or no longer available.';
  end if;

  perform 1
    from public.contractor_local_customer_claim_invite_homes member
    join public.contractor_local_homes home
      on home.id = member.local_home_id
     and home.contractor_id = member.contractor_id
     and home.local_contact_id = member.local_contact_id
   where member.claim_invite_id = p_invite_id
   order by member.sort_order, member.local_home_id
   for update of member, home;

  select count(*)::int
    into v_home_count
    from public.contractor_local_customer_claim_invite_homes member
   where member.claim_invite_id = p_invite_id;

  if v_home_count = 0 then
    raise exception 'Claim invite not found or no longer available.';
  end if;

  if exists (
    select 1
      from public.contractor_local_customer_claim_invite_homes member
      left join public.contractor_local_homes home
        on home.id = member.local_home_id
       and home.contractor_id = member.contractor_id
       and home.local_contact_id = member.local_contact_id
     where member.claim_invite_id = p_invite_id
       and (home.id is null or home.home_id is not null or home.claimed_at is not null)
  ) then
    raise exception 'Claim invite not found or no longer available.';
  end if;

  select *
    into v_invite
    from public.contractor_local_customer_claim_invites
   where id = p_invite_id
   for update;

  if v_invite.id is null
     or v_invite.contractor_id is distinct from v_invite_contractor_id
     or v_invite.local_contact_id is distinct from v_invite_local_contact_id then
    raise exception 'Claim invite not found or no longer available.';
  end if;

  if not public.servsync_private_can_prepare_local_customer_claim_invites(v_invite.contractor_id) then
    raise exception 'You do not have permission to prepare this claim invite.';
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'Claim invite not found or no longer available.';
  end if;

  if v_invite.invited_email is distinct from nullif(trim(v_contact.email), '')
     or v_invite.invited_phone is distinct from nullif(trim(v_contact.phone), '') then
    raise exception 'Claim invite not found or no longer available.';
  end if;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'local_contact_id', v_invite.local_contact_id,
    'local_home_id', v_invite.local_home_id,
    'property_count', v_home_count,
    'invite_token', v_invite.invite_token
  );
end;
$$;

revoke execute on function public.servsync_prepare_local_customer_claim_invite_delivery(uuid) from public;
revoke execute on function public.servsync_prepare_local_customer_claim_invite_delivery(uuid) from anon;
grant execute on function public.servsync_prepare_local_customer_claim_invite_delivery(uuid) to authenticated;

create or replace function public.servsync_accept_local_customer_claim_v2(
  p_token text,
  p_profile_updates jsonb default '{}'::jsonb,
  p_home_mappings jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.contractor_local_customer_claim_invites;
  v_contact public.contractor_local_contacts;
  v_profile public.profiles;
  v_connection_id uuid;
  v_invite_id uuid;
  v_invite_contractor_id uuid;
  v_invite_local_contact_id uuid;
  v_profile_updates jsonb;
  v_home_mappings jsonb;
  v_member record;
  v_mapping jsonb;
  v_mode text;
  v_home_updates jsonb;
  v_home public.homes;
  v_claimed_home_id uuid;
  v_claimed_home_ids uuid[] := array[]::uuid[];
  v_local_home_ids uuid[] := array[]::uuid[];
  v_expected_count int := 0;
  v_processed_count int := 0;
  v_share_address boolean := false;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_profile
    from public.profiles
   where id = auth.uid()
   limit 1;

  if v_profile.id is null or v_profile.role <> 'homeowner' then
    raise exception 'Only homeowner accounts can claim a local customer profile.';
  end if;

  select invite.id,
         invite.contractor_id,
         invite.local_contact_id
    into v_invite_id,
         v_invite_contractor_id,
         v_invite_local_contact_id
    from public.contractor_local_customer_claim_invites invite
   where invite.invite_token = lower(trim(coalesce(p_token, '')))
   limit 1;

  if v_invite_id is null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = v_invite_local_contact_id
     and contractor_id = v_invite_contractor_id
   for update;

  if v_contact.id is null then
    raise exception 'Local customer not found.';
  end if;

  if v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null then
    raise exception 'This local customer profile has already been claimed.';
  end if;

  select count(*)::int
    into v_expected_count
    from public.contractor_local_customer_claim_invite_homes member
   where member.claim_invite_id = v_invite_id;

  if v_expected_count = 0 then
    raise exception 'This claim invite does not include a property set.';
  end if;

  perform 1
    from public.contractor_local_customer_claim_invite_homes member
    join public.contractor_local_homes home
      on home.id = member.local_home_id
     and home.contractor_id = member.contractor_id
     and home.local_contact_id = member.local_contact_id
   where member.claim_invite_id = v_invite_id
   order by member.sort_order, member.local_home_id
   for update of member, home;

  select *
    into v_invite
    from public.contractor_local_customer_claim_invites
   where id = v_invite_id
   for update;

  if v_invite.id is null
     or v_invite.contractor_id is distinct from v_invite_contractor_id
     or v_invite.local_contact_id is distinct from v_invite_local_contact_id
     or v_invite.invite_token is distinct from lower(trim(coalesce(p_token, ''))) then
    raise exception 'Claim link not found or no longer active.';
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'Claim link not found or no longer active.';
  end if;

  if jsonb_typeof(coalesce(p_home_mappings, '[]'::jsonb)) <> 'array' then
    raise exception 'Property claim mappings are required.';
  end if;

  if jsonb_array_length(coalesce(p_home_mappings, '[]'::jsonb)) <> v_expected_count then
    raise exception 'Choose exactly one destination for every invited property.';
  end if;

  v_profile_updates := coalesce(p_profile_updates, '{}'::jsonb);
  v_home_mappings := coalesce(p_home_mappings, '[]'::jsonb);

  insert into public.homeowner_profiles (
    user_id,
    display_name,
    phone,
    city,
    state,
    zip_code
  ) values (
    auth.uid(),
    coalesce(nullif(trim(v_profile_updates->>'display_name'), ''), nullif(trim(v_contact.display_name), ''), ''),
    coalesce(nullif(trim(v_profile_updates->>'phone'), ''), nullif(trim(v_contact.phone), ''), ''),
    coalesce(nullif(trim(v_profile_updates->>'city'), ''), ''),
    coalesce(nullif(trim(v_profile_updates->>'state'), ''), ''),
    coalesce(nullif(trim(v_profile_updates->>'zip_code'), ''), '')
  )
  on conflict (user_id) do update
     set display_name = case
           when v_profile_updates ? 'display_name'
           then coalesce(nullif(trim(v_profile_updates->>'display_name'), ''), public.homeowner_profiles.display_name)
           else public.homeowner_profiles.display_name
         end,
         phone = case
           when v_profile_updates ? 'phone'
           then coalesce(nullif(trim(v_profile_updates->>'phone'), ''), public.homeowner_profiles.phone)
           else public.homeowner_profiles.phone
         end,
         city = case
           when v_profile_updates ? 'city'
           then coalesce(nullif(trim(v_profile_updates->>'city'), ''), public.homeowner_profiles.city)
           else public.homeowner_profiles.city
         end,
         state = case
           when v_profile_updates ? 'state'
           then coalesce(nullif(trim(v_profile_updates->>'state'), ''), public.homeowner_profiles.state)
           else public.homeowner_profiles.state
         end,
         zip_code = case
           when v_profile_updates ? 'zip_code'
           then coalesce(nullif(trim(v_profile_updates->>'zip_code'), ''), public.homeowner_profiles.zip_code)
           else public.homeowner_profiles.zip_code
         end;

  insert into public.homeowner_contractor_connections (
    homeowner_user_id,
    contractor_id,
    invite_id,
    status,
    source
  ) values (
    auth.uid(),
    v_invite.contractor_id,
    null,
    'active',
    'local_customer_claim'
  )
  on conflict (homeowner_user_id, contractor_id) do update
     set status = 'active',
         source = case
           when homeowner_contractor_connections.source = 'contractor_invite'
           then homeowner_contractor_connections.source
           else 'local_customer_claim'
         end,
         updated_at = now()
  returning id into v_connection_id;

  for v_member in
    select member.*,
           home.nickname,
           home.address_line1,
           home.address_line2,
           home.city,
           home.state,
           home.zip_code,
           home.home_type,
           home.year_built,
           home.square_feet,
           home.home_id,
           home.claimed_at
      from public.contractor_local_customer_claim_invite_homes member
      join public.contractor_local_homes home
        on home.id = member.local_home_id
       and home.contractor_id = member.contractor_id
       and home.local_contact_id = member.local_contact_id
     where member.claim_invite_id = v_invite.id
     order by member.sort_order, member.local_home_id
  loop
    if v_member.home_id is not null or v_member.claimed_at is not null then
      raise exception 'One of the invited properties has already been claimed.';
    end if;

    select mapping.value
      into v_mapping
      from jsonb_array_elements(v_home_mappings) as mapping(value)
     where mapping.value->>'local_home_id' = v_member.local_home_id::text
     limit 1;

    if v_mapping is null then
      raise exception 'Choose a destination for every invited property.';
    end if;

    v_mode := coalesce(nullif(trim(v_mapping->>'mode'), ''), case when nullif(trim(v_mapping->>'home_id'), '') is null then 'create' else 'existing' end);
    v_home_updates := coalesce(v_mapping->'home_updates', '{}'::jsonb);

    if v_mode = 'existing' then
      if nullif(trim(v_mapping->>'home_id'), '') is null then
        raise exception 'Choose an existing home for every matched property.';
      end if;

      select *
        into v_home
        from public.homes
       where id = (v_mapping->>'home_id')::uuid
         and homeowner_user_id = auth.uid()
       for update;

      if v_home.id is null then
        raise exception 'Selected home was not found for this homeowner.';
      end if;

      v_claimed_home_id := v_home.id;
    elsif v_mode = 'create' then
      insert into public.homes (
        homeowner_user_id,
        nickname,
        address_line1,
        address_line2,
        city,
        state,
        zip_code,
        home_type,
        year_built,
        square_feet,
        notes
      ) values (
        auth.uid(),
        coalesce(nullif(trim(v_home_updates->>'nickname'), ''), nullif(trim(v_member.snapshot_nickname), ''), nullif(trim(v_member.nickname), ''), 'My Home'),
        coalesce(nullif(trim(v_home_updates->>'address_line1'), ''), nullif(trim(v_member.snapshot_address_line1), ''), nullif(trim(v_member.address_line1), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'address_line2'), ''), nullif(trim(v_member.snapshot_address_line2), ''), nullif(trim(v_member.address_line2), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'city'), ''), nullif(trim(v_member.snapshot_city), ''), nullif(trim(v_member.city), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'state'), ''), nullif(trim(v_member.snapshot_state), ''), nullif(trim(v_member.state), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'zip_code'), ''), nullif(trim(v_member.snapshot_zip_code), ''), nullif(trim(v_member.zip_code), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'home_type'), ''), nullif(trim(v_member.snapshot_home_type), ''), nullif(trim(v_member.home_type), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'year_built'), ''), nullif(trim(v_member.snapshot_year_built), ''), nullif(trim(v_member.year_built), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'square_feet'), ''), nullif(trim(v_member.snapshot_square_feet), ''), nullif(trim(v_member.square_feet), ''), ''),
        ''
      )
      returning id into v_claimed_home_id;
    else
      raise exception 'Choose whether to create a new home or match an existing home.';
    end if;

    if v_claimed_home_id = any(v_claimed_home_ids) then
      raise exception 'Each invited property must map to a different homeowner property.';
    end if;

    v_claimed_home_ids := array_append(v_claimed_home_ids, v_claimed_home_id);
    v_local_home_ids := array_append(v_local_home_ids, v_member.local_home_id);
    v_processed_count := v_processed_count + 1;

    update public.contractor_local_homes
       set home_id = v_claimed_home_id,
           claimed_at = coalesce(claimed_at, now())
     where id = v_member.local_home_id;

    update public.contractor_local_customer_claim_invite_homes
       set claimed_home_id = v_claimed_home_id
     where id = v_member.id;

    if nullif(trim(coalesce(v_home_updates->>'address_line1', v_member.snapshot_address_line1, v_member.address_line1)), '') is not null
       or nullif(trim(coalesce(v_home_updates->>'city', v_member.snapshot_city, v_member.city)), '') is not null
       or nullif(trim(coalesce(v_home_updates->>'zip_code', v_member.snapshot_zip_code, v_member.zip_code)), '') is not null then
      v_share_address := true;
    end if;
  end loop;

  if v_processed_count <> v_expected_count then
    raise exception 'Choose exactly one destination for every invited property.';
  end if;

  insert into public.connection_permissions (
    connection_id,
    share_contact,
    share_home_overview,
    share_address,
    share_preferred_vendors,
    share_photos
  ) values (
    v_connection_id,
    true,
    true,
    v_share_address,
    false,
    false
  )
  on conflict (connection_id) do update
     set share_contact = true,
         share_home_overview = true,
         share_address = excluded.share_address,
         share_preferred_vendors = false,
         share_photos = false,
         updated_at = now();

  update public.contractor_local_contacts
     set homeowner_user_id = auth.uid(),
         claimed_at = coalesce(claimed_at, now())
   where id = v_contact.id;

  update public.contractor_local_customer_claim_invites
     set status = 'claimed',
         claimed_by_homeowner_user_id = auth.uid(),
         claimed_home_id = case when array_length(v_claimed_home_ids, 1) = 1 then v_claimed_home_ids[1] else null end,
         connection_id = v_connection_id,
         used_at = now()
   where id = v_invite.id;

  insert into public.connection_audit_events (
    connection_id,
    actor_user_id,
    event_type,
    event_details
  ) values (
    v_connection_id,
    auth.uid(),
    'local_customer_claim_accepted',
    jsonb_build_object(
      'claim_invite_id', v_invite.id,
      'local_contact_id', v_contact.id,
      'local_home_ids', to_jsonb(v_local_home_ids),
      'claimed_home_ids', to_jsonb(v_claimed_home_ids)
    )
  );

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'status', 'claimed',
    'connection_id', v_connection_id,
    'home_ids', to_jsonb(v_claimed_home_ids),
    'local_contact_id', v_contact.id,
    'local_home_ids', to_jsonb(v_local_home_ids)
  );
end;
$$;

revoke execute on function public.servsync_accept_local_customer_claim_v2(text, jsonb, jsonb) from public;
revoke execute on function public.servsync_accept_local_customer_claim_v2(text, jsonb, jsonb) from anon;
grant execute on function public.servsync_accept_local_customer_claim_v2(text, jsonb, jsonb) to authenticated;

create or replace function public.servsync_accept_local_customer_claim(
  p_token text,
  p_home_id uuid default null,
  p_profile_updates jsonb default '{}'::jsonb,
  p_home_updates jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_property_count int := 0;
  v_local_home_id uuid;
begin
  select invite.id
    into v_invite_id
    from public.contractor_local_customer_claim_invites invite
   where invite.invite_token = lower(trim(coalesce(p_token, '')))
   limit 1;

  if v_invite_id is null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  select count(*)::int
    into v_property_count
    from public.contractor_local_customer_claim_invite_homes member
   where member.claim_invite_id = v_invite_id;

  select member.local_home_id
    into v_local_home_id
    from public.contractor_local_customer_claim_invite_homes member
   where member.claim_invite_id = v_invite_id
   order by member.sort_order, member.local_home_id
   limit 1;

  if v_property_count > 1 then
    raise exception 'This invitation includes multiple properties. Refresh ServSync before accepting it.';
  end if;

  if v_property_count = 1 then
    return public.servsync_accept_local_customer_claim_v2(
      p_token,
      p_profile_updates,
      jsonb_build_array(jsonb_build_object(
        'local_home_id', v_local_home_id,
        'mode', case when p_home_id is null then 'create' else 'existing' end,
        'home_id', p_home_id,
        'home_updates', coalesce(p_home_updates, '{}'::jsonb)
      ))
    );
  end if;

  raise exception 'This invitation does not include a claimable property.';
end;
$$;

revoke execute on function public.servsync_accept_local_customer_claim(text, uuid, jsonb, jsonb) from public;
revoke execute on function public.servsync_accept_local_customer_claim(text, uuid, jsonb, jsonb) from anon;
grant execute on function public.servsync_accept_local_customer_claim(text, uuid, jsonb, jsonb) to authenticated;

-- Reassert least-privilege grants for legacy claim lifecycle RPCs created by
-- the single-property foundation so rerunning this slice closes inherited
-- default EXECUTE exposure without changing function behavior.
revoke execute on function public.servsync_decline_local_customer_claim(text) from public;
revoke execute on function public.servsync_decline_local_customer_claim(text) from anon;
grant execute on function public.servsync_decline_local_customer_claim(text) to authenticated;

revoke execute on function public.servsync_revoke_local_customer_claim_invite(uuid) from public;
revoke execute on function public.servsync_revoke_local_customer_claim_invite(uuid) from anon;
grant execute on function public.servsync_revoke_local_customer_claim_invite(uuid) to authenticated;

-- Preserve the completed token-containment boundary for the token-bearing
-- legacy invite table when this feature slice is rerun in an environment that
-- previously used SQL-first compatibility grants.
revoke select on public.contractor_local_customer_claim_invites from public;
revoke select on public.contractor_local_customer_claim_invites from anon;
revoke select on public.contractor_local_customer_claim_invites from authenticated;

notify pgrst, 'reload schema';

commit;
