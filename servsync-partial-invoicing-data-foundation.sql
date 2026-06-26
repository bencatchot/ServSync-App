-- ServSync partial invoicing data foundation.
-- Paste this into the Supabase SQL Editor for the ServSync project only after
-- explicit environment-specific SQL approval.
--
-- Run after:
--   - servsync-invoices-schema.sql
--   - servsync-estimate-price-required-foundation.sql
--   - servsync-structured-line-items-foundation.sql
--   - servsync-estimate-labor-model-foundation.sql
--   - servsync-invoice-actions.sql
--
-- Adds durable job work items, invoice line linkage, backlog snapshots, and a
-- guarded RPC for creating a draft invoice from selected completed work only.
-- This patch does not wire the contractor UI, homeowner invoice display, or PDF
-- backlog section yet.

begin;

create extension if not exists pgcrypto;

create table if not exists public.job_work_items (
  id                           uuid primary key default gen_random_uuid(),
  inspection_id                uuid not null references public.inspections(id) on delete cascade,
  contractor_id                uuid not null references public.contractor_profiles(id) on delete cascade,
  source_estimate_line_item_id uuid references public.estimate_line_items(id) on delete set null,
  reserved_invoice_id          uuid references public.invoices(id) on delete set null,
  invoiced_invoice_id          uuid references public.invoices(id) on delete set null,
  title                        text not null,
  description                  text not null default '',
  customer_description         text not null default '',
  internal_notes               text not null default '',
  line_type                    text not null default 'labor'
                               check (line_type in ('labor', 'material', 'fee', 'other')),
  quantity                     numeric(12,2) not null default 1 check (quantity >= 0),
  unit                         text not null default 'each',
  unit_price_cents             integer check (unit_price_cents is null or unit_price_cents >= 0),
  labor_hours                  numeric(8,2) check (labor_hours is null or labor_hours >= 0),
  billable                     boolean not null default true,
  completion_status            text not null default 'open'
                               check (completion_status in ('open', 'completed', 'declined', 'removed')),
  billing_status               text not null default 'unbilled'
                               check (billing_status in ('unbilled', 'drafted', 'invoiced', 'not_billable')),
  completed_at                 timestamptz,
  completed_by                 uuid references public.profiles(id) on delete set null,
  sort_order                   integer not null default 0,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint job_work_items_title_not_blank check (length(trim(title)) > 0),
  constraint job_work_items_drafted_invoice_check check (
    (billing_status = 'drafted' and reserved_invoice_id is not null and invoiced_invoice_id is null)
    or billing_status <> 'drafted'
  ),
  constraint job_work_items_invoiced_invoice_check check (
    (billing_status = 'invoiced' and invoiced_invoice_id is not null and reserved_invoice_id is null)
    or billing_status <> 'invoiced'
  ),
  constraint job_work_items_unbilled_invoice_check check (
    (billing_status in ('unbilled', 'not_billable') and reserved_invoice_id is null and invoiced_invoice_id is null)
    or billing_status not in ('unbilled', 'not_billable')
  ),
  constraint job_work_items_not_billable_flag_check check (
    billing_status <> 'not_billable' or billable = false
  )
);

alter table public.invoice_line_items
  add column if not exists job_work_item_id uuid references public.job_work_items(id) on delete set null;

