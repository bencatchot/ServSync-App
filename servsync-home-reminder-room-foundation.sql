-- ServSync Home Reminder Room foundation.
-- Adds an optional room link for homeowner-owned Home Reminders.
-- This patch does not add UI, shared reminder shell changes, contractor
-- visibility, documents/photos, jobs, estimates, invoices, inspections,
-- Home Map, assets/systems, key locations, storage behavior, or automation.

begin;

alter table public.home_reminders
  add column if not exists home_room_id uuid references public.home_rooms(id) on delete set null;

comment on column public.home_reminders.home_room_id is
  'Optional link to a durable home_rooms row for future room-tagged reminder UI. Room notes are not copied or exposed through reminders.';

create index if not exists home_reminders_home_room_idx
  on public.home_reminders(home_room_id)
  where home_room_id is not null;

create index if not exists home_reminders_home_room_due_idx
  on public.home_reminders(home_id, home_room_id, due_on)
  where home_room_id is not null;

create or replace function public.home_reminders_validate_home_room()
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

  if new.home_id is null then
    raise exception 'Home room link requires a reminder home.';
  end if;

  select hr.home_id
    into v_room_home_id
    from public.home_rooms hr
   where hr.id = new.home_room_id
   limit 1;

  if v_room_home_id is null then
    raise exception 'Home room not found.';
  end if;

  if v_room_home_id is distinct from new.home_id then
    raise exception 'Home reminder room must belong to the same home as the reminder.';
  end if;

  return new;
end;
$$;

comment on function public.home_reminders_validate_home_room() is
  'Validates optional home_reminders.home_room_id links so reminders cannot point at rooms from another home. Does not expose home_rooms notes.';

revoke all on function public.home_reminders_validate_home_room() from public;
revoke all on function public.home_reminders_validate_home_room() from anon;
revoke all on function public.home_reminders_validate_home_room() from authenticated;

drop trigger if exists home_reminders_validate_home_room_trigger
  on public.home_reminders;
create trigger home_reminders_validate_home_room_trigger
  before insert or update of home_id, home_room_id on public.home_reminders
  for each row execute function public.home_reminders_validate_home_room();

notify pgrst, 'reload schema';

commit;
