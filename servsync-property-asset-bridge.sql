-- ServSync Property Asset Bridge v1.
--
-- Extends the canonical homeowner home_assets foundation so the same durable
-- asset identity can serve homeowner-owned homes and contractor-managed local
-- properties. The bridge is intentionally independent of Trade Pack billing,
-- capabilities, Drafts, Jobs, and visible contractor UI.

begin;

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.home_assets') is null then v_missing := array_append(v_missing, 'public.home_assets'); end if;
  if to_regclass('public.home_rooms') is null then v_missing := array_append(v_missing, 'public.home_rooms'); end if;
  if to_regclass('public.homes') is null then v_missing := array_append(v_missing, 'public.homes'); end if;
  if to_regclass('public.contractor_profiles') is null then v_missing := array_append(v_missing, 'public.contractor_profiles'); end if;
  if to_regclass('public.contractor_team_members') is null then v_missing := array_append(v_missing, 'public.contractor_team_members'); end if;
  if to_regclass('public.contractor_local_contacts') is null then v_missing := array_append(v_missing, 'public.contractor_local_contacts'); end if;
  if to_regclass('public.contractor_local_homes') is null then v_missing := array_append(v_missing, 'public.contractor_local_homes'); end if;
  if to_regclass('public.homeowner_contractor_connections') is null then v_missing := array_append(v_missing, 'public.homeowner_contractor_connections'); end if;
  if to_regclass('public.connection_shared_properties') is null then v_missing := array_append(v_missing, 'public.connection_shared_properties'); end if;
  if to_regprocedure('public.current_user_can_access_home(uuid)') is null then v_missing := array_append(v_missing, 'public.current_user_can_access_home(uuid)'); end if;
  if to_regprocedure('public.current_user_can_manage_home(uuid)') is null then v_missing := array_append(v_missing, 'public.current_user_can_manage_home(uuid)'); end if;
  if to_regprocedure('public.current_user_can_manage_contractor_customers(uuid)') is null then v_missing := array_append(v_missing, 'public.current_user_can_manage_contractor_customers(uuid)'); end if;

  if cardinality(v_missing) > 0 then
    raise exception 'Property Asset Bridge prerequisites are missing: %', array_to_string(v_missing, ', ');
  end if;

  if to_regclass('public.home_asset_revisions') is not null
     or exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'home_assets'
          and column_name = 'revision_number'
     ) then
    raise exception 'Property Asset Bridge v1 is already installed or partially present.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contractor_local_homes' and column_name = 'home_id'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contractor_local_homes' and column_name = 'claimed_at'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contractor_local_homes' and column_name = 'archived_at'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contractor_local_contacts' and column_name = 'homeowner_user_id'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contractor_local_contacts' and column_name = 'archived_at'
  ) then
    raise exception 'Property Asset Bridge requires the current local-customer claim and archive foundation.';
  end if;
end;
$$;

-- The historical foundation used ON DELETE CASCADE. Durable asset identity and
-- revision history now make property deletion explicit rather than cascading.
do $$
declare
  v_constraint_name text;
  v_constraint_count integer;
begin
  select count(*), min(constraint_record.conname)
    into v_constraint_count, v_constraint_name
    from pg_constraint constraint_record
    join pg_attribute attribute_record
      on attribute_record.attrelid = constraint_record.conrelid
     and attribute_record.attnum = any(constraint_record.conkey)
   where constraint_record.conrelid = 'public.home_assets'::regclass
     and constraint_record.contype = 'f'
     and constraint_record.confrelid = 'public.homes'::regclass
     and attribute_record.attname = 'home_id';

  if v_constraint_count <> 1 then
    raise exception 'Expected exactly one home_assets.home_id foreign key; found %.', v_constraint_count;
  end if;

  execute format('alter table public.home_assets drop constraint %I', v_constraint_name);
end;
$$;

alter table public.home_assets
  alter column home_id drop not null,
  add column local_home_id uuid,
  add column asset_kind text,
  add column location_label text,
  add column serial_identifier text,
  add column approximate_age_years smallint,
  add column customer_safe_description text,
  add column lifecycle_status text,
  add column origin_kind text,
  add column origin_contractor_id uuid,
  add column revision_number bigint;

update public.home_assets
   set asset_kind = case lower(trim(asset_category))
     when 'hvac' then 'hvac'
     when 'plumbing' then 'plumbing'
     when 'electrical' then 'electrical'
     when 'appliance' then 'appliance'
     when 'roof' then 'roof'
     when 'exterior' then 'exterior'
     when 'garage' then 'garage'
     when 'safety' then 'safety'
     else 'other'
   end,
       lifecycle_status = case when archived_at is null then 'active' else 'retired' end,
       origin_kind = 'homeowner',
       revision_number = 1;

