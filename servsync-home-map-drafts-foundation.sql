-- ServSync Home Map Draft foundation.
-- Adds workflow-scoped contractor-created Home Map drafts that require
-- homeowner manager approval before writing to the permanent homeowner map.
--
-- This patch does not add UI, contractor direct access to permanent
-- home_rooms/home_room_layouts/home_assets, document/reminder/storage
-- visibility, estimates/jobs anchors, key locations, CAD/floor-plan/LiDAR/3D,
-- map objects, or production data changes.

begin;

create extension if not exists pgcrypto;

create table if not exists public.home_map_drafts (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  status text not null default 'draft',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_map_drafts_status_check
    check (status in ('draft', 'submitted', 'accepted', 'declined', 'revoked')),
  constraint home_map_drafts_review_note_length
    check (review_note is null or char_length(review_note) <= 1000),
  constraint home_map_drafts_submitted_check
    check (
      (status in ('submitted', 'accepted', 'declined') and submitted_at is not null)
      or status in ('draft', 'revoked')
    ),
  constraint home_map_drafts_reviewed_check
    check (
      (status in ('accepted', 'declined') and reviewed_at is not null and reviewed_by_user_id is not null)
      or (status not in ('accepted', 'declined') and reviewed_at is null and reviewed_by_user_id is null)
    )
);

comment on table public.home_map_drafts is
  'Workflow-scoped contractor Home Map draft headers. Drafts are proposals only; homeowner managers must approve before any permanent home_rooms or home_room_layouts rows are written.';

comment on column public.home_map_drafts.home_id is
  'Homeowner-owned homes.id for the property this draft proposes map updates for.';

comment on column public.home_map_drafts.service_request_id is
  'First MVP workflow anchor. Draft creation requires an active service request for the same contractor, homeowner, and home.';

comment on column public.home_map_drafts.status is
  'Draft lifecycle state. Only submitted drafts can be accepted or declined by a homeowner manager.';

create index if not exists home_map_drafts_home_status_idx
  on public.home_map_drafts(home_id, status, created_at desc);

create index if not exists home_map_drafts_contractor_status_idx
  on public.home_map_drafts(contractor_id, status, created_at desc);

create index if not exists home_map_drafts_homeowner_status_idx
  on public.home_map_drafts(homeowner_user_id, status, created_at desc);

create index if not exists home_map_drafts_service_request_idx
  on public.home_map_drafts(service_request_id, status, created_at desc);

drop trigger if exists home_map_drafts_touch_updated_at on public.home_map_drafts;
create trigger home_map_drafts_touch_updated_at
  before update on public.home_map_drafts
  for each row execute function public.touch_updated_at();

create table if not exists public.home_map_draft_rooms (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.home_map_drafts(id) on delete cascade,
  source_home_room_id uuid references public.home_rooms(id) on delete set null,
  name text not null,
  room_type text,
  floor_label text,
  area_label text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_map_draft_rooms_name_not_blank
    check (length(trim(name)) > 0),
  constraint home_map_draft_rooms_name_length
    check (char_length(name) <= 120),
  constraint home_map_draft_rooms_room_type_length
    check (room_type is null or char_length(room_type) <= 80),
  constraint home_map_draft_rooms_floor_label_length
    check (floor_label is null or char_length(floor_label) <= 80),
  constraint home_map_draft_rooms_area_label_length
    check (area_label is null or char_length(area_label) <= 80),
  constraint home_map_draft_rooms_notes_length
    check (notes is null or char_length(notes) <= 4000),
  constraint home_map_draft_rooms_sort_order_non_negative
    check (sort_order >= 0)
);

comment on table public.home_map_draft_rooms is
  'Proposed room basics inside a Home Map draft. These rows are not permanent home_rooms until a homeowner manager accepts the draft.';

comment on column public.home_map_draft_rooms.source_home_room_id is
  'Optional future-safe link to an existing permanent home_rooms row when a draft proposes updating that room. Same-home validation is enforced by trigger.';

