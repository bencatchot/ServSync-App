insert into public.profiles (id, full_name) values
  ('10000000-0000-0000-0000-000000000001', 'Owner'),
  ('10000000-0000-0000-0000-000000000002', 'Office'),
  ('10000000-0000-0000-0000-000000000003', 'Field Technician'),
  ('10000000-0000-0000-0000-000000000004', 'Other Contractor Owner');

insert into public.contractor_profiles (id, owner_user_id)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004');

insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'office', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'field_technician', 'active');

insert into public.invoices (
  id, contractor_id, invoice_number, title, status, subtotal_cents, total_cents,
  amount_paid_cents, issued_at
) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'INV-DRAFT', 'Paid before sending', 'draft', 125000, 125000, 0, null),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'INV-DRAFT-PARTIAL', 'Draft partial denied', 'draft', 80000, 80000, 0, null),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'INV-SENT', 'Existing partial flow', 'sent', 100000, 100000, 0, '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'INV-VIEWED', 'Viewed flow', 'viewed', 60000, 60000, 0, '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'INV-OVERDUE', 'Overdue flow', 'overdue', 70000, 70000, 0, '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'INV-VOID', 'Void denial', 'void', 90000, 90000, 0, '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'INV-PAID', 'Paid denial', 'paid', 50000, 50000, 50000, '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 'INV-OFFICE', 'Office full payment', 'draft', 45000, 45000, 0, null),
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 'INV-OTHER', 'Other tenant', 'draft', 55000, 55000, 0, null);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select public.servsync_record_offline_invoice_payment(
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  125000,
  current_date - 2,
  'check',
  'CHECK-101',
  'Paid directly before the Invoice was sent.'
);

reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';

select public.servsync_record_offline_invoice_payment(
  '30000000-0000-0000-0000-000000000008',
  '40000000-0000-0000-0000-000000000008',
  45000,
  current_date,
  'cash',
  null,
  null
);

reset role;

do $$
begin
  if (select status from public.invoices where id = '30000000-0000-0000-0000-000000000008') <> 'paid'
     or (select recorded_by_user_id from public.invoice_offline_payment_records where invoice_id = '30000000-0000-0000-0000-000000000008') <> '10000000-0000-0000-0000-000000000002' then
    raise exception 'Existing Office billing authority was not preserved.';
  end if;
end;
$$;

do $$
declare
  v_invoice public.invoices;
  v_payment public.invoice_offline_payment_records;
  v_event public.workflow_activity_events;
begin
  select * into v_invoice from public.invoices where id = '30000000-0000-0000-0000-000000000001';
  select * into v_payment from public.invoice_offline_payment_records where invoice_id = v_invoice.id;
  select * into v_event from public.workflow_activity_events where invoice_id = v_invoice.id and event_type = 'invoice_paid';

  if v_invoice.status <> 'paid'
     or v_invoice.amount_paid_cents <> v_invoice.total_cents
     or v_invoice.issued_at is null
     or v_invoice.paid_at is null
     or (v_invoice.paid_at at time zone 'UTC')::date <> current_date - 2 then
    raise exception 'Draft Invoice did not finalize with exact paid state.';
  end if;
  if v_payment.amount_cents <> 125000
     or v_payment.payment_date <> current_date - 2
     or v_payment.payment_method <> 'check'
     or v_payment.reference <> 'CHECK-101'
     or v_payment.note <> 'Paid directly before the Invoice was sent.'
     or v_payment.recorded_by_user_id <> '10000000-0000-0000-0000-000000000001' then
    raise exception 'Draft Invoice payment history was not preserved.';
  end if;
  if v_event.id is null
     or v_event.metadata ->> 'source_rpc' <> 'servsync_record_offline_invoice_payment'
     or v_event.metadata ->> 'finalized_from_draft' <> 'true' then
    raise exception 'Draft Invoice paid activity was not recorded correctly.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

do $$
declare
  v_rows integer;
begin
  begin
    update public.invoices
       set title = 'Unauthorized paid edit'
     where id = '30000000-0000-0000-0000-000000000001';
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'Paid Invoice remained directly editable.';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.servsync_record_offline_invoice_payment(
      '30000000-0000-0000-0000-000000000009', gen_random_uuid(), 55000, current_date, 'cash', null, null
    );
    raise exception 'Expected cross-tenant Invoice denial.';
  exception when others then
    if sqlerrm not like '%Invoice not found%' then raise; end if;
  end;
