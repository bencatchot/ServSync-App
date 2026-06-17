-- Contextual connection request SQL foundation.
-- Adds per-property connection permissions while keeping contact sharing
-- connection-level, and replaces contractor property visibility with the
-- explicit shared-property rows.

begin;

create extension if not exists pgcrypto;

create table if not exists public.connection_shared_properties (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.homeowner_contractor_connections(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  share_home_overview boolean not null default false,
  share_address boolean not null default false,
  share_preferred_vendors boolean not null default false,
  share_photos boolean not null default false,
  sharing_source text not null default 'contextual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_shared_properties_source_check
    check (sharing_source in ('contextual', 'legacy_global'))
);

alter table public.connection_shared_properties
  add column if not exists sharing_source text not null default 'contextual';

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.connection_shared_properties'::regclass
       and conname = 'connection_shared_properties_source_check'
  ) then
    alter table public.connection_shared_properties
      drop constraint connection_shared_properties_source_check;
  end if;
end $$;

alter table public.connection_shared_properties
  add constraint connection_shared_properties_source_check
  check (sharing_source in ('contextual', 'legacy_global'));

create unique index if not exists connection_shared_properties_connection_home_uidx
  on public.connection_shared_properties(connection_id, home_id);

create index if not exists connection_shared_properties_connection_idx
  on public.connection_shared_properties(connection_id);

create index if not exists connection_shared_properties_home_idx
  on public.connection_shared_properties(home_id);

create index if not exists connection_shared_properties_connection_overview_idx
  on public.connection_shared_properties(connection_id, share_home_overview);

create index if not exists connection_shared_properties_connection_source_idx
  on public.connection_shared_properties(connection_id, sharing_source);

drop trigger if exists connection_shared_properties_touch_updated_at on public.connection_shared_properties;
create trigger connection_shared_properties_touch_updated_at
  before update on public.connection_shared_properties
  for each row execute function public.touch_updated_at();

