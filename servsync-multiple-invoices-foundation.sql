-- ServSync multiple invoices from one estimate foundation.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Run after:
--   - servsync-invoices-schema.sql
--   - servsync-partial-invoicing-data-foundation.sql
--
-- Adds structured invoice purpose and optional display sequencing without
-- enabling the frontend multi-invoice workflow yet.

begin;

alter table public.invoices
  add column if not exists invoice_type text not null default 'total',
  add column if not exists invoice_sequence integer;

alter table public.invoices
  drop constraint if exists invoices_invoice_type_check;

alter table public.invoices
  add constraint invoices_invoice_type_check
  check (invoice_type in ('total', 'deposit', 'progress', 'final'));

alter table public.invoices
  drop constraint if exists invoices_invoice_sequence_positive_check;

alter table public.invoices
  add constraint invoices_invoice_sequence_positive_check
  check (invoice_sequence is null or invoice_sequence > 0);

update public.invoices
   set invoice_type = 'total'
 where invoice_type is null;

alter table public.invoices
  alter column invoice_type set default 'total';

alter table public.invoices
  alter column invoice_type set not null;

update public.invoices i
   set invoice_type = 'progress'
 where exists (
   select 1
     from public.invoice_line_items ili
    where ili.invoice_id = i.id
      and ili.job_work_item_id is not null
 )
   and i.invoice_type = 'total';

create index if not exists invoices_estimate_status_type_idx
  on public.invoices(estimate_id, status, invoice_type)
  where estimate_id is not null;

create index if not exists invoices_estimate_sequence_idx
  on public.invoices(estimate_id, invoice_sequence)
  where estimate_id is not null
    and invoice_sequence is not null;

comment on column public.invoices.invoice_type is
  'Structured invoice purpose for estimate-led billing. Allowed values: total, deposit, progress, final.';

comment on column public.invoices.invoice_sequence is
  'Optional contractor-facing display order for multiple invoices linked to the same estimate. Not unique.';

