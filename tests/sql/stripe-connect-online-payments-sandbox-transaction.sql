begin;

create temporary table stripe_validation_context on commit drop as
select
  invoice.id as invoice_id,
  invoice.contractor_id,
  invoice.homeowner_user_id,
  contractor.owner_user_id,
  invoice.status as original_status,
  invoice.amount_paid_cents as original_paid_cents,
  invoice.total_cents - invoice.amount_paid_cents as amount_due_cents
from public.invoices invoice
join public.contractor_profiles contractor on contractor.id = invoice.contractor_id
where invoice.homeowner_user_id is not null
  and invoice.status in ('sent', 'viewed', 'overdue', 'partially_paid')
  and invoice.amount_paid_cents < invoice.total_cents
  and contractor.account_status = 'active'
order by invoice.updated_at desc
limit 1;

grant select on stripe_validation_context to authenticated;

do $$
begin
  if (select count(*) from stripe_validation_context) <> 1 then
    raise exception 'No eligible connected-customer Sandbox Invoice is available for rollback-only validation.';
  end if;
end;
$$;

select public.servsync_sync_stripe_connect_account(
  contractor_id,
  'acct_servsyncsandbox01',
  'active',
  true,
  true,
  true,
  'active',
  'active',
  0,
  'stripe',
  'stripe',
  'full'
)
from stripe_validation_context;

select set_config('request.jwt.claim.sub', homeowner_user_id::text, true)
from stripe_validation_context;
set local role authenticated;
select public.servsync_prepare_authenticated_stripe_invoice_checkout(
  (select invoice_id from stripe_validation_context),
  '90000000-0000-4000-8000-000000000001'
);
reset role;

select public.servsync_record_stripe_checkout_session(
  (select id from public.invoice_online_payment_attempts where idempotency_key = '90000000-0000-4000-8000-000000000001'),
  'cs_test_servsyncsandbox01',
  'pi_servsyncsandbox01'
);

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_servsyncprocessing01',
  '2026-08-08T02:05:00Z',
  'payment_intent.processing',
  'acct_servsyncsandbox01',
  (select id from public.invoice_online_payment_attempts where idempotency_key = '90000000-0000-4000-8000-000000000001'),
  'cs_test_servsyncsandbox01',
  'pi_servsyncsandbox01',
  null,
  'us_bank_account',
  'processing',
  (select amount_due_cents from stripe_validation_context),
  null,
  null
);

do $$
begin
  if (select amount_paid_cents from public.invoices where id = (select invoice_id from stripe_validation_context))
       <> (select original_paid_cents from stripe_validation_context) then
    raise exception 'ACH processing was incorrectly posted as paid.';
  end if;
end;
$$;

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_servsyncsucceeded01',
  '2026-08-08T02:05:01Z',
  'payment_intent.succeeded',
  'acct_servsyncsandbox01',
  (select id from public.invoice_online_payment_attempts where idempotency_key = '90000000-0000-4000-8000-000000000001'),
  'cs_test_servsyncsandbox01',
  'pi_servsyncsandbox01',
  'ch_servsyncsandbox01',
  'us_bank_account',
  'succeeded',
  (select amount_due_cents from stripe_validation_context),
  (select amount_due_cents from stripe_validation_context),
  null
);

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_servsyncsucceeded01',
  '2026-08-08T02:05:01Z',
  'payment_intent.succeeded',
  'acct_servsyncsandbox01',
  (select id from public.invoice_online_payment_attempts where idempotency_key = '90000000-0000-4000-8000-000000000001'),
  'cs_test_servsyncsandbox01',
  'pi_servsyncsandbox01',
  'ch_servsyncsandbox01',
  'us_bank_account',
  'succeeded',
  (select amount_due_cents from stripe_validation_context),
  (select amount_due_cents from stripe_validation_context),
  null
);

select public.servsync_reconcile_stripe_invoice_payment_event(
  'evt_servsynclateprocess1',
  '2026-08-08T02:05:01Z',
  'payment_intent.processing',
  'acct_servsyncsandbox01',
  (select id from public.invoice_online_payment_attempts where idempotency_key = '90000000-0000-4000-8000-000000000001'),
  'cs_test_servsyncsandbox01',
  'pi_servsyncsandbox01',
  null,
  'us_bank_account',
  'processing',
  (select amount_due_cents from stripe_validation_context),
  null,
  null
);

do $$
begin
  if (select status from public.invoices where id = (select invoice_id from stripe_validation_context)) <> 'paid'
     or (select amount_paid_cents from public.invoices where id = (select invoice_id from stripe_validation_context))
       <> (select original_paid_cents + amount_due_cents from stripe_validation_context)
     or (select state from public.invoice_online_payment_attempts where idempotency_key = '90000000-0000-4000-8000-000000000001') <> 'succeeded'
     or (select count(*) from public.stripe_connect_payment_events where event_id = 'evt_servsyncsucceeded01') <> 1
     or (select processing_outcome from public.stripe_connect_payment_events where event_id = 'evt_servsynclateprocess1') <> 'ignored' then
    raise exception 'Sandbox settlement, idempotency, or ordering validation failed.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', owner_user_id::text, true)
from stripe_validation_context;
set local role authenticated;
do $$
begin
  if (select count(*) from public.servsync_list_invoice_online_payments(
    (select invoice_id from stripe_validation_context)
  )) <> 1 then
    raise exception 'Sanitized contractor online-payment history is unavailable.';
  end if;
end;
$$;
reset role;

rollback;