alter table public.home_assets
  alter column asset_kind set not null,
  alter column lifecycle_status set not null,
  alter column lifecycle_status set default 'active',
  alter column origin_kind set not null,
  alter column revision_number set not null,
  alter column revision_number set default 1,
  add constraint home_assets_home_id_fkey
    foreign key (home_id) references public.homes(id) on delete restrict,
  add constraint home_assets_local_home_id_fkey
    foreign key (local_home_id) references public.contractor_local_homes(id) on delete restrict,
  add constraint home_assets_origin_contractor_id_fkey
    foreign key (origin_contractor_id) references public.contractor_profiles(id) on delete restrict,
  add constraint home_assets_property_reference_check
    check (home_id is not null or local_home_id is not null),
  add constraint home_assets_asset_kind_check
    check (asset_kind in ('hvac', 'plumbing', 'electrical', 'appliance', 'roof', 'exterior', 'garage', 'safety', 'other')),
  add constraint home_assets_location_label_length
    check (location_label is null or char_length(location_label) <= 160),
  add constraint home_assets_serial_identifier_length
    check (serial_identifier is null or char_length(serial_identifier) <= 160),
  add constraint home_assets_approximate_age_check
    check (approximate_age_years is null or approximate_age_years between 0 and 200),
  add constraint home_assets_customer_safe_description_length
    check (customer_safe_description is null or char_length(customer_safe_description) <= 2000),
  add constraint home_assets_lifecycle_check
    check (
      (lifecycle_status = 'active' and archived_at is null)
      or (lifecycle_status = 'retired' and archived_at is not null)
    ),
  add constraint home_assets_origin_check
    check (
      (origin_kind = 'homeowner' and origin_contractor_id is null)
      or (origin_kind in ('contractor_local', 'contractor_connected') and origin_contractor_id is not null)
    ),
  add constraint home_assets_revision_number_check
    check (revision_number >= 1);

create index home_assets_local_home_lifecycle_idx
  on public.home_assets(local_home_id, lifecycle_status, name, id)
  where local_home_id is not null;

create index home_assets_home_lifecycle_idx
  on public.home_assets(home_id, lifecycle_status, asset_kind, name, id)
  where home_id is not null;

create index home_assets_origin_contractor_idx
  on public.home_assets(origin_contractor_id, created_at, id)
  where origin_contractor_id is not null;

create table public.home_asset_revisions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.home_assets(id) on delete restrict,
  revision_number bigint not null,
  change_kind text not null,
  source_kind text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source_contractor_id uuid references public.contractor_profiles(id) on delete restrict,
  home_id uuid,
  local_home_id uuid,
  home_room_id uuid,
  asset_kind text not null,
  asset_category text not null,
  asset_type text,
  name text not null,
  location_label text,
  manufacturer text,
  model text,
  serial_identifier text,
  install_date date,
  approximate_age_years smallint,
  warranty_expires_on date,
  customer_safe_description text,
  notes text,
  lifecycle_status text not null,
  archived_at timestamptz,
  origin_kind text not null,
  origin_contractor_id uuid,
  asset_created_by uuid not null,
  asset_created_at timestamptz not null,
  asset_updated_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint home_asset_revisions_asset_revision_unique unique (asset_id, revision_number),
  constraint home_asset_revisions_change_kind_check
    check (change_kind in ('baseline', 'created', 'updated', 'retired', 'restored', 'claim_mapped')),
  constraint home_asset_revisions_source_kind_check
    check (source_kind in ('homeowner', 'contractor', 'system')),
  constraint home_asset_revisions_snapshot_property_check
    check (home_id is not null or local_home_id is not null),
  constraint home_asset_revisions_asset_kind_check
    check (asset_kind in ('hvac', 'plumbing', 'electrical', 'appliance', 'roof', 'exterior', 'garage', 'safety', 'other')),
  constraint home_asset_revisions_lifecycle_check
    check (lifecycle_status in ('active', 'retired'))
);

create index home_asset_revisions_asset_recorded_idx
  on public.home_asset_revisions(asset_id, revision_number desc);

create index home_asset_revisions_source_contractor_idx
  on public.home_asset_revisions(source_contractor_id, recorded_at desc, id)
  where source_contractor_id is not null;

insert into public.home_asset_revisions (
  asset_id, revision_number, change_kind, source_kind, actor_user_id,
  source_contractor_id, home_id, local_home_id, home_room_id, asset_kind,
  asset_category, asset_type, name, location_label, manufacturer, model,
  serial_identifier, install_date, approximate_age_years, warranty_expires_on,
  customer_safe_description, notes, lifecycle_status, archived_at, origin_kind,
  origin_contractor_id, asset_created_by, asset_created_at, asset_updated_at,
  recorded_at
)
select asset.id, 1, 'baseline', 'homeowner', asset.created_by,
       null, asset.home_id, null, asset.home_room_id, asset.asset_kind,
       asset.asset_category, asset.asset_type, asset.name, asset.location_label,
       asset.manufacturer, asset.model, asset.serial_identifier,
       asset.install_date, asset.approximate_age_years,
       asset.warranty_expires_on, asset.customer_safe_description, asset.notes,
       asset.lifecycle_status, asset.archived_at, asset.origin_kind,
       asset.origin_contractor_id, asset.created_by, asset.created_at,
       asset.updated_at, asset.updated_at
  from public.home_assets asset;

