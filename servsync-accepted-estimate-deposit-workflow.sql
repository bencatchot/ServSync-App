-- ServSync Accepted Estimate Deposit Workflow v1.
--
-- Extends the existing Estimate payment schedule and Invoice foundations with:
--   - retry-safe draft Invoice creation from an accepted schedule item;
--   - explicit Deposit Invoice replacement after an unpaid void;
--   - append-only offline payment records with partial/full balance updates;
--   - a payment-history reader for authorized billing roles.
--
-- This migration does not activate Stripe, process money, block Job creation,
-- send an Invoice, add refunds, or change existing Estimate/Invoice rows.

begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(required.object_name order by required.object_name)
    into v_missing
    from (
      values
        ('public.profiles', to_regclass('public.profiles') is not null),
        ('public.contractor_profiles', to_regclass('public.contractor_profiles') is not null),
        ('public.estimates', to_regclass('public.estimates') is not null),
        ('public.estimate_payment_schedule_items', to_regclass('public.estimate_payment_schedule_items') is not null),
        ('public.invoices', to_regclass('public.invoices') is not null),
        ('public.invoice_line_items', to_regclass('public.invoice_line_items') is not null),
        ('public.workflow_activity_events', to_regclass('public.workflow_activity_events') is not null),
        ('public.current_user_can_manage_contractor_billing(uuid)', to_regprocedure('public.current_user_can_manage_contractor_billing(uuid)') is not null),
        ('public.servsync_create_invoice_from_estimate_schedule_item(uuid)', to_regprocedure('public.servsync_create_invoice_from_estimate_schedule_item(uuid)') is not null),
        ('public.servsync_mark_invoice_paid(uuid)', to_regprocedure('public.servsync_mark_invoice_paid(uuid)') is not null),
        ('public.servsync_void_invoice(uuid)', to_regprocedure('public.servsync_void_invoice(uuid)') is not null),
        ('public.touch_updated_at()', to_regprocedure('public.touch_updated_at()') is not null),
        ('public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)', to_regprocedure('public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)') is not null)
    ) required(object_name, present)
   where not required.present;

  if v_missing is not null then
    raise exception 'Accepted Estimate Deposit Workflow prerequisites are missing: %', array_to_string(v_missing, ', ');
  end if;

  if exists (
    select 1
      from (
        values
          ('estimate_payment_schedule_items', 'id'),
          ('estimate_payment_schedule_items', 'estimate_id'),
          ('estimate_payment_schedule_items', 'invoice_type'),
          ('estimate_payment_schedule_items', 'label'),
          ('estimate_payment_schedule_items', 'calculated_amount_cents'),
          ('estimate_payment_schedule_items', 'due_trigger'),
          ('estimate_payment_schedule_items', 'sort_order'),
          ('estimate_payment_schedule_items', 'linked_invoice_id'),
          ('estimates', 'contractor_id'),
          ('estimates', 'status'),
          ('estimates', 'total_cents'),
          ('invoices', 'contractor_id'),
          ('invoices', 'invoice_type'),
          ('invoices', 'status'),
          ('invoices', 'total_cents'),
          ('invoices', 'amount_paid_cents'),
          ('invoices', 'paid_at'),
          ('invoices', 'voided_at')
      ) required(table_name, column_name)
      left join information_schema.columns column_definition
        on column_definition.table_schema = 'public'
       and column_definition.table_name = required.table_name
       and column_definition.column_name = required.column_name
     where column_definition.column_name is null
  ) then
    raise exception 'Accepted Estimate Deposit Workflow requires the canonical Estimate schedule and Invoice columns.';
  end if;
end;
$$;

create table if not exists public.invoice_offline_payment_records (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices(id) on delete restrict,
  contractor_id       uuid not null references public.contractor_profiles(id) on delete restrict,
  idempotency_key     uuid not null,
  amount_cents        integer not null check (amount_cents > 0),
  payment_date        date not null,
  payment_method      text not null check (payment_method in ('cash', 'check', 'bank_transfer', 'card_terminal', 'other')),
  reference           text,
  note                text,
  recorded_by_user_id uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint invoice_offline_payment_records_reference_length_check
    check (reference is null or length(reference) between 1 and 120),
  constraint invoice_offline_payment_records_note_length_check
    check (note is null or length(note) between 1 and 500),
  constraint invoice_offline_payment_records_contractor_idempotency_key
    unique (contractor_id, idempotency_key)
);

