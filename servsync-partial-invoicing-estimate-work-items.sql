-- ServSync partial invoicing Phase 2B-1: accepted estimate work-item seeding.
-- Paste this into the Supabase SQL Editor only after explicit environment
-- approval.
--
-- Run after:
--   - servsync-estimate-labor-model-conversion-rpcs.sql
--   - servsync-partial-invoicing-data-foundation.sql
--
-- Replaces servsync_create_job_from_estimate so new and existing accepted-
-- estimate jobs seed one durable job_work_items row per estimate line item.
-- This patch does not backfill legacy jobs globally, convert inspection
-- findings, sync simple service tasks, or change invoice/PDF UI behavior.

begin;

create unique index if not exists job_work_items_source_estimate_line_item_uidx
  on public.job_work_items(source_estimate_line_item_id)
  where source_estimate_line_item_id is not null;

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

  if v_work_item.unit_price_cents is null then
    raise exception 'Add pricing before invoicing this job work item.';
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

create or replace function public.servsync_seed_job_work_items_from_estimate(
  p_estimate_id uuid,
  p_inspection_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate public.estimates;
  v_job public.inspections;
  v_inserted_count integer := 0;
begin
  if p_estimate_id is null or p_inspection_id is null then
    raise exception 'Estimate and job are required.';
  end if;

  select *
    into v_estimate
    from public.estimates
   where id = p_estimate_id
   for update;

  if v_estimate.id is null then
    raise exception 'Estimate not found.';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if v_job.contractor_id <> v_estimate.contractor_id then
    raise exception 'Job contractor does not match estimate contractor.';
  end if;

  if v_job.estimate_id is not null and v_job.estimate_id <> v_estimate.id then
    raise exception 'Job is linked to another estimate.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_estimate.contractor_id) then
    raise exception 'You do not have permission to create job work items for this contractor account.';
  end if;

  insert into public.job_work_items (
    inspection_id,
    contractor_id,
    source_estimate_line_item_id,
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
    sort_order
  )
  select
    v_job.id,
    v_estimate.contractor_id,
    eli.id,
    coalesce(
      nullif(trim(eli.line_title), ''),
      nullif(trim(eli.description), ''),
      initcap(coalesce(nullif(trim(eli.line_type), ''), 'Work')) || ' item'
    ),
    coalesce(nullif(trim(eli.description), ''), ''),
    coalesce(nullif(trim(eli.customer_description), ''), ''),
    concat_ws(
      E'\n',
      case
        when nullif(trim(eli.model_spec), '') is not null
          then 'Model/spec: ' || trim(eli.model_spec)
        else null
      end,
      case eli.supply_status
        when 'contractor_supplied' then 'Supply status: Contractor supplied'
        when 'customer_supplied' then 'Supply status: Customer supplied'
        when 'to_be_confirmed' then 'Supply status: To be confirmed'
        else null
      end
    ),
    case
      when eli.line_type in ('labor', 'material', 'fee', 'other') then eli.line_type
      when eli.line_type = 'equipment' then 'material'
      else 'other'
    end,
    coalesce(eli.quantity, 1),
    coalesce(nullif(trim(eli.unit), ''), 'each'),
    eli.unit_price_cents,
    eli.labor_hours,
    true,
    'open',
    'unbilled',
    coalesce(eli.sort_order, 0)
  from public.estimate_line_items eli
  where eli.estimate_id = v_estimate.id
  on conflict (source_estimate_line_item_id)
    where source_estimate_line_item_id is not null
  do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count;
end;
$$;

create or replace function public.servsync_create_job_from_estimate(p_estimate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate public.estimates;
  v_existing_job_id uuid;
  v_job_id uuid;
  v_job_status text;
  v_has_confirmed_appointment boolean := false;
  v_line_summary text;
  v_line_labor_summary text;
  v_labor_summary text;
  v_summary text;
  v_approved_scope jsonb;
  v_work_item_count integer := 0;
begin
  select *
    into v_estimate
    from public.estimates
   where id = p_estimate_id
   for update;

  if v_estimate.id is null then
    raise exception 'Estimate not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_estimate.contractor_id) then
    raise exception 'You do not have permission to create jobs for this contractor account.';
  end if;

  if v_estimate.status <> 'accepted' then
    raise exception 'Only accepted estimates can be converted to jobs.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_estimate.id::text)::bigint);

  select i.id
    into v_existing_job_id
    from public.inspections i
   where i.contractor_id = v_estimate.contractor_id
     and (
       i.estimate_id = v_estimate.id
       or (
         v_estimate.inspection_id is not null
         and i.id = v_estimate.inspection_id
         and (i.estimate_id is null or i.estimate_id = v_estimate.id)
       )
     )
   order by i.created_at asc
   limit 1;

  if v_existing_job_id is not null then
    update public.estimates
       set inspection_id = v_existing_job_id
     where id = v_estimate.id
       and inspection_id is distinct from v_existing_job_id;

    update public.inspections
       set estimate_id = v_estimate.id,
           home_id = coalesce(home_id, v_estimate.home_id),
           local_home_id = coalesce(local_home_id, v_estimate.local_home_id),
           updated_at = now()
     where id = v_existing_job_id
       and (estimate_id is null or estimate_id = v_estimate.id)
       and public.current_user_can_write_contractor_jobs(contractor_id);

    v_work_item_count := public.servsync_seed_job_work_items_from_estimate(v_estimate.id, v_existing_job_id);

    return jsonb_build_object(
      'estimate_id', v_estimate.id,
      'job_id', v_existing_job_id,
      'created', false,
      'work_items_created', v_work_item_count
    );
  end if;

  select string_agg(
           '- ' || line_label ||
           case
             when quantity is null then ''
             else ' (' || trim(to_char(quantity, 'FM999999990.##')) || ' ' || coalesce(nullif(trim(unit), ''), 'unit') || ')'
           end,
           E'\n'
           order by sort_order asc, created_at asc
         )
    into v_line_summary
    from (
      select
        coalesce(
          nullif(trim(line_title), ''),
          nullif(trim(description), '')
        ) as line_label,
        quantity,
        unit,
        sort_order,
        created_at
      from public.estimate_line_items
      where estimate_id = v_estimate.id
    ) line_rows
   where line_label is not null;

  select string_agg(
           '- ' || line_label || ': ' || regexp_replace(regexp_replace(labor_hours::text, '0+$', ''), '\.$', '') || ' hours',
           E'\n'
           order by sort_order asc, created_at asc
         )
    into v_line_labor_summary
    from (
      select
        coalesce(
          nullif(trim(line_title), ''),
          nullif(trim(description), ''),
          initcap(coalesce(nullif(trim(line_type), ''), 'Work')) || ' item'
        ) as line_label,
        labor_hours,
        sort_order,
        created_at
      from public.estimate_line_items
      where estimate_id = v_estimate.id
        and labor_hours is not null
    ) labor_rows;

  v_labor_summary := concat_ws(
    E'\n',
    case v_estimate.labor_mode
      when 'job_total' then 'Labor model: Job-total labor'
      when 'line_specific' then 'Labor model: Line-specific labor'
      else null
    end,
    case
      when v_estimate.labor_mode = 'job_total'
       and v_estimate.job_labor_hours is not null
        then 'Job labor hours: ' || regexp_replace(regexp_replace(v_estimate.job_labor_hours::text, '0+$', ''), '\.$', '')
      else null
    end,
    case
      when v_estimate.labor_mode = 'job_total'
       and v_estimate.job_labor_hours is not null
       and v_estimate.labor_rate_cents is null
        then 'Labor rate: Price to be confirmed'
      when v_estimate.labor_mode = 'job_total'
       and v_estimate.job_labor_hours is not null
       and v_estimate.labor_rate_cents is not null
        then 'Labor rate: $' || trim(to_char(v_estimate.labor_rate_cents / 100.0, 'FM999999990.00')) || '/hr'
      else null
    end,
    case
      when v_estimate.labor_mode = 'job_total'
       and v_estimate.job_labor_hours is not null
       and v_estimate.labor_rate_cents is not null
        then 'Labor total: $' || trim(to_char((v_estimate.job_labor_hours * v_estimate.labor_rate_cents) / 100.0, 'FM999999990.00'))
      else null
    end,
    case
      when v_estimate.labor_mode = 'line_specific'
       and nullif(trim(coalesce(v_line_labor_summary, '')), '') is not null
        then 'Line labor hours:' || E'\n' || v_line_labor_summary
      else null
    end,
    case
      when v_estimate.labor_mode = 'line_specific'
       and nullif(trim(coalesce(v_line_labor_summary, '')), '') is not null
       and v_estimate.labor_rate_cents is null
        then 'Labor rate: Price to be confirmed'
      when v_estimate.labor_mode = 'line_specific'
       and nullif(trim(coalesce(v_line_labor_summary, '')), '') is not null
       and v_estimate.labor_rate_cents is not null
        then 'Labor rate: $' || trim(to_char(v_estimate.labor_rate_cents / 100.0, 'FM999999990.00')) || '/hr'
      else null
    end
  );

  v_summary := concat_ws(
    E'\n\n',
    nullif(trim(v_estimate.scope), ''),
    case when nullif(trim(coalesce(v_line_summary, '')), '') is not null
      then 'Approved estimate line items:' || E'\n' || v_line_summary
      else null
    end,
    case when nullif(trim(coalesce(v_labor_summary, '')), '') is not null
      then 'Approved labor context:' || E'\n' || v_labor_summary
      else null
    end,
    case when nullif(trim(v_estimate.notes), '') is not null
      then 'Notes: ' || trim(v_estimate.notes)
      else null
    end,
    case when nullif(trim(v_estimate.terms), '') is not null
      then 'Terms: ' || trim(v_estimate.terms)
      else null
    end
  );

  select jsonb_build_array(jsonb_build_object(
    'room', 'Approved Scope',
    'findings', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'title', coalesce(
            nullif(trim(eli.line_title), ''),
            nullif(trim(eli.description), ''),
            initcap(coalesce(nullif(trim(eli.line_type), ''), 'Work')) || ' item'
          ),
          'status', 'Monitor',
          'notes', concat_ws(
            E'\n',
            'Approved estimate line item.',
            case
              when nullif(trim(eli.customer_description), '') is not null
                then trim(eli.customer_description)
              else null
            end,
            case
              when nullif(trim(eli.model_spec), '') is not null
                then 'Model/spec: ' || trim(eli.model_spec)
              else null
            end,
            case eli.supply_status
              when 'contractor_supplied' then 'Supply status: Contractor supplied'
              when 'customer_supplied' then 'Supply status: Customer supplied'
              when 'to_be_confirmed' then 'Supply status: To be confirmed'
              else null
            end,
            'Type: ' || coalesce(nullif(trim(eli.line_type), ''), 'work'),
            'Quantity: ' || trim(to_char(coalesce(eli.quantity, 1), 'FM999999990.##')) || ' ' || coalesce(nullif(trim(eli.unit), ''), 'unit'),
            case
              when eli.unit_price_cents is null then 'Unit price: Price to be confirmed'
              else 'Unit price: $' || trim(to_char(eli.unit_price_cents / 100.0, 'FM999999990.00'))
            end,
            case
              when eli.unit_price_cents is null then 'Line total: Price to be confirmed'
              else 'Line total: $' || trim(to_char((coalesce(eli.quantity, 1) * eli.unit_price_cents) / 100.0, 'FM999999990.00'))
            end,
            case
              when eli.labor_hours is not null then 'Labor hours: ' || regexp_replace(regexp_replace(eli.labor_hours::text, '0+$', ''), '\.$', '')
              else null
            end,
            case
              when eli.labor_hours is not null and v_estimate.labor_rate_cents is null then 'Labor rate: Price to be confirmed'
              when eli.labor_hours is not null and v_estimate.labor_rate_cents is not null then 'Labor rate: $' || trim(to_char(v_estimate.labor_rate_cents / 100.0, 'FM999999990.00')) || '/hr'
              else null
            end,
            case
              when eli.labor_hours is not null and v_estimate.labor_rate_cents is not null then 'Labor total: $' || trim(to_char((eli.labor_hours * v_estimate.labor_rate_cents) / 100.0, 'FM999999990.00'))
              else null
            end
          ),
          'action', 'Complete approved work: ' || coalesce(
            nullif(trim(eli.line_title), ''),
            nullif(trim(eli.description), ''),
            'line item'
          ),
          'due', '',
          'photos', '[]'::jsonb
        )
        order by eli.sort_order asc, eli.created_at asc
      ) filter (where eli.id is not null),
      jsonb_build_array(jsonb_build_object(
        'title', 'Approved scope',
        'status', 'Monitor',
        'notes', coalesce(
          nullif(trim(concat_ws(
            E'\n\n',
            nullif(trim(v_estimate.scope), ''),
            case when nullif(trim(coalesce(v_labor_summary, '')), '') is not null
              then 'Approved labor context:' || E'\n' || v_labor_summary
              else null
            end
          )), ''),
          'Accepted estimate did not include line items. Review the approved estimate before starting work.'
        ),
        'action', 'Complete the approved work.',
        'due', '',
        'photos', '[]'::jsonb
      ))
    )
  ))
    into v_approved_scope
    from public.estimate_line_items eli
   where eli.estimate_id = v_estimate.id;

  if v_estimate.service_request_id is not null
     and to_regclass('public.service_request_appointments') is not null then
    execute
      'select exists (
         select 1
           from public.service_request_appointments a
          where a.request_id = $1
            and a.status = ''confirmed''
       )'
      into v_has_confirmed_appointment
      using v_estimate.service_request_id;
  end if;

  v_job_status := case when v_has_confirmed_appointment then 'scheduled' else 'draft' end;

  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    name,
    summary,
    status,
    job_type,
    job_status,
    estimate_id,
    rooms_with_findings
  ) values (
    v_estimate.contractor_id,
    v_estimate.homeowner_user_id,
    v_estimate.home_id,
    v_estimate.local_contact_id,
    v_estimate.local_home_id,
    v_estimate.service_request_id,
    coalesce(nullif(trim(v_estimate.title), ''), 'Job from accepted estimate'),
    coalesce(v_summary, ''),
    'draft',
    'service_visit',
    v_job_status,
    v_estimate.id,
    coalesce(v_approved_scope, '[]'::jsonb)
  )
  on conflict (estimate_id) where estimate_id is not null
  do update set estimate_id = excluded.estimate_id
  returning id into v_job_id;

  update public.estimates
     set inspection_id = v_job_id
   where id = v_estimate.id;

  v_work_item_count := public.servsync_seed_job_work_items_from_estimate(v_estimate.id, v_job_id);

  return jsonb_build_object(
    'estimate_id', v_estimate.id,
    'job_id', v_job_id,
    'created', true,
    'job_status', v_job_status,
    'work_items_created', v_work_item_count
  );
end;
$$;

revoke execute on function public.servsync_seed_job_work_items_from_estimate(uuid, uuid) from public;
revoke execute on function public.servsync_seed_job_work_items_from_estimate(uuid, uuid) from anon;
revoke execute on function public.servsync_seed_job_work_items_from_estimate(uuid, uuid) from authenticated;

revoke execute on function public.servsync_validate_invoice_job_work_item_link() from public;
revoke execute on function public.servsync_validate_invoice_job_work_item_link() from anon;

revoke execute on function public.servsync_create_job_from_estimate(uuid) from public;
revoke execute on function public.servsync_create_job_from_estimate(uuid) from anon;
grant execute on function public.servsync_create_job_from_estimate(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