create or replace function public.servsync_private_property_asset_category(p_asset_kind text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select case p_asset_kind
    when 'hvac' then 'HVAC'
    when 'plumbing' then 'Plumbing'
    when 'electrical' then 'Electrical'
    when 'appliance' then 'Appliance'
    when 'roof' then 'Roof'
    when 'exterior' then 'Exterior'
    when 'garage' then 'Garage'
    when 'safety' then 'Safety'
    when 'other' then 'Other'
    else null
  end;
$$;

create or replace function public.servsync_private_property_asset_optional_text(
  p_value text,
  p_max_length integer,
  p_field_name text,
  p_allow_newlines boolean default false
)
returns text
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  v_value text := nullif(btrim(p_value), '');
begin
  if v_value is null then
    return null;
  end if;
  if char_length(v_value) > p_max_length then
    raise exception '% is too long.', p_field_name;
  end if;
  if (not p_allow_newlines and v_value ~ '[[:cntrl:]]')
     or (p_allow_newlines and replace(replace(v_value, chr(10), ''), chr(13), '') ~ '[[:cntrl:]]') then
    raise exception '% contains unsupported control characters.', p_field_name;
  end if;
  return v_value;
end;
$$;

create or replace function public.servsync_private_can_read_property_assets(
  p_home_id uuid,
  p_local_home_id uuid,
  p_contractor_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or (p_home_id is null) = (p_local_home_id is null) then
    return false;
  end if;

  if p_home_id is not null then
    if p_contractor_id is null then
      return public.current_user_can_access_home(p_home_id);
    end if;
    return exists (
      select 1
        from public.homes home
        join public.homeowner_contractor_connections connection
          on connection.homeowner_user_id = home.homeowner_user_id
         and connection.contractor_id = p_contractor_id
         and connection.status = 'active'
        join public.connection_shared_properties shared
          on shared.connection_id = connection.id
         and shared.home_id = home.id
         and shared.share_home_overview = true
        join public.contractor_profiles contractor
          on contractor.id = connection.contractor_id
         and contractor.account_status = 'active'
       where home.id = p_home_id
         and public.current_user_can_access_contractor(p_contractor_id)
    );
  end if;

  return exists (
    select 1
      from public.contractor_local_homes local_home
      join public.contractor_local_contacts contact
        on contact.id = local_home.local_contact_id
       and contact.contractor_id = local_home.contractor_id
      join public.contractor_profiles contractor
        on contractor.id = local_home.contractor_id
       and contractor.account_status = 'active'
     where local_home.id = p_local_home_id
       and local_home.contractor_id = p_contractor_id
       and local_home.home_id is null
       and local_home.claimed_at is null
       and local_home.archived_at is null
       and contact.homeowner_user_id is null
       and contact.claimed_at is null
       and contact.archived_at is null
       and (
         contractor.owner_user_id = auth.uid()
         or exists (
           select 1
             from public.contractor_team_members member
            where member.contractor_id = contractor.id
              and member.user_id = auth.uid()
              and member.status = 'active'
              and member.role in ('admin', 'office', 'field_tech')
         )
       )
  );
end;
$$;

create or replace function public.servsync_private_can_manage_property_assets(
  p_home_id uuid,
  p_local_home_id uuid,
  p_contractor_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or (p_home_id is null) = (p_local_home_id is null) then
    return false;
  end if;

  if p_home_id is not null then
    if p_contractor_id is null then
      return public.current_user_can_manage_home(p_home_id);
    end if;
    return public.servsync_private_can_read_property_assets(p_home_id, null, p_contractor_id)
      and public.current_user_can_manage_contractor_customers(p_contractor_id);
  end if;

  return public.servsync_private_can_read_property_assets(null, p_local_home_id, p_contractor_id)
    and public.current_user_can_manage_contractor_customers(p_contractor_id);
end;
$$;

create or replace function public.servsync_private_validate_property_asset_target(
  p_home_id uuid,
  p_local_home_id uuid,
  p_home_room_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_local_home_id uuid;
begin
  if (p_home_id is null) = (p_local_home_id is null) then
    raise exception 'Choose exactly one property identity.';
  end if;

  if p_local_home_id is not null and p_home_room_id is not null then
    raise exception 'Contractor-local assets cannot use homeowner room identifiers before claim.';
  end if;

  if p_home_room_id is not null and not exists (
    select 1 from public.home_rooms room
     where room.id = p_home_room_id and room.home_id = p_home_id
  ) then
    raise exception 'Home asset room must belong to the same home as the asset.';
  end if;

  if p_local_home_id is not null then
    select local_home.id into v_local_home_id
      from public.contractor_local_homes local_home
     where local_home.id = p_local_home_id;
    if v_local_home_id is null then
      raise exception 'Property is unavailable.';
    end if;
  end if;
end;
$$;

create or replace function public.home_assets_validate_home_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_home_id uuid;
  v_mapped_home_id uuid;
begin
  if new.home_id is null and new.local_home_id is null then
    raise exception 'A property asset requires a canonical or contractor-local property.';
  end if;

  if new.local_home_id is not null then
    select local_home.home_id into v_mapped_home_id
      from public.contractor_local_homes local_home
     where local_home.id = new.local_home_id;
    if not found then
      raise exception 'Contractor-local property not found.';
    end if;
    if new.home_id is not null and v_mapped_home_id is distinct from new.home_id then
      raise exception 'Mapped property identity does not match the canonical home.';
    end if;
  end if;

  if new.home_room_id is null then
    return new;
  end if;
  if new.home_id is null then
    raise exception 'A room link requires a canonical home.';
  end if;

  select room.home_id into v_room_home_id
    from public.home_rooms room
   where room.id = new.home_room_id;
  if v_room_home_id is null then
    raise exception 'Home room not found.';
  end if;
  if v_room_home_id is distinct from new.home_id then
    raise exception 'Home asset room must belong to the same home as the asset.';
  end if;
  return new;
end;
$$;

create or replace function public.home_assets_protect_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change_kind text := current_setting('servsync.property_asset_change_kind', true);
  v_source_kind text := current_setting('servsync.property_asset_source_kind', true);
  v_mapped_home_id uuid;
begin
  if v_change_kind not in ('updated', 'retired', 'restored', 'claim_mapped')
     or v_source_kind not in ('homeowner', 'contractor', 'system') then
    raise exception 'Property assets may be changed only through the controlled mutation boundary.';
  end if;
  if new.id is distinct from old.id
     or new.local_home_id is distinct from old.local_home_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.origin_kind is distinct from old.origin_kind
     or new.origin_contractor_id is distinct from old.origin_contractor_id then
    raise exception 'Property asset identity and origin cannot be changed.';
  end if;
  if new.revision_number <> old.revision_number + 1 then
    raise exception 'Property asset revision must advance exactly once.';
  end if;
  if new.home_id is distinct from old.home_id then
    if v_change_kind <> 'claim_mapped' or old.home_id is not null or new.home_id is null or old.local_home_id is null then
      raise exception 'Property asset cannot be moved to another property.';
    end if;
    select local_home.home_id into v_mapped_home_id
      from public.contractor_local_homes local_home
     where local_home.id = old.local_home_id;
    if v_mapped_home_id is distinct from new.home_id then
      raise exception 'Claim mapping does not match the contractor-local property.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.servsync_private_guard_property_asset_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('servsync.property_asset_change_kind', true) <> 'created'
     or current_setting('servsync.property_asset_source_kind', true) not in ('homeowner', 'contractor')
     or new.revision_number <> 1 then
    raise exception 'Property assets may be created only through the controlled mutation boundary.';
  end if;
  return new;
end;
$$;

create or replace function public.servsync_private_record_property_asset_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_contractor_id uuid := nullif(current_setting('servsync.property_asset_source_contractor_id', true), '')::uuid;
begin
  insert into public.home_asset_revisions (
    asset_id, revision_number, change_kind, source_kind, actor_user_id,
    source_contractor_id, home_id, local_home_id, home_room_id, asset_kind,
    asset_category, asset_type, name, location_label, manufacturer, model,
    serial_identifier, install_date, approximate_age_years, warranty_expires_on,
    customer_safe_description, notes, lifecycle_status, archived_at, origin_kind,
    origin_contractor_id, asset_created_by, asset_created_at, asset_updated_at
  ) values (
    new.id, new.revision_number,
    current_setting('servsync.property_asset_change_kind', true),
    current_setting('servsync.property_asset_source_kind', true),
    auth.uid(), v_source_contractor_id, new.home_id, new.local_home_id,
    new.home_room_id, new.asset_kind, new.asset_category, new.asset_type,
    new.name, new.location_label, new.manufacturer, new.model,
    new.serial_identifier, new.install_date, new.approximate_age_years,
    new.warranty_expires_on, new.customer_safe_description, new.notes,
    new.lifecycle_status, new.archived_at, new.origin_kind,
    new.origin_contractor_id, new.created_by, new.created_at, new.updated_at
  );
  return new;
end;
$$;

create or replace function public.servsync_private_guard_property_asset_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     and pg_trigger_depth() > 1
     and current_setting('servsync.property_asset_change_kind', true) in ('created', 'updated', 'retired', 'restored', 'claim_mapped')
     and current_setting('servsync.property_asset_source_kind', true) in ('homeowner', 'contractor', 'system') then
    return new;
  end if;
  raise exception 'Property asset revisions are immutable.';
end;
$$;

drop trigger if exists home_assets_validate_home_room_trigger on public.home_assets;
create trigger home_assets_validate_home_room_trigger
  before insert or update of home_id, local_home_id, home_room_id on public.home_assets
  for each row execute function public.home_assets_validate_home_room();

drop trigger if exists home_assets_protect_identity_trigger on public.home_assets;
create trigger home_assets_protect_identity_trigger
  before update on public.home_assets
  for each row execute function public.home_assets_protect_identity();

create trigger home_assets_guard_insert_trigger
  before insert on public.home_assets
  for each row execute function public.servsync_private_guard_property_asset_insert();

create trigger home_assets_record_revision_trigger
  after insert or update on public.home_assets
  for each row execute function public.servsync_private_record_property_asset_revision();

create trigger home_asset_revisions_immutable_trigger
  before insert or update or delete on public.home_asset_revisions
  for each row execute function public.servsync_private_guard_property_asset_revision();

create or replace function public.servsync_private_map_claimed_property_assets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.home_id is null and new.home_id is not null then
    perform set_config('servsync.property_asset_change_kind', 'claim_mapped', true);
    perform set_config('servsync.property_asset_source_kind', 'system', true);
    perform set_config('servsync.property_asset_source_contractor_id', new.contractor_id::text, true);
    update public.home_assets asset
       set home_id = new.home_id,
           revision_number = asset.revision_number + 1,
           updated_at = now()
     where asset.local_home_id = new.id
       and asset.home_id is null;
  end if;
  return new;
end;
$$;

create trigger contractor_local_homes_map_property_assets_trigger
  after update of home_id on public.contractor_local_homes
  for each row
  when (old.home_id is null and new.home_id is not null)
  execute function public.servsync_private_map_claimed_property_assets();

create or replace function public.servsync_list_property_assets(
  p_home_id uuid default null,
  p_local_home_id uuid default null,
  p_contractor_id uuid default null,
  p_include_retired boolean default false
)
returns table (
  id uuid,
  home_id uuid,
  local_home_id uuid,
  home_room_id uuid,
  asset_kind text,
  asset_category text,
  asset_type text,
  name text,
  location_label text,
  manufacturer text,
  model text,
  serial_identifier text,
  install_date date,
  approximate_age_years smallint,
  warranty_expires_on date,
  customer_safe_description text,
  notes text,
  lifecycle_status text,
  archived_at timestamptz,
  revision_number bigint,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_show_private_notes boolean := false;
begin
  if not public.servsync_private_can_read_property_assets(p_home_id, p_local_home_id, p_contractor_id) then
    raise exception 'Property assets are unavailable.';
  end if;
  v_show_private_notes := p_home_id is not null
    and p_contractor_id is null
    and public.current_user_can_manage_home(p_home_id);

  return query
  select asset.id, asset.home_id, asset.local_home_id, asset.home_room_id,
         asset.asset_kind, asset.asset_category, asset.asset_type, asset.name,
         asset.location_label, asset.manufacturer, asset.model,
         asset.serial_identifier, asset.install_date,
         asset.approximate_age_years, asset.warranty_expires_on,
         asset.customer_safe_description,
         case when v_show_private_notes then asset.notes else null end,
         asset.lifecycle_status, asset.archived_at, asset.revision_number,
         asset.created_by, asset.created_at, asset.updated_at
    from public.home_assets asset
   where (
     (p_home_id is not null and asset.home_id = p_home_id)
     or (p_local_home_id is not null and asset.local_home_id = p_local_home_id and asset.home_id is null)
   )
     and (p_include_retired or asset.lifecycle_status = 'active')
   order by asset.asset_category, asset.name, asset.id;
end;
$$;

create or replace function public.servsync_create_property_asset(
  p_home_id uuid default null,
  p_local_home_id uuid default null,
  p_contractor_id uuid default null,
  p_home_room_id uuid default null,
  p_asset_kind text default null,
  p_asset_type text default null,
  p_name text default null,
  p_location_label text default null,
  p_manufacturer text default null,
  p_model text default null,
  p_serial_identifier text default null,
  p_install_date date default null,
  p_approximate_age_years smallint default null,
  p_warranty_expires_on date default null,
  p_customer_safe_description text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.home_assets;
  v_asset_kind text := lower(btrim(coalesce(p_asset_kind, '')));
  v_asset_category text;
  v_name text;
  v_source_kind text;
  v_origin_kind text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.servsync_private_can_manage_property_assets(p_home_id, p_local_home_id, p_contractor_id) then
    raise exception 'Property asset management is unavailable.';
  end if;
  perform public.servsync_private_validate_property_asset_target(p_home_id, p_local_home_id, p_home_room_id);
  v_asset_category := public.servsync_private_property_asset_category(v_asset_kind);
  if v_asset_category is null then raise exception 'Unknown property asset kind.'; end if;
  v_name := public.servsync_private_property_asset_optional_text(p_name, 160, 'Asset name');
  if v_name is null then raise exception 'Asset name is required.'; end if;
  if p_install_date is not null and p_install_date < date '1800-01-01' then raise exception 'Install date is invalid.'; end if;
  if p_warranty_expires_on is not null and p_warranty_expires_on < date '1800-01-01' then raise exception 'Warranty date is invalid.'; end if;
  if p_approximate_age_years is not null and p_approximate_age_years not between 0 and 200 then raise exception 'Approximate age is invalid.'; end if;
  if p_contractor_id is not null and nullif(btrim(coalesce(p_notes, '')), '') is not null then
    raise exception 'Contractors cannot write homeowner-private asset notes.';
  end if;

  v_source_kind := case when p_contractor_id is null then 'homeowner' else 'contractor' end;
  v_origin_kind := case
    when p_contractor_id is null then 'homeowner'
    when p_local_home_id is not null then 'contractor_local'
    else 'contractor_connected'
  end;
  perform set_config('servsync.property_asset_change_kind', 'created', true);
  perform set_config('servsync.property_asset_source_kind', v_source_kind, true);
  perform set_config('servsync.property_asset_source_contractor_id', coalesce(p_contractor_id::text, ''), true);

  insert into public.home_assets (
    home_id, local_home_id, home_room_id, asset_kind, asset_category,
    asset_type, name, location_label, manufacturer, model, serial_identifier,
    install_date, approximate_age_years, warranty_expires_on,
    customer_safe_description, notes, lifecycle_status, archived_at,
    origin_kind, origin_contractor_id, revision_number, created_by
  ) values (
    p_home_id, p_local_home_id, p_home_room_id, v_asset_kind, v_asset_category,
    public.servsync_private_property_asset_optional_text(p_asset_type, 120, 'Asset type'),
    v_name,
    public.servsync_private_property_asset_optional_text(p_location_label, 160, 'Location'),
    public.servsync_private_property_asset_optional_text(p_manufacturer, 120, 'Manufacturer'),
    public.servsync_private_property_asset_optional_text(p_model, 120, 'Model'),
    public.servsync_private_property_asset_optional_text(p_serial_identifier, 160, 'Serial identifier'),
    p_install_date, p_approximate_age_years, p_warranty_expires_on,
    public.servsync_private_property_asset_optional_text(p_customer_safe_description, 2000, 'Customer-safe description', true),
    case when p_contractor_id is null then public.servsync_private_property_asset_optional_text(p_notes, 4000, 'Notes', true) else null end,
    'active', null, v_origin_kind, p_contractor_id, 1, auth.uid()
  ) returning * into v_asset;

  return to_jsonb(v_asset) - 'notes' || jsonb_build_object('notes', case when p_contractor_id is null then v_asset.notes else null end);
end;
$$;

create or replace function public.servsync_update_property_asset(
  p_asset_id uuid,
  p_expected_revision bigint,
  p_contractor_id uuid default null,
  p_home_room_id uuid default null,
  p_asset_kind text default null,
  p_asset_type text default null,
  p_name text default null,
  p_location_label text default null,
  p_manufacturer text default null,
  p_model text default null,
  p_serial_identifier text default null,
  p_install_date date default null,
  p_approximate_age_years smallint default null,
  p_warranty_expires_on date default null,
  p_customer_safe_description text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.home_assets;
  v_updated public.home_assets;
  v_asset_kind text := lower(btrim(coalesce(p_asset_kind, '')));
  v_asset_category text;
  v_name text;
  v_source_kind text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  select asset.* into v_asset from public.home_assets asset where asset.id = p_asset_id for update;
  if v_asset.id is null then raise exception 'Property asset is unavailable.'; end if;
  if v_asset.revision_number <> p_expected_revision then raise exception 'Property asset has changed. Reload before saving.'; end if;
  if v_asset.lifecycle_status <> 'active' then raise exception 'Retired property assets must be restored before editing.'; end if;
  if not public.servsync_private_can_manage_property_assets(
    v_asset.home_id,
    case when v_asset.home_id is null then v_asset.local_home_id else null end,
    p_contractor_id
  ) then raise exception 'Property asset management is unavailable.'; end if;
  perform public.servsync_private_validate_property_asset_target(
    v_asset.home_id,
    case when v_asset.home_id is null then v_asset.local_home_id else null end,
    p_home_room_id
  );
  v_asset_category := public.servsync_private_property_asset_category(v_asset_kind);
  if v_asset_category is null then raise exception 'Unknown property asset kind.'; end if;
  v_name := public.servsync_private_property_asset_optional_text(p_name, 160, 'Asset name');
  if v_name is null then raise exception 'Asset name is required.'; end if;
  if p_install_date is not null and p_install_date < date '1800-01-01' then raise exception 'Install date is invalid.'; end if;
  if p_warranty_expires_on is not null and p_warranty_expires_on < date '1800-01-01' then raise exception 'Warranty date is invalid.'; end if;
  if p_approximate_age_years is not null and p_approximate_age_years not between 0 and 200 then raise exception 'Approximate age is invalid.'; end if;
  if p_contractor_id is not null and nullif(btrim(coalesce(p_notes, '')), '') is not null then
    raise exception 'Contractors cannot write homeowner-private asset notes.';
  end if;

  v_source_kind := case when p_contractor_id is null then 'homeowner' else 'contractor' end;
  perform set_config('servsync.property_asset_change_kind', 'updated', true);
  perform set_config('servsync.property_asset_source_kind', v_source_kind, true);
  perform set_config('servsync.property_asset_source_contractor_id', coalesce(p_contractor_id::text, ''), true);

  update public.home_assets asset
     set home_room_id = p_home_room_id,
         asset_kind = v_asset_kind,
         asset_category = v_asset_category,
         asset_type = public.servsync_private_property_asset_optional_text(p_asset_type, 120, 'Asset type'),
         name = v_name,
         location_label = public.servsync_private_property_asset_optional_text(p_location_label, 160, 'Location'),
         manufacturer = public.servsync_private_property_asset_optional_text(p_manufacturer, 120, 'Manufacturer'),
         model = public.servsync_private_property_asset_optional_text(p_model, 120, 'Model'),
         serial_identifier = public.servsync_private_property_asset_optional_text(p_serial_identifier, 160, 'Serial identifier'),
         install_date = p_install_date,
         approximate_age_years = p_approximate_age_years,
         warranty_expires_on = p_warranty_expires_on,
         customer_safe_description = public.servsync_private_property_asset_optional_text(p_customer_safe_description, 2000, 'Customer-safe description', true),
         notes = case when p_contractor_id is null then public.servsync_private_property_asset_optional_text(p_notes, 4000, 'Notes', true) else asset.notes end,
         revision_number = asset.revision_number + 1,
         updated_at = now()
   where asset.id = p_asset_id
   returning * into v_updated;

  return to_jsonb(v_updated) - 'notes' || jsonb_build_object('notes', case when p_contractor_id is null then v_updated.notes else null end);
end;
$$;

create or replace function public.servsync_set_property_asset_lifecycle(
  p_asset_id uuid,
  p_expected_revision bigint,
  p_lifecycle_status text,
  p_contractor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.home_assets;
  v_updated public.home_assets;
  v_target text := lower(btrim(coalesce(p_lifecycle_status, '')));
  v_change_kind text;
  v_source_kind text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if v_target not in ('active', 'retired') then raise exception 'Unsupported property asset lifecycle state.'; end if;
  select asset.* into v_asset from public.home_assets asset where asset.id = p_asset_id for update;
  if v_asset.id is null then raise exception 'Property asset is unavailable.'; end if;
  if v_asset.revision_number <> p_expected_revision then raise exception 'Property asset has changed. Reload before saving.'; end if;
  if not public.servsync_private_can_manage_property_assets(
    v_asset.home_id,
    case when v_asset.home_id is null then v_asset.local_home_id else null end,
    p_contractor_id
  ) then raise exception 'Property asset management is unavailable.'; end if;
  if v_asset.lifecycle_status = v_target then return to_jsonb(v_asset) - 'notes'; end if;

  v_change_kind := case when v_target = 'retired' then 'retired' else 'restored' end;
  v_source_kind := case when p_contractor_id is null then 'homeowner' else 'contractor' end;
  perform set_config('servsync.property_asset_change_kind', v_change_kind, true);
  perform set_config('servsync.property_asset_source_kind', v_source_kind, true);
  perform set_config('servsync.property_asset_source_contractor_id', coalesce(p_contractor_id::text, ''), true);

  update public.home_assets asset
     set lifecycle_status = v_target,
         archived_at = case when v_target = 'retired' then now() else null end,
         revision_number = asset.revision_number + 1,
         updated_at = now()
   where asset.id = p_asset_id
   returning * into v_updated;
  return to_jsonb(v_updated) - 'notes' || jsonb_build_object('notes', case when p_contractor_id is null then v_updated.notes else null end);
end;
$$;

create or replace function public.servsync_list_property_asset_revisions(
  p_asset_id uuid,
  p_contractor_id uuid default null
)
returns table (
  revision_number bigint,
  change_kind text,
  source_kind text,
  source_contractor_id uuid,
  source_business_name text,
  asset_kind text,
  asset_category text,
  asset_type text,
  name text,
  location_label text,
  manufacturer text,
  model text,
  serial_identifier text,
  install_date date,
  approximate_age_years smallint,
  warranty_expires_on date,
  customer_safe_description text,
  notes text,
  lifecycle_status text,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_asset public.home_assets;
  v_homeowner_context boolean;
  v_show_private_notes boolean;
begin
  select asset.* into v_asset from public.home_assets asset where asset.id = p_asset_id;
  if v_asset.id is null then raise exception 'Property asset is unavailable.'; end if;
  if not public.servsync_private_can_read_property_assets(
    v_asset.home_id,
    case when v_asset.home_id is null then v_asset.local_home_id else null end,
    p_contractor_id
  ) then raise exception 'Property asset history is unavailable.'; end if;
  v_homeowner_context := p_contractor_id is null and v_asset.home_id is not null;
  v_show_private_notes := v_homeowner_context and public.current_user_can_manage_home(v_asset.home_id);

  return query
  select revision.revision_number, revision.change_kind, revision.source_kind,
         case when v_homeowner_context or revision.source_contractor_id = p_contractor_id then revision.source_contractor_id else null end,
         case when v_homeowner_context or revision.source_contractor_id = p_contractor_id then contractor.business_name else null end,
         revision.asset_kind, revision.asset_category, revision.asset_type,
         revision.name, revision.location_label, revision.manufacturer,
         revision.model, revision.serial_identifier, revision.install_date,
         revision.approximate_age_years, revision.warranty_expires_on,
         revision.customer_safe_description,
         case when v_show_private_notes then revision.notes else null end,
         revision.lifecycle_status, revision.recorded_at
    from public.home_asset_revisions revision
    left join public.contractor_profiles contractor on contractor.id = revision.source_contractor_id
   where revision.asset_id = p_asset_id
   order by revision.revision_number desc;
end;
$$;

-- Direct browser table access is replaced by the narrow RPC boundary. The
-- private revision table has no browser policies or grants.
drop policy if exists "Home assets: owner admin read" on public.home_assets;
drop policy if exists "Home assets: active shared roles read" on public.home_assets;
drop policy if exists "Home assets: owner admin inserts" on public.home_assets;
drop policy if exists "Home assets: owner admin updates" on public.home_assets;

alter table public.home_assets enable row level security;
alter table public.home_assets force row level security;
alter table public.home_asset_revisions enable row level security;
alter table public.home_asset_revisions force row level security;

revoke all on table public.home_assets from public, anon, authenticated, service_role;
revoke all on table public.home_asset_revisions from public, anon, authenticated, service_role;
grant all privileges on table public.home_assets to service_role;
grant all privileges on table public.home_asset_revisions to service_role;

revoke all on function public.servsync_private_property_asset_category(text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_property_asset_optional_text(text, integer, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_can_read_property_assets(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_can_manage_property_assets(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_validate_property_asset_target(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_property_asset_insert() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_record_property_asset_revision() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_property_asset_revision() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_map_claimed_property_assets() from public, anon, authenticated, service_role;
revoke all on function public.home_assets_validate_home_room() from public, anon, authenticated, service_role;
revoke all on function public.home_assets_protect_identity() from public, anon, authenticated, service_role;
grant execute on function public.home_assets_validate_home_room() to service_role;
grant execute on function public.home_assets_protect_identity() to service_role;

revoke all on function public.servsync_list_property_assets(uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.servsync_create_property_asset(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_update_property_asset(uuid, bigint, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_set_property_asset_lifecycle(uuid, bigint, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_property_asset_revisions(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.servsync_list_property_assets(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.servsync_create_property_asset(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) to authenticated;
grant execute on function public.servsync_update_property_asset(uuid, bigint, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) to authenticated;
grant execute on function public.servsync_set_property_asset_lifecycle(uuid, bigint, text, uuid) to authenticated;
grant execute on function public.servsync_list_property_asset_revisions(uuid, uuid) to authenticated;

alter table public.home_assets owner to postgres;
alter table public.home_asset_revisions owner to postgres;
alter function public.servsync_private_property_asset_category(text) owner to postgres;
alter function public.servsync_private_property_asset_optional_text(text, integer, text, boolean) owner to postgres;
alter function public.servsync_private_can_read_property_assets(uuid, uuid, uuid) owner to postgres;
alter function public.servsync_private_can_manage_property_assets(uuid, uuid, uuid) owner to postgres;
alter function public.servsync_private_validate_property_asset_target(uuid, uuid, uuid) owner to postgres;
alter function public.home_assets_validate_home_room() owner to postgres;
alter function public.home_assets_protect_identity() owner to postgres;
alter function public.servsync_private_guard_property_asset_insert() owner to postgres;
alter function public.servsync_private_record_property_asset_revision() owner to postgres;
alter function public.servsync_private_guard_property_asset_revision() owner to postgres;
alter function public.servsync_private_map_claimed_property_assets() owner to postgres;
alter function public.servsync_list_property_assets(uuid, uuid, uuid, boolean) owner to postgres;
alter function public.servsync_create_property_asset(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) owner to postgres;
alter function public.servsync_update_property_asset(uuid, bigint, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) owner to postgres;
alter function public.servsync_set_property_asset_lifecycle(uuid, bigint, text, uuid) owner to postgres;
alter function public.servsync_list_property_asset_revisions(uuid, uuid) owner to postgres;

comment on table public.home_asset_revisions is
  'Append-only full snapshots for every Property Asset mutation. Browser roles have no direct access; controlled history RPCs redact homeowner-private notes and other-contractor provenance.';
comment on column public.home_assets.local_home_id is
  'Stable contractor-local property identity. Claim mapping retains this reference and adds canonical home_id without replacing the asset id.';
comment on column public.home_assets.asset_kind is
  'Strict generic schema discriminator. Human asset_type remains a customer-safe label rather than an extensible schema contract.';
comment on column public.home_assets.notes is
  'Homeowner-manager-private notes. Contractor mutations cannot set or replace this field, and contractor/member/viewer reads redact it.';
comment on column public.home_assets.revision_number is
  'Optimistic concurrency token. Controlled updates require the exact current revision and advance it once.';
comment on function public.servsync_list_property_assets(uuid, uuid, uuid, boolean) is
  'Lists customer-safe Property Asset data for an authorized home or contractor-local property. Homeowner-private notes are visible only to home owner/admin roles.';
comment on function public.servsync_create_property_asset(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) is
  'Creates one generic Property Asset through exact homeowner or contractor property authority. No Trade Pack capability or billing identifier participates.';
comment on function public.servsync_update_property_asset(uuid, bigint, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text) is
  'Updates an active Property Asset only at the caller-supplied current revision. Contractor writes remain Owner/Admin/Office and cannot change homeowner-private notes.';

notify pgrst, 'reload schema';

commit;
