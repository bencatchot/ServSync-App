-- ServSync local customer -> homeowner claim invite foundation.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after:
--   - servsync-clean-foundation.sql
--   - servsync-contractor-team-access.sql
--   - servsync-local-field-work.sql
--   - servsync-job-lifecycle.sql
--
-- This patch adds the database foundation for contractor-created local
-- customer/home records to be claimed later by a homeowner through a secure
-- token. It does not build UI, send email, or rewrite historical work records.

begin;

-- Link local contractor records to homeowner-owned records after claim.
alter table public.contractor_local_contacts
  add column if not exists homeowner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

alter table public.contractor_local_homes
  add column if not exists home_id uuid references public.homes(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists contractor_local_contacts_homeowner_idx
  on public.contractor_local_contacts(homeowner_user_id)
  where homeowner_user_id is not null;

create index if not exists contractor_local_homes_home_idx
  on public.contractor_local_homes(home_id)
  where home_id is not null;

-- Claim invites are separate from generic contractor referral invites because
-- they are tied to specific contractor-created local customer/home records.
create table if not exists public.contractor_local_customer_claim_invites (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  invite_token text not null unique,
  invited_email text,
  invited_phone text,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'declined', 'expired', 'revoked')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  claimed_by_homeowner_user_id uuid references public.profiles(id) on delete set null,
  claimed_home_id uuid references public.homes(id) on delete set null,
  connection_id uuid references public.homeowner_contractor_connections(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists local_customer_claim_invites_token_idx
  on public.contractor_local_customer_claim_invites(invite_token);

create index if not exists local_customer_claim_invites_contractor_status_idx
  on public.contractor_local_customer_claim_invites(contractor_id, status);

create index if not exists local_customer_claim_invites_contact_idx
  on public.contractor_local_customer_claim_invites(local_contact_id);

create index if not exists local_customer_claim_invites_home_idx
  on public.contractor_local_customer_claim_invites(local_home_id)
  where local_home_id is not null;

create index if not exists local_customer_claim_invites_homeowner_idx
  on public.contractor_local_customer_claim_invites(claimed_by_homeowner_user_id)
  where claimed_by_homeowner_user_id is not null;

create index if not exists local_customer_claim_invites_claimed_home_idx
  on public.contractor_local_customer_claim_invites(claimed_home_id)
  where claimed_home_id is not null;

drop trigger if exists contractor_local_customer_claim_invites_touch_updated_at
  on public.contractor_local_customer_claim_invites;
create trigger contractor_local_customer_claim_invites_touch_updated_at
  before update on public.contractor_local_customer_claim_invites
  for each row execute function public.touch_updated_at();

alter table public.contractor_local_customer_claim_invites enable row level security;

drop policy if exists "Local claim invites: contractor reads own" on public.contractor_local_customer_claim_invites;
create policy "Local claim invites: contractor reads own"
  on public.contractor_local_customer_claim_invites for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Local claim invites: contractor creates own" on public.contractor_local_customer_claim_invites;
create policy "Local claim invites: contractor creates own"
  on public.contractor_local_customer_claim_invites for insert to authenticated
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Local claim invites: contractor updates own" on public.contractor_local_customer_claim_invites;
create policy "Local claim invites: contractor updates own"
  on public.contractor_local_customer_claim_invites for update to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
    or public.current_user_is_platform_admin()
  )
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
    or public.current_user_is_platform_admin()
  );

grant select on public.contractor_local_customer_claim_invites to authenticated;

create or replace function public.servsync_generate_local_customer_claim_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  loop
    v_token := lower(encode(gen_random_bytes(24), 'hex'));
    exit when not exists (
      select 1
        from public.contractor_local_customer_claim_invites
       where invite_token = v_token
    );
  end loop;

  return v_token;
end;
$$;

