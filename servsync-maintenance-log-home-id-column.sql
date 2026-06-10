-- ServSync maintenance log home_id foundation.
-- Apply after servsync-maintenance-log.sql and before patches that read maintenance log home_id.

begin;

alter table public.home_maintenance_log
  add column if not exists home_id uuid references public.homes(id) on delete set null;

create index if not exists maintenance_log_homeowner_home_performed_idx
  on public.home_maintenance_log(homeowner_user_id, home_id, performed_at desc);

notify pgrst, 'reload schema';

commit;
