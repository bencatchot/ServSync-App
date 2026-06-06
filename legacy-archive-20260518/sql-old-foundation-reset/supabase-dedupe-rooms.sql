-- Clean up duplicate room rows caused by earlier double-inserts.
-- Safe to run once. It keeps the oldest room row for each property/name.
-- It moves checklist items/photos to the kept room before deleting duplicates.

with duplicate_rooms as (
  select
    id,
    first_value(id) over (
      partition by property_id, lower(trim(name))
      order by created_at asc, id asc
    ) as keep_id,
    row_number() over (
      partition by property_id, lower(trim(name))
      order by created_at asc, id asc
    ) as rn
  from public.rooms
), moved_checklist as (
  update public.checklist_items ci
     set room_id = dr.keep_id
    from duplicate_rooms dr
   where ci.room_id = dr.id
     and dr.rn > 1
  returning ci.id
), moved_photos as (
  update public.photos p
     set room_id = dr.keep_id
    from duplicate_rooms dr
   where p.room_id = dr.id
     and dr.rn > 1
  returning p.id
), moved_findings as (
  update public.findings f
     set room_id = dr.keep_id
    from duplicate_rooms dr
   where f.room_id = dr.id
     and dr.rn > 1
  returning f.id
)
delete from public.rooms r
using duplicate_rooms dr
where r.id = dr.id
  and dr.rn > 1;

-- Optional protection so this cannot happen again.
create unique index if not exists rooms_property_name_unique
on public.rooms (property_id, lower(trim(name)));