create table if not exists public.invoice_backlog_items (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references public.invoices(id) on delete cascade,
  job_work_item_id     uuid references public.job_work_items(id) on delete set null,
  title                text not null,
  description          text not null default '',
  completion_status    text not null default 'open'
                       check (completion_status in ('open', 'completed', 'declined', 'removed')),
  billing_status       text not null default 'unbilled'
                       check (billing_status in ('unbilled', 'drafted', 'invoiced', 'not_billable')),
  not_included_reason  text not null default 'Open backlog item - not included in this invoice total.',
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint invoice_backlog_items_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists job_work_items_inspection_status_idx
  on public.job_work_items(inspection_id, completion_status, billing_status, sort_order);

create index if not exists job_work_items_contractor_status_idx
  on public.job_work_items(contractor_id, completion_status, billing_status, updated_at desc);

create index if not exists job_work_items_reserved_invoice_idx
  on public.job_work_items(reserved_invoice_id)
  where reserved_invoice_id is not null;

create index if not exists job_work_items_invoiced_invoice_idx
  on public.job_work_items(invoiced_invoice_id)
  where invoiced_invoice_id is not null;

create index if not exists invoice_line_items_job_work_item_idx
  on public.invoice_line_items(job_work_item_id)
  where job_work_item_id is not null;

create index if not exists invoice_backlog_items_invoice_sort_idx
  on public.invoice_backlog_items(invoice_id, sort_order);

create index if not exists invoice_backlog_items_job_work_item_idx
  on public.invoice_backlog_items(job_work_item_id)
  where job_work_item_id is not null;

drop trigger if exists job_work_items_touch_updated_at on public.job_work_items;
create trigger job_work_items_touch_updated_at
  before update on public.job_work_items
  for each row execute function public.touch_updated_at();

drop trigger if exists invoice_backlog_items_touch_updated_at on public.invoice_backlog_items;
create trigger invoice_backlog_items_touch_updated_at
  before update on public.invoice_backlog_items
  for each row execute function public.touch_updated_at();

alter table public.job_work_items enable row level security;
alter table public.invoice_backlog_items enable row level security;

drop policy if exists "Job work items: contractor team reads" on public.job_work_items;
create policy "Job work items: contractor team reads"
  on public.job_work_items for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Job work items: contractor team creates" on public.job_work_items;
create policy "Job work items: contractor team creates"
  on public.job_work_items for insert to authenticated
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
    and exists (
      select 1
        from public.inspections i
       where i.id = job_work_items.inspection_id
         and i.contractor_id = job_work_items.contractor_id
    )
  );

drop policy if exists "Job work items: contractor team updates" on public.job_work_items;
create policy "Job work items: contractor team updates"
  on public.job_work_items for update to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
  )
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
    and exists (
      select 1
        from public.inspections i
       where i.id = job_work_items.inspection_id
         and i.contractor_id = job_work_items.contractor_id
    )
  );

drop policy if exists "Job work items: contractor team deletes unbilled" on public.job_work_items;
create policy "Job work items: contractor team deletes unbilled"
  on public.job_work_items for delete to authenticated
  using (
    billing_status in ('unbilled', 'not_billable')
    and public.current_user_can_write_contractor_jobs(contractor_id)
  );

drop policy if exists "Invoice backlog items: contractor team reads" on public.invoice_backlog_items;
create policy "Invoice backlog items: contractor team reads"
  on public.invoice_backlog_items for select to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and (
           public.current_user_can_access_contractor(i.contractor_id)
           or public.current_user_is_platform_admin()
         )
    )
  );

drop policy if exists "Invoice backlog items: homeowner reads shared" on public.invoice_backlog_items;
create policy "Invoice backlog items: homeowner reads shared"
  on public.invoice_backlog_items for select to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.homeowner_user_id = auth.uid()
         and i.status <> 'draft'
    )
  );

drop policy if exists "Invoice backlog items: contractor team creates" on public.invoice_backlog_items;
create policy "Invoice backlog items: contractor team creates"
  on public.invoice_backlog_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  );

drop policy if exists "Invoice backlog items: contractor team updates drafts" on public.invoice_backlog_items;
create policy "Invoice backlog items: contractor team updates drafts"
  on public.invoice_backlog_items for update to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  );

drop policy if exists "Invoice backlog items: contractor team deletes drafts" on public.invoice_backlog_items;
create policy "Invoice backlog items: contractor team deletes drafts"
  on public.invoice_backlog_items for delete to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  );

revoke all on table public.job_work_items from public;
revoke all on table public.job_work_items from anon;
revoke all on table public.job_work_items from authenticated;
revoke all on table public.invoice_backlog_items from public;
revoke all on table public.invoice_backlog_items from anon;
revoke all on table public.invoice_backlog_items from authenticated;
grant select, insert, update, delete on public.job_work_items to authenticated;
grant select, insert, update, delete on public.invoice_backlog_items to authenticated;

