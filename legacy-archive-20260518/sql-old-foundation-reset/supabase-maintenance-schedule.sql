-- Maintenance Scheduler table for Prevention Pros LLC
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.maintenance_schedule (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  room text not null default '',
  source text not null default 'Manual' check (source in ('Inspection Follow-up', 'Fixed On Site Recheck', 'Seasonal Recommendation', 'Manual')),
  priority text not null default 'Medium' check (priority in ('Urgent', 'High', 'Medium', 'Low')),
  cadence_type text not null default 'both' check (cadence_type in ('visit', 'calendar', 'both')),
  frequency text not null default 'Next visit',
  next_due_date date,
  next_due_visit text not null default 'Next visit',
  status text not null default 'Upcoming' check (status in ('Due', 'Upcoming', 'Completed', 'Skipped')),
  notes text not null default '',
  created_from_finding_id uuid,
  completed_at timestamptz
);

alter table public.maintenance_schedule enable row level security;

grant select, insert, update, delete on public.maintenance_schedule to authenticated;

-- Replace old policies for this table only.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_schedule'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "Maintenance schedule: admins manage all"
  on public.maintenance_schedule
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Maintenance schedule: customers read own"
  on public.maintenance_schedule
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create index if not exists maintenance_schedule_property_status_idx
  on public.maintenance_schedule(property_id, status, next_due_date);

create index if not exists maintenance_schedule_finding_idx
  on public.maintenance_schedule(created_from_finding_id);

notify pgrst, 'reload schema';
