-- ServSync connected-homeowner property proposal foundation.
-- Adds consent-first contractor property suggestions for existing connected homeowners.

begin;

create extension if not exists pgcrypto;

create table if not exists public.contractor_home_property_proposals (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.homeowner_contractor_connections(id) on delete cascade,
  proposed_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  nickname text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  homeowner_visible_note text not null default '',
  accepted_home_id uuid references public.homes(id),
  reviewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_home_property_proposals_status_check
    check (status in ('pending', 'accepted', 'rejected', 'revoked')),
  constraint contractor_home_property_proposals_useful_property_check
    check (
      length(trim(coalesce(nickname, ''))) > 0
      or length(trim(coalesce(address_line1, ''))) > 0
    ),
  constraint contractor_home_property_proposals_reviewed_check
    check (
      (status in ('accepted', 'rejected') and reviewed_at is not null)
      or (status not in ('accepted', 'rejected') and reviewed_at is null)
    ),
  constraint contractor_home_property_proposals_accepted_home_check
    check (
      (status = 'accepted' and accepted_home_id is not null)
      or (status <> 'accepted' and accepted_home_id is null)
    ),
  constraint contractor_home_property_proposals_revoked_check
    check (
      (status = 'revoked' and revoked_at is not null)
      or (status <> 'revoked' and revoked_at is null)
    )
);

alter table public.contractor_home_property_proposals
  drop constraint if exists contractor_home_property_proposals_accepted_home_id_fkey;

alter table public.contractor_home_property_proposals
  add constraint contractor_home_property_proposals_accepted_home_id_fkey
  foreign key (accepted_home_id) references public.homes(id);

create index if not exists contractor_home_property_proposals_contractor_status_idx
  on public.contractor_home_property_proposals(contractor_id, status, created_at desc);

create index if not exists contractor_home_property_proposals_homeowner_status_idx
  on public.contractor_home_property_proposals(homeowner_user_id, status, created_at desc);

create index if not exists contractor_home_property_proposals_connection_status_idx
  on public.contractor_home_property_proposals(connection_id, status, created_at desc);

create index if not exists contractor_home_property_proposals_accepted_home_idx
  on public.contractor_home_property_proposals(accepted_home_id)
  where accepted_home_id is not null;

drop trigger if exists contractor_home_property_proposals_touch_updated_at
  on public.contractor_home_property_proposals;
create trigger contractor_home_property_proposals_touch_updated_at
  before update on public.contractor_home_property_proposals
  for each row execute function public.touch_updated_at();

alter table public.contractor_home_property_proposals enable row level security;

drop policy if exists "Property proposals: contractor reads own" on public.contractor_home_property_proposals;
create policy "Property proposals: contractor reads own"
  on public.contractor_home_property_proposals for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
  );

drop policy if exists "Property proposals: homeowner reads own" on public.contractor_home_property_proposals;
create policy "Property proposals: homeowner reads own"
  on public.contractor_home_property_proposals for select to authenticated
  using (
    homeowner_user_id = auth.uid()
  );

drop policy if exists "Property proposals: platform admin reads" on public.contractor_home_property_proposals;
create policy "Property proposals: platform admin reads"
  on public.contractor_home_property_proposals for select to authenticated
  using (
    public.current_user_is_platform_admin()
  );

revoke all on table public.contractor_home_property_proposals from public;
revoke all on table public.contractor_home_property_proposals from anon;
revoke all on table public.contractor_home_property_proposals from authenticated;
grant select on table public.contractor_home_property_proposals to authenticated;