comment on column public.home_map_draft_rooms.notes is
  'Homeowner-visible proposed general room notes. Sensitive access details, key locations, and asset notes are intentionally out of scope.';

create index if not exists home_map_draft_rooms_draft_sort_idx
  on public.home_map_draft_rooms(draft_id, sort_order, name);

create index if not exists home_map_draft_rooms_source_home_room_idx
  on public.home_map_draft_rooms(source_home_room_id)
  where source_home_room_id is not null;

drop trigger if exists home_map_draft_rooms_touch_updated_at on public.home_map_draft_rooms;
create trigger home_map_draft_rooms_touch_updated_at
  before update on public.home_map_draft_rooms
  for each row execute function public.touch_updated_at();

create table if not exists public.home_map_draft_room_layouts (
  id uuid primary key default gen_random_uuid(),
  draft_room_id uuid not null references public.home_map_draft_rooms(id) on delete cascade,
  x_feet numeric(8,2) not null default 0,
  y_feet numeric(8,2) not null default 0,
  width_feet numeric(8,2) not null default 10,
  depth_feet numeric(8,2) not null default 10,
  measurement_unit text not null default 'ft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_map_draft_room_layouts_measurement_unit_check
    check (measurement_unit = 'ft'),
  constraint home_map_draft_room_layouts_grid_bounds
    check (
      x_feet >= 0
      and y_feet >= 0
      and width_feet > 0
      and depth_feet > 0
      and x_feet <= 48
      and y_feet <= 48
      and width_feet <= 24
      and depth_feet <= 24
    ),
  constraint home_map_draft_room_layouts_sort_order_non_negative
    check (sort_order >= 0)
);

comment on table public.home_map_draft_room_layouts is
  'Proposed feet-based room rectangles inside a contractor Home Map draft. These rows are not permanent home_room_layouts until a homeowner manager accepts the draft.';

comment on column public.home_map_draft_room_layouts.x_feet is
  'Draft x position in rough feet/grid units. Saved only as draft proposal data until homeowner approval.';

comment on column public.home_map_draft_room_layouts.y_feet is
  'Draft y position in rough feet/grid units. Saved only as draft proposal data until homeowner approval.';

comment on column public.home_map_draft_room_layouts.width_feet is
  'Draft room width in rough feet/grid units. Not CAD, permit, architectural, or floor-plan data.';

comment on column public.home_map_draft_room_layouts.depth_feet is
  'Draft room depth in rough feet/grid units. Not CAD, permit, architectural, or floor-plan data.';

create unique index if not exists home_map_draft_room_layouts_draft_room_uidx
  on public.home_map_draft_room_layouts(draft_room_id);

create index if not exists home_map_draft_room_layouts_sort_idx
  on public.home_map_draft_room_layouts(draft_room_id, sort_order);

drop trigger if exists home_map_draft_room_layouts_touch_updated_at on public.home_map_draft_room_layouts;
create trigger home_map_draft_room_layouts_touch_updated_at
  before update on public.home_map_draft_room_layouts
  for each row execute function public.touch_updated_at();

create or replace function public.home_map_draft_rooms_validate_source_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_home_id uuid;
  v_source_home_id uuid;
begin
  if new.source_home_room_id is null then
    return new;
  end if;

  select d.home_id
    into v_draft_home_id
    from public.home_map_drafts d
   where d.id = new.draft_id;

  select hr.home_id
    into v_source_home_id
    from public.home_rooms hr
   where hr.id = new.source_home_room_id;

  if v_source_home_id is null then
    raise exception 'Source room was not found.';
  end if;

  if v_source_home_id is distinct from v_draft_home_id then
    raise exception 'Source room must belong to the same home as the draft.';
  end if;

  return new;
end;
$$;

