-- ServSync Partial Invoicing Phase 2C-1
-- Manual job work item RPCs.
--
-- This patch adds guarded RPCs for contractor-created manual job work items.
-- It does not backfill legacy jobs, convert inspection findings, change invoice
-- PDF behavior, or remove the existing whole-job invoice flow.

begin;

create or replace function public.servsync_create_job_work_item(
  p_inspection_id uuid,
  p_title text,
  p_customer_description text default '',
  p_internal_notes text default '',
  p_line_type text default 'other',
  p_quantity numeric default 1,
  p_unit text default 'each',
  p_unit_price_cents integer default null,
  p_labor_hours numeric default null,
  p_billable boolean default true,
  p_completion_status text default 'open',
  p_source_key text default null
)
returns public.job_work_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_item public.job_work_items;
  v_title text := trim(coalesce(p_title, ''));
  v_source_key text := nullif(trim(coalesce(p_source_key, '')), '');
  v_line_type text := coalesce(nullif(trim(p_line_type), ''), 'other');
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'each');
  v_completion_status text := coalesce(nullif(trim(p_completion_status), ''), 'open');
  v_billable boolean := coalesce(p_billable, true);
  v_billing_status text := 'unbilled';
begin
  if p_inspection_id is null then
    raise exception 'Job is required.';
  end if;

  if v_title = '' then
    raise exception 'Work item title is required.';
  end if;

  if v_line_type not in ('labor', 'material', 'fee', 'other') then
    raise exception 'Choose a valid line type.';
  end if;

  if v_completion_status not in ('open', 'completed', 'removed') then
    raise exception 'Choose a valid completion status.';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be zero or more.';
  end if;

  if p_unit_price_cents is not null and p_unit_price_cents < 0 then
    raise exception 'Unit price must be zero or more, or blank.';
  end if;

  if p_labor_hours is not null and p_labor_hours < 0 then
    raise exception 'Labor hours must be zero or more, or blank.';
  end if;

  if v_source_key is not null and v_source_key !~ '^[A-Za-z0-9:_-]{1,160}$' then
    raise exception 'Manual source key contains unsupported characters.';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_job.contractor_id) then
    raise exception 'You do not have permission to add work items for this job.';
  end if;

  if v_source_key is null then
    v_source_key := 'manual:' || gen_random_uuid()::text;
  end if;

  if v_completion_status = 'removed' or not v_billable then
    v_billable := false;
    v_billing_status := 'not_billable';
  end if;

  insert into public.job_work_items (
    inspection_id,
    contractor_id,
    source_type,
    source_key,
    title,
    description,
    customer_description,
    internal_notes,
    line_type,
    quantity,
    unit,
    unit_price_cents,
    labor_hours,
    billable,
    completion_status,
    billing_status,
    completed_at,
    completed_by,
    sort_order
  )
  values (
    v_job.id,
    v_job.contractor_id,
    'manual',
    v_source_key,
    v_title,
    coalesce(p_customer_description, ''),
    coalesce(p_customer_description, ''),
    coalesce(p_internal_notes, ''),
    v_line_type,
    p_quantity,
    v_unit,
    p_unit_price_cents,
    p_labor_hours,
    v_billable,
    v_completion_status,
    v_billing_status,
    case when v_completion_status = 'completed' then now() else null end,
    case when v_completion_status = 'completed' then auth.uid() else null end,
    coalesce((
      select max(sort_order) + 10
        from public.job_work_items
       where inspection_id = v_job.id
    ), 10)
  )
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.servsync_update_job_work_item(
  p_work_item_id uuid,
  p_title text,
  p_customer_description text default '',
  p_internal_notes text default '',
  p_line_type text default 'other',
  p_quantity numeric default 1,
  p_unit text default 'each',
  p_unit_price_cents integer default null,
  p_labor_hours numeric default null,
  p_billable boolean default true,
  p_completion_status text default 'open'
)
returns public.job_work_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.job_work_items;
  v_updated public.job_work_items;
  v_title text := trim(coalesce(p_title, ''));
  v_line_type text := coalesce(nullif(trim(p_line_type), ''), 'other');
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'each');
  v_completion_status text := coalesce(nullif(trim(p_completion_status), ''), 'open');
  v_billable boolean := coalesce(p_billable, true);
  v_billing_status text := 'unbilled';
