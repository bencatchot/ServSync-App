-- Controlled rollback for Property Asset Bridge v1.
-- This rollback is intentionally data-safe: it refuses to discard contractor
-- assets or mutation history. It is suitable only before bridge use.

begin;

do $$
begin
  if to_regclass('public.home_asset_revisions') is null then
    raise exception 'Property Asset Bridge v1 is not installed.';
  end if;
  if exists (
    select 1 from public.home_assets asset
     where asset.local_home_id is not null
        or asset.origin_kind <> 'homeowner'
        or asset.revision_number <> 1
        or asset.location_label is not null
        or asset.serial_identifier is not null
        or asset.approximate_age_years is not null
        or asset.customer_safe_description is not null
  ) or exists (
    select 1 from public.home_asset_revisions revision
     where revision.change_kind <> 'baseline'
        or revision.revision_number <> 1
  ) then
    raise exception 'Property Asset Bridge contains durable use history and cannot be rolled back safely.';
  end if;
end;
$$;

drop trigger if exists contractor_local_homes_map_property_assets_trigger on public.contractor_local_homes;
drop trigger if exists home_assets_guard_insert_trigger on public.home_assets;
drop trigger if exists home_assets_record_revision_trigger on public.home_assets;
drop trigger if exists home_asset_revisions_immutable_trigger on public.home_asset_revisions;

drop function if exists public.servsync_list_property_asset_revisions(uuid, uuid);
drop function if exists public.servsync_set_property_asset_lifecycle(uuid, bigint, text, uuid);
drop function if exists public.servsync_update_property_asset(uuid, bigint, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text);
drop function if exists public.servsync_create_property_asset(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, date, smallint, date, text, text);
drop function if exists public.servsync_list_property_assets(uuid, uuid, uuid, boolean);
drop function if exists public.servsync_private_map_claimed_property_assets();
drop function if exists public.servsync_private_guard_property_asset_revision();
drop function if exists public.servsync_private_record_property_asset_revision();
drop function if exists public.servsync_private_guard_property_asset_insert();
drop function if exists public.servsync_private_validate_property_asset_target(uuid, uuid, uuid);
drop function if exists public.servsync_private_can_manage_property_assets(uuid, uuid, uuid);
drop function if exists public.servsync_private_can_read_property_assets(uuid, uuid, uuid);
drop function if exists public.servsync_private_property_asset_optional_text(text, integer, text, boolean);
drop function if exists public.servsync_private_property_asset_category(text);

drop table public.home_asset_revisions;

drop trigger if exists home_assets_validate_home_room_trigger on public.home_assets;
drop trigger if exists home_assets_protect_identity_trigger on public.home_assets;

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
  select room.home_id into v_room_home_id
    from public.home_rooms room
   where room.id = new.home_room_id;
  if v_room_home_id is null then raise exception 'Home room not found.'; end if;
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
begin
  if new.id <> old.id then raise exception 'Home asset id cannot be changed.'; end if;
  if new.home_id <> old.home_id then raise exception 'Home asset cannot be moved to another home.'; end if;
  if new.created_by <> old.created_by then raise exception 'Home asset creator cannot be changed.'; end if;
  return new;
end;
$$;

create trigger home_assets_validate_home_room_trigger
  before insert or update of home_id, home_room_id on public.home_assets
  for each row execute function public.home_assets_validate_home_room();

create trigger home_assets_protect_identity_trigger
  before update on public.home_assets
  for each row execute function public.home_assets_protect_identity();

drop index if exists public.home_assets_origin_contractor_idx;
drop index if exists public.home_assets_home_lifecycle_idx;
drop index if exists public.home_assets_local_home_lifecycle_idx;

alter table public.home_assets
  drop constraint home_assets_home_id_fkey,
  drop constraint home_assets_local_home_id_fkey,
  drop constraint home_assets_origin_contractor_id_fkey,
  drop constraint home_assets_property_reference_check,
  drop constraint home_assets_asset_kind_check,
  drop constraint home_assets_location_label_length,
  drop constraint home_assets_serial_identifier_length,
  drop constraint home_assets_approximate_age_check,
  drop constraint home_assets_customer_safe_description_length,
  drop constraint home_assets_lifecycle_check,
  drop constraint home_assets_origin_check,
  drop constraint home_assets_revision_number_check,
  alter column home_id set not null,
  add constraint home_assets_home_id_fkey
    foreign key (home_id) references public.homes(id) on delete cascade,
  drop column local_home_id,
  drop column asset_kind,
  drop column location_label,
  drop column serial_identifier,
  drop column approximate_age_years,
  drop column customer_safe_description,
  drop column lifecycle_status,
  drop column origin_kind,
  drop column origin_contractor_id,
  drop column revision_number;

alter table public.home_assets no force row level security;

create policy "Home assets: owner admin read"
  on public.home_assets for select to authenticated
  using (public.current_user_can_manage_home(home_id) or public.current_user_is_platform_admin());
create policy "Home assets: owner admin inserts"
  on public.home_assets for insert to authenticated
  with check ((public.current_user_can_manage_home(home_id) and created_by = auth.uid()) or public.current_user_is_platform_admin());
create policy "Home assets: owner admin updates"
  on public.home_assets for update to authenticated
  using (public.current_user_can_manage_home(home_id) or public.current_user_is_platform_admin())
  with check (public.current_user_can_manage_home(home_id) or public.current_user_is_platform_admin());

revoke all on table public.home_assets from public, anon, authenticated;
grant select, insert, update on table public.home_assets to authenticated;
grant all privileges on table public.home_assets to service_role;
revoke all on function public.home_assets_validate_home_room() from public, anon, authenticated;
revoke all on function public.home_assets_protect_identity() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