revoke all on function public.home_map_draft_rooms_validate_source_room() from public;
revoke all on function public.home_map_draft_rooms_validate_source_room() from anon;
revoke all on function public.home_map_draft_rooms_validate_source_room() from authenticated;

drop trigger if exists home_map_draft_rooms_validate_source_room_trigger
  on public.home_map_draft_rooms;
create trigger home_map_draft_rooms_validate_source_room_trigger
  before insert or update of draft_id, source_home_room_id on public.home_map_draft_rooms
  for each row execute function public.home_map_draft_rooms_validate_source_room();

alter table public.home_map_drafts enable row level security;
alter table public.home_map_draft_rooms enable row level security;
alter table public.home_map_draft_room_layouts enable row level security;

drop policy if exists "Home map drafts: contractor reads own" on public.home_map_drafts;
create policy "Home map drafts: contractor reads own"
  on public.home_map_drafts for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

drop policy if exists "Home map drafts: homeowner managers read own" on public.home_map_drafts;
create policy "Home map drafts: homeowner managers read own"
  on public.home_map_drafts for select to authenticated
  using (public.current_user_can_manage_home(home_id));

drop policy if exists "Home map drafts: platform admin reads" on public.home_map_drafts;
create policy "Home map drafts: platform admin reads"
  on public.home_map_drafts for select to authenticated
  using (public.current_user_is_platform_admin());

drop policy if exists "Home map draft rooms: draft parties read" on public.home_map_draft_rooms;
create policy "Home map draft rooms: draft parties read"
  on public.home_map_draft_rooms for select to authenticated
  using (
    exists (
      select 1
        from public.home_map_drafts d
       where d.id = home_map_draft_rooms.draft_id
         and (
           public.current_user_can_access_contractor(d.contractor_id)
           or public.current_user_can_manage_home(d.home_id)
           or public.current_user_is_platform_admin()
         )
    )
  );

drop policy if exists "Home map draft room layouts: draft parties read" on public.home_map_draft_room_layouts;
create policy "Home map draft room layouts: draft parties read"
  on public.home_map_draft_room_layouts for select to authenticated
  using (
    exists (
      select 1
        from public.home_map_draft_rooms dr
        join public.home_map_drafts d on d.id = dr.draft_id
       where dr.id = home_map_draft_room_layouts.draft_room_id
         and (
           public.current_user_can_access_contractor(d.contractor_id)
           or public.current_user_can_manage_home(d.home_id)
           or public.current_user_is_platform_admin()
         )
    )
  );

revoke all on table public.home_map_drafts from public;
revoke all on table public.home_map_drafts from anon;
revoke all on table public.home_map_drafts from authenticated;
grant select on table public.home_map_drafts to authenticated;

revoke all on table public.home_map_draft_rooms from public;
revoke all on table public.home_map_draft_rooms from anon;
revoke all on table public.home_map_draft_rooms from authenticated;
grant select on table public.home_map_draft_rooms to authenticated;

revoke all on table public.home_map_draft_room_layouts from public;
revoke all on table public.home_map_draft_room_layouts from anon;
revoke all on table public.home_map_draft_room_layouts from authenticated;
grant select on table public.home_map_draft_room_layouts to authenticated;

