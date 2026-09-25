-- Approved Demo-only audit-row ownership amendment, 2026-09-25.
-- Only bdytwgejqnlblhrnqxkp. No product table/grant/trigger changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $preflight$
begin
  if md5(pg_get_functiondef('public.servsync_demo_reset_order(text, text)'::regprocedure)) <> 'a0660c958941c22f02f57795f583a1c4' then
    raise exception 'Demo audit amendment baseline differs: public.servsync_demo_reset_order(text, text)';
  end if;
  if md5(pg_get_functiondef('public.servsync_demo_reset_pk_column(text, text)'::regprocedure)) <> 'a8dd7dc8b3cc72ae947b827600d0adf1' then
    raise exception 'Demo audit amendment baseline differs: public.servsync_demo_reset_pk_column(text, text)';
  end if;
  if md5(pg_get_functiondef('public.servsync_demo_reset_registered_run(uuid)'::regprocedure)) <> '9bb9ff6b73be3f0284b7d1d99902b643' then
    raise exception 'Demo audit amendment baseline differs: public.servsync_demo_reset_registered_run(uuid)';
  end if;
  if exists (select 1 from public.demo_scenario_runs where target_project_ref <> 'bdytwgejqnlblhrnqxkp') then
    raise exception 'Unexpected Demo environment registry.';
  end if;
  if to_regclass('public.estimate_actor_audit') is null then
    raise exception 'Existing Estimate audit foundation is required.';
  end if;
