-- ServSync whole-job invoice guard for work-item-backed jobs.
--
-- This patch preserves the existing legacy/no-work-item whole-job invoice path,
-- but blocks new whole-job invoice creation when durable job_work_items exist.
-- Existing non-void invoice return behavior is intentionally preserved.

begin;

create or replace function public.servsync_create_invoice_from_job(p_inspection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_estimate public.estimates;
  v_existing public.invoices;
  v_invoice public.invoices;
  v_subtotal_cents integer := 0;
  v_total_cents integer := 0;
  v_scope_from_approved text;
  v_task_scope text;
begin
  perform pg_advisory_xact_lock(hashtext('servsync-invoice-job-' || p_inspection_id::text));

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   limit 1;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_job.contractor_id) then
    raise exception 'You do not have permission to create invoices for this job.';
  end if;

  select *
    into v_existing
    from public.invoices
   where job_id = v_job.id
     and status <> 'void'
   order by created_at asc
   limit 1;

  if v_existing.id is null and v_job.estimate_id is not null then
    select *
      into v_existing
      from public.invoices
     where estimate_id = v_job.estimate_id
       and status <> 'void'
     order by created_at asc
     limit 1;
  end if;

  if v_existing.id is not null then
    if v_job.estimate_id is not null then
      select *
        into v_estimate
        from public.estimates
       where id = v_job.estimate_id
       limit 1;
    end if;

    update public.invoices
       set home_id = coalesce(home_id, v_job.home_id, v_estimate.home_id),
           local_home_id = coalesce(local_home_id, v_job.local_home_id, v_estimate.local_home_id)
     where id = v_existing.id;

    if v_job.service_request_id is not null
       and (
         coalesce(v_job.job_status, '') in ('completed', 'closed')
         or v_job.status = 'finalized'
       ) then
      update public.service_requests
         set status = 'closed',
             closing_summary = coalesce(
               nullif(trim(closing_summary), ''),
               'Job completed and invoice created.'
             ),
             updated_at = now()
       where id = v_job.service_request_id
         and contractor_id = v_job.contractor_id
         and status not in ('closed', 'declined');
    end if;

    return jsonb_build_object(
      'invoice_id', v_existing.id,
      'created', false,
      'status', v_existing.status
    );
  end if;

  if exists (
    select 1
      from public.job_work_items jwi
     where jwi.inspection_id = v_job.id
     limit 1
  ) then
    raise exception 'Use item-based invoicing for jobs with work items.';
  end if;

  if v_job.estimate_id is not null then
    select *
      into v_estimate
      from public.estimates
     where id = v_job.estimate_id
     limit 1;

    if v_estimate.id is not null then
      v_subtotal_cents := coalesce(v_estimate.subtotal_cents, v_estimate.total_cents, 0);
      v_total_cents := coalesce(v_estimate.total_cents, v_estimate.subtotal_cents, 0);
    end if;
  end if;

  if v_estimate.id is null then
    select string_agg(task_notes, E'\n' order by room_ord, finding_ord)
      into v_scope_from_approved
      from (
        select
          room_data.room_ord,
          finding_data.finding_ord,
          nullif(trim(finding_data.finding->>'notes'), '') as task_notes,
          lower(trim(coalesce(room_data.room_json->>'display_name', room_data.room_json->>'room', ''))) as room_label
        from jsonb_array_elements(coalesce(v_job.rooms_with_findings, '[]'::jsonb)) with ordinality as room_data(room_json, room_ord)
        cross join lateral jsonb_array_elements(coalesce(room_data.room_json->'findings', '[]'::jsonb)) with ordinality as finding_data(finding, finding_ord)
      ) approved_rows
     where task_notes is not null
       and room_label = 'approved scope';

    select string_agg('- ' || task_title, E'\n' order by room_ord, finding_ord)
      into v_task_scope
      from (
        select
          room_data.room_ord,
          finding_data.finding_ord,
          nullif(trim(finding_data.finding->>'title'), '') as task_title,
          lower(trim(coalesce(room_data.room_json->>'display_name', room_data.room_json->>'room', ''))) as room_label
        from jsonb_array_elements(coalesce(v_job.rooms_with_findings, '[]'::jsonb)) with ordinality as room_data(room_json, room_ord)
        cross join lateral jsonb_array_elements(coalesce(room_data.room_json->'findings', '[]'::jsonb)) with ordinality as finding_data(finding, finding_ord)
      ) task_rows
     where task_title is not null
       and room_label <> 'approved scope'
       and lower(task_title) <> lower(trim(coalesce(v_job.name, '')));
  end if;

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
    labor_rate_cents,
    job_labor_hours,
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
    coalesce(v_job.home_id, v_estimate.home_id),
    v_job.local_contact_id,
    coalesce(v_job.local_home_id, v_estimate.local_home_id),
    v_job.service_request_id,
    v_job.id,
    v_job.estimate_id,
    'Invoice — ' || coalesce(nullif(trim(v_job.name), ''), 'Completed job'),
    coalesce(
      nullif(trim(v_estimate.scope), ''),
      nullif(trim(v_job.summary), ''),
      nullif(trim(v_scope_from_approved), ''),
      case when nullif(trim(coalesce(v_task_scope, '')), '') is not null
        then 'Completed work items:' || E'\n' || v_task_scope
        else null
      end,
      'Completed service work.'
    ),
    coalesce(v_estimate.notes, ''),
    coalesce(v_estimate.terms, 'Payment is due upon receipt unless otherwise agreed in writing.'),
    v_estimate.labor_mode,
    v_estimate.labor_rate_cents,
    v_estimate.job_labor_hours,
    v_estimate.material_total_cents,
    v_estimate.labor_total_cents,
    v_estimate.fee_total_cents,
    v_estimate.other_total_cents,
    'draft',
    v_subtotal_cents,
    0,
    0,
    v_total_cents,
    0
  )
  returning * into v_invoice;

  if v_estimate.id is not null then
    insert into public.invoice_line_items (
      invoice_id,
      line_type,
      description,
      line_title,
      customer_description,
      model_spec,
      supply_status,
      labor_hours,
      quantity,
      unit,
      unit_price_cents,
      sort_order
    )
    select
      v_invoice.id,
      eli.line_type,
      eli.description,
      coalesce(nullif(trim(eli.line_title), ''), nullif(trim(eli.description), '')),
      nullif(trim(eli.customer_description), ''),
      nullif(trim(eli.model_spec), ''),
      eli.supply_status,
      eli.labor_hours,
      eli.quantity,
      eli.unit,
      eli.unit_price_cents,
      eli.sort_order
    from public.estimate_line_items eli
    where eli.estimate_id = v_estimate.id
    order by eli.sort_order asc, eli.created_at asc;
  else
    insert into public.invoice_line_items (
      invoice_id,
      line_type,
      description,
      line_title,
      quantity,
      unit,
      unit_price_cents,
      sort_order
    )
    select
      v_invoice.id,
      'labor',
      task_title,
      task_title,
      1,
      'each',
      0,
      (row_number() over (order by room_ord, finding_ord) - 1)::int
    from (
      select
        room_data.room_ord,
        finding_data.finding_ord,
        nullif(trim(finding_data.finding->>'title'), '') as task_title,
        lower(trim(coalesce(room_data.room_json->>'display_name', room_data.room_json->>'room', ''))) as room_label
      from jsonb_array_elements(coalesce(v_job.rooms_with_findings, '[]'::jsonb)) with ordinality as room_data(room_json, room_ord)
      cross join lateral jsonb_array_elements(coalesce(room_data.room_json->'findings', '[]'::jsonb)) with ordinality as finding_data(finding, finding_ord)
    ) task_rows
    where task_title is not null
      and room_label <> 'approved scope'
      and lower(task_title) <> lower(trim(coalesce(v_job.name, '')))
    order by room_ord, finding_ord;
  end if;

  if not exists (
    select 1
      from public.invoice_line_items ili
     where ili.invoice_id = v_invoice.id
  ) then
    insert into public.invoice_line_items (
      invoice_id,
      line_type,
      description,
      line_title,
      quantity,
      unit,
      unit_price_cents,
      sort_order
    )
    values (
      v_invoice.id,
      'labor',
      '',
      null,
      1,
      'job',
      0,
      0
    );
  end if;

  if v_job.service_request_id is not null
     and (
       coalesce(v_job.job_status, '') in ('completed', 'closed')
       or v_job.status = 'finalized'
     ) then
    update public.service_requests
       set status = 'closed',
           closing_summary = coalesce(
             nullif(trim(closing_summary), ''),
             'Job completed and invoice created.'
           ),
           updated_at = now()
     where id = v_job.service_request_id
       and contractor_id = v_job.contractor_id
       and status not in ('closed', 'declined');
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'created', true,
    'status', v_invoice.status
  );
end;
$$;

revoke execute on function public.servsync_create_invoice_from_job(uuid) from public;
revoke execute on function public.servsync_create_invoice_from_job(uuid) from anon;
grant execute on function public.servsync_create_invoice_from_job(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
