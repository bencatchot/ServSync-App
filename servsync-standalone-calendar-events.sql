-- ServSync standalone calendar events (v1).
-- Contractor-only calendar events that are NOT tied to a job/inspection.
-- Distinct from public.contractor_visit_events (which requires inspection_id)
-- and from service requests / appointments / invoices.
--
-- Run after servsync-unified-visit-events.sql (reuses touch_updated_at and
-- current_user_can_write_contractor_jobs).
--
-- Sandbox-review patch. Do NOT apply to production without explicit approval.

begin;

create table if not exists public.contractor_calendar_events (
  id                uuid        primary key default gen_random_uuid(),
  contractor_id     uuid        not null references public.contractor_profiles(id) on delete cascade,
  created_by        uuid        references auth.users(id) on delete set null,
  title             text        not null,
  event_type        text        not null default 'other'
                    check (event_type in ('routine_inspection', 'follow_up', 'reminder', 'check_in', 'other')),
  starts_at         timestamptz not null,
  duration_minutes  integer     check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 1440)),
  notes             text        not null default '',
  -- Optional, non-required customer association (no job is implied).
  local_contact_id  uuid        references public.contractor_local_contacts(id) on delete set null,
  homeowner_user_id uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists contractor_calendar_events_contractor_idx
  on public.contractor_calendar_events(contractor_id, starts_at desc);

drop trigger if exists contractor_calendar_events_touch_updated_at on public.contractor_calendar_events;
create trigger contractor_calendar_events_touch_updated_at
  before update on public.contractor_calendar_events
  for each row execute function public.touch_updated_at();

alter table public.contractor_calendar_events enable row level security;

-- Contractor team only. No homeowner access — these are private contractor
-- calendar events and are never shared with homeowners in v1.
drop policy if exists "Calendar events: team read"   on public.contractor_calendar_events;
drop policy if exists "Calendar events: team insert" on public.contractor_calendar_events;
drop policy if exists "Calendar events: team update" on public.contractor_calendar_events;
drop policy if exists "Calendar events: team delete" on public.contractor_calendar_events;

create policy "Calendar events: team read"
  on public.contractor_calendar_events for select to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar events: team insert"
  on public.contractor_calendar_events for insert to authenticated
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar events: team update"
  on public.contractor_calendar_events for update to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id))
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar events: team delete"
  on public.contractor_calendar_events for delete to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id));

grant select, insert, update, delete on public.contractor_calendar_events to authenticated;

notify pgrst, 'reload schema';

commit;
