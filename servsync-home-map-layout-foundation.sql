-- ServSync Home Map v1 / Rooms & Systems v1 foundation.
-- Adds simple not-to-scale room layout rectangles and keeps asset RLS
-- manager-only so member/viewer shared-home roles cannot query asset notes.
-- This patch does not add contractor visibility, key locations, storage/media
-- behavior, CAD/floor-plan/LiDAR/scanning/3D, workflow links, or migrations.

begin;

create extension if not exists pgcrypto;

create table if not exists public.home_room_layouts (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  home_room_id uuid not null references public.home_rooms(id) on delete cascade,
  floor_label text,
  layout_x integer not null default 0,
  layout_y integer not null default 0,
  layout_width integer not null default 4,
  layout_height integer not null default 3,
  measured_width numeric(8,2),
  measured_depth numeric(8,2),
  measurement_unit text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_room_layouts_floor_label_length
    check (floor_label is null or char_length(floor_label) <= 80),
  constraint home_room_layouts_grid_bounds
    check (
      layout_x >= 0
      and layout_y >= 0
      and layout_width > 0
      and layout_height > 0
      and layout_x <= 48
      and layout_y <= 48
      and layout_width <= 24
      and layout_height <= 24
    ),
  constraint home_room_layouts_measurements_positive
    check (
      (measured_width is null or measured_width > 0)
      and (measured_depth is null or measured_depth > 0)
    ),
  constraint home_room_layouts_measurement_unit_allowed
    check (measurement_unit is null or measurement_unit in ('ft', 'm')),
  constraint home_room_layouts_sort_order_non_negative
    check (sort_order >= 0)
);

comment on table public.home_room_layouts is
  'Simple not-to-scale Home Map v1 room rectangles. Layout rows attach to durable home_rooms and are intentionally not CAD, floor-plan, LiDAR, scanning, 3D, key-location, media, or contractor proposal records.';

comment on column public.home_room_layouts.home_id is
  'Homeowner-owned homes.id for the property this map rectangle belongs to.';

comment on column public.home_room_layouts.home_room_id is
  'Required home_rooms.id for the room represented by this map rectangle. Same-home validation prevents cross-home layout links.';

comment on column public.home_room_layouts.floor_label is
  'Optional floor grouping label for simple display only. Not a measured architectural level.';

comment on column public.home_room_layouts.layout_x is
  'Integer not-to-scale grid x position. Not a measured coordinate.';

comment on column public.home_room_layouts.layout_y is
  'Integer not-to-scale grid y position. Not a measured coordinate.';

comment on column public.home_room_layouts.layout_width is
  'Integer not-to-scale grid width. Not a measured dimension.';

comment on column public.home_room_layouts.layout_height is
  'Integer not-to-scale grid height. Not a measured dimension.';

comment on column public.home_room_layouts.measured_width is
  'Optional display-only approximate room width. Does not make the Home Map scaled, CAD, or floor-plan accurate.';

comment on column public.home_room_layouts.measured_depth is
  'Optional display-only approximate room depth. Does not make the Home Map scaled, CAD, or floor-plan accurate.';

comment on column public.home_room_layouts.measurement_unit is
  'Optional display-only measurement unit, ft or m.';

comment on column public.home_room_layouts.archived_at is
  'Soft-archive timestamp. Normal browser users do not receive a hard-delete policy.';

create unique index if not exists home_room_layouts_active_room_unique_idx
  on public.home_room_layouts(home_room_id)
  where archived_at is null;

create index if not exists home_room_layouts_home_archived_sort_idx
  on public.home_room_layouts(home_id, archived_at, sort_order);

create index if not exists home_room_layouts_home_floor_archived_idx
  on public.home_room_layouts(home_id, floor_label, archived_at);

create index if not exists home_room_layouts_created_by_idx
  on public.home_room_layouts(created_by);

drop trigger if exists home_room_layouts_touch_updated_at on public.home_room_layouts;
create trigger home_room_layouts_touch_updated_at
  before update on public.home_room_layouts
  for each row execute function public.touch_updated_at();

create or replace function public.home_room_layouts_validate_home_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_home_id uuid;
begin
  select hr.home_id
    into v_room_home_id
    from public.home_rooms hr
   where hr.id = new.home_room_id;

  if v_room_home_id is null then
    raise exception 'Home map room not found.';
  end if;

  if v_room_home_id is distinct from new.home_id then
    raise exception 'Home map room must belong to the same home as the layout.';
  end if;

  return new;
end;
$$;

comment on function public.home_room_layouts_validate_home_room() is
  'Validates that home_room_layouts.home_room_id belongs to the same home_id. Layout boxes cannot point at rooms from another home.';

revoke all on function public.home_room_layouts_validate_home_room() from public;
revoke all on function public.home_room_layouts_validate_home_room() from anon;
revoke all on function public.home_room_layouts_validate_home_room() from authenticated;

drop trigger if exists home_room_layouts_validate_home_room_trigger
  on public.home_room_layouts;
create trigger home_room_layouts_validate_home_room_trigger
  before insert or update of home_id, home_room_id on public.home_room_layouts
  for each row execute function public.home_room_layouts_validate_home_room();

create or replace function public.home_room_layouts_protect_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'Home map layout id cannot be changed.';
  end if;

  if new.home_id <> old.home_id then
    raise exception 'Home map layout cannot be moved to another home.';
  end if;

  if new.home_room_id <> old.home_room_id then
    raise exception 'Home map layout cannot be moved to another room.';
  end if;

  if new.created_by <> old.created_by then
    raise exception 'Home map layout creator cannot be changed.';
  end if;

  return new;
end;
$$;

comment on function public.home_room_layouts_protect_identity() is
  'Protects immutable home_room_layouts identity fields after creation.';

revoke all on function public.home_room_layouts_protect_identity() from public;
revoke all on function public.home_room_layouts_protect_identity() from anon;
revoke all on function public.home_room_layouts_protect_identity() from authenticated;

drop trigger if exists home_room_layouts_protect_identity_trigger
  on public.home_room_layouts;
create trigger home_room_layouts_protect_identity_trigger
  before update on public.home_room_layouts
  for each row execute function public.home_room_layouts_protect_identity();

alter table public.home_room_layouts enable row level security;

drop policy if exists "Home room layouts: active shared roles read" on public.home_room_layouts;
create policy "Home room layouts: active shared roles read"
  on public.home_room_layouts for select to authenticated
  using (
    public.current_user_can_access_home(home_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Home room layouts: owner admin inserts" on public.home_room_layouts;
create policy "Home room layouts: owner admin inserts"
  on public.home_room_layouts for insert to authenticated
  with check (
    (
      public.current_user_can_manage_home(home_id)
      and created_by = auth.uid()
    )
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Home room layouts: owner admin updates" on public.home_room_layouts;
create policy "Home room layouts: owner admin updates"
  on public.home_room_layouts for update to authenticated
  using (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  )
  with check (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  );

revoke all on table public.home_room_layouts from public;
revoke all on table public.home_room_layouts from anon;
revoke all on table public.home_room_layouts from authenticated;
grant select, insert, update on table public.home_room_layouts to authenticated;

drop policy if exists "Home assets: owner admin read" on public.home_assets;
drop policy if exists "Home assets: active shared roles read" on public.home_assets;
create policy "Home assets: owner admin read"
  on public.home_assets for select to authenticated
  using (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  );

notify pgrst, 'reload schema';

commit;
