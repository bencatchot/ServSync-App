do $$
declare
  v_owner text;
  v_security_definer boolean;
  v_search_path text[];
begin
  select owner_role.rolname, function_definition.prosecdef, function_definition.proconfig
    into v_owner, v_security_definer, v_search_path
    from pg_proc function_definition
    join pg_roles owner_role on owner_role.oid = function_definition.proowner
   where function_definition.oid = 'public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)'::regprocedure;

  if v_owner <> 'postgres' or not v_security_definer or v_search_path <> array['search_path=public'] then
    raise exception 'Offline payment RPC security posture is not canonical.';
  end if;

  if has_table_privilege('authenticated', 'public.invoice_offline_payment_records', 'select')
     or has_table_privilege('service_role', 'public.invoice_offline_payment_records', 'select')
     or has_function_privilege('public', 'public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)', 'execute')
     or has_function_privilege('service_role', 'public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)', 'execute') then
    raise exception 'Offline payment ledger grants are not canonical.';
  end if;

  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.invoice_offline_payment_records'::regclass) then
    raise exception 'Offline payment ledger must have enabled and forced RLS.';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_offline_payment_records') then
    raise exception 'Offline payment ledger must not expose browser policies.';
  end if;
end;
$$;

insert into public.profiles (id, full_name) values
  ('10000000-0000-0000-0000-000000000001', 'Owner'),
  ('10000000-0000-0000-0000-000000000002', 'Admin'),
  ('10000000-0000-0000-0000-000000000003', 'Office'),
  ('10000000-0000-0000-0000-000000000004', 'Field Technician'),
  ('10000000-0000-0000-0000-000000000005', 'Other Owner');

insert into public.contractor_profiles (id, owner_user_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005');

insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'office', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'field_tech', 'active');

insert into public.estimates (id, contractor_id, local_contact_id, title, status, total_cents) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Fixed deposit', 'accepted', 1000000),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Percentage deposit', 'accepted', 250000),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'No deposit', 'accepted', 50000),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Other tenant', 'accepted', 100000),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Concurrent deposit', 'accepted', 120000);

insert into public.estimate_payment_schedule_items (
  id, estimate_id, invoice_type, label, amount_type, amount_value, calculated_amount_cents, due_trigger, sort_order
) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'deposit', 'Deposit', 'fixed', 2000, 200000, 'Due on approval', 0),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'progress', 'Progress', 'fixed', 3000, 300000, 'Halfway', 1),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'final', 'Final', 'fixed', 5000, 500000, 'Completion', 2),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', 'deposit', 'Deposit', 'percentage', 20, 50000, 'Due on approval', 0),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000004', 'deposit', 'Deposit', 'fixed', 500, 50000, 'Due on approval', 0),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000005', 'deposit', 'Deposit', 'fixed', 300, 30000, 'Due on approval', 0);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select public.servsync_create_invoice_from_estimate_schedule_item('40000000-0000-0000-0000-000000000001');
select public.servsync_create_invoice_from_estimate_schedule_item('40000000-0000-0000-0000-000000000001');

reset role;
do $$
declare
  v_invoice public.invoices;
begin
  select invoice.* into v_invoice
    from public.invoices invoice
   where invoice.estimate_id = '30000000-0000-0000-0000-000000000001'
     and invoice.invoice_type = 'deposit';
  if v_invoice.total_cents <> 200000 or v_invoice.status <> 'draft'
     or (select count(*) from public.invoices where estimate_id = v_invoice.estimate_id and invoice_type = 'deposit') <> 1
     or (select linked_invoice_id from public.estimate_payment_schedule_items where id = '40000000-0000-0000-0000-000000000001') <> v_invoice.id then
    raise exception 'Fixed Deposit Invoice creation or retry safety failed.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_create_invoice_from_estimate_schedule_item('40000000-0000-0000-0000-000000000004');

reset role;
do $$
begin
  if (select total_cents from public.invoices where estimate_id = '30000000-0000-0000-0000-000000000002' and invoice_type = 'deposit') <> 50000 then
    raise exception 'Percentage Deposit Invoice did not use its persisted calculated snapshot.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
do $$
begin
  perform public.servsync_create_invoice_from_estimate_schedule_item('40000000-0000-0000-0000-000000000005');
  raise exception 'Cross-tenant schedule access unexpectedly succeeded.';
