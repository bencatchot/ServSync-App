-- ServSync Home Reminders v1.
-- Adds homeowner-owned manual follow-up reminders.
--
-- V1 intentionally does not add notification automation, cron jobs,
-- push/email/text delivery, calendar sync, recurrence, or contractor access.

begin;

create table if not exists public.home_reminders (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  maintenance_log_id uuid references public.home_maintenance_log(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  title text not null,
  notes text not null default '',
  due_on date not null,
  status text not null default 'open',
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_reminders
  add column if not exists homeowner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists home_id uuid references public.homes(id) on delete set null,
  add column if not exists maintenance_log_id uuid references public.home_maintenance_log(id) on delete set null,
  add column if not exists service_request_id uuid references public.service_requests(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists title text,
  add column if not exists notes text not null default '',
  add column if not exists due_on date,
  add column if not exists status text not null default 'open',
  add column if not exists completed_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.home_reminders
  alter column homeowner_user_id set not null,
  alter column title set not null,
  alter column notes set default '',
  alter column notes set not null,
  alter column due_on set not null,
  alter column status set default 'open',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.home_reminders
  drop constraint if exists home_reminders_status_check;

alter table public.home_reminders
  add constraint home_reminders_status_check
  check (status in ('open', 'completed', 'dismissed'));

create index if not exists home_reminders_homeowner_status_due_idx
  on public.home_reminders(homeowner_user_id, status, due_on);

create index if not exists home_reminders_home_due_idx
  on public.home_reminders(home_id, due_on)
  where home_id is not null;

create index if not exists home_reminders_maintenance_log_idx
  on public.home_reminders(maintenance_log_id)
  where maintenance_log_id is not null;

drop trigger if exists home_reminders_touch_updated_at on public.home_reminders;

create trigger home_reminders_touch_updated_at
before update on public.home_reminders
for each row
execute function public.touch_updated_at();

alter table public.home_reminders enable row level security;

drop policy if exists "Home reminders: homeowners read own" on public.home_reminders;
drop policy if exists "Home reminders: homeowners create own" on public.home_reminders;
drop policy if exists "Home reminders: homeowners update own" on public.home_reminders;
drop policy if exists "Home reminders: homeowners delete own" on public.home_reminders;

create policy "Home reminders: homeowners read own"
  on public.home_reminders
  for select
  to authenticated
  using (homeowner_user_id = auth.uid());

create policy "Home reminders: homeowners create own"
  on public.home_reminders
  for insert
  to authenticated
  with check (homeowner_user_id = auth.uid());

create policy "Home reminders: homeowners update own"
  on public.home_reminders
  for update
  to authenticated
  using (homeowner_user_id = auth.uid())
  with check (homeowner_user_id = auth.uid());

create policy "Home reminders: homeowners delete own"
  on public.home_reminders
  for delete
  to authenticated
  using (homeowner_user_id = auth.uid());

grant select, insert, update, delete on public.home_reminders to authenticated;

notify pgrst, 'reload schema';

commit;