grant execute on function public.servsync_generate_local_customer_claim_token() to authenticated;

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
declare
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_invite public.contractor_local_customer_claim_invites;
  v_expires_days int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = p_local_contact_id
   limit 1;

  if v_contact.id is null then
    raise exception 'Local customer not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_contact.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to invite this customer.';
  end if;

  if p_local_home_id is not null then
    select *
      into v_home
      from public.contractor_local_homes
     where id = p_local_home_id
       and contractor_id = v_contact.contractor_id
       and local_contact_id = v_contact.id
     limit 1;

    if v_home.id is null then
      raise exception 'Local home does not belong to this local customer.';
    end if;
  end if;

  v_expires_days := greatest(1, least(coalesce(p_expires_days, 14), 90));

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
    p_local_home_id,
    public.servsync_generate_local_customer_claim_token(),
    nullif(trim(v_contact.email), ''),
    nullif(trim(v_contact.phone), ''),
    'pending',
    auth.uid(),
    now() + make_interval(days => v_expires_days)
  )
  returning * into v_invite;

  return jsonb_build_object(
    'id', v_invite.id,
    'invite_token', v_invite.invite_token,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'local_contact_id', v_invite.local_contact_id,
    'local_home_id', v_invite.local_home_id
  );
end;
$$;

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
  v_home public.contractor_local_homes;
  v_contractor public.contractor_profiles;
begin
  select *
    into v_invite
    from public.contractor_local_customer_claim_invites
   where invite_token = lower(trim(coalesce(p_token, '')))
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

  if v_invite.local_home_id is not null then
    select *
      into v_home
      from public.contractor_local_homes
     where id = v_invite.local_home_id
       and contractor_id = v_invite.contractor_id
       and local_contact_id = v_invite.local_contact_id
     limit 1;
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
    'home', case
      when v_home.id is null then null
      else jsonb_build_object(
        'nickname', v_home.nickname,
        'address_line1', v_home.address_line1,
        'address_line2', v_home.address_line2,
        'city', v_home.city,
        'state', v_home.state,
        'zip_code', v_home.zip_code,
        'home_type', v_home.home_type,
        'year_built', v_home.year_built,
        'square_feet', v_home.square_feet
      )
    end
  );
end;
$$;

grant execute on function public.servsync_lookup_local_customer_claim(text) to anon, authenticated;

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
  v_invite public.contractor_local_customer_claim_invites;
  v_contact public.contractor_local_contacts;
  v_local_home public.contractor_local_homes;
  v_profile public.profiles;
  v_home public.homes;
  v_connection_id uuid;
  v_home_id uuid;
  v_profile_updates jsonb;
  v_home_updates jsonb;
  v_share_contact boolean;
  v_share_home_overview boolean;
  v_share_address boolean;
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

  select *
    into v_invite
    from public.contractor_local_customer_claim_invites
   where invite_token = lower(trim(coalesce(p_token, '')))
   for update;

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
   for update;

  if v_contact.id is null then
    raise exception 'Local customer not found.';
  end if;

  if v_contact.homeowner_user_id is not null and v_contact.homeowner_user_id <> auth.uid() then
    raise exception 'This local customer profile has already been claimed.';
  end if;

  if v_invite.local_home_id is not null then
    select *
      into v_local_home
      from public.contractor_local_homes
     where id = v_invite.local_home_id
       and contractor_id = v_invite.contractor_id
       and local_contact_id = v_invite.local_contact_id
     for update;

    if v_local_home.id is null then
      raise exception 'Local home not found.';
    end if;

    if v_local_home.home_id is not null and v_local_home.home_id <> p_home_id then
      raise exception 'This local home has already been claimed.';
    end if;
  end if;

  v_profile_updates := coalesce(p_profile_updates, '{}'::jsonb);
  v_home_updates := coalesce(p_home_updates, '{}'::jsonb);

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

  if v_local_home.id is not null then
    if p_home_id is not null then
      select *
        into v_home
        from public.homes
       where id = p_home_id
         and homeowner_user_id = auth.uid()
       limit 1;

      if v_home.id is null then
        raise exception 'Selected home was not found for this homeowner.';
      end if;

      v_home_id := v_home.id;
    else
      select *
        into v_home
        from public.homes
       where homeowner_user_id = auth.uid()
       order by created_at asc
       limit 1;

      if v_home.id is not null then
        raise exception 'Choose an existing home before accepting this claim.';
      end if;

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
        coalesce(nullif(trim(v_home_updates->>'nickname'), ''), nullif(trim(v_local_home.nickname), ''), 'My Home'),
        coalesce(nullif(trim(v_home_updates->>'address_line1'), ''), nullif(trim(v_local_home.address_line1), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'address_line2'), ''), nullif(trim(v_local_home.address_line2), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'city'), ''), nullif(trim(v_local_home.city), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'state'), ''), nullif(trim(v_local_home.state), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'zip_code'), ''), nullif(trim(v_local_home.zip_code), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'home_type'), ''), nullif(trim(v_local_home.home_type), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'year_built'), ''), nullif(trim(v_local_home.year_built), ''), ''),
        coalesce(nullif(trim(v_home_updates->>'square_feet'), ''), nullif(trim(v_local_home.square_feet), ''), ''),
        ''
      )
      returning id into v_home_id;
    end if;
  end if;

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

  v_share_contact := true;
  v_share_home_overview := v_home_id is not null;
  v_share_address := v_home_id is not null and v_local_home.id is not null and (
    nullif(trim(coalesce(v_home_updates->>'address_line1', v_local_home.address_line1)), '') is not null
    or nullif(trim(coalesce(v_home_updates->>'city', v_local_home.city)), '') is not null
    or nullif(trim(coalesce(v_home_updates->>'zip_code', v_local_home.zip_code)), '') is not null
  );

  insert into public.connection_permissions (
    connection_id,
    share_contact,
    share_home_overview,
    share_address,
    share_preferred_vendors,
    share_photos
  ) values (
    v_connection_id,
    v_share_contact,
    v_share_home_overview,
    v_share_address,
    false,
    false
  )
  on conflict (connection_id) do update
     set share_contact = excluded.share_contact,
         share_home_overview = excluded.share_home_overview,
         share_address = excluded.share_address,
         share_preferred_vendors = false,
         share_photos = false,
         updated_at = now();

  update public.contractor_local_contacts
     set homeowner_user_id = auth.uid(),
         claimed_at = coalesce(claimed_at, now())
   where id = v_contact.id;

  if v_local_home.id is not null and v_home_id is not null then
    update public.contractor_local_homes
       set home_id = v_home_id,
           claimed_at = coalesce(claimed_at, now())
     where id = v_local_home.id;
  end if;

  update public.contractor_local_customer_claim_invites
     set status = 'claimed',
         claimed_by_homeowner_user_id = auth.uid(),
         claimed_home_id = v_home_id,
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
      'local_home_id', v_local_home.id,
      'claimed_home_id', v_home_id
    )
  );

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'status', 'claimed',
    'connection_id', v_connection_id,
    'home_id', v_home_id,
    'local_contact_id', v_contact.id,
    'local_home_id', v_local_home.id
  );
