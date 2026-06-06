-- Appointments / Calendar table for Prevention Pros LLC
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.appointments (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  status text not null default 'Recommended' check (status in ('Recommended', 'Confirmed', 'Customer Requested', 'Cancelled', 'Completed')),
  visit_type text not null default 'Inspection' check (visit_type in ('Inspection', 'Follow-up', 'Urgent', 'Seasonal')),
  recommended_date date,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  duration_minutes integer not null default 60,
  time_window text not null default 'Morning' check (time_window in ('Morning', 'Midday', 'Afternoon', 'Custom')),
  internal_notes text not null default '',
  customer_notes text not null default '',
  customer_requested_start timestamptz,
  customer_request_notes text not null default '',
  source text not null default 'Monthly recommendation',
  source_schedule_item_id uuid,
  customer_visible boolean not null default false,
  email_notification_status text not null default 'not_configured',
  sms_notification_status text not null default 'not_configured',
  last_notification_sent_at timestamptz,
  google_calendar_event_id text,
  outlook_calendar_event_id text,
  ics_uid text not null default gen_random_uuid()::text,
  sync_status text not null default 'not_synced'
);

alter table public.appointments enable row level security;
grant select, insert, update, delete on public.appointments to authenticated;

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename='appointments'
  loop execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

create policy "Appointments: admins manage all"
  on public.appointments for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Appointments: customers read visible own"
  on public.appointments for select to authenticated
  using (property_id = public.current_user_property_id() and customer_visible = true);

create policy "Appointments: customers update visible own"
  on public.appointments for update to authenticated
  using (property_id = public.current_user_property_id() and customer_visible = true)
  with check (property_id = public.current_user_property_id() and customer_visible = true);

create index if not exists appointments_property_status_idx on public.appointments(property_id, status, recommended_date);
create index if not exists appointments_scheduled_start_idx on public.appointments(scheduled_start);

notify pgrst, 'reload schema';