create table if not exists public.connection_request_contexts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.homeowner_contractor_connections(id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists connection_request_contexts_connection_uidx
  on public.connection_request_contexts(connection_id);

create index if not exists connection_request_contexts_updated_idx
  on public.connection_request_contexts(updated_at desc);

drop trigger if exists connection_request_contexts_touch_updated_at on public.connection_request_contexts;
create trigger connection_request_contexts_touch_updated_at
  before update on public.connection_request_contexts
  for each row execute function public.touch_updated_at();

alter table public.connection_shared_properties enable row level security;
alter table public.connection_request_contexts enable row level security;

drop policy if exists "Shared properties: homeowner reads own" on public.connection_shared_properties;
create policy "Shared properties: homeowner reads own"
  on public.connection_shared_properties for select to authenticated
  using (
    exists (
      select 1
        from public.homeowner_contractor_connections c
        join public.homes h on h.id = connection_shared_properties.home_id
       where c.id = connection_shared_properties.connection_id
         and c.homeowner_user_id = auth.uid()
         and h.homeowner_user_id = auth.uid()
         and h.homeowner_user_id = c.homeowner_user_id
    )
  );

drop policy if exists "Shared properties: contractor reads active" on public.connection_shared_properties;
create policy "Shared properties: contractor reads active"
  on public.connection_shared_properties for select to authenticated
  using (
    exists (
      select 1
        from public.homeowner_contractor_connections c
        join public.homes h on h.id = connection_shared_properties.home_id
       where c.id = connection_shared_properties.connection_id
         and c.status = 'active'
         and h.homeowner_user_id = c.homeowner_user_id
         and public.current_user_can_access_contractor(c.contractor_id)
    )
  );

drop policy if exists "Shared properties: platform admin reads" on public.connection_shared_properties;
create policy "Shared properties: platform admin reads"
  on public.connection_shared_properties for select to authenticated
  using (public.current_user_is_platform_admin());

drop policy if exists "Request contexts: homeowner reads own" on public.connection_request_contexts;
create policy "Request contexts: homeowner reads own"
  on public.connection_request_contexts for select to authenticated
  using (
    exists (
      select 1
        from public.homeowner_contractor_connections c
       where c.id = connection_request_contexts.connection_id
         and c.homeowner_user_id = auth.uid()
    )
  );

drop policy if exists "Request contexts: contractor reads pending or active" on public.connection_request_contexts;
create policy "Request contexts: contractor reads pending or active"
  on public.connection_request_contexts for select to authenticated
  using (
    exists (
      select 1
        from public.homeowner_contractor_connections c
       where c.id = connection_request_contexts.connection_id
         and c.status in ('pending', 'active')
         and public.current_user_can_access_contractor(c.contractor_id)
    )
  );

drop policy if exists "Request contexts: platform admin reads" on public.connection_request_contexts;
create policy "Request contexts: platform admin reads"
  on public.connection_request_contexts for select to authenticated
  using (public.current_user_is_platform_admin());

revoke all on table public.connection_shared_properties from public;
revoke all on table public.connection_shared_properties from anon;
revoke all on table public.connection_shared_properties from authenticated;
grant select on table public.connection_shared_properties to authenticated;

revoke all on table public.connection_request_contexts from public;
revoke all on table public.connection_request_contexts from anon;
revoke all on table public.connection_request_contexts from authenticated;
grant select on table public.connection_request_contexts to authenticated;

-- Preserve existing beta visibility without expanding access: only active
-- connections that already globally shared home overview receive per-property
-- rows, and only for homes owned by that connection's homeowner.
insert into public.connection_shared_properties (
  connection_id,
  home_id,
  share_home_overview,
  share_address,
  share_preferred_vendors,
  share_photos,
  sharing_source
)
select
  c.id,
  h.id,
  coalesce(p.share_home_overview, false),
  coalesce(p.share_address, false),
  coalesce(p.share_preferred_vendors, false),
  coalesce(p.share_photos, false),
  'legacy_global'
from public.homeowner_contractor_connections c
join public.connection_permissions p on p.connection_id = c.id
join public.homes h on h.homeowner_user_id = c.homeowner_user_id
where c.status = 'active'
  and coalesce(p.share_home_overview, false) = true
on conflict (connection_id, home_id) do nothing;

create or replace function public.servsync_sync_shared_properties_from_global_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Temporary beta compatibility bridge for the existing app UI, which still
  -- edits connection-level permission flags directly. This preserves old
  -- behavior where global share_home_overview=true exposed all homeowner homes.
  -- It is not the final per-property permission model and should be removed
  -- or narrowed once the UI calls the contextual per-property RPCs directly.
  -- Bridge writes are tagged legacy_global and must not overwrite contextual
  -- homeowner-selected rows. If contextual rows exist, the bridge does nothing
  -- so old global saves cannot add unselected homes back into contractor view.
  if exists (
    select 1
      from public.homeowner_contractor_connections c
     where c.id = new.connection_id
       and c.status = 'active'
  ) and not exists (
    select 1
      from public.connection_shared_properties csp
     where csp.connection_id = new.connection_id
       and csp.sharing_source = 'contextual'
  ) then
    if coalesce(new.share_home_overview, false) then
      insert into public.connection_shared_properties (
        connection_id,
        home_id,
        share_home_overview,
        share_address,
        share_preferred_vendors,
        share_photos,
        sharing_source
      )
      select
        new.connection_id,
        h.id,
        coalesce(new.share_home_overview, false),
        coalesce(new.share_address, false),
        coalesce(new.share_preferred_vendors, false),
        coalesce(new.share_photos, false),
        'legacy_global'
      from public.homeowner_contractor_connections c
      join public.homes h on h.homeowner_user_id = c.homeowner_user_id
      where c.id = new.connection_id
      on conflict (connection_id, home_id) do update
         set share_home_overview = excluded.share_home_overview,
             share_address = excluded.share_address,
             share_preferred_vendors = excluded.share_preferred_vendors,
             share_photos = excluded.share_photos,
             updated_at = now()
         where public.connection_shared_properties.sharing_source = 'legacy_global';
    else
      delete from public.connection_shared_properties
       where connection_id = new.connection_id
         and sharing_source = 'legacy_global';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists connection_permissions_sync_shared_properties on public.connection_permissions;

-- Temporary beta compatibility trigger. It only syncs legacy_global rows from
-- global connection permission flags so the current UI keeps working until the
-- contextual per-property UI/RPC migration lands.
create trigger connection_permissions_sync_shared_properties
  after insert or update of share_home_overview, share_address, share_preferred_vendors, share_photos
  on public.connection_permissions
  for each row execute function public.servsync_sync_shared_properties_from_global_permissions();

revoke execute on function public.servsync_sync_shared_properties_from_global_permissions() from public;
revoke execute on function public.servsync_sync_shared_properties_from_global_permissions() from anon;
revoke execute on function public.servsync_sync_shared_properties_from_global_permissions() from authenticated;

create or replace function public.current_user_can_manage_contractor_connections(p_contractor_id uuid)
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
       and tm.role in ('admin', 'office')
  )
  or public.current_user_is_platform_admin();