end;
$$;

grant execute on function public.servsync_accept_local_customer_claim(text, uuid, jsonb, jsonb) to authenticated;

create or replace function public.servsync_decline_local_customer_claim(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_invite public.contractor_local_customer_claim_invites;
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
    raise exception 'Only homeowner accounts can decline a local customer claim.';
  end if;

  select *
    into v_invite
    from public.contractor_local_customer_claim_invites
   where invite_token = lower(trim(coalesce(p_token, '')))
   for update;

  if v_invite.id is null then
    raise exception 'Claim link not found or no longer active.';
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'Claim link not found or no longer active.';
  end if;

  update public.contractor_local_customer_claim_invites
     set status = 'declined',
         declined_at = now()
   where id = v_invite.id;

  return jsonb_build_object('invite_id', v_invite.id, 'status', 'declined');
end;
$$;

grant execute on function public.servsync_decline_local_customer_claim(text) to authenticated;

create or replace function public.servsync_revoke_local_customer_claim_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.contractor_local_customer_claim_invites;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_invite
    from public.contractor_local_customer_claim_invites
   where id = p_invite_id
   for update;

  if v_invite.id is null then
    raise exception 'Claim invite not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_invite.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to revoke this claim invite.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Only pending claim invites can be revoked.';
  end if;

  update public.contractor_local_customer_claim_invites
     set status = 'revoked',
         revoked_at = now()
   where id = v_invite.id;

  return jsonb_build_object('invite_id', v_invite.id, 'status', 'revoked');
end;
$$;

grant execute on function public.servsync_revoke_local_customer_claim_invite(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification helpers after applying:
-- select * from public.contractor_local_customer_claim_invites order by created_at desc limit 5;
-- select public.servsync_lookup_local_customer_claim('<token>');
-- select homeowner_user_id, claimed_at from public.contractor_local_contacts where id = '<local_contact_id>';
-- select home_id, claimed_at from public.contractor_local_homes where id = '<local_home_id>';
