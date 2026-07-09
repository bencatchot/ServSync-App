-- ServSync estimate payment schedule invoice generation foundation.
--
-- Adds a narrow RPC for generating one draft invoice from one approved
-- estimate payment schedule row. This patch does not add UI, send invoices,
-- collect payments, write Home History, or integrate with external providers.

begin;

create or replace function public.servsync_create_invoice_from_estimate_schedule_item(
  p_schedule_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.estimate_payment_schedule_items;
  v_estimate public.estimates;
  v_invoice public.invoices;
  v_invoice_type_label text;
  v_estimate_title text;
  v_invoice_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_schedule_item_id is null then
    raise exception 'Payment schedule item is required.';
  end if;

  perform pg_advisory_xact_lock(hashtext('servsync-estimate-schedule-invoice-' || p_schedule_item_id::text));

  select *
    into v_schedule
    from public.estimate_payment_schedule_items
   where id = p_schedule_item_id
   for update;

  if v_schedule.id is null then
    raise exception 'Payment schedule item not found.';
  end if;

  select *
    into v_estimate
    from public.estimates
   where id = v_schedule.estimate_id
   for update;

  if v_estimate.id is null then
    raise exception 'Estimate not found.';
  end if;

  if v_estimate.status <> 'accepted' then
    raise exception 'Only accepted estimate payment schedule items can create invoices.';
  end if;

  if v_schedule.linked_invoice_id is not null then
    raise exception 'This payment schedule item already has an invoice.';
  end if;

  if not public.current_user_can_manage_contractor_billing(v_estimate.contractor_id) then
    raise exception 'You do not have permission to create invoices for this estimate.';
  end if;

  v_invoice_type_label := case v_schedule.invoice_type
    when 'total' then 'Total invoice'
    when 'deposit' then 'Deposit invoice'
    when 'progress' then 'Progress invoice'
    when 'final' then 'Final invoice'
    else 'Scheduled invoice'
  end;
  v_estimate_title := coalesce(
    nullif(trim(regexp_replace(coalesce(v_estimate.title, ''), '^\s*Estimate\s*[-:]\s*', '', 'i')), ''),
    'Approved estimate'
  );
  v_invoice_title := coalesce(nullif(trim(v_schedule.label), ''), v_invoice_type_label) || ' - ' || v_estimate_title;

  insert into public.invoices (
    contractor_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    job_id,
    estimate_id,
    invoice_type,
    invoice_sequence,
    title,
    scope,
    notes,
    terms,
    status,
    subtotal_cents,
    material_total_cents,
    labor_total_cents,
    fee_total_cents,
    other_total_cents,
    tax_cents,
    discount_cents,
    total_cents,
    amount_paid_cents
  )
  values (
    v_estimate.contractor_id,
    v_estimate.homeowner_user_id,
    v_estimate.home_id,
    v_estimate.local_contact_id,
    v_estimate.local_home_id,
    v_estimate.service_request_id,
    v_estimate.inspection_id,
    v_estimate.id,
    v_schedule.invoice_type,
    v_schedule.sort_order + 1,
    v_invoice_title,
    coalesce(v_estimate.scope, ''),
    concat_ws(
      E'\n',
      nullif(trim(coalesce(v_estimate.notes, '')), ''),
      'Created from approved estimate payment schedule item: ' || coalesce(nullif(trim(v_schedule.label), ''), v_invoice_type_label) || '.',
      case when nullif(trim(v_schedule.due_trigger), '') is not null then 'Due trigger: ' || trim(v_schedule.due_trigger) else null end
    ),
    coalesce(v_estimate.terms, ''),
    'draft',
    v_schedule.calculated_amount_cents,
    0,
    0,
    v_schedule.calculated_amount_cents,
    0,
    0,
    0,
    v_schedule.calculated_amount_cents,
    0
  )
  returning * into v_invoice;

  insert into public.invoice_line_items (
    invoice_id,
    line_type,
    description,
    line_title,
    customer_description,
    quantity,
    unit,
    unit_price_cents,
    sort_order
  )
  values (
    v_invoice.id,
    'fee',
    v_invoice_title,
    v_invoice_title,
    nullif(trim(v_schedule.due_trigger), ''),
    1,
    'schedule',
    v_schedule.calculated_amount_cents,
    0
  );

  update public.estimate_payment_schedule_items
     set linked_invoice_id = v_invoice.id
   where id = v_schedule.id
     and linked_invoice_id is null;

  if not found then
    raise exception 'This payment schedule item already has an invoice.';
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'schedule_item_id', v_schedule.id,
    'created', true
  );
end;
$$;

revoke execute on function public.servsync_create_invoice_from_estimate_schedule_item(uuid) from public;
revoke execute on function public.servsync_create_invoice_from_estimate_schedule_item(uuid) from anon;
grant execute on function public.servsync_create_invoice_from_estimate_schedule_item(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