$$;

revoke execute on function public.current_user_can_manage_contractor_connections(uuid) from public;
revoke execute on function public.current_user_can_manage_contractor_connections(uuid) from anon;
grant execute on function public.current_user_can_manage_contractor_connections(uuid) to authenticated;

drop function if exists public.servsync_submit_contextual_connection_request(uuid, text, boolean, jsonb);
create function public.servsync_submit_contextual_connection_request(
  p_contractor_id uuid,
  p_request_message text default '',
  p_share_contact boolean default false,
  p_property_permissions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_connection_id uuid;
  v_property_count integer;
  v_home_id_count integer;
  v_distinct_home_count integer;
  v_share_home_overview boolean;
  v_share_address boolean;
  v_share_preferred_vendors boolean;
  v_share_photos boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if public.current_user_role() <> 'homeowner' then
    raise exception 'Only homeowners can request a contractor connection.';
  end if;

  if not exists (select 1 from public.contractor_profiles where id = p_contractor_id) then
    raise exception 'Contractor profile not found.';
  end if;

  if p_property_permissions is null or jsonb_typeof(p_property_permissions) <> 'array' then
    raise exception 'Select at least one property to share.';
  end if;

  with parsed as (
    select
      (item ->> 'home_id')::uuid as home_id,
      coalesce((item ->> 'share_home_overview')::boolean, false) as share_home_overview,
      coalesce((item ->> 'share_address')::boolean, false) as share_address,
      coalesce((item ->> 'share_preferred_vendors')::boolean, false) as share_preferred_vendors,
      coalesce((item ->> 'share_photos')::boolean, false) as share_photos
    from jsonb_array_elements(p_property_permissions) as item
  )
  select
    count(*),
    count(home_id),
    count(distinct home_id),
    coalesce(bool_or(share_home_overview), false),
    coalesce(bool_or(share_address), false),
    coalesce(bool_or(share_preferred_vendors), false),
    coalesce(bool_or(share_photos), false)
  into
    v_property_count,
    v_home_id_count,
    v_distinct_home_count,
    v_share_home_overview,
    v_share_address,
    v_share_preferred_vendors,
    v_share_photos
  from parsed;

  if v_property_count = 0 then
    raise exception 'Select at least one property to share.';
  end if;

  if v_home_id_count <> v_property_count then
    raise exception 'Every shared property must include a home id.';
  end if;

  if v_distinct_home_count <> v_property_count then
    raise exception 'Each shared property can only be selected once.';
  end if;

  if exists (
    with parsed as (
      select
        (item ->> 'home_id')::uuid as home_id,
        coalesce((item ->> 'share_home_overview')::boolean, false) as share_home_overview,
        coalesce((item ->> 'share_address')::boolean, false) as share_address,
        coalesce((item ->> 'share_preferred_vendors')::boolean, false) as share_preferred_vendors,
        coalesce((item ->> 'share_photos')::boolean, false) as share_photos
      from jsonb_array_elements(p_property_permissions) as item
    )
    select 1
      from parsed
     where not (share_home_overview or share_address or share_preferred_vendors or share_photos)
  ) then
    raise exception 'Enable at least one permission for each shared property.';
  end if;

  if exists (
    with parsed as (
      select (item ->> 'home_id')::uuid as home_id
      from jsonb_array_elements(p_property_permissions) as item
    )
    select 1
      from parsed p
      left join public.homes h on h.id = p.home_id and h.homeowner_user_id = auth.uid()
     where h.id is null
  ) then
    raise exception 'Selected properties must belong to your account.';
  end if;

  select *
    into v_connection
    from public.homeowner_contractor_connections
   where homeowner_user_id = auth.uid()
     and contractor_id = p_contractor_id
   limit 1
   for update;

  if v_connection.id is null then
    insert into public.homeowner_contractor_connections (
      homeowner_user_id,
      contractor_id,
      status,
      source
    ) values (
      auth.uid(),
      p_contractor_id,
      'pending',
      'homeowner_request'
    )
    returning id into v_connection_id;
  elsif v_connection.status = 'active' then
    raise exception 'This contractor is already connected. Update shared properties instead.';
  else
    update public.homeowner_contractor_connections
       set status = 'pending',
           source = 'homeowner_request',
           updated_at = now()
     where id = v_connection.id
    returning id into v_connection_id;
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
    coalesce(p_share_contact, false),
    v_share_home_overview,
    v_share_address,
    v_share_preferred_vendors,
    v_share_photos
  )
  on conflict (connection_id) do update
     set share_contact = excluded.share_contact,
         share_home_overview = excluded.share_home_overview,
         share_address = excluded.share_address,
         share_preferred_vendors = excluded.share_preferred_vendors,
         share_photos = excluded.share_photos,
         updated_at = now();

  delete from public.connection_shared_properties
   where connection_id = v_connection_id;

  insert into public.connection_shared_properties (
    connection_id,
    home_id,
    share_home_overview,
    share_address,
    share_preferred_vendors,
    share_photos,
    sharing_source
  )
  select
    v_connection_id,
    parsed.home_id,
    parsed.share_home_overview,
    parsed.share_address,
    parsed.share_preferred_vendors,
    parsed.share_photos,
    'contextual'
  from (
    select
      (item ->> 'home_id')::uuid as home_id,
      coalesce((item ->> 'share_home_overview')::boolean, false) as share_home_overview,
      coalesce((item ->> 'share_address')::boolean, false) as share_address,
      coalesce((item ->> 'share_preferred_vendors')::boolean, false) as share_preferred_vendors,
      coalesce((item ->> 'share_photos')::boolean, false) as share_photos
    from jsonb_array_elements(p_property_permissions) as item
  ) parsed;

  insert into public.connection_request_contexts (
    connection_id,
    message
  ) values (
    v_connection_id,
    trim(coalesce(p_request_message, ''))
  )
  on conflict (connection_id) do update
     set message = excluded.message,
         updated_at = now();

  insert into public.connection_audit_events (
    connection_id,
    actor_user_id,
    event_type,
    event_details
  ) values (
    v_connection_id,
    auth.uid(),
    'contextual_connection_request_submitted',
    jsonb_build_object(
      'property_count', v_property_count,
      'share_contact', coalesce(p_share_contact, false),
      'message_present', nullif(trim(coalesce(p_request_message, '')), '') is not null
    )
  );

  return jsonb_build_object(
    'connection_id', v_connection_id,
    'status', 'pending',
    'property_count', v_property_count
  );