end;
$$;

do $$
declare
  v_receipt jsonb;
begin
  v_receipt := public.servsync_record_offline_invoice_payment(
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    125000,
    current_date - 2,
    'check',
    'CHECK-101',
    'Paid directly before the Invoice was sent.'
  );
  if (v_receipt ->> 'created')::boolean
     or v_receipt ->> 'status' <> 'paid' then
    raise exception 'Exact replay was not idempotent.';
  end if;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.invoice_offline_payment_records where invoice_id = '30000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Exact replay created a duplicate payment.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    perform public.servsync_record_offline_invoice_payment(
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000002',
      20000,
      current_date,
      'cash',
      null,
      null
    );
    raise exception 'Expected Draft partial-payment denial.';
  exception when others then
    if sqlerrm not like '%Draft Invoice must be marked paid in full%' then raise; end if;
  end;
end;
$$;

select public.servsync_record_offline_invoice_payment(
  '30000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000003',
  25000,
  current_date - 1,
  'cash',
  null,
  null
);
select public.servsync_record_offline_invoice_payment(
  '30000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000004',
  75000,
  current_date,
  'bank_transfer',
  'ACH-22',
  null
);
select public.servsync_record_offline_invoice_payment(
  '30000000-0000-0000-0000-000000000004',
  '40000000-0000-0000-0000-000000000005',
  60000,
  current_date,
  'card_terminal',
  null,
  null
);
select public.servsync_record_offline_invoice_payment(
  '30000000-0000-0000-0000-000000000005',
  '40000000-0000-0000-0000-000000000006',
  70000,
  current_date,
  'other',
  null,
  null
);

reset role;

do $$
begin
  if (select status from public.invoices where id = '30000000-0000-0000-0000-000000000003') <> 'paid'
     or (select amount_paid_cents from public.invoices where id = '30000000-0000-0000-0000-000000000003') <> 100000
     or (select count(*) from public.invoice_offline_payment_records where invoice_id = '30000000-0000-0000-0000-000000000003') <> 2
     or (select status from public.invoices where id = '30000000-0000-0000-0000-000000000004') <> 'paid'
     or (select status from public.invoices where id = '30000000-0000-0000-0000-000000000005') <> 'paid' then
    raise exception 'Existing Invoice payment states regressed.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

do $$
declare
  v_id uuid;
begin
  foreach v_id in array array[
    '30000000-0000-0000-0000-000000000006'::uuid,
    '30000000-0000-0000-0000-000000000007'::uuid
  ] loop
    begin
      perform public.servsync_record_offline_invoice_payment(
        v_id, gen_random_uuid(), 1000, current_date, 'cash', null, null
      );
      raise exception 'Expected void/paid Invoice denial.';
    exception when others then
      if sqlerrm not like '%Only an outstanding Invoice%' then raise; end if;
    end;
  end loop;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
do $$
begin
  begin
    perform public.servsync_record_offline_invoice_payment(
      '30000000-0000-0000-0000-000000000002', gen_random_uuid(), 80000, current_date, 'cash', null, null
    );
    raise exception 'Expected Field Technician denial.';
  exception when others then
    if sqlerrm not like '%Invoice not found%' then raise; end if;
  end;
end;
$$;

reset role;

do $$
declare
  v_function regprocedure := 'public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)'::regprocedure;
begin
  if (select proowner <> 'postgres'::regrole or not prosecdef or proconfig <> array['search_path=public'] from pg_proc where oid = v_function) then
    raise exception 'Payment RPC ownership or fixed-path security changed.';
  end if;
  if not has_function_privilege('authenticated', v_function, 'execute')
     or has_function_privilege('anon', v_function, 'execute')
     or has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'Payment RPC grants changed unexpectedly.';
  end if;
  if (select count(*) from public.invoice_offline_payment_records where invoice_id = '30000000-0000-0000-0000-000000000002') <> 0
     or (select status from public.invoices where id = '30000000-0000-0000-0000-000000000002') <> 'draft' then
    raise exception 'Denied Draft payment left residue.';
  end if;
end;
$$;
