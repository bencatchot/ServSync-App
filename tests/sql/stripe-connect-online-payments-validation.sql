insert into public.profiles (id, full_name, email) values
  ('10000000-0000-0000-0000-000000000001', 'Owner', 'owner@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'Homeowner', 'homeowner@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'Field', 'field@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'Other owner', 'other@example.test');

insert into public.contractor_profiles (id, owner_user_id, business_name, email, account_status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Fixture Services', 'billing@example.test', 'active'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'Other Services', 'other@example.test', 'active');

insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'field_tech', 'active');

select public.servsync_sync_stripe_connect_account(
  '20000000-0000-0000-0000-000000000001', 'acct_fixture12345678', 'active',
  true, true, true, 'active', 'active', 0, 'stripe', 'stripe', 'full'
);

do $$
begin
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.contractor_stripe_payment_accounts'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.invoice_online_payment_attempts'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.stripe_connect_payment_events'::regclass) then
    raise exception 'Private Stripe tables must use forced RLS.';
  end if;
  if has_table_privilege('authenticated', 'public.contractor_stripe_payment_accounts', 'select')
     or has_table_privilege('service_role', 'public.invoice_online_payment_attempts', 'select')
     or has_table_privilege('anon', 'public.stripe_connect_payment_events', 'insert') then
    raise exception 'Stripe private table privileges are too broad.';
  end if;
  if not has_function_privilege('authenticated', 'public.servsync_authorize_stripe_connect_onboarding()', 'execute')
     or has_function_privilege('service_role', 'public.servsync_authorize_stripe_connect_onboarding()', 'execute')
     or has_function_privilege('anon', 'public.servsync_prepare_authenticated_stripe_invoice_checkout(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.servsync_get_stripe_connect_account_contractor(text)', 'execute')
     or not has_function_privilege('service_role', 'public.servsync_reconcile_stripe_invoice_payment_event(text,timestamptz,text,text,uuid,text,text,text,text,text,integer,integer,text)', 'execute') then
    raise exception 'Stripe RPC grants are incompatible.';
  end if;
  if exists (
    select 1 from pg_proc procedure
     where procedure.pronamespace = 'public'::regnamespace
       and procedure.proname like 'servsync%stripe%'
       and procedure.prosecdef
       and procedure.proconfig is distinct from array['search_path=public']::text[]
  ) then
    raise exception 'A Stripe SECURITY DEFINER function has an unsafe search_path.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
do $$
declare v jsonb;
begin
  v := public.servsync_authorize_stripe_connect_onboarding();
  if v->>'contractor_id' <> '20000000-0000-0000-0000-000000000001' then raise exception 'Owner onboarding authorization failed.'; end if;
  v := public.servsync_get_stripe_connect_account_status();
  if v->>'state' <> 'active' or (v->>'application_fee_cents')::int <> 0 then raise exception 'Connected account status failed.'; end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
do $$ begin
  begin perform public.servsync_authorize_stripe_connect_onboarding(); raise exception 'Field Technician unexpectedly configured Stripe.';
  exception when others then if sqlerrm = 'Field Technician unexpectedly configured Stripe.' then raise; end if; end;
end $$;
reset role;

insert into public.invoices (
  id, contractor_id, homeowner_user_id, invoice_number, title, status,
  total_cents, amount_paid_cents, issued_at
) values (
  '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002', 'INV-ONLINE-1', 'Deposit Invoice', 'partially_paid',
  200000, 50000, now()
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select public.servsync_prepare_authenticated_stripe_invoice_checkout(
  '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'
);
reset role;

do $$
begin
  if (select amount_cents from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001') <> 150000 then
    raise exception 'Checkout did not derive the exact outstanding balance.';
  end if;
end;
$$;

select public.servsync_record_stripe_checkout_session(
  (select id from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001'),
  'cs_test_fixture12345678', 'pi_fixture12345678'
);

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_processing12345678', now(), 'payment_intent.processing', 'acct_fixture12345678',
  (select id from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001'),
  'cs_test_fixture12345678', 'pi_fixture12345678', null, 'us_bank_account', 'processing', 150000, null, null
);

do $$ begin
  if (select amount_paid_cents from public.invoices where id = '30000000-0000-0000-0000-000000000001') <> 50000 then
    raise exception 'ACH initiation was incorrectly treated as paid.';
  end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    perform public.servsync_record_offline_invoice_payment(
      '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000099',
      1000, current_date, 'cash', null, null
    );
    raise exception 'Offline payment raced an actionable online payment.';
  exception when others then
    if sqlerrm = 'Offline payment raced an actionable online payment.' then raise; end if;
  end;
end $$;
reset role;

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_succeeded12345678', now() + interval '1 second', 'payment_intent.succeeded', 'acct_fixture12345678',
  (select id from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001'),
  'cs_test_fixture12345678', 'pi_fixture12345678', 'py_fixture12345678', 'us_bank_account', 'succeeded', 150000, 150000, null
);
select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_succeeded12345678', now() + interval '1 second', 'payment_intent.succeeded', 'acct_fixture12345678',
  (select id from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001'),
  'cs_test_fixture12345678', 'pi_fixture12345678', 'py_fixture12345678', 'us_bank_account', 'succeeded', 150000, 150000, null
);

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_lateprocessing1234',
  (select last_provider_event_created_at from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001'),
  'payment_intent.processing', 'acct_fixture12345678',
  (select id from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001'),
  'cs_test_fixture12345678', 'pi_fixture12345678', null, 'us_bank_account', 'processing', 150000, null, null
);

do $$ begin
  if (select amount_paid_cents from public.invoices where id = '30000000-0000-0000-0000-000000000001') <> 200000
     or (select status from public.invoices where id = '30000000-0000-0000-0000-000000000001') <> 'paid'
     or (select state from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000001') <> 'succeeded'
     or (select processing_outcome from public.stripe_connect_payment_events where event_id = 'evt_lateprocessing1234') <> 'ignored'
     or (select count(*) from public.stripe_connect_payment_events where event_id = 'evt_succeeded12345678') <> 1 then
    raise exception 'Settled payment, event ordering, or webhook idempotency failed.';
  end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.servsync_list_invoice_online_payments('30000000-0000-0000-0000-000000000001')) <> 1 then
    raise exception 'Contractor online payment history was unavailable.';
  end if;
end $$;
reset role;

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_refunded12345678', now() + interval '2 seconds', 'charge.refunded', 'acct_fixture12345678',
  null, null, 'pi_fixture12345678', 'py_fixture12345678', 'us_bank_account', 'partially_refunded', 150000, 100000, null
);

do $$ begin
  if (select amount_paid_cents from public.invoices where id = '30000000-0000-0000-0000-000000000001') <> 150000
     or (select status from public.invoices where id = '30000000-0000-0000-0000-000000000001') <> 'partially_paid' then
    raise exception 'Provider reversal did not adjust the existing Invoice authority.';
  end if;
end $$;

do $$
begin
  begin
    update public.invoice_online_payment_attempts
       set charge_id = 'provider_fixture12345678'
     where invoice_id = '30000000-0000-0000-0000-000000000001';
    raise exception 'An unknown provider payment identifier prefix was accepted.';
  exception when check_violation then
    null;
  end;
end;
$$;

insert into public.contractor_local_contacts (id, contractor_id, display_name, email) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Local Customer', 'local@example.test');
insert into public.contractor_local_homes (id, contractor_id, local_contact_id) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
insert into public.invoices (
  id, contractor_id, local_contact_id, local_home_id, invoice_number, title, status, total_cents, amount_paid_cents, issued_at
) values (
  '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  'INV-LOCAL-1', 'Local Invoice', 'sent', 10000, 0, now()
);
insert into public.local_invoice_delivery_links (
  id, contractor_id, invoice_id, local_contact_id, local_home_id, status, expires_at
) values (
  '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001', 'active', now() + interval '1 day'
);
insert into public.local_invoice_delivery_sessions (
  session_hash, delivery_link_id, created_at, expires_at
) values (
  decode(repeat('ab', 32), 'hex'), '70000000-0000-0000-0000-000000000001', now(), now() + interval '30 minutes'
);

select public.servsync_prepare_request_free_stripe_invoice_checkout(
  repeat('ab', 32), '40000000-0000-0000-0000-000000000002'
);

do $$ begin
  if (select source from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000002') <> 'request_free'
     or (select delivery_link_id from public.invoice_online_payment_attempts where invoice_id = '30000000-0000-0000-0000-000000000002') <> '70000000-0000-0000-0000-000000000001' then
    raise exception 'Request-free payment was not bound to the protected delivery session.';
  end if;
end $$;

do $$ begin
  begin
    perform public.servsync_sync_stripe_connect_account(
      '20000000-0000-0000-0000-000000000002', 'acct_badfixture1234', 'active',
      true, true, true, 'active', 'active', 0, 'application', 'stripe', 'full'
    );
    raise exception 'Application fee responsibility was accepted.';
  exception when others then if sqlerrm = 'Application fee responsibility was accepted.' then raise; end if; end;
end $$;