end;
$$;

revoke execute on function public.servsync_submit_contextual_connection_request(uuid, text, boolean, jsonb) from public;
revoke execute on function public.servsync_submit_contextual_connection_request(uuid, text, boolean, jsonb) from anon;
grant execute on function public.servsync_submit_contextual_connection_request(uuid, text, boolean, jsonb) to authenticated;

drop function if exists public.servsync_update_connection_shared_properties(uuid, boolean, jsonb);
create function public.servsync_update_connection_shared_properties(
  p_connection_id uuid,
  p_share_contact boolean,
  p_property_permissions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_property_count integer;
  v_home_id_count integer;
  v_distinct_home_count integer;
  v_share_home_overview boolean;
  v_share_address boolean;
  v_share_preferred_vendors boolean;
  v_share_photos boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if public.current_user_role() <> 'homeowner' then
    raise exception 'Only homeowners can update shared properties.';
  end if;

  select *
    into v_connection
    from public.homeowner_contractor_connections
   where id = p_connection_id
     and homeowner_user_id = auth.uid()
     and status in ('pending', 'active')
   limit 1
   for update;

  if v_connection.id is null then
    raise exception 'Connection not found.';
  end if;

  if p_property_permissions is null or jsonb_typeof(p_property_permissions) <> 'array' then
    raise exception 'Select at least one property to share.';
  end if;

  with parsed as (
    select
      (item ->> 'home_id')::uuid as home_id,
      coalesce((item ->> 'share_home_overview')::boolean, false) as share_home_overview,
      coalesce((item ->> 'share_address')::boolean, false) as share_address,
      coalesce((item ->> 'share_preferred_vendors')::boolean, false) as share_preferred_vendors,
      coalesce((item ->> 'share_photos')::boolean, false) as share_photos
    from jsonb_array_elements(p_property_permissions) as item
  )
  select
    count(*),
    count(home_id),
    count(distinct home_id),
    coalesce(bool_or(share_home_overview), false),
    coalesce(bool_or(share_address), false),
    coalesce(bool_or(share_preferred_vendors), false),
    coalesce(bool_or(share_photos), false)
  into
    v_property_count,
    v_home_id_count,
    v_distinct_home_count,
    v_share_home_overview,
    v_share_address,
    v_share_preferred_vendors,
    v_share_photos
  from parsed;

  if v_property_count = 0 then
    raise exception 'Select at least one property to share.';
  end if;

  if v_home_id_count <> v_property_count then
    raise exception 'Every shared property must include a home id.';
  end if;

  if v_distinct_home_count <> v_property_count then
    raise exception 'Each shared property can only be selected once.';
  end if;

  if exists (
    with parsed as (
      select
        (item ->> 'home_id')::uuid as home_id,
        coalesce((item ->> 'share_home_overview')::boolean, false) as share_home_overview,
        coalesce((item ->> 'share_address')::boolean, false) as share_address,
        coalesce((item ->> 'share_preferred_vendors')::boolean, false) as share_preferred_vendors,
        coalesce((item ->> 'share_photos')::boolean, false) as share_photos
      from jsonb_array_elements(p_property_permissions) as item
    )
    select 1
      from parsed
     where not (share_home_overview or share_address or share_preferred_vendors or share_photos)
  ) then
    raise exception 'Enable at least one permission for each shared property.';
  end if;

  if exists (
    with parsed as (
      select (item ->> 'home_id')::uuid as home_id
      from jsonb_array_elements(p_property_permissions) as item
    )
    select 1
      from parsed p
      left join public.homes h on h.id = p.home_id and h.homeowner_user_id = auth.uid()
     where h.id is null
  ) then
    raise exception 'Selected properties must belong to your account.';
  end if;

  insert into public.connection_permissions (
    connection_id,
    share_contact,
    share_home_overview,
    share_address,
    share_preferred_vendors,
    share_photos
  ) values (
    p_connection_id,
    coalesce(p_share_contact, false),
    v_share_home_overview,
    v_share_address,
    v_share_preferred_vendors,
    v_share_photos
  )
  on conflict (connection_id) do update
     set share_contact = excluded.share_contact,
         share_home_overview = excluded.share_home_overview,
         share_address = excluded.share_address,
         share_preferred_vendors = excluded.share_preferred_vendors,
         share_photos = excluded.share_photos,
         updated_at = now();

  delete from public.connection_shared_properties
   where connection_id = p_connection_id;

  insert into public.connection_shared_properties (
    connection_id,
    home_id,
    share_home_overview,
    share_address,
    share_preferred_vendors,
    share_photos,
    sharing_source
  )
  select
    p_connection_id,
    parsed.home_id,
    parsed.share_home_overview,
    parsed.share_address,
    parsed.share_preferred_vendors,
    parsed.share_photos,
    'contextual'
  from (
    select
      (item ->> 'home_id')::uuid as home_id,
      coalesce((item ->> 'share_home_overview')::boolean, false) as share_home_overview,
      coalesce((item ->> 'share_address')::boolean, false) as share_address,
      coalesce((item ->> 'share_preferred_vendors')::boolean, false) as share_preferred_vendors,
      coalesce((item ->> 'share_photos')::boolean, false) as share_photos
    from jsonb_array_elements(p_property_permissions) as item
  ) parsed;

  insert into public.connection_audit_events (
    connection_id,
    actor_user_id,
    event_type,
    event_details
  ) values (
    p_connection_id,
    auth.uid(),
    'connection_shared_properties_updated',
    jsonb_build_object(
      'property_count', v_property_count,
      'share_contact', coalesce(p_share_contact, false)
    )
  );

  return jsonb_build_object(
    'connection_id', p_connection_id,
    'status', v_connection.status,
    'property_count', v_property_count
  );
end;
$$;

revoke execute on function public.servsync_update_connection_shared_properties(uuid, boolean, jsonb) from public;
revoke execute on function public.servsync_update_connection_shared_properties(uuid, boolean, jsonb) from anon;
grant execute on function public.servsync_update_connection_shared_properties(uuid, boolean, jsonb) to authenticated;

drop function if exists public.servsync_respond_to_connection_request(uuid, text);
create function public.servsync_respond_to_connection_request(
  p_connection_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_next_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  v_next_status := case lower(trim(coalesce(p_response, '')))
    when 'accept' then 'active'
    when 'accepted' then 'active'
    when 'active' then 'active'
    when 'decline' then 'declined'
    when 'declined' then 'declined'
    else null
  end;

  if v_next_status is null then
    raise exception 'Response must be accept or decline.';
  end if;

  select *
    into v_connection
    from public.homeowner_contractor_connections
   where id = p_connection_id
   limit 1
   for update;

  if v_connection.id is null then
    raise exception 'Connection request not found.';
  end if;

  if v_connection.status <> 'pending' then
    raise exception 'Only pending connection requests can be updated.';
  end if;

  if not public.current_user_can_manage_contractor_connections(v_connection.contractor_id) then
    raise exception 'You do not have permission to respond to this connection request.';
  end if;

  update public.homeowner_contractor_connections
     set status = v_next_status,
         updated_at = now()
   where id = p_connection_id;

  insert into public.connection_audit_events (
    connection_id,
    actor_user_id,
    event_type,
    event_details
  ) values (
    p_connection_id,
    auth.uid(),
    case when v_next_status = 'active' then 'connection_request_accepted' else 'connection_request_declined' end,
    jsonb_build_object('status', v_next_status)
  );

  return jsonb_build_object('connection_id', p_connection_id, 'status', v_next_status);
end;
$$;

revoke execute on function public.servsync_respond_to_connection_request(uuid, text) from public;
revoke execute on function public.servsync_respond_to_connection_request(uuid, text) from anon;
grant execute on function public.servsync_respond_to_connection_request(uuid, text) to authenticated;

drop function if exists public.servsync_get_homeowner_connections();
create function public.servsync_get_homeowner_connections()
returns table (
  connection_id uuid,
  contractor_id uuid,
  business_name text,
  contact_name text,
  email text,
  phone text,
  city text,
  state text,
  status text,
  source text,
  permissions jsonb,
  shared_properties jsonb,
  request_context jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    cp.id,
    cp.business_name,
    cp.contact_name,
    cp.email,
    cp.phone,
    cp.city,
    cp.state,
    c.status,
    c.source,
    jsonb_build_object(
      'share_contact', coalesce(p.share_contact, false),
      'share_home_overview', coalesce(p.share_home_overview, false),
      'share_address', coalesce(p.share_address, false),
      'share_preferred_vendors', coalesce(p.share_preferred_vendors, false),
      'share_photos', coalesce(p.share_photos, false)
    ) as permissions,
    coalesce(shared_properties.properties, '[]'::jsonb) as shared_properties,
    case
      when ctx.connection_id is null then null
      else jsonb_build_object(
        'message', ctx.message,
        'created_at', ctx.created_at,
        'updated_at', ctx.updated_at
      )
    end as request_context,
    c.created_at,
    c.updated_at
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.connection_permissions p on p.connection_id = c.id
  left join public.connection_request_contexts ctx on ctx.connection_id = c.id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', csp.id,
        'home_id', csp.home_id,
        'nickname', h.nickname,
        'address_line1', h.address_line1,
        'address_line2', h.address_line2,
        'city', h.city,
        'state', h.state,
        'zip_code', h.zip_code,
        'share_home_overview', csp.share_home_overview,
        'share_address', csp.share_address,
        'share_preferred_vendors', csp.share_preferred_vendors,
        'share_photos', csp.share_photos,
        'updated_at', csp.updated_at
      )
      order by h.created_at asc
    ) as properties
      from public.connection_shared_properties csp
      join public.homes h on h.id = csp.home_id
     where csp.connection_id = c.id
       and h.homeowner_user_id = c.homeowner_user_id
  ) shared_properties on true
  where c.homeowner_user_id = auth.uid()
  order by c.created_at desc;
