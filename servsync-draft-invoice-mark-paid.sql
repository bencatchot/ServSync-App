-- ServSync Draft Invoice Mark Paid v1.
--
-- Extends the existing append-only offline-payment operation so an authorized
-- billing user can finalize a saved Draft Invoice by recording its full
-- remaining balance. Existing non-draft partial/full payment behavior remains
-- unchanged.

begin;

do $$
begin
  if to_regclass('public.invoices') is null
     or to_regclass('public.invoice_offline_payment_records') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_can_manage_contractor_billing(uuid)') is null
     or to_regprocedure('public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)') is null then
    raise exception 'Missing Draft Invoice Mark Paid prerequisite.';
  end if;
end;
$$;

create or replace function public.servsync_record_offline_invoice_payment(
  p_invoice_id uuid,
  p_idempotency_key uuid,
  p_amount_cents integer,
  p_payment_date date,
  p_payment_method text,
  p_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_payment public.invoice_offline_payment_records;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_reference text := nullif(trim(coalesce(p_reference, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_balance_cents integer;
  v_next_paid_cents integer;
  v_next_status text;
  v_finalizing_draft boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_invoice_id is null or p_idempotency_key is null then
    raise exception 'Invoice and payment operation identifiers are required.';
  end if;

  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id;

  if v_invoice.id is null
     or not public.current_user_can_manage_contractor_billing(v_invoice.contractor_id) then
    raise exception 'Invoice not found.';
  end if;

  perform pg_advisory_xact_lock(hashtext('servsync-record-offline-invoice-payment-' || p_invoice_id::text));

  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id
   for update;

  if v_invoice.id is null
     or not public.current_user_can_manage_contractor_billing(v_invoice.contractor_id) then
    raise exception 'Invoice not found.';
  end if;

  select payment.*
    into v_payment
    from public.invoice_offline_payment_records payment
   where payment.contractor_id = v_invoice.contractor_id
     and payment.idempotency_key = p_idempotency_key;

  if v_payment.id is not null then
    if v_payment.invoice_id <> v_invoice.id
       or v_payment.amount_cents <> p_amount_cents
       or v_payment.payment_date <> p_payment_date
       or v_payment.payment_method <> v_method
       or v_payment.reference is distinct from v_reference
       or v_payment.note is distinct from v_note then
      raise exception 'This payment operation identifier was already used for different payment details.';
    end if;

    return jsonb_build_object(
      'payment_id', v_payment.id,
      'invoice_id', v_invoice.id,
      'created', false,
      'status', v_invoice.status,
      'amount_paid_cents', v_invoice.amount_paid_cents,
      'balance_due_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0)
    );
  end if;

  if v_invoice.status not in ('draft', 'sent', 'viewed', 'overdue', 'partially_paid') then
    raise exception 'Only an outstanding Invoice can receive an offline payment.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_payment_date is null or p_payment_date > current_date then
    raise exception 'Payment date is required and cannot be in the future.';
  end if;

  if v_method not in ('cash', 'check', 'bank_transfer', 'card_terminal', 'other') then
    raise exception 'Select a supported offline payment method.';
  end if;

  if v_reference is not null and length(v_reference) > 120 then
    raise exception 'Payment reference must be 120 characters or fewer.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'Payment note must be 500 characters or fewer.';
  end if;

  v_balance_cents := greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0);
  if v_balance_cents <= 0 then
    raise exception 'This Invoice has no remaining balance.';
  end if;

  if p_amount_cents > v_balance_cents then
    raise exception 'Payment amount cannot exceed the remaining Invoice balance.';
  end if;

  v_finalizing_draft := v_invoice.status = 'draft';
  if v_finalizing_draft and p_amount_cents <> v_balance_cents then
    raise exception 'A Draft Invoice must be marked paid in full.';
  end if;

  insert into public.invoice_offline_payment_records (
    invoice_id,
    contractor_id,
    idempotency_key,
    amount_cents,
    payment_date,
    payment_method,
    reference,
    note,
    recorded_by_user_id
  ) values (
    v_invoice.id,
    v_invoice.contractor_id,
    p_idempotency_key,
    p_amount_cents,
    p_payment_date,
    v_method,
    v_reference,
    v_note,
    auth.uid()
  )
  returning * into v_payment;

  v_next_paid_cents := v_invoice.amount_paid_cents + p_amount_cents;
  v_next_status := case when v_next_paid_cents = v_invoice.total_cents then 'paid' else 'partially_paid' end;

  update public.invoices
     set amount_paid_cents = v_next_paid_cents,
         status = v_next_status,
         issued_at = case
           when v_finalizing_draft then coalesce(issued_at, now())
           else issued_at
         end,
         paid_at = case
           when v_next_status = 'paid' then coalesce(
             paid_at,
             (p_payment_date + time '12:00') at time zone 'UTC'
           )
           else null
         end,
         updated_at = now()
   where id = v_invoice.id
     and amount_paid_cents = v_invoice.amount_paid_cents
     and status = v_invoice.status
  returning * into v_invoice;

  if v_invoice.id is null then
    raise exception 'The Invoice payment state changed concurrently.';
  end if;

  if v_next_status = 'paid'
     and to_regprocedure('public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)') is not null
     and not exists (
       select 1
         from public.workflow_activity_events event
        where event.event_type = 'invoice_paid'
          and event.invoice_id = v_invoice.id
     ) then
    perform public.servsync_append_workflow_activity_event(
      p_context_type => 'invoice',
      p_event_type => 'invoice_paid',
      p_service_request_id => v_invoice.service_request_id,
      p_inspection_id => v_invoice.job_id,
      p_estimate_id => v_invoice.estimate_id,
      p_invoice_id => v_invoice.id,
      p_actor_user_id => auth.uid(),
      p_metadata => jsonb_build_object(
        'source_rpc', 'servsync_record_offline_invoice_payment',
        'payment_method', v_method,
        'finalized_from_draft', v_finalizing_draft
      )
    );
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'invoice_id', v_invoice.id,
    'created', true,
    'status', v_invoice.status,
    'amount_paid_cents', v_invoice.amount_paid_cents,
    'balance_due_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0),
    'issued_at', v_invoice.issued_at,
    'paid_at', v_invoice.paid_at,
    'finalized_from_draft', v_finalizing_draft
  );
end;
$$;

alter function public.servsync_record_offline_invoice_payment(uuid, uuid, integer, date, text, text, text) owner to postgres;
revoke all on function public.servsync_record_offline_invoice_payment(uuid, uuid, integer, date, text, text, text) from public, anon, service_role;
grant execute on function public.servsync_record_offline_invoice_payment(uuid, uuid, integer, date, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