end;
$preflight$;
CREATE OR REPLACE FUNCTION public.servsync_demo_reset_order(p_schema_name text, p_table_name text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
  select case
    when p_schema_name <> 'public' then null
    when p_table_name = 'contractor_work_draft_launches' then 130
    when p_table_name = 'contractor_work_draft_items' then 129
    when p_table_name = 'contractor_work_drafts' then 128
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
    when p_table_name = 'estimate_actor_audit' then 91
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
$function$
;
CREATE OR REPLACE FUNCTION public.servsync_demo_reset_pk_column(p_schema_name text, p_table_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
  select case
    when public.servsync_demo_reset_order(p_schema_name, p_table_name) is null then null
    when p_table_name = 'estimate_actor_audit' then 'estimate_id'
    when p_table_name = 'connection_permissions' then 'connection_id'
    else 'id'
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.servsync_demo_reset_registered_run(p_run_id uuid)
 RETURNS TABLE(schema_name text, table_name text, record_role text, deleted_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.demo_scenario_runs;
  v_record record;
  v_deleted integer;
  v_payment_invoice_id uuid;
  v_guard record;
  v_fk record;
  v_row jsonb;
  v_unexpected boolean;
begin
  select * into v_run
    from public.demo_scenario_runs
   where id = p_run_id
   limit 1 for update;

  if v_run.id is null then
    raise exception 'Demo scenario run was not found.';
  end if;


  -- Draft-first recorder ownership is independent of water_heater_core_loop.
  if v_run.scenario_key = 'draft_first_estimate' or exists (
    select 1 from public.demo_scenario_records r where r.run_id = p_run_id
      and r.table_name in ('contractor_work_drafts', 'contractor_work_draft_items', 'contractor_work_draft_launches', 'estimate_actor_audit')
  ) then
    if v_run.scenario_key <> 'draft_first_estimate'
       or v_run.target_project_ref <> 'bdytwgejqnlblhrnqxkp'
       or nullif(v_run.metadata->>'contractor_id', '') is null
       or nullif(v_run.metadata->>'homeowner_user_id', '') is null
       or nullif(v_run.metadata->>'home_id', '') is null then
      raise exception 'Draft-first reset requires the isolated Demo run and identity lineage.';
    end if;

    if nullif(v_run.metadata->>'contractor_user_id', '') is null then
      raise exception 'Draft-first reset requires the recording actor identity.';
    end if;

    -- Serialize registration and lock targets plus all inbound FK relations before
    -- checking. This also protects SET NULL/CASCADE children from concurrent writes.
    lock table public.demo_scenario_records in share row exclusive mode;
    for v_guard in
      select distinct c.oid, n.nspname, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.oid in (
        select to_regclass('public.' || name) from unnest(array[
          'contractor_work_drafts','contractor_work_draft_items','contractor_work_draft_launches',
          'estimates','estimate_line_items','estimate_actor_audit']) name
        union
        select conrelid from pg_constraint where contype = 'f' and confrelid in (
          'public.contractor_work_drafts'::regclass,'public.contractor_work_draft_items'::regclass,
          'public.contractor_work_draft_launches'::regclass,'public.estimates'::regclass,
          'public.estimate_line_items'::regclass,'public.estimate_actor_audit'::regclass)
      ) order by c.oid
    loop
      execute format('lock table %I.%I in share row exclusive mode', v_guard.nspname, v_guard.relname);
    end loop;

    for v_guard in select * from public.demo_scenario_records r where r.run_id = p_run_id loop
      if v_guard.schema_name <> 'public' or v_guard.primary_key_column <> public.servsync_demo_reset_pk_column(v_guard.schema_name, v_guard.table_name)
         or v_guard.table_name not in ('contractor_work_drafts','contractor_work_draft_items',
           'contractor_work_draft_launches','estimates','estimate_line_items','estimate_actor_audit')
         or v_guard.record_role <> 'draft_first_' || v_guard.table_name
         or v_guard.reset_order <> public.servsync_demo_reset_order('public', v_guard.table_name)
         or exists (select 1 from public.demo_scenario_records r
           where r.run_id <> p_run_id and r.schema_name = v_guard.schema_name
             and r.table_name = v_guard.table_name and r.record_id = v_guard.record_id) then
        raise exception 'Draft-first reset encountered an unsupported or cross-run registration.';
      end if;
      execute format('select to_jsonb(t) from public.%I t where %I = $1', v_guard.table_name, v_guard.primary_key_column)
        into v_row using v_guard.record_id;
      if v_row is null then
        raise exception 'Draft-first reset requires every registered record to exist.';
      end if;
      if v_guard.table_name <> 'estimate_line_items'
         and v_row->>'contractor_id' is distinct from v_run.metadata->>'contractor_id' then
        raise exception 'Draft-first contractor lineage mismatch.';
      end if;
      if v_guard.table_name in ('contractor_work_drafts', 'estimates') then
        if v_row->>'homeowner_user_id' is distinct from v_run.metadata->>'homeowner_user_id'
           or v_row->>'home_id' is distinct from v_run.metadata->>'home_id'
           or v_row->>'service_request_id' is not null or v_row->>'local_contact_id' is not null
           or v_row->>'local_home_id' is not null or v_row->>'inspection_id' is not null
           or v_row->>'legacy_inspection_id' is not null then
          raise exception 'Draft-first customer/property lineage mismatch.';
        end if;
      end if;
      if v_guard.table_name = 'contractor_work_drafts' then
        if v_row->>'status' not in ('active','consumed') or v_row->>'work_format' is distinct from 'standard'
           or v_row->>'intended_output' is distinct from 'estimate'
           or v_row->>'launched_job_id' is not null or v_row->>'launched_job_id_snapshot' is not null
           or v_row->>'launched_invoice_id' is not null or v_row->>'launched_invoice_id_snapshot' is not null
           or (v_row->>'launched_output_type' is not null and v_row->>'launched_output_type' <> 'estimate') then
          raise exception 'Draft-first reset rejects non-Estimate Drafts.';
        end if;
        if v_row->>'status' = 'consumed' and (
          v_row->>'launched_estimate_id' is null
          or v_row->>'launched_estimate_id_snapshot' is distinct from v_row->>'launched_estimate_id'
          or not exists (select 1 from public.demo_scenario_records r where r.run_id = p_run_id
            and r.table_name = 'estimates' and r.record_id::text = v_row->>'launched_estimate_id')
        ) then raise exception 'Draft-first consumed output is not owned by this run.'; end if;
        if v_row->>'status' = 'active' and (v_row->>'launched_estimate_id' is not null
          or v_row->>'launched_estimate_id_snapshot' is not null) then
          raise exception 'Draft-first active Draft unexpectedly has an output.';
        end if;
      elsif v_guard.table_name in ('contractor_work_draft_items','contractor_work_draft_launches') then
        if not exists (select 1 from public.demo_scenario_records r where r.run_id = p_run_id
          and r.table_name = 'contractor_work_drafts' and r.record_id::text = v_row->>'draft_id') then
          raise exception 'Draft-first child belongs to another Draft.';
        end if;
        if v_guard.table_name = 'contractor_work_draft_launches' then
          if v_row->>'requested_output' is distinct from 'estimate' or v_row->>'status' is distinct from 'succeeded'
             or v_row->>'launched_job_id' is not null or v_row->>'launched_job_id_snapshot' is not null
             or v_row->>'launched_invoice_id' is not null or v_row->>'launched_invoice_id_snapshot' is not null
             or v_row->>'launched_estimate_id_snapshot' is distinct from v_row->>'launched_estimate_id'
             or not exists (select 1 from public.demo_scenario_records r where r.run_id = p_run_id
               and r.table_name = 'estimates' and r.record_id::text = v_row->>'launched_estimate_id')
             or not exists (select 1 from public.contractor_work_drafts d
               where d.id::text = v_row->>'draft_id' and d.status = 'consumed'
                 and d.launched_estimate_id::text = v_row->>'launched_estimate_id') then
            raise exception 'Draft-first launch output lineage mismatch.';
          end if;
        end if;
      elsif v_guard.table_name = 'estimates' then
        if v_row->>'status' is distinct from 'draft' or not exists (
          select 1 from public.contractor_work_drafts d join public.demo_scenario_records r
            on r.record_id = d.id and r.table_name = 'contractor_work_drafts' and r.run_id = p_run_id
          where d.launched_estimate_id = v_guard.record_id and d.status = 'consumed'
        ) then raise exception 'Draft-first reset requires an unsent Estimate from its owned Draft.'; end if;
      elsif v_guard.table_name = 'estimate_actor_audit' then
        if v_row->>'estimate_id' is distinct from v_guard.record_id::text
           or v_row->>'created_by_user_id' is distinct from v_run.metadata->>'contractor_user_id'
           or (v_row->>'last_edited_by_user_id' is not null
               and v_row->>'last_edited_by_user_id' is distinct from v_run.metadata->>'contractor_user_id')
           or v_row->>'sent_by_user_id' is not null or v_row->>'sent_at' is not null
           or v_row->>'created_at' is null
           or (v_row->>'created_at')::timestamptz < v_run.started_at
           or not exists (select 1 from public.contractor_profiles cp
             where cp.id::text = v_run.metadata->>'contractor_id'
               and cp.owner_user_id::text = v_run.metadata->>'contractor_user_id')
           or not exists (select 1 from public.demo_scenario_records r
             where r.run_id = p_run_id and r.table_name = 'estimates'
               and r.record_id = v_guard.record_id) then
          raise exception 'Draft-first audit row is not new, unsent attribution for the same actor and Estimate.';
        end if;
      elsif v_guard.table_name = 'estimate_line_items' then
        if not exists (select 1 from public.demo_scenario_records r where r.run_id = p_run_id
          and r.table_name = 'estimates' and r.record_id::text = v_row->>'estimate_id') then
          raise exception 'Draft-first Estimate item belongs to another output.';
        end if;
      end if;

      -- Check every inbound FK, including composite keys and future dependencies.
      -- Any unregistered child is a hard failure before the first delete.
      for v_fk in
        select con.conrelid::regclass as child_table, ns.nspname as child_schema, cl.relname as child_name,
          string_agg(format('child.%I = parent.%I', ca.attname, pa.attname), ' and ' order by k.ord) as join_sql
        from pg_constraint con
        join pg_class cl on cl.oid = con.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
        cross join lateral unnest(con.conkey, con.confkey) with ordinality k(child_att, parent_att, ord)
        join pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = k.child_att
        join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = k.parent_att
        where con.contype = 'f' and con.confrelid = to_regclass('public.' || v_guard.table_name)
        group by con.oid, con.conrelid, ns.nspname, cl.relname
      loop
        execute format('select exists (select 1 from %s child join public.%I parent on %s
          where parent.%I = $1 and not exists (select 1 from public.demo_scenario_records owned
          where owned.run_id = $2 and owned.schema_name = $3 and owned.table_name = $4
          and owned.record_id::text = to_jsonb(child)->>owned.primary_key_column))',
          v_fk.child_table, v_guard.table_name, v_fk.join_sql, v_guard.primary_key_column)
          into v_unexpected using v_guard.record_id, p_run_id, v_fk.child_schema, v_fk.child_name;
        if v_unexpected then raise exception 'Draft-first reset rejected an unregistered dependent in %.', v_fk.child_table; end if;
      end loop;
    end loop;
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
$function$
;
commit;