$$;

revoke execute on function public.servsync_get_homeowner_connections() from public;
revoke execute on function public.servsync_get_homeowner_connections() from anon;
grant execute on function public.servsync_get_homeowner_connections() to authenticated;

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
  homes jsonb,
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
      'share_home_overview', coalesce(shared_homes.any_home_overview, false),
      'share_address', coalesce(shared_homes.any_address, false),
      'share_preferred_vendors', coalesce(shared_homes.any_preferred_vendors, false),
      'share_photos', false
    ) as permissions,
    primary_home.home,
    coalesce(shared_homes.homes, '[]'::jsonb) as homes,
    c.created_at,
    c.updated_at,
    c.source
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = c.homeowner_user_id
  left join public.connection_permissions p on p.connection_id = c.id
  left join lateral (
    select jsonb_build_object(
      'id', h.id,
      'nickname', case when csp.share_home_overview then h.nickname else '' end,
      'address_line1', case when csp.share_address then h.address_line1 else '' end,
      'address_line2', case when csp.share_address then h.address_line2 else '' end,
      'city', case when csp.share_address then h.city else '' end,
      'state', case when csp.share_address then h.state else '' end,
      'zip_code', case when csp.share_address then h.zip_code else '' end,
      'home_type', case when csp.share_home_overview then h.home_type else '' end,
      'year_built', case when csp.share_home_overview then h.year_built else null end,
      'square_feet', case when csp.share_home_overview then h.square_feet else null end,
      'notes', case when csp.share_home_overview then h.notes else '' end,
      'share_home_overview', csp.share_home_overview,
      'share_address', csp.share_address,
      'share_preferred_vendors', csp.share_preferred_vendors,
      'share_photos', false
    ) as home
      from public.connection_shared_properties csp
      join public.homes h on h.id = csp.home_id
     where csp.connection_id = c.id
       and h.homeowner_user_id = c.homeowner_user_id
     order by h.created_at asc
     limit 1
  ) primary_home on true
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'nickname', case when csp.share_home_overview then h.nickname else '' end,
          'address_line1', case when csp.share_address then h.address_line1 else '' end,
          'address_line2', case when csp.share_address then h.address_line2 else '' end,
          'city', case when csp.share_address then h.city else '' end,
          'state', case when csp.share_address then h.state else '' end,
          'zip_code', case when csp.share_address then h.zip_code else '' end,
          'home_type', case when csp.share_home_overview then h.home_type else '' end,
          'year_built', case when csp.share_home_overview then h.year_built else null end,
          'square_feet', case when csp.share_home_overview then h.square_feet else null end,
          'notes', case when csp.share_home_overview then h.notes else '' end,
          'share_home_overview', csp.share_home_overview,
          'share_address', csp.share_address,
          'share_preferred_vendors', csp.share_preferred_vendors,
          'share_photos', false
        )
        order by h.created_at asc
      ) as homes,
      bool_or(csp.share_home_overview) as any_home_overview,
      bool_or(csp.share_address) as any_address,
      bool_or(csp.share_preferred_vendors) as any_preferred_vendors
      from public.connection_shared_properties csp
      join public.homes h on h.id = csp.home_id
     where csp.connection_id = c.id
       and h.homeowner_user_id = c.homeowner_user_id
  ) shared_homes on true
  where public.current_user_can_access_contractor(cp.id)
    and c.status = 'active'
  order by c.created_at desc;