do $$
declare
  v_owner text;
begin
  select owner_role.rolname
    into v_owner
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_roles owner_role on owner_role.oid = relation.relowner
   where namespace.nspname = 'public'
     and relation.relname = 'invoice_offline_payment_records'
     and relation.relkind = 'r';

  if v_owner is null then
    raise exception 'The offline payment ledger is not a compatible table.';
  end if;

  if v_owner <> 'postgres' then
    raise exception 'The offline payment ledger must be owned by postgres.';
  end if;

  if exists (
    select 1
      from (
        values
          ('id', 'uuid', 'NO'),
          ('invoice_id', 'uuid', 'NO'),
          ('contractor_id', 'uuid', 'NO'),
          ('idempotency_key', 'uuid', 'NO'),
          ('amount_cents', 'integer', 'NO'),
          ('payment_date', 'date', 'NO'),
          ('payment_method', 'text', 'NO'),
          ('reference', 'text', 'YES'),
          ('note', 'text', 'YES'),
          ('recorded_by_user_id', 'uuid', 'YES'),
          ('created_at', 'timestamp with time zone', 'NO')
      ) expected(column_name, data_type, is_nullable)
      left join information_schema.columns actual
        on actual.table_schema = 'public'
       and actual.table_name = 'invoice_offline_payment_records'
       and actual.column_name = expected.column_name
     where actual.column_name is null
        or actual.data_type <> expected.data_type
        or actual.is_nullable <> expected.is_nullable
  ) or (
    select count(*)
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'invoice_offline_payment_records'
  ) <> 11 then
    raise exception 'The offline payment ledger columns are incompatible with the canonical definition.';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_definition
     where constraint_definition.conrelid = 'public.invoice_offline_payment_records'::regclass
       and constraint_definition.contype = 'f'
       and pg_get_constraintdef(constraint_definition.oid) = 'FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT'
       and constraint_definition.convalidated
  ) or not exists (
    select 1
      from pg_constraint constraint_definition
     where constraint_definition.conrelid = 'public.invoice_offline_payment_records'::regclass
       and constraint_definition.contype = 'f'
       and pg_get_constraintdef(constraint_definition.oid) = 'FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(id) ON DELETE RESTRICT'
       and constraint_definition.convalidated
  ) or not exists (
    select 1
      from pg_constraint constraint_definition
     where constraint_definition.conrelid = 'public.invoice_offline_payment_records'::regclass
       and constraint_definition.contype = 'f'
       and pg_get_constraintdef(constraint_definition.oid) = 'FOREIGN KEY (recorded_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL'
       and constraint_definition.convalidated
  ) then
    raise exception 'The offline payment ledger foreign keys are incompatible with the canonical definition.';
  end if;
end;
$$;

create index if not exists invoice_offline_payment_records_invoice_date_idx
  on public.invoice_offline_payment_records(invoice_id, payment_date desc, created_at desc);

create index if not exists invoice_offline_payment_records_contractor_created_idx
  on public.invoice_offline_payment_records(contractor_id, created_at desc);

create or replace function public.servsync_reject_invoice_offline_payment_record_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Offline payment records are append-only.';
end;
$$;

drop trigger if exists invoice_offline_payment_records_immutable
  on public.invoice_offline_payment_records;
create trigger invoice_offline_payment_records_immutable
  before update or delete on public.invoice_offline_payment_records
  for each row execute function public.servsync_reject_invoice_offline_payment_record_mutation();

alter table public.invoice_offline_payment_records enable row level security;
alter table public.invoice_offline_payment_records force row level security;
alter table public.invoice_offline_payment_records owner to postgres;

comment on table public.invoice_offline_payment_records is
  'Append-only contractor-recorded offline Invoice payments. No payment processor action is performed.';
comment on column public.invoice_offline_payment_records.idempotency_key is
  'Client-generated operation identifier used to make a Record payment submission retry-safe.';
