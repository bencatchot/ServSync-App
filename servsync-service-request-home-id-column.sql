-- ServSync service request home_id foundation.
-- Apply after servsync-service-requests-v1.sql and before patches that read service_requests.home_id.

begin;

alter table public.service_requests
  add column if not exists home_id uuid references public.homes(id) on delete set null;

create index if not exists service_requests_homeowner_home_updated_idx
  on public.service_requests(homeowner_user_id, home_id, updated_at desc);

notify pgrst, 'reload schema';

commit;
