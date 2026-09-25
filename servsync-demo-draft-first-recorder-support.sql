-- Demo-only Draft-first tutorial recorder support. Approved 2026-09-25.
-- Install only on bdytwgejqnlblhrnqxkp. Preserves all existing ACLs and reset behavior.
-- Guard exact reviewed helper bodies; do not apply over unexpected infrastructure.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $migration$
declare
  v_order text := pg_get_functiondef('public.servsync_demo_reset_order(text,text)'::regprocedure);
  v_reset text := pg_get_functiondef('public.servsync_demo_reset_registered_run(uuid)'::regprocedure);
begin
  if md5(v_order) <> '6e0466f0cdfb675cae18c909561d2b1b'
     or md5(v_reset) <> '4f734806a2ea7f8378ed15df2cf57be0' then
    raise exception 'Demo recorder helper baseline differs from the reviewed preflight.';
  end if;
  if to_regclass('public.contractor_work_drafts') is null
     or to_regclass('public.contractor_work_draft_items') is null
     or to_regclass('public.contractor_work_draft_launches') is null then
    raise exception 'The supported Draft foundation must already exist.';
  end if;
  if exists (select 1 from public.demo_scenario_runs where target_project_ref <> 'bdytwgejqnlblhrnqxkp') then
    raise exception 'Unexpected environment in Demo registry.';
  end if;
  if has_function_privilege('anon', 'public.servsync_demo_reset_registered_run(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.servsync_demo_reset_registered_run(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.servsync_demo_reset_registered_run(uuid)', 'execute') then
    raise exception 'Unexpected Demo helper permissions.';
  end if;
  execute replace(v_order, '    when p_table_name = ''contractor_posts'' then 125',
    '    when p_table_name = ''contractor_work_draft_launches'' then 130
    when p_table_name = ''contractor_work_draft_items'' then 129
    when p_table_name = ''contractor_work_drafts'' then 128
    when p_table_name = ''contractor_posts'' then 125');
  v_reset := replace(v_reset, '  v_payment_invoice_id uuid;',
    '  v_payment_invoice_id uuid;
  v_guard record;
  v_fk record;
  v_row jsonb;
  v_unexpected boolean;');
  v_reset := replace(v_reset, '   limit 1;', '   limit 1 for update;');
  v_reset := replace(v_reset, '  for v_record in', $guard$
  -- Draft-first recorder ownership is independent of water_heater_core_loop.
  if v_run.scenario_key = 'draft_first_estimate' or exists (
    select 1 from public.demo_scenario_records r where r.run_id = p_run_id
      and r.table_name in ('contractor_work_drafts', 'contractor_work_draft_items', 'contractor_work_draft_launches')
  ) then
    if v_run.scenario_key <> 'draft_first_estimate'
       or v_run.target_project_ref <> 'bdytwgejqnlblhrnqxkp'
       or nullif(v_run.metadata->>'contractor_id', '') is null
       or nullif(v_run.metadata->>'homeowner_user_id', '') is null
       or nullif(v_run.metadata->>'home_id', '') is null then
      raise exception 'Draft-first reset requires the isolated Demo run and identity lineage.';
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
          'estimates','estimate_line_items']) name
        union
        select conrelid from pg_constraint where contype = 'f' and confrelid in (
          'public.contractor_work_drafts'::regclass,'public.contractor_work_draft_items'::regclass,
          'public.contractor_work_draft_launches'::regclass,'public.estimates'::regclass,
          'public.estimate_line_items'::regclass)
      ) order by c.oid
    loop
      execute format('lock table %I.%I in share row exclusive mode', v_guard.nspname, v_guard.relname);
    end loop;

    for v_guard in select * from public.demo_scenario_records r where r.run_id = p_run_id loop
      if v_guard.schema_name <> 'public' or v_guard.primary_key_column <> 'id'
         or v_guard.table_name not in ('contractor_work_drafts','contractor_work_draft_items',
           'contractor_work_draft_launches','estimates','estimate_line_items')
         or v_guard.record_role <> 'draft_first_' || v_guard.table_name
         or v_guard.reset_order <> public.servsync_demo_reset_order('public', v_guard.table_name)
         or exists (select 1 from public.demo_scenario_records r
           where r.run_id <> p_run_id and r.schema_name = v_guard.schema_name
             and r.table_name = v_guard.table_name and r.record_id = v_guard.record_id) then
        raise exception 'Draft-first reset encountered an unsupported or cross-run registration.';
      end if;
      execute format('select to_jsonb(t) from public.%I t where id = $1', v_guard.table_name)
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
          where parent.id = $1 and not exists (select 1 from public.demo_scenario_records owned
          where owned.run_id = $2 and owned.schema_name = $3 and owned.table_name = $4
          and owned.record_id::text = to_jsonb(child)->>''id''))',
          v_fk.child_table, v_guard.table_name, v_fk.join_sql)
          into v_unexpected using v_guard.record_id, p_run_id, v_fk.child_schema, v_fk.child_name;
        if v_unexpected then raise exception 'Draft-first reset rejected an unregistered dependent in %.', v_fk.child_table; end if;
      end loop;
    end loop;
  end if;

$guard$ || '  for v_record in');
  execute v_reset;
end;
$migration$;
commit;
