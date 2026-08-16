-- ServSync Demo recorder flagship fixture-registry extension.
--
-- Dedicated Demo project only: bdytwgejqnlblhrnqxkp.
-- This patch adds exact-row reset ownership for contractor-created Discover
-- posts and canonical Invoice rows used by the platform-introduction recorder.
-- It does not alter product RLS, grants, or Production/Sandbox projects.

begin;

create or replace function public.servsync_demo_reset_order(
  p_schema_name text,
  p_table_name text
)
returns integer
language sql
immutable
strict
set search_path = public
as $$
  select case
    when p_schema_name <> 'public' then null
    when p_table_name = 'contractor_posts' then 125
    when p_table_name = 'workflow_activity_events' then 120
    when p_table_name = 'home_maintenance_log' then 119
    when p_table_name = 'home_documents' then 118
    when p_table_name = 'notifications' then 115
    when p_table_name = 'invoice_line_items' then 114
    when p_table_name = 'invoices' then 113
    when p_table_name = 'contractor_visit_events' then 112
    when p_table_name = 'job_work_items' then 110
    when p_table_name = 'estimate_payment_schedule_items' then 100
    when p_table_name = 'estimate_line_items' then 90
    when p_table_name = 'inspections' then 80
    when p_table_name = 'estimates' then 70
    when p_table_name = 'service_request_messages' then 60
    when p_table_name = 'service_requests' then 50
    when p_table_name = 'connection_audit_events' then 45
    when p_table_name = 'connection_permissions' then 42
    when p_table_name = 'homeowner_contractor_connections' then 40
    when p_table_name = 'home_assets' then 34
    when p_table_name = 'home_rooms' then 32
    when p_table_name = 'homes' then 30
    else null
  end;
$$;

comment on function public.servsync_demo_reset_order(text, text) is
  'Internal helper listing the only core tables the demo reset runner may remove from, with reverse dependency priority. This is not a browser API.';

revoke execute on function public.servsync_demo_reset_order(text, text) from public;
revoke execute on function public.servsync_demo_reset_order(text, text) from anon;
revoke execute on function public.servsync_demo_reset_order(text, text) from authenticated;
grant execute on function public.servsync_demo_reset_order(text, text) to service_role;

notify pgrst, 'reload schema';

commit;
