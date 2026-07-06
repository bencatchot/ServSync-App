-- ServSync Home Assets foundation.
-- Adds durable homeowner-owned asset/system records for future Rooms & Systems
-- and simple not-to-scale Home Map work.
-- This patch does not add UI, contractor visibility, shared member/viewer
-- browsing, key locations, access-code fields, map layout metadata, storage
-- behavior, or migration/backfill from existing workflow records.

begin;

create extension if not exists pgcrypto;

create table if not exists public.home_assets (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  home_room_id uuid references public.home_rooms(id) on delete set null,
  asset_category text not null,
  asset_type text,
  name text not null,
  manufacturer text,
  model text,
  install_date date,
  warranty_expires_on date,
  notes text,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_assets_name_not_blank
    check (length(trim(name)) > 0),
  constraint home_assets_asset_category_not_blank
    check (length(trim(asset_category)) > 0),
  constraint home_assets_name_length
    check (char_length(name) <= 160),
  constraint home_assets_asset_category_length
    check (char_length(asset_category) <= 80),
  constraint home_assets_asset_type_length
    check (asset_type is null or char_length(asset_type) <= 120),
  constraint home_assets_manufacturer_length
    check (manufacturer is null or char_length(manufacturer) <= 120),
  constraint home_assets_model_length
    check (model is null or char_length(model) <= 120),
  constraint home_assets_notes_length
    check (notes is null or char_length(notes) <= 4000),
  constraint home_assets_install_date_sane
    check (install_date is null or install_date >= date '1800-01-01'),
  constraint home_assets_warranty_date_sane
    check (warranty_expires_on is null or warranty_expires_on >= date '1800-01-01')
);

comment on table public.home_assets is
  'Durable homeowner-owned asset/system records. Assets are structured home basics for future Rooms & Systems and Home Map work; key locations, sensitive access data, contractor visibility, and map layout metadata are future separately approved work.';

comment on column public.home_assets.home_id is
  'Homeowner-owned homes.id for the property this asset belongs to.';

comment on column public.home_assets.home_room_id is
  'Optional home_rooms.id link for room-scoped organization. Null is allowed; same-home validation prevents cross-home links. Archived rooms may remain linked for historical continuity.';

comment on column public.home_assets.asset_category is
  'Required broad category such as HVAC, plumbing, electrical, appliance, exterior, roof, or other. Not a key-location or access-code category.';

comment on column public.home_assets.asset_type is
  'Optional lightweight asset/system type such as furnace, water heater, electrical panel, refrigerator, roof, sump pump, or garage door opener.';

comment on column public.home_assets.name is
  'Human-readable asset name. Required, trimmed non-empty, and intentionally not a place for sensitive access details.';

comment on column public.home_assets.manufacturer is
  'Optional manufacturer or brand. Serial numbers are intentionally out of scope for v1.';

comment on column public.home_assets.model is
  'Optional model name or model number. Serial numbers are intentionally out of scope for v1.';

comment on column public.home_assets.install_date is
  'Optional installation date when known.';

comment on column public.home_assets.warranty_expires_on is
  'Optional warranty expiration date when known.';

comment on column public.home_assets.notes is
  'Optional general asset notes. Sensitive access details, lockbox/gate/alarm information, hidden-key details, shutoff instructions, and key-location data are intentionally out of scope.';

comment on column public.home_assets.archived_at is
  'Soft-archive timestamp. Normal browser users do not receive a hard-delete policy.';

create index if not exists home_assets_home_archived_idx
  on public.home_assets(home_id, archived_at);

create index if not exists home_assets_home_room_archived_idx
  on public.home_assets(home_id, home_room_id, archived_at);

create index if not exists home_assets_home_category_archived_idx
  on public.home_assets(home_id, asset_category, archived_at);

create index if not exists home_assets_created_by_idx
  on public.home_assets(created_by);

drop trigger if exists home_assets_touch_updated_at on public.home_assets;
create trigger home_assets_touch_updated_at
  before update on public.home_assets
  for each row execute function public.touch_updated_at();

create or replace function public.home_assets_validate_home_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_home_id uuid;
begin
  if new.home_room_id is null then
    return new;
  end if;

  select hr.home_id
    into v_room_home_id
    from public.home_rooms hr
   where hr.id = new.home_room_id;

  if v_room_home_id is null then
    raise exception 'Home room not found.';
  end if;

  if v_room_home_id is distinct from new.home_id then
    raise exception 'Home asset room must belong to the same home as the asset.';
  end if;

  return new;
end;
$$;

comment on function public.home_assets_validate_home_room() is
  'Validates optional home_assets.home_room_id links so assets cannot point at rooms from another home. Allows null room links and does not require active rooms so archived room links can remain for historical continuity.';

revoke all on function public.home_assets_validate_home_room() from public;
revoke all on function public.home_assets_validate_home_room() from anon;
revoke all on function public.home_assets_validate_home_room() from authenticated;

drop trigger if exists home_assets_validate_home_room_trigger
  on public.home_assets;
create trigger home_assets_validate_home_room_trigger
  before insert or update of home_id, home_room_id on public.home_assets
  for each row execute function public.home_assets_validate_home_room();

create or replace function public.home_assets_protect_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'Home asset id cannot be changed.';
  end if;

  if new.home_id <> old.home_id then
    raise exception 'Home asset cannot be moved to another home.';
  end if;

  if new.created_by <> old.created_by then
    raise exception 'Home asset creator cannot be changed.';
  end if;

  return new;
end;
$$;

comment on function public.home_assets_protect_identity() is
  'Protects immutable home_assets identity fields after creation.';

revoke all on function public.home_assets_protect_identity() from public;
revoke all on function public.home_assets_protect_identity() from anon;
revoke all on function public.home_assets_protect_identity() from authenticated;

drop trigger if exists home_assets_protect_identity_trigger
  on public.home_assets;
create trigger home_assets_protect_identity_trigger
  before update on public.home_assets
  for each row execute function public.home_assets_protect_identity();

alter table public.home_assets enable row level security;

drop policy if exists "Home assets: owner admin read" on public.home_assets;
create policy "Home assets: owner admin read"
  on public.home_assets for select to authenticated
  using (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Home assets: owner admin inserts" on public.home_assets;
create policy "Home assets: owner admin inserts"
  on public.home_assets for insert to authenticated
  with check (
    (
      public.current_user_can_manage_home(home_id)
      and created_by = auth.uid()
    )
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Home assets: owner admin updates" on public.home_assets;
create policy "Home assets: owner admin updates"
  on public.home_assets for update to authenticated
  using (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  )
  with check (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  );

revoke all on table public.home_assets from public;
revoke all on table public.home_assets from anon;
revoke all on table public.home_assets from authenticated;
grant select, insert, update on table public.home_assets to authenticated;

notify pgrst, 'reload schema';

commit;