create or replace function public.servsync_create_home_map_draft(
  p_service_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request public.service_requests;
  v_home public.homes;
  v_draft public.home_map_drafts;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select id
    into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if v_contractor_id is null or not public.current_user_can_write_contractor_jobs(v_contractor_id) then
    raise exception 'Contractor profile not found.';
  end if;

  select *
    into v_request
    from public.service_requests
   where id = p_service_request_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found for this contractor.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'Home Map drafts require an active service request.';
  end if;

  if v_request.home_id is null then
    raise exception 'Home Map drafts require a homeowner property on the service request.';
  end if;

  select *
    into v_home
    from public.homes
   where id = v_request.home_id
     and homeowner_user_id = v_request.homeowner_user_id
   limit 1;

  if v_home.id is null then
    raise exception 'Service request property was not found for this homeowner.';
  end if;

  if not exists (
    select 1
      from public.homeowner_contractor_connections c
     where c.id = v_request.connection_id
       and c.contractor_id = v_request.contractor_id
       and c.homeowner_user_id = v_request.homeowner_user_id
       and c.status = 'active'
  ) then
    raise exception 'This contractor connection is no longer active.';
  end if;

  insert into public.home_map_drafts (
    home_id,
    homeowner_user_id,
    contractor_id,
    service_request_id,
    status,
    created_by_user_id
  ) values (
    v_request.home_id,
    v_request.homeowner_user_id,
    v_request.contractor_id,
    v_request.id,
    'draft',
    auth.uid()
  )
  returning * into v_draft;

  return to_jsonb(v_draft);
end;
$$;

create or replace function public.servsync_upsert_home_map_draft_room(
  p_draft_id uuid,
  p_draft_room_id uuid default null,
  p_name text default 'New room',
  p_room_type text default null,
  p_floor_label text default null,
  p_area_label text default null,
  p_notes text default null,
  p_source_home_room_id uuid default null,
  p_x_feet numeric default 0,
  p_y_feet numeric default 0,
  p_width_feet numeric default 10,
  p_depth_feet numeric default 10,
  p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.home_map_drafts;
  v_room public.home_map_draft_rooms;
  v_layout public.home_map_draft_room_layouts;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_draft
    from public.home_map_drafts
   where id = p_draft_id
   for update;

  if v_draft.id is null then
    raise exception 'Home Map draft not found.';
  end if;

  if v_draft.status <> 'draft' then
    raise exception 'Only draft Home Map drafts can be edited.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_draft.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to edit this Home Map draft.';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Room name is required.';
  end if;

  if p_width_feet <= 0 or p_depth_feet <= 0 then
    raise exception 'Room dimensions must be greater than zero.';
  end if;

  if p_draft_room_id is null then
    insert into public.home_map_draft_rooms (
      draft_id,
      source_home_room_id,
      name,
      room_type,
      floor_label,
      area_label,
      notes,
      sort_order
    ) values (
      v_draft.id,
      p_source_home_room_id,
      trim(p_name),
      nullif(trim(coalesce(p_room_type, '')), ''),
      nullif(trim(coalesce(p_floor_label, '')), ''),
      nullif(trim(coalesce(p_area_label, '')), ''),
      nullif(p_notes, ''),
      greatest(0, coalesce(p_sort_order, 0))
    )
    returning * into v_room;
  else
    update public.home_map_draft_rooms
       set source_home_room_id = p_source_home_room_id,
           name = trim(p_name),
           room_type = nullif(trim(coalesce(p_room_type, '')), ''),
           floor_label = nullif(trim(coalesce(p_floor_label, '')), ''),
           area_label = nullif(trim(coalesce(p_area_label, '')), ''),
           notes = nullif(p_notes, ''),
           sort_order = greatest(0, coalesce(p_sort_order, 0)),
           updated_at = now()
     where id = p_draft_room_id
       and draft_id = v_draft.id
     returning * into v_room;

    if v_room.id is null then
      raise exception 'Home Map draft room not found.';
    end if;
  end if;

  insert into public.home_map_draft_room_layouts (
    draft_room_id,
    x_feet,
    y_feet,
    width_feet,
    depth_feet,
    measurement_unit,
    sort_order
  ) values (
    v_room.id,
    greatest(0, coalesce(p_x_feet, 0)),
    greatest(0, coalesce(p_y_feet, 0)),
    p_width_feet,
    p_depth_feet,
    'ft',
    greatest(0, coalesce(p_sort_order, 0))
  )
  on conflict (draft_room_id) do update
     set x_feet = excluded.x_feet,
         y_feet = excluded.y_feet,
         width_feet = excluded.width_feet,
         depth_feet = excluded.depth_feet,
         measurement_unit = 'ft',
         sort_order = excluded.sort_order,
         updated_at = now()
  returning * into v_layout;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'layout', to_jsonb(v_layout)
  );
end;
$$;

create or replace function public.servsync_submit_home_map_draft(
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.home_map_drafts;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_draft
    from public.home_map_drafts
   where id = p_draft_id
   for update;

  if v_draft.id is null then
    raise exception 'Home Map draft not found.';
  end if;

  if v_draft.status <> 'draft' then
    raise exception 'Only draft Home Map drafts can be submitted.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_draft.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to submit this Home Map draft.';
  end if;

  if not exists (
    select 1
      from public.home_map_draft_rooms dr
      join public.home_map_draft_room_layouts dl on dl.draft_room_id = dr.id
     where dr.draft_id = v_draft.id
  ) then
    raise exception 'Add at least one room before submitting a Home Map draft.';
  end if;

  update public.home_map_drafts
     set status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   where id = v_draft.id
   returning * into v_draft;

  return to_jsonb(v_draft);
end;
$$;

create or replace function public.servsync_revoke_home_map_draft(
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.home_map_drafts;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_draft
    from public.home_map_drafts
   where id = p_draft_id
   for update;

  if v_draft.id is null then
    raise exception 'Home Map draft not found.';
  end if;

  if v_draft.status not in ('draft', 'submitted') then
    raise exception 'Only draft or submitted Home Map drafts can be revoked.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_draft.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to revoke this Home Map draft.';
  end if;

  update public.home_map_drafts
     set status = 'revoked',
         updated_at = now()
   where id = v_draft.id
   returning * into v_draft;

  return to_jsonb(v_draft);
end;
$$;

create or replace function public.servsync_decline_home_map_draft(
  p_draft_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.home_map_drafts;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_draft
    from public.home_map_drafts
   where id = p_draft_id
   for update;

  if v_draft.id is null then
    raise exception 'Home Map draft not found.';
  end if;

  if v_draft.status <> 'submitted' then
    raise exception 'Only submitted Home Map drafts can be declined.';
  end if;

  if not public.current_user_can_manage_home(v_draft.home_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to review this Home Map draft.';
  end if;

  update public.home_map_drafts
     set status = 'declined',
         reviewed_by_user_id = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(p_review_note, ''),
         updated_at = now()
   where id = v_draft.id
   returning * into v_draft;

  return to_jsonb(v_draft);
end;
$$;

create or replace function public.servsync_accept_home_map_draft(
  p_draft_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.home_map_drafts;
  v_room record;
  v_home_room_id uuid;
  v_created_count integer := 0;
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_draft
    from public.home_map_drafts
   where id = p_draft_id
   for update;

  if v_draft.id is null then
    raise exception 'Home Map draft not found.';
  end if;

  if v_draft.status <> 'submitted' then
    raise exception 'Only submitted Home Map drafts can be accepted.';
  end if;

  if not public.current_user_can_manage_home(v_draft.home_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to approve this Home Map draft.';
  end if;

  for v_room in
    select
      dr.*,
      dl.x_feet,
      dl.y_feet,
      dl.width_feet,
      dl.depth_feet,
      dl.measurement_unit
    from public.home_map_draft_rooms dr
    join public.home_map_draft_room_layouts dl on dl.draft_room_id = dr.id
   where dr.draft_id = v_draft.id
   order by dr.sort_order, dr.created_at
  loop
    if v_room.source_home_room_id is not null then
      update public.home_rooms
         set name = v_room.name,
             room_type = v_room.room_type,
             floor_label = v_room.floor_label,
             area_label = v_room.area_label,
             notes = v_room.notes,
             sort_order = v_room.sort_order,
             archived_at = null,
             updated_at = now()
       where id = v_room.source_home_room_id
         and home_id = v_draft.home_id
       returning id into v_home_room_id;

      if v_home_room_id is null then
        raise exception 'Draft source room was not found for this home.';
      end if;

      v_updated_count := v_updated_count + 1;
    else
      insert into public.home_rooms (
        home_id,
        name,
        room_type,
        floor_label,
        area_label,
        sort_order,
        notes,
        created_by
      ) values (
        v_draft.home_id,
        v_room.name,
        v_room.room_type,
        v_room.floor_label,
        v_room.area_label,
        v_room.sort_order,
        v_room.notes,
        auth.uid()
      )
      returning id into v_home_room_id;

      v_created_count := v_created_count + 1;
    end if;

    insert into public.home_room_layouts (
      home_id,
      home_room_id,
      floor_label,
      layout_x,
      layout_y,
      layout_width,
      layout_height,
      measured_width,
      measured_depth,
      measurement_unit,
      sort_order,
      archived_at,
      created_by
    ) values (
      v_draft.home_id,
      v_home_room_id,
      v_room.floor_label,
      round(v_room.x_feet)::integer,
      round(v_room.y_feet)::integer,
      greatest(1, round(v_room.width_feet)::integer),
      greatest(1, round(v_room.depth_feet)::integer),
      v_room.width_feet,
      v_room.depth_feet,
      'ft',
      v_room.sort_order,
      null,
      auth.uid()
    )
    on conflict (home_room_id) where archived_at is null do update
       set floor_label = excluded.floor_label,
           layout_x = excluded.layout_x,
           layout_y = excluded.layout_y,
           layout_width = excluded.layout_width,
           layout_height = excluded.layout_height,
           measured_width = excluded.measured_width,
           measured_depth = excluded.measured_depth,
           measurement_unit = 'ft',
           sort_order = excluded.sort_order,
           updated_at = now();
  end loop;

  if v_created_count + v_updated_count = 0 then
    raise exception 'Submitted Home Map draft has no rooms to accept.';
  end if;

  update public.home_map_drafts
     set status = 'accepted',
         reviewed_by_user_id = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(p_review_note, ''),
         updated_at = now()
   where id = v_draft.id
   returning * into v_draft;

  return jsonb_build_object(
    'draft', to_jsonb(v_draft),
    'created_rooms', v_created_count,
    'updated_rooms', v_updated_count
  );
end;
$$;

revoke execute on function public.servsync_create_home_map_draft(uuid) from public;
revoke execute on function public.servsync_create_home_map_draft(uuid) from anon;
grant execute on function public.servsync_create_home_map_draft(uuid) to authenticated;

revoke execute on function public.servsync_upsert_home_map_draft_room(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, numeric, numeric, integer) from public;
revoke execute on function public.servsync_upsert_home_map_draft_room(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, numeric, numeric, integer) from anon;
grant execute on function public.servsync_upsert_home_map_draft_room(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, numeric, numeric, integer) to authenticated;

revoke execute on function public.servsync_submit_home_map_draft(uuid) from public;
revoke execute on function public.servsync_submit_home_map_draft(uuid) from anon;
grant execute on function public.servsync_submit_home_map_draft(uuid) to authenticated;

revoke execute on function public.servsync_revoke_home_map_draft(uuid) from public;
revoke execute on function public.servsync_revoke_home_map_draft(uuid) from anon;
grant execute on function public.servsync_revoke_home_map_draft(uuid) to authenticated;

revoke execute on function public.servsync_decline_home_map_draft(uuid, text) from public;
revoke execute on function public.servsync_decline_home_map_draft(uuid, text) from anon;
grant execute on function public.servsync_decline_home_map_draft(uuid, text) to authenticated;

revoke execute on function public.servsync_accept_home_map_draft(uuid, text) from public;
revoke execute on function public.servsync_accept_home_map_draft(uuid, text) from anon;
grant execute on function public.servsync_accept_home_map_draft(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
