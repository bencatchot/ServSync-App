-- ServSync Phase 0.6 dedicated-Demo Invoice fixture reset extension.
--
-- Apply only to Demo project bdytwgejqnlblhrnqxkp after separate owner approval.
-- Never apply to Production or shared Sandbox. This adds no browser authority.

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
    when p_table_name = 'home_reminders' then 124
    when p_table_name = 'invoice_offline_payment_records' then 123
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

create or replace function public.servsync_demo_reset_registered_run(p_run_id uuid)
returns table (
  schema_name text,
  table_name text,
  record_role text,
  deleted_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.demo_scenario_runs;
  v_record record;
  v_deleted integer;
  v_payment_invoice_id uuid;
begin
  select * into v_run
    from public.demo_scenario_runs
   where id = p_run_id
   limit 1;

  if v_run.id is null then
    raise exception 'Demo scenario run was not found.';
  end if;

  for v_record in
    select *
      from public.demo_scenario_records
     where run_id = p_run_id
     order by reset_order desc, created_at desc
  loop
    if public.servsync_demo_reset_order(v_record.schema_name, v_record.table_name) is null
       or public.servsync_demo_reset_pk_column(v_record.schema_name, v_record.table_name) <> v_record.primary_key_column then
      raise exception 'Registered demo target %.% is no longer allowed.', v_record.schema_name, v_record.table_name;
    end if;

    if v_record.table_name = 'invoice_offline_payment_records' then
      if v_record.record_role not in ('demo_invoice_partial_payment', 'demo_invoice_final_payment') then
        raise exception 'Registered Demo payment row has an unsupported ownership role.';
      end if;

      select payment.invoice_id into v_payment_invoice_id
        from public.invoice_offline_payment_records payment
       where payment.id = v_record.record_id;

      if v_payment_invoice_id is not null and not exists (
        select 1
          from public.demo_scenario_records invoice_record
         where invoice_record.run_id = p_run_id
           and invoice_record.schema_name = 'public'
           and invoice_record.table_name = 'invoices'
           and invoice_record.primary_key_column = 'id'
           and invoice_record.record_id = v_payment_invoice_id
           and invoice_record.record_role = 'demo_invoice'
      ) then
        raise exception 'Registered Demo payment row points to an Invoice not owned by the same run.';
      end if;

      alter table public.invoice_offline_payment_records
        disable trigger invoice_offline_payment_records_immutable;
      delete from public.invoice_offline_payment_records
       where id = v_record.record_id
         and (v_payment_invoice_id is null or invoice_id = v_payment_invoice_id);
      get diagnostics v_deleted = row_count;
      alter table public.invoice_offline_payment_records
        enable trigger invoice_offline_payment_records_immutable;
    else
      execute format(
        'delete from %I.%I where %I = $1',
        v_record.schema_name,
        v_record.table_name,
        v_record.primary_key_column
      )
      using v_record.record_id;
      get diagnostics v_deleted = row_count;
    end if;
    schema_name := v_record.schema_name;
    table_name := v_record.table_name;
    record_role := v_record.record_role;
    deleted_count := v_deleted;
    return next;
  end loop;

  delete from public.demo_scenario_records where run_id = p_run_id;
  update public.demo_scenario_runs
     set status = 'reset', completed_at = now(), updated_at = now()
   where id = p_run_id;
end;
$$;

comment on function public.servsync_demo_reset_registered_run(uuid) is
  'Dedicated-Demo service-role helper. Deletes exact registered run rows; immutable payment rows require same-run Invoice ownership and the exact named trigger bypass inside one locked transaction.';

revoke execute on function public.servsync_demo_reset_order(text, text) from public;
revoke execute on function public.servsync_demo_reset_order(text, text) from anon;
revoke execute on function public.servsync_demo_reset_order(text, text) from authenticated;
revoke execute on function public.servsync_demo_reset_registered_run(uuid) from public;
revoke execute on function public.servsync_demo_reset_registered_run(uuid) from anon;
revoke execute on function public.servsync_demo_reset_registered_run(uuid) from authenticated;
grant execute on function public.servsync_demo_reset_order(text, text) to service_role;
grant execute on function public.servsync_demo_reset_registered_run(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
