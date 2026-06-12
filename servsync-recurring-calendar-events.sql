-- ServSync recurring standalone calendar events (v1).
-- Adds simple contractor-only recurrence metadata to standalone events.
-- Run after servsync-standalone-calendar-events.sql.
--
-- Sandbox-review patch. Do NOT apply to production without explicit approval.

begin;

alter table public.contractor_calendar_events
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_frequency text not null default 'none',
  add column if not exists recurrence_ends_at timestamptz;

alter table public.contractor_calendar_events
  drop constraint if exists contractor_calendar_events_recurrence_frequency_check;

alter table public.contractor_calendar_events
  add constraint contractor_calendar_events_recurrence_frequency_check
  check (recurrence_frequency in ('none', 'weekly', 'monthly', 'quarterly', 'annually'));

create index if not exists contractor_calendar_events_recurrence_idx
  on public.contractor_calendar_events(contractor_id, recurrence_frequency, starts_at);

notify pgrst, 'reload schema';

commit;