comment on table public.job_work_items is
  'Durable job task/work item records used to support backlog-aware partial invoicing.';

comment on column public.job_work_items.billing_status is
  'Billing lifecycle for partial invoicing: unbilled, drafted, invoiced, or not_billable.';

comment on table public.invoice_backlog_items is
  'Invoice-time snapshot of open job backlog items that are not included in invoice totals.';

comment on column public.invoice_line_items.job_work_item_id is
  'Optional source job work item for partial-invoicing generated lines.';

create or replace function public.servsync_validate_invoice_job_work_item_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_work_item public.job_work_items;
begin
  if new.job_work_item_id is null then
    return new;
  end if;

  select *
    into v_invoice
    from public.invoices
   where id = new.invoice_id
   limit 1;

  if v_invoice.id is null then
    raise exception 'Invoice not found for job work item link.';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'Job work items can only be attached to draft invoices.';
  end if;

  select *
    into v_work_item
    from public.job_work_items
   where id = new.job_work_item_id
   for update;

  if v_work_item.id is null then
    raise exception 'Job work item not found.';
  end if;

  if v_work_item.contractor_id <> v_invoice.contractor_id then
    raise exception 'Job work item does not belong to this invoice contractor.';
  end if;

  if v_invoice.job_id is null or v_work_item.inspection_id <> v_invoice.job_id then
    raise exception 'Job work item does not belong to this invoice job.';
  end if;

  if v_work_item.completion_status <> 'completed' then
    raise exception 'Only completed job work items can be billed.';
  end if;

  if not v_work_item.billable then
    raise exception 'This job work item is not billable.';
  end if;

  if v_work_item.billing_status = 'not_billable' then
    raise exception 'This job work item is marked not billable.';
  end if;

  if v_work_item.billing_status = 'invoiced' then
    raise exception 'This job work item has already been invoiced.';
  end if;

  if v_work_item.billing_status = 'drafted'
     and v_work_item.reserved_invoice_id is distinct from new.invoice_id then
    raise exception 'This job work item is already reserved on another draft invoice.';
  end if;

  if exists (
    select 1
      from public.invoice_line_items ili
      join public.invoices i on i.id = ili.invoice_id
     where ili.job_work_item_id = new.job_work_item_id
       and i.status <> 'void'
       and ili.id is distinct from new.id
  ) then
    raise exception 'This job work item is already attached to an active invoice.';
  end if;

  return new;
end;
$$;

drop trigger if exists invoice_line_items_validate_job_work_item_link on public.invoice_line_items;
create trigger invoice_line_items_validate_job_work_item_link
  before insert or update of job_work_item_id, invoice_id
  on public.invoice_line_items
  for each row execute function public.servsync_validate_invoice_job_work_item_link();

create or replace function public.servsync_sync_invoice_job_work_item_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_invoice_status text;
  v_new_invoice_status text;
begin
  if tg_op in ('UPDATE', 'DELETE')
     and old.job_work_item_id is not null
     and (tg_op = 'DELETE' or old.job_work_item_id is distinct from new.job_work_item_id) then
    select status
      into v_old_invoice_status
      from public.invoices
     where id = old.invoice_id;

    if v_old_invoice_status = 'draft'
       and not exists (
         select 1
           from public.invoice_line_items ili
           join public.invoices i on i.id = ili.invoice_id
          where ili.job_work_item_id = old.job_work_item_id
            and i.status <> 'void'
            and ili.id is distinct from old.id
       ) then
      update public.job_work_items
         set billing_status = 'unbilled',
             reserved_invoice_id = null,
             invoiced_invoice_id = null,
             updated_at = now()
       where id = old.job_work_item_id
         and billing_status = 'drafted'
         and reserved_invoice_id = old.invoice_id;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.job_work_item_id is not null then
    select status
      into v_new_invoice_status
      from public.invoices
     where id = new.invoice_id;

    if v_new_invoice_status = 'draft' then
      update public.job_work_items
         set billing_status = 'drafted',
             reserved_invoice_id = new.invoice_id,
             invoiced_invoice_id = null,
             updated_at = now()
       where id = new.job_work_item_id
         and completion_status = 'completed'
         and billable = true
         and billing_status in ('unbilled', 'drafted');
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists invoice_line_items_sync_job_work_item_reservation on public.invoice_line_items;
create trigger invoice_line_items_sync_job_work_item_reservation
  after insert or update of job_work_item_id, invoice_id
  on public.invoice_line_items
  for each row execute function public.servsync_sync_invoice_job_work_item_reservation();

