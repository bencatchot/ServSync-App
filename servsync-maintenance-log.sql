-- ServSync home maintenance log.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-reviews.sql.

begin;

create table if not exists public.home_maintenance_log (
  id                 uuid        primary key default gen_random_uuid(),
  homeowner_user_id  uuid        not null references auth.users(id) on delete cascade,
  service_request_id uuid        references public.service_requests(id) on delete set null,
  category           text        not null default '',
  title              text        not null,
  description        text        not null default '',
  performed_at       date        not null,
  contractor_name    text        not null default '',
  cost_cents         int         check (cost_cents is null or cost_cents >= 0),
  notes              text        not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists maintenance_log_homeowner_idx
  on public.home_maintenance_log(homeowner_user_id, performed_at desc);

alter table public.home_maintenance_log enable row level security;

drop policy if exists "log_select_own" on public.home_maintenance_log;
create policy "log_select_own"
  on public.home_maintenance_log for select to authenticated
  using (homeowner_user_id = auth.uid());

drop policy if exists "log_insert_own" on public.home_maintenance_log;
create policy "log_insert_own"
  on public.home_maintenance_log for insert to authenticated
  with check (homeowner_user_id = auth.uid());

drop policy if exists "log_update_own" on public.home_maintenance_log;
create policy "log_update_own"
  on public.home_maintenance_log for update to authenticated
  using (homeowner_user_id = auth.uid());

drop policy if exists "log_delete_own" on public.home_maintenance_log;
create policy "log_delete_own"
  on public.home_maintenance_log for delete to authenticated
  using (homeowner_user_id = auth.uid());

grant select, insert, update, delete on public.home_maintenance_log to authenticated;

notify pgrst, 'reload schema';

commit;