create or replace function public.servsync_create_home_property_proposal(
  p_connection_id uuid,
  p_nickname text default '',
  p_address_line1 text default '',
  p_address_line2 text default '',
  p_city text default '',
  p_state text default '',
  p_zip_code text default '',
  p_homeowner_visible_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_proposal public.contractor_home_property_proposals;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_connection
    from public.homeowner_contractor_connections
   where id = p_connection_id
     and status = 'active'
   limit 1;

  if v_connection.id is null then
    raise exception 'Connected homeowner relationship not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_connection.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to suggest a property for this homeowner.';
  end if;

  if length(trim(coalesce(p_nickname, ''))) = 0
     and length(trim(coalesce(p_address_line1, ''))) = 0 then
    raise exception 'Enter a property label or street address.';
  end if;

  insert into public.contractor_home_property_proposals (
    contractor_id,
    homeowner_user_id,
    connection_id,
    proposed_by_user_id,
    status,
    nickname,
    address_line1,
    address_line2,
    city,
    state,
    zip_code,
    homeowner_visible_note
  ) values (
    v_connection.contractor_id,
    v_connection.homeowner_user_id,
    v_connection.id,
    auth.uid(),
    'pending',
    trim(coalesce(p_nickname, '')),
    trim(coalesce(p_address_line1, '')),
    trim(coalesce(p_address_line2, '')),
    trim(coalesce(p_city, '')),
    trim(coalesce(p_state, '')),
    trim(coalesce(p_zip_code, '')),
    coalesce(p_homeowner_visible_note, '')
  )
  returning * into v_proposal;

  return to_jsonb(v_proposal);
end;
$$;

create or replace function public.servsync_homeowner_accept_home_property_proposal(
  p_proposal_id uuid,
  p_existing_home_id uuid default null,
  p_share_with_contractor boolean default false,
  p_nickname text default '',
  p_address_line1 text default '',
  p_address_line2 text default '',
  p_city text default '',
  p_state text default '',
  p_zip_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.contractor_home_property_proposals;
  v_connection public.homeowner_contractor_connections;
  v_home public.homes;
  v_home_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_proposal
    from public.contractor_home_property_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.id is null then
    raise exception 'Property suggestion not found.';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Only pending property suggestions can be accepted.';
  end if;

  if v_proposal.homeowner_user_id <> auth.uid() then
    raise exception 'You do not have permission to review this property suggestion.';
  end if;

  select *
    into v_connection
    from public.homeowner_contractor_connections
   where id = v_proposal.connection_id
     and contractor_id = v_proposal.contractor_id
     and homeowner_user_id = auth.uid()
     and status = 'active'
   limit 1;

  if v_connection.id is null then
    raise exception 'This contractor connection is no longer active.';
  end if;

  if p_existing_home_id is not null then
    select *
      into v_home
      from public.homes
     where id = p_existing_home_id
       and homeowner_user_id = auth.uid()
     limit 1;

    if v_home.id is null then
      raise exception 'Selected home was not found for this homeowner.';
    end if;

    v_home_id := v_home.id;
  else
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
      coalesce(nullif(trim(coalesce(p_nickname, '')), ''), nullif(trim(v_proposal.nickname), ''), 'Property'),
      coalesce(nullif(trim(coalesce(p_address_line1, '')), ''), trim(v_proposal.address_line1), ''),
      coalesce(nullif(trim(coalesce(p_address_line2, '')), ''), trim(v_proposal.address_line2), ''),
      coalesce(nullif(trim(coalesce(p_city, '')), ''), trim(v_proposal.city), ''),
      coalesce(nullif(trim(coalesce(p_state, '')), ''), trim(v_proposal.state), ''),
      coalesce(nullif(trim(coalesce(p_zip_code, '')), ''), trim(v_proposal.zip_code), ''),
      '',
      '',
      '',
      ''
    )
    returning id into v_home_id;
  end if;

  if p_share_with_contractor then
    insert into public.connection_shared_properties (
      connection_id,
      home_id,
      share_home_overview,
      share_address,
      share_preferred_vendors,
      share_photos,
      sharing_source
    ) values (
      v_connection.id,
      v_home_id,
      true,
      true,
      false,
      false,
      'contextual'
    )
    on conflict (connection_id, home_id) do update
       set share_home_overview = true,
           share_address = true,
           share_preferred_vendors = public.connection_shared_properties.share_preferred_vendors,
           share_photos = false,
           sharing_source = 'contextual',
           updated_at = now();

    insert into public.connection_permissions (
      connection_id,
      share_contact,
      share_home_overview,
      share_address,
      share_preferred_vendors,
      share_photos
    )
    select
      v_connection.id,
      coalesce(existing.share_contact, false),
      coalesce(bool_or(csp.share_home_overview), false),
      coalesce(bool_or(csp.share_address), false),
      coalesce(bool_or(csp.share_preferred_vendors), false),
      false
    from public.connection_shared_properties csp
    left join public.connection_permissions existing
      on existing.connection_id = v_connection.id
   where csp.connection_id = v_connection.id
   group by existing.share_contact
    on conflict (connection_id) do update
       set share_home_overview = excluded.share_home_overview,
           share_address = excluded.share_address,
           share_preferred_vendors = excluded.share_preferred_vendors,
           share_photos = false,
           updated_at = now();
  end if;

  update public.contractor_home_property_proposals
     set status = 'accepted',
         accepted_home_id = v_home_id,
         reviewed_at = now(),
         updated_at = now()
   where id = v_proposal.id
   returning * into v_proposal;

  return to_jsonb(v_proposal);
end;
$$;

create or replace function public.servsync_homeowner_reject_home_property_proposal(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.contractor_home_property_proposals;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_proposal
    from public.contractor_home_property_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.id is null then
    raise exception 'Property suggestion not found.';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Only pending property suggestions can be rejected.';
  end if;

  if v_proposal.homeowner_user_id <> auth.uid() then
    raise exception 'You do not have permission to review this property suggestion.';
  end if;

  update public.contractor_home_property_proposals
     set status = 'rejected',
         reviewed_at = now(),
         updated_at = now()
   where id = v_proposal.id
   returning * into v_proposal;

  return to_jsonb(v_proposal);
end;
$$;

create or replace function public.servsync_revoke_home_property_proposal(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.contractor_home_property_proposals;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_proposal
    from public.contractor_home_property_proposals
   where id = p_proposal_id
   for update;

  if v_proposal.id is null then
    raise exception 'Property suggestion not found.';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Only pending property suggestions can be revoked.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_proposal.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to revoke this property suggestion.';
  end if;

  update public.contractor_home_property_proposals
     set status = 'revoked',
         revoked_at = now(),
         updated_at = now()
   where id = v_proposal.id
   returning * into v_proposal;

  return to_jsonb(v_proposal);
end;
$$;

revoke execute on function public.servsync_create_home_property_proposal(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.servsync_create_home_property_proposal(uuid, text, text, text, text, text, text, text) from anon;
grant execute on function public.servsync_create_home_property_proposal(uuid, text, text, text, text, text, text, text) to authenticated;

revoke execute on function public.servsync_homeowner_accept_home_property_proposal(uuid, uuid, boolean, text, text, text, text, text, text) from public;
revoke execute on function public.servsync_homeowner_accept_home_property_proposal(uuid, uuid, boolean, text, text, text, text, text, text) from anon;
grant execute on function public.servsync_homeowner_accept_home_property_proposal(uuid, uuid, boolean, text, text, text, text, text, text) to authenticated;

revoke execute on function public.servsync_homeowner_reject_home_property_proposal(uuid) from public;
revoke execute on function public.servsync_homeowner_reject_home_property_proposal(uuid) from anon;
grant execute on function public.servsync_homeowner_reject_home_property_proposal(uuid) to authenticated;

revoke execute on function public.servsync_revoke_home_property_proposal(uuid) from public;
revoke execute on function public.servsync_revoke_home_property_proposal(uuid) from anon;
grant execute on function public.servsync_revoke_home_property_proposal(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