comment on column public.invoice_offline_payment_records.payment_method is
  'Offline receipt category only: cash, check, bank transfer, external card terminal, or other.';

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
  v_linked_invoice public.invoices;
  v_invoice public.invoices;
  v_invoice_type_label text;
  v_estimate_title text;
  v_invoice_title text;
  v_deposit_count integer;
  v_replaced_void_invoice_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_schedule_item_id is null then
    raise exception 'Payment schedule item is required.';
  end if;

  select schedule.*
    into v_schedule
    from public.estimate_payment_schedule_items schedule
   where schedule.id = p_schedule_item_id;

  if v_schedule.id is null then
    raise exception 'Payment schedule item not found.';
  end if;

  select estimate.*
    into v_estimate
    from public.estimates estimate
   where estimate.id = v_schedule.estimate_id;

  if v_estimate.id is null
     or not public.current_user_can_manage_contractor_billing(v_estimate.contractor_id) then
    raise exception 'Payment schedule item not found.';
  end if;

  perform pg_advisory_xact_lock(hashtext('servsync-estimate-schedule-invoice-' || p_schedule_item_id::text));

  select schedule.*
    into v_schedule
    from public.estimate_payment_schedule_items schedule
   where schedule.id = p_schedule_item_id
   for update;

  select estimate.*
    into v_estimate
    from public.estimates estimate
   where estimate.id = v_schedule.estimate_id
   for update;

  if v_estimate.id is null
     or not public.current_user_can_manage_contractor_billing(v_estimate.contractor_id) then
    raise exception 'Payment schedule item not found.';
  end if;

  if v_estimate.status <> 'accepted' then
    raise exception 'Only accepted estimate payment schedule items can create invoices.';
  end if;

  if v_schedule.calculated_amount_cents <= 0
     or v_schedule.calculated_amount_cents > v_estimate.total_cents then
    raise exception 'The payment schedule amount is not eligible for invoicing.';
  end if;

  if v_schedule.invoice_type = 'deposit' then
    select count(*)
      into v_deposit_count
      from public.estimate_payment_schedule_items schedule
     where schedule.estimate_id = v_estimate.id
       and schedule.invoice_type = 'deposit';

    if v_deposit_count <> 1 then
      raise exception 'Request deposit requires exactly one Deposit payment schedule item.';
    end if;
  end if;

  if v_schedule.linked_invoice_id is not null then
    select invoice.*
      into v_linked_invoice
      from public.invoices invoice
     where invoice.id = v_schedule.linked_invoice_id
     for update;

    if v_linked_invoice.id is null then
      raise exception 'The linked Invoice could not be verified.';
    end if;

    if v_linked_invoice.contractor_id <> v_estimate.contractor_id
       or v_linked_invoice.estimate_id is distinct from v_estimate.id
       or v_linked_invoice.invoice_type <> v_schedule.invoice_type then
      raise exception 'The linked Invoice does not match this payment schedule item.';
    end if;

    if v_linked_invoice.status <> 'void' then
      return jsonb_build_object(
        'invoice_id', v_linked_invoice.id,
        'schedule_item_id', v_schedule.id,
        'created', false,
        'status', v_linked_invoice.status
      );
    end if;

    if v_linked_invoice.amount_paid_cents <> 0 then
      raise exception 'A voided Invoice with recorded payment cannot be replaced automatically.';
    end if;

    v_replaced_void_invoice_id := v_linked_invoice.id;
  end if;

  if v_schedule.invoice_type = 'deposit' and exists (
    select 1
      from public.invoices invoice
     where invoice.estimate_id = v_estimate.id
       and invoice.contractor_id = v_estimate.contractor_id
       and invoice.invoice_type = 'deposit'
       and invoice.status <> 'void'
       and invoice.id is distinct from v_schedule.linked_invoice_id
  ) then
    raise exception 'This Estimate already has an active Deposit Invoice that requires review.';
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
    'Accepted estimate'
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
      'Created from accepted Estimate payment schedule item: ' || coalesce(nullif(trim(v_schedule.label), ''), v_invoice_type_label) || '.',
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
     and linked_invoice_id is not distinct from v_schedule.linked_invoice_id;

  if not found then
    raise exception 'This payment schedule item was changed concurrently.';
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'schedule_item_id', v_schedule.id,
    'created', true,
    'status', v_invoice.status,
    'replaced_void_invoice_id', v_replaced_void_invoice_id
  );