create or replace function public.servsync_create_partial_invoice_from_job(
  p_inspection_id uuid,
  p_work_item_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_invoice public.invoices;
  v_requested_count integer;
  v_selected_count integer;
  v_backlog_count integer := 0;
  v_subtotal_cents integer := 0;
  v_material_total_cents integer := 0;
  v_labor_total_cents integer := 0;
  v_fee_total_cents integer := 0;
  v_other_total_cents integer := 0;
begin
  if p_inspection_id is null then
    raise exception 'Job is required.';
  end if;

  if coalesce(array_length(p_work_item_ids, 1), 0) = 0 then
    raise exception 'Select at least one completed work item to invoice.';
  end if;

  perform pg_advisory_xact_lock(hashtext('servsync-partial-invoice-job-' || p_inspection_id::text));

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if not public.current_user_can_manage_contractor_billing(v_job.contractor_id) then
    raise exception 'You do not have permission to create invoices for this job.';
  end if;

  select count(distinct work_item_id)
    into v_requested_count
    from unnest(p_work_item_ids) as requested(work_item_id)
   where work_item_id is not null;

  if v_requested_count = 0 then
    raise exception 'Select at least one completed work item to invoice.';
  end if;

  if exists (
    select 1
      from unnest(p_work_item_ids) as requested(work_item_id)
      left join public.job_work_items jwi on jwi.id = requested.work_item_id
     where requested.work_item_id is null
        or jwi.id is null
        or jwi.inspection_id <> v_job.id
        or jwi.contractor_id <> v_job.contractor_id
  ) then
    raise exception 'One or more selected work items do not belong to this job.';
  end if;

  perform 1
    from public.job_work_items jwi
   where jwi.id = any(p_work_item_ids)
   for update;

  if exists (
    select 1
      from public.job_work_items jwi
     where jwi.id = any(p_work_item_ids)
       and jwi.completion_status <> 'completed'
  ) then
    raise exception 'Only completed job work items can be invoiced.';
  end if;

  if exists (
    select 1
      from public.job_work_items jwi
     where jwi.id = any(p_work_item_ids)
       and (jwi.billable = false or jwi.billing_status = 'not_billable')
  ) then
    raise exception 'One or more selected work items are not billable.';
  end if;

  if exists (
    select 1
      from public.job_work_items jwi
     where jwi.id = any(p_work_item_ids)
       and jwi.billing_status <> 'unbilled'
  ) then
    raise exception 'One or more selected work items are already drafted, invoiced, or not billable.';
  end if;

  if exists (
    select 1
      from public.invoice_line_items ili
      join public.invoices i on i.id = ili.invoice_id
     where ili.job_work_item_id = any(p_work_item_ids)
       and i.status <> 'void'
  ) then
    raise exception 'One or more selected work items are already attached to an active invoice.';
  end if;

  select
    coalesce(sum(round(jwi.quantity * coalesce(jwi.unit_price_cents, 0))::integer), 0),
    coalesce(sum(case when jwi.line_type = 'material' then round(jwi.quantity * coalesce(jwi.unit_price_cents, 0))::integer else 0 end), 0),
    coalesce(sum(case when jwi.line_type = 'labor' then round(jwi.quantity * coalesce(jwi.unit_price_cents, 0))::integer else 0 end), 0),
    coalesce(sum(case when jwi.line_type = 'fee' then round(jwi.quantity * coalesce(jwi.unit_price_cents, 0))::integer else 0 end), 0),
    coalesce(sum(case when jwi.line_type = 'other' then round(jwi.quantity * coalesce(jwi.unit_price_cents, 0))::integer else 0 end), 0),
    count(*)
    into
      v_subtotal_cents,
      v_material_total_cents,
      v_labor_total_cents,
      v_fee_total_cents,
      v_other_total_cents,
      v_selected_count
    from public.job_work_items jwi
   where jwi.id = any(p_work_item_ids);

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
    title,
    scope,
    notes,
    terms,
    labor_mode,
    material_total_cents,
    labor_total_cents,
    fee_total_cents,
    other_total_cents,
    status,
    subtotal_cents,
    tax_cents,
    discount_cents,
    total_cents,
    amount_paid_cents
  )
  values (
    v_job.contractor_id,
    v_job.homeowner_user_id,
    v_job.home_id,
    v_job.local_contact_id,
    v_job.local_home_id,
    v_job.service_request_id,
    v_job.id,
    v_job.estimate_id,
    'progress',
    'Partial invoice — ' || coalesce(nullif(trim(v_job.name), ''), 'Completed work'),
    'Completed billable work from job: ' || coalesce(nullif(trim(v_job.name), ''), 'Job'),
    '',
    'Payment is due upon receipt unless otherwise agreed in writing.',
    'line_specific',
    v_material_total_cents,
    v_labor_total_cents,
    v_fee_total_cents,
    v_other_total_cents,
    'draft',
    v_subtotal_cents,
    0,
    0,
    v_subtotal_cents,
    0
  )
  returning * into v_invoice;

  insert into public.invoice_line_items (
    invoice_id,
    job_work_item_id,
    line_type,
    description,
    line_title,
    customer_description,
    labor_hours,
    quantity,
    unit,
    unit_price_cents,
    sort_order
  )
  select
    v_invoice.id,
    jwi.id,
    jwi.line_type,
    coalesce(nullif(trim(jwi.description), ''), jwi.title),
    jwi.title,
    nullif(trim(jwi.customer_description), ''),
    jwi.labor_hours,
    jwi.quantity,
    jwi.unit,
    jwi.unit_price_cents,
    jwi.sort_order
  from public.job_work_items jwi
  where jwi.id = any(p_work_item_ids)
  order by jwi.sort_order asc, jwi.created_at asc;

  insert into public.invoice_backlog_items (
    invoice_id,
    job_work_item_id,
    title,
    description,
    completion_status,
    billing_status,
    not_included_reason,
    sort_order
  )
  select
    v_invoice.id,
    jwi.id,
    jwi.title,
    jwi.description,
    jwi.completion_status,
    jwi.billing_status,
    case
      when jwi.completion_status = 'open' then 'Open backlog item - not completed and not included in this invoice total.'
      when jwi.completion_status in ('declined', 'removed') then 'Resolved outside this invoice and not included in this invoice total.'
      else 'Not included in this invoice total.'
    end,
    jwi.sort_order
  from public.job_work_items jwi
  where jwi.inspection_id = v_job.id
    and jwi.id <> all(p_work_item_ids)
    and jwi.completion_status in ('open', 'declined', 'removed')
  order by jwi.sort_order asc, jwi.created_at asc;

  get diagnostics v_backlog_count = row_count;

  update public.job_work_items
     set billing_status = 'drafted',
         reserved_invoice_id = v_invoice.id,
         invoiced_invoice_id = null,
         updated_at = now()
   where id = any(p_work_item_ids);

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'created', true,
    'status', v_invoice.status,
    'selected_work_item_count', v_selected_count,
    'backlog_item_count', v_backlog_count
  );
end;
$$;

revoke execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) from public;
revoke execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) from anon;
grant execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