drop trigger if exists invoice_line_items_release_job_work_item_reservation on public.invoice_line_items;
create trigger invoice_line_items_release_job_work_item_reservation
  after delete
  on public.invoice_line_items
  for each row execute function public.servsync_sync_invoice_job_work_item_reservation();

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

  if not public.current_user_can_write_contractor_jobs(v_job.contractor_id) then
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

create or replace function public.servsync_send_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
   for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_invoice.contractor_id) then
    raise exception 'You do not have permission to send this invoice.';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'Only draft invoices can be sent.';
  end if;

  if v_invoice.homeowner_user_id is null then
    raise exception 'Local-only invoices cannot be sent to a homeowner yet. Connect this customer to a ServSync homeowner before sending.';
  end if;

  update public.invoices
     set status = 'sent',
         issued_at = coalesce(issued_at, now()),
         updated_at = now()
   where id = v_invoice.id
   returning * into v_invoice;

  update public.job_work_items jwi
     set billing_status = 'invoiced',
         reserved_invoice_id = null,
         invoiced_invoice_id = v_invoice.id,
         updated_at = now()
    from public.invoice_line_items ili
   where ili.invoice_id = v_invoice.id
     and ili.job_work_item_id = jwi.id
     and jwi.billing_status = 'drafted'
     and jwi.reserved_invoice_id = v_invoice.id;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'status', v_invoice.status,
    'issued_at', v_invoice.issued_at
  );
end;
$$;

create or replace function public.servsync_void_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
   for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_invoice.contractor_id) then
    raise exception 'You do not have permission to void this invoice.';
  end if;

  if v_invoice.status not in ('draft', 'sent', 'viewed') then
    raise exception 'Only draft, sent, or viewed invoices can be voided.';
  end if;

  update public.invoices
     set status = 'void',
         voided_at = now(),
         updated_at = now()
   where id = v_invoice.id
   returning * into v_invoice;

  update public.job_work_items jwi
     set billing_status = 'unbilled',
         reserved_invoice_id = null,
         invoiced_invoice_id = null,
         updated_at = now()
    from public.invoice_line_items ili
   where ili.invoice_id = v_invoice.id
     and ili.job_work_item_id = jwi.id
     and (
       jwi.reserved_invoice_id = v_invoice.id
       or jwi.invoiced_invoice_id = v_invoice.id
     );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'status', v_invoice.status,
    'voided_at', v_invoice.voided_at
  );
end;
$$;

revoke execute on function public.servsync_validate_invoice_job_work_item_link() from public;
revoke execute on function public.servsync_validate_invoice_job_work_item_link() from anon;
revoke execute on function public.servsync_sync_invoice_job_work_item_reservation() from public;
revoke execute on function public.servsync_sync_invoice_job_work_item_reservation() from anon;
revoke execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) from public;
revoke execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) from anon;
grant execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) to authenticated;

revoke execute on function public.servsync_send_invoice(uuid) from public;
revoke execute on function public.servsync_send_invoice(uuid) from anon;
grant execute on function public.servsync_send_invoice(uuid) to authenticated;

revoke execute on function public.servsync_void_invoice(uuid) from public;
revoke execute on function public.servsync_void_invoice(uuid) from anon;
grant execute on function public.servsync_void_invoice(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