begin
  if p_work_item_id is null then
    raise exception 'Work item is required.';
  end if;

  if v_title = '' then
    raise exception 'Work item title is required.';
  end if;

  if v_line_type not in ('labor', 'material', 'fee', 'other') then
    raise exception 'Choose a valid line type.';
  end if;

  if v_completion_status not in ('open', 'completed', 'removed') then
    raise exception 'Choose a valid completion status.';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be zero or more.';
  end if;

  if p_unit_price_cents is not null and p_unit_price_cents < 0 then
    raise exception 'Unit price must be zero or more, or blank.';
  end if;

  if p_labor_hours is not null and p_labor_hours < 0 then
    raise exception 'Labor hours must be zero or more, or blank.';
  end if;

  select *
    into v_item
    from public.job_work_items
   where id = p_work_item_id
   for update;

  if v_item.id is null then
    raise exception 'Work item not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_item.contractor_id) then
    raise exception 'You do not have permission to edit this work item.';
  end if;

  if v_item.source_type is distinct from 'manual' then
    raise exception 'Only manual work items can be edited here.';
  end if;

  if v_item.billing_status <> 'unbilled' then
    raise exception 'Only unbilled work items can be edited.';
  end if;

  if exists (
    select 1
      from public.invoice_line_items ili
      join public.invoices i on i.id = ili.invoice_id
     where ili.job_work_item_id = v_item.id
       and i.status <> 'void'
  ) then
    raise exception 'This work item is attached to an active invoice and cannot be edited.';
  end if;

  if v_completion_status = 'removed' or not v_billable then
    v_billable := false;
    v_billing_status := 'not_billable';
  end if;

  update public.job_work_items
     set title = v_title,
         description = coalesce(p_customer_description, ''),
         customer_description = coalesce(p_customer_description, ''),
         internal_notes = coalesce(p_internal_notes, ''),
         line_type = v_line_type,
         quantity = p_quantity,
         unit = v_unit,
         unit_price_cents = p_unit_price_cents,
         labor_hours = p_labor_hours,
         billable = v_billable,
         completion_status = v_completion_status,
         billing_status = v_billing_status,
         reserved_invoice_id = null,
         invoiced_invoice_id = null,
         completed_at = case
           when v_completion_status = 'completed' then coalesce(completed_at, now())
           else null
         end,
         completed_by = case
           when v_completion_status = 'completed' then coalesce(completed_by, auth.uid())
           else null
         end,
         updated_at = now()
   where id = v_item.id
   returning * into v_updated;

  return v_updated;
end;
$$;

create or replace function public.servsync_remove_job_work_item(
  p_work_item_id uuid
)
returns public.job_work_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.job_work_items;
  v_updated public.job_work_items;
begin
  if p_work_item_id is null then
    raise exception 'Work item is required.';
  end if;

  select *
    into v_item
    from public.job_work_items
   where id = p_work_item_id
   for update;

  if v_item.id is null then
    raise exception 'Work item not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_item.contractor_id) then
    raise exception 'You do not have permission to remove this work item.';
  end if;

  if v_item.source_type is distinct from 'manual' then
    raise exception 'Only manual work items can be removed here.';
  end if;

  if v_item.billing_status <> 'unbilled' then
    raise exception 'Only unbilled work items can be removed.';
  end if;

  if exists (
    select 1
      from public.invoice_line_items ili
      join public.invoices i on i.id = ili.invoice_id
     where ili.job_work_item_id = v_item.id
       and i.status <> 'void'
  ) then
    raise exception 'This work item is attached to an active invoice and cannot be removed.';
  end if;

  update public.job_work_items
     set completion_status = 'removed',
         billing_status = 'not_billable',
         billable = false,
         reserved_invoice_id = null,
         invoiced_invoice_id = null,
         updated_at = now()
   where id = v_item.id
   returning * into v_updated;

  return v_updated;
end;
$$;

revoke execute on function public.servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text) from public;
revoke execute on function public.servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text) from anon;
grant execute on function public.servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text) to authenticated;

revoke execute on function public.servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text) from public;
revoke execute on function public.servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text) from anon;
grant execute on function public.servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text) to authenticated;

revoke execute on function public.servsync_remove_job_work_item(uuid) from public;
revoke execute on function public.servsync_remove_job_work_item(uuid) from anon;
grant execute on function public.servsync_remove_job_work_item(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
