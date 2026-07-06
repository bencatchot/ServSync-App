-- ServSync Home Rooms foundation.
-- Adds durable homeowner-owned room records for future Rooms & Systems,
-- Home Setup Templates, and simple not-to-scale Home Map work.
-- This patch does not add UI, contractor visibility, local property rooms,
-- assets/systems, key locations, map layout metadata, or storage behavior.

begin;

create extension if not exists pgcrypto;

create table if not exists public.home_rooms (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  name text not null,
  room_type text,
  floor_label text,
  area_label text,
  sort_order integer not null default 0,
  notes text,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_rooms_name_not_blank
    check (length(trim(name)) > 0),
  constraint home_rooms_name_length
    check (char_length(name) <= 120),
  constraint home_rooms_room_type_length
    check (room_type is null or char_length(room_type) <= 80),
  constraint home_rooms_floor_label_length
    check (floor_label is null or char_length(floor_label) <= 80),
  constraint home_rooms_area_label_length
    check (area_label is null or char_length(area_label) <= 80),
  constraint home_rooms_notes_length
    check (notes is null or char_length(notes) <= 4000),
  constraint home_rooms_sort_order_non_negative
    check (sort_order >= 0)
);

comment on table public.home_rooms is
  'Durable homeowner-owned home room records. Rooms are non-sensitive home basics; assets, key locations, contractor visibility, and map layout metadata are future separately approved work.';

comment on column public.home_rooms.home_id is
  'Homeowner-owned homes.id for the property this room belongs to.';

comment on column public.home_rooms.name is
  'Human-readable room name. Required, trimmed non-empty, and intentionally not a place for sensitive access details.';

comment on column public.home_rooms.room_type is
  'Optional lightweight room category for future grouping. Not an inspection template or checklist type.';

comment on column public.home_rooms.floor_label is
  'Optional floor label, such as Main, Upstairs, Basement, or Exterior.';

comment on column public.home_rooms.area_label is
  'Optional area grouping label for future not-to-scale room/system map views.';

comment on column public.home_rooms.sort_order is
  'Non-negative display order within a home/floor/area grouping.';

comment on column public.home_rooms.notes is
  'Optional general room notes. Sensitive access details and key location data are intentionally out of scope for this table.';

comment on column public.home_rooms.archived_at is
  'Soft-archive timestamp. Normal browser users do not receive a hard-delete policy.';

create index if not exists home_rooms_home_idx
  on public.home_rooms(home_id);

create index if not exists home_rooms_home_archived_idx
  on public.home_rooms(home_id, archived_at);

create index if not exists home_rooms_home_sort_idx
  on public.home_rooms(home_id, sort_order, name);

create index if not exists home_rooms_created_by_idx
  on public.home_rooms(created_by);

drop trigger if exists home_rooms_touch_updated_at on public.home_rooms;
create trigger home_rooms_touch_updated_at
  before update on public.home_rooms
  for each row execute function public.touch_updated_at();

create or replace function public.home_rooms_protect_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'Home room id cannot be changed.';
  end if;

  if new.home_id <> old.home_id then
    raise exception 'Home room cannot be moved to another home.';
  end if;

  if new.created_by <> old.created_by then
    raise exception 'Home room creator cannot be changed.';
  end if;

  return new;
end;
$$;

revoke all on function public.home_rooms_protect_identity() from public;
revoke all on function public.home_rooms_protect_identity() from anon;
revoke all on function public.home_rooms_protect_identity() from authenticated;

drop trigger if exists home_rooms_protect_identity_trigger
  on public.home_rooms;
create trigger home_rooms_protect_identity_trigger
  before update on public.home_rooms
  for each row execute function public.home_rooms_protect_identity();

alter table public.home_rooms enable row level security;

drop policy if exists "Home rooms: active shared roles read" on public.home_rooms;
create policy "Home rooms: active shared roles read"
  on public.home_rooms for select to authenticated
  using (
    public.current_user_can_access_home(home_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Home rooms: owner admin inserts" on public.home_rooms;
create policy "Home rooms: owner admin inserts"
  on public.home_rooms for insert to authenticated
  with check (
    (
      public.current_user_can_manage_home(home_id)
      and created_by = auth.uid()
    )
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Home rooms: owner admin updates" on public.home_rooms;
create policy "Home rooms: owner admin updates"
  on public.home_rooms for update to authenticated
  using (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  )
  with check (
    public.current_user_can_manage_home(home_id)
    or public.current_user_is_platform_admin()
  );

revoke all on table public.home_rooms from public;
revoke all on table public.home_rooms from anon;
revoke all on table public.home_rooms from authenticated;
grant select, insert, update on table public.home_rooms to authenticated;

notify pgrst, 'reload schema';

commit;