$$;

revoke execute on function public.servsync_contractor_connected_homeowners() from public;
revoke execute on function public.servsync_contractor_connected_homeowners() from anon;
grant execute on function public.servsync_contractor_connected_homeowners() to authenticated;

drop function if exists public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, uuid
);

create or replace function public.servsync_create_field_work(
  p_homeowner_user_id    uuid  default null,
  p_home_id              uuid  default null,
  p_local_contact_id     uuid  default null,
  p_local_home_id        uuid  default null,
  p_service_request_id   uuid  default null,
  p_name                 text  default '',
  p_rooms_with_findings  jsonb default '[]'::jsonb,
  p_template_id          uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request public.service_requests;
  v_home public.homes;
  v_local_home public.contractor_local_homes;
  v_new_id uuid;
  v_home_allowed_by_request boolean := false;
begin
  select id into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if v_contractor_id is null or not public.current_user_can_write_contractor_jobs(v_contractor_id) then
    raise exception 'Contractor profile not found.';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Job name is required.';
  end if;

  if p_service_request_id is not null then
    select * into v_request
      from public.service_requests
     where id = p_service_request_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_request.id is null then
      raise exception 'Service request not found for this contractor.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_request.homeowner_user_id;
    elsif p_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception 'Job homeowner does not match the service request.';
    end if;

    if p_home_id is null then
      p_home_id := v_request.home_id;
    elsif v_request.home_id is not null and p_home_id <> v_request.home_id then
      raise exception 'Job property does not match the service request.';
    end if;

    if v_request.home_id is not null and p_home_id = v_request.home_id then
      v_home_allowed_by_request := true;
    end if;
  end if;

  if p_home_id is not null then
    select * into v_home
      from public.homes
     where id = p_home_id
     limit 1;

    if v_home.id is null then
      raise exception 'Selected property was not found.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_home.homeowner_user_id;
    elsif p_homeowner_user_id <> v_home.homeowner_user_id then
      raise exception 'Selected property does not belong to this homeowner.';
    end if;
  end if;

  if p_local_home_id is not null then
    select * into v_local_home
      from public.contractor_local_homes
     where id = p_local_home_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_local_home.id is null then
      raise exception 'Local home not found for this contractor.';
    end if;

    if p_local_contact_id is null then
      p_local_contact_id := v_local_home.local_contact_id;
    elsif p_local_contact_id <> v_local_home.local_contact_id then
      raise exception 'Local customer does not match the selected local home.';
    end if;
  end if;

  if p_homeowner_user_id is null and p_local_contact_id is null then
    raise exception 'Choose a homeowner or new customer before starting a job.';
  end if;

  if p_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = p_homeowner_user_id
       and status = 'active'
  ) then
    raise exception 'Homeowner is not connected to this contractor.';
  end if;

  if p_homeowner_user_id is not null
     and p_home_id is not null
     and not v_home_allowed_by_request
     and not exists (
       select 1
         from public.homeowner_contractor_connections c
         join public.connection_shared_properties csp on csp.connection_id = c.id
        where c.contractor_id = v_contractor_id
          and c.homeowner_user_id = p_homeowner_user_id
          and c.status = 'active'
          and csp.home_id = p_home_id
     ) then
    raise exception 'Selected property is not shared for this contractor connection.';
  end if;

  if p_local_contact_id is not null and not exists (
    select 1
      from public.contractor_local_contacts
     where id = p_local_contact_id
       and contractor_id = v_contractor_id
  ) then
    raise exception 'New customer not found for this contractor.';
  end if;

  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    template_id,
    name,
    rooms_with_findings
  ) values (
    v_contractor_id,
    p_homeowner_user_id,
    case when p_homeowner_user_id is not null then p_home_id else null end,
    p_local_contact_id,
    p_local_home_id,
    p_service_request_id,
    p_template_id,
    trim(p_name),
    coalesce(p_rooms_with_findings, '[]'::jsonb)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, uuid
) from public;
revoke execute on function public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, uuid
) from anon;
grant execute on function public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, uuid
) to authenticated;

notify pgrst, 'reload schema';

commit;