end;
$$;

create or replace function public.servsync_list_invoice_offline_payments(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invoice public.invoices;
  v_payments jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id;

  if v_invoice.id is null
     or not public.current_user_can_manage_contractor_billing(v_invoice.contractor_id) then
    raise exception 'Invoice not found.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', payment.id,
    'invoice_id', payment.invoice_id,
    'amount_cents', payment.amount_cents,
    'payment_date', payment.payment_date,
    'payment_method', payment.payment_method,
    'reference', payment.reference,
    'note', payment.note,
    'recorded_by_name', coalesce(nullif(trim(profile.full_name), ''), 'ServSync team member'),
    'created_at', payment.created_at
  ) order by payment.payment_date desc, payment.created_at desc), '[]'::jsonb)
    into v_payments
    from public.invoice_offline_payment_records payment
    left join public.profiles profile on profile.id = payment.recorded_by_user_id
   where payment.invoice_id = v_invoice.id
     and payment.contractor_id = v_invoice.contractor_id;

  return v_payments;
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

  if v_invoice.status not in ('sent', 'viewed', 'overdue', 'partially_paid') then
    raise exception 'Only an outstanding sent Invoice can receive an offline payment.';
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
         paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else null end,
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
        'payment_method', v_method
      )
    );
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'invoice_id', v_invoice.id,
    'created', true,
    'status', v_invoice.status,
    'amount_paid_cents', v_invoice.amount_paid_cents,
    'balance_due_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0)
  );
end;
$$;

create or replace function public.servsync_mark_invoice_paid(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id;

  if v_invoice.id is null
     or not public.current_user_can_manage_contractor_billing(v_invoice.contractor_id) then
    raise exception 'Invoice not found.';
  end if;

  return public.servsync_record_offline_invoice_payment(
    p_invoice_id => v_invoice.id,
    p_idempotency_key => gen_random_uuid(),
    p_amount_cents => greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0),
    p_payment_date => current_date,
    p_payment_method => 'other',
    p_reference => null,
    p_note => 'Recorded through the legacy Mark Paid action.'
  );
end;
$$;

alter function public.servsync_reject_invoice_offline_payment_record_mutation() owner to postgres;
alter function public.servsync_create_invoice_from_estimate_schedule_item(uuid) owner to postgres;
alter function public.servsync_list_invoice_offline_payments(uuid) owner to postgres;
alter function public.servsync_record_offline_invoice_payment(uuid, uuid, integer, date, text, text, text) owner to postgres;
alter function public.servsync_mark_invoice_paid(uuid) owner to postgres;

do $$
begin
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'servsync_reject_invoice_offline_payment_record_mutation') <> 1
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'servsync_create_invoice_from_estimate_schedule_item') <> 1
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'servsync_list_invoice_offline_payments') <> 1
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'servsync_record_offline_invoice_payment') <> 1
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'servsync_mark_invoice_paid') <> 1 then
    raise exception 'Accepted Estimate Deposit Workflow found an unexpected function overload.';
  end if;
end;
$$;

revoke all on table public.invoice_offline_payment_records from public, anon, authenticated, service_role;

revoke all on function public.servsync_reject_invoice_offline_payment_record_mutation() from public, anon, authenticated, service_role;

revoke all on function public.servsync_create_invoice_from_estimate_schedule_item(uuid) from public, anon, service_role;
grant execute on function public.servsync_create_invoice_from_estimate_schedule_item(uuid) to authenticated;

revoke all on function public.servsync_list_invoice_offline_payments(uuid) from public, anon, service_role;
grant execute on function public.servsync_list_invoice_offline_payments(uuid) to authenticated;

revoke all on function public.servsync_record_offline_invoice_payment(uuid, uuid, integer, date, text, text, text) from public, anon, service_role;
grant execute on function public.servsync_record_offline_invoice_payment(uuid, uuid, integer, date, text, text, text) to authenticated;

revoke all on function public.servsync_mark_invoice_paid(uuid) from public, anon, service_role;
grant execute on function public.servsync_mark_invoice_paid(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