exception when others then
  if sqlerrm = 'Cross-tenant schedule access unexpectedly succeeded.' then raise; end if;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
do $$
begin
  perform public.servsync_create_invoice_from_estimate_schedule_item('40000000-0000-0000-0000-000000000002');
  raise exception 'Field Technician unexpectedly created a financial Invoice.';
exception when others then
  if sqlerrm = 'Field Technician unexpectedly created a financial Invoice.' then raise; end if;
end;
$$;

reset role;
update public.invoices
   set status = 'sent', issued_at = now()
 where estimate_id = '30000000-0000-0000-0000-000000000001' and invoice_type = 'deposit';
select set_config(
  'servsync.test_invoice_id',
  (select id::text from public.invoices where estimate_id = '30000000-0000-0000-0000-000000000001' and invoice_type = 'deposit'),
  false
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select public.servsync_record_offline_invoice_payment(
  current_setting('servsync.test_invoice_id')::uuid,
  '50000000-0000-0000-0000-000000000001', 50000, current_date, 'check', 'CHK-100', 'First installment'
);
select public.servsync_record_offline_invoice_payment(
  current_setting('servsync.test_invoice_id')::uuid,
  '50000000-0000-0000-0000-000000000001', 50000, current_date, 'check', 'CHK-100', 'First installment'
);

reset role;
do $$
declare
  v_invoice public.invoices;
begin
  select invoice.* into v_invoice from public.invoices invoice
   where invoice.estimate_id = '30000000-0000-0000-0000-000000000001' and invoice.invoice_type = 'deposit';
  if v_invoice.status <> 'partially_paid' or v_invoice.amount_paid_cents <> 50000
     or (select count(*) from public.invoice_offline_payment_records where invoice_id = v_invoice.id) <> 1 then
    raise exception 'Partial payment or idempotent retry failed.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select public.servsync_record_offline_invoice_payment(
  current_setting('servsync.test_invoice_id')::uuid,
  '50000000-0000-0000-0000-000000000002', 150000, current_date, 'bank_transfer', 'ACH-200', null
);

reset role;
do $$
declare
  v_invoice public.invoices;
begin
  select invoice.* into v_invoice from public.invoices invoice
   where invoice.estimate_id = '30000000-0000-0000-0000-000000000001' and invoice.invoice_type = 'deposit';
  if v_invoice.status <> 'paid' or v_invoice.amount_paid_cents <> 200000 or v_invoice.paid_at is null
     or (select count(*) from public.workflow_activity_events where invoice_id = v_invoice.id and event_type = 'invoice_paid') <> 1 then
    raise exception 'Full payment transition or activity event failed.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
do $$
begin
  if jsonb_array_length(public.servsync_list_invoice_offline_payments(current_setting('servsync.test_invoice_id')::uuid)) <> 2 then
    raise exception 'Authorized payment history did not return two safe records.';
  end if;
end;
$$;
reset role;

do $$
begin
  update public.invoice_offline_payment_records set note = 'changed';
  raise exception 'Append-only update unexpectedly succeeded.';
exception when others then
  if sqlerrm = 'Append-only update unexpectedly succeeded.' then raise; end if;
end;
$$;

update public.invoices
   set status = 'void', voided_at = now()
 where estimate_id = '30000000-0000-0000-0000-000000000002' and invoice_type = 'deposit';

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select public.servsync_create_invoice_from_estimate_schedule_item('40000000-0000-0000-0000-000000000004');

reset role;
do $$
begin
  if (select count(*) from public.invoices where estimate_id = '30000000-0000-0000-0000-000000000002' and invoice_type = 'deposit') <> 2
     or (select count(*) from public.invoices where estimate_id = '30000000-0000-0000-0000-000000000002' and invoice_type = 'deposit' and status = 'draft') <> 1
     or (select count(*) from public.invoices where estimate_id = '30000000-0000-0000-0000-000000000002' and invoice_type = 'deposit' and status = 'void') <> 1 then
    raise exception 'Unpaid void replacement did not preserve history and create one new draft.';
  end if;
end;
$$;

do $$
begin
  if pg_get_functiondef('public.servsync_create_job_from_estimate(uuid)'::regprocedure) not like '%job_allowed%' then
    raise exception 'Job handoff foundation was unexpectedly changed by the deposit migration.';
  end if;
end;
$$;
