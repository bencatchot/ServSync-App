-- ServSync first-class invoice creation from estimates/jobs.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Run after:
--   - servsync-invoices-schema.sql
--   - servsync-invoice-actions.sql
--   - servsync-estimate-to-job.sql
--
-- Adds safe RPC entry points to create draft invoices from accepted estimates
-- and inspections-backed jobs. This does not add payments, PDFs, reminders,
-- or timeline entries.

begin;

create or replace function public.servsync_create_invoice_from_estimate(p_estimate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate public.estimates;
  v_existing public.invoices;
  v_invoice public.invoices;
begin
  perform pg_advisory_xact_lock(hashtext('servsync-invoice-estimate-' || p_estimate_id::text));

  select *
    into v_estimate
    from public.estimates
   where id = p_estimate_id
   limit 1;

  if v_estimate.id is null then
    raise exception 'Estimate not found.';
  end if;

  if v_estimate.status <> 'accepted' then
    raise exception 'Only accepted estimates can be converted to invoices.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_estimate.contractor_id) then
    raise exception 'You do not have permission to create invoices for this contractor.';
  end if;

  select *
    into v_existing
    from public.invoices
   where estimate_id = v_estimate.id
     and status <> 'void'
   order by created_at asc
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'invoice_id', v_existing.id,
      'created', false,
      'status', v_existing.status
    );
  end if;

  insert into public.invoices (
    contractor_id,
    homeowner_user_id,
    local_contact_id,
    service_request_id,
    job_id,
    estimate_id,
    title,
    scope,
    notes,
    terms,
    status,
    subtotal_cents,
    tax_cents,
    discount_cents,
    total_cents,
    amount_paid_cents
  )
  values (
    v_estimate.contractor_id,
    v_estimate.homeowner_user_id,
    v_estimate.local_contact_id,
    v_estimate.service_request_id,
    v_estimate.inspection_id,
    v_estimate.id,
    'Invoice — ' || coalesce(nullif(trim(regexp_replace(v_estimate.title, '^\s*Estimate\s*[—-]\s*', '', 'i')), ''), 'Accepted estimate'),
    coalesce(v_estimate.scope, ''),
    coalesce(v_estimate.notes, ''),
    coalesce(v_estimate.terms, ''),
    'draft',
    coalesce(v_estimate.subtotal_cents, v_estimate.total_cents, 0),
    0,
    0,
    coalesce(v_estimate.total_cents, v_estimate.subtotal_cents, 0),
    0
  )
  returning * into v_invoice;

  insert into public.invoice_line_items (
    invoice_id,
    line_type,
    description,
    quantity,
    unit,
    unit_price_cents,
    sort_order
  )
  select
    v_invoice.id,
    eli.line_type,
    eli.description,
    eli.quantity,
    eli.unit,
    eli.unit_price_cents,
    eli.sort_order
  from public.estimate_line_items eli
  where eli.estimate_id = v_estimate.id
  order by eli.sort_order asc, eli.created_at asc;

  if not exists (
    select 1
      from public.invoice_line_items ili
     where ili.invoice_id = v_invoice.id
  ) then
    insert into public.invoice_line_items (
      invoice_id,
      line_type,
      description,
      quantity,
      unit,
      unit_price_cents,
      sort_order
    )
    values (
      v_invoice.id,
      'labor',
      '',
      1,
      'job',
      0,
      0
    );
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'created', true,
    'status', v_invoice.status
  );
end;
$$;

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
    return jsonb_build_object(
      'invoice_id', v_existing.id,
      'created', false,
      'status', v_existing.status
    );
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
    select string_agg('- ' || task_title, E'\n' order by room_ord, finding_ord)
      into v_task_scope
      from (
        select
          room_data.room_ord,
          finding_data.finding_ord,
          nullif(trim(finding_data.finding->>'title'), '') as task_title
        from jsonb_array_elements(coalesce(v_job.rooms_with_findings, '[]'::jsonb)) with ordinality as room_data(room_json, room_ord)
        cross join lateral jsonb_array_elements(coalesce(room_data.room_json->'findings', '[]'::jsonb)) with ordinality as finding_data(finding, finding_ord)
      ) task_rows
     where task_title is not null;
  end if;

  insert into public.invoices (
    contractor_id,
    homeowner_user_id,
    local_contact_id,
    service_request_id,
    job_id,
    estimate_id,
    title,
    scope,
    notes,
    terms,
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
    v_job.local_contact_id,
    v_job.service_request_id,
    v_job.id,
    v_job.estimate_id,
    'Invoice — ' || coalesce(nullif(trim(v_job.name), ''), 'Completed job'),
    coalesce(
      nullif(trim(v_estimate.scope), ''),
      nullif(trim(v_job.summary), ''),
      case when nullif(trim(coalesce(v_task_scope, '')), '') is not null
        then 'Completed work items:' || E'\n' || v_task_scope
        else null
      end,
      'Completed work for this job.'
    ),
    coalesce(v_estimate.notes, ''),
    coalesce(v_estimate.terms, 'Payment is due upon receipt unless otherwise agreed in writing.'),
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
      quantity,
      unit,
      unit_price_cents,
      sort_order
    )
    select
      v_invoice.id,
      eli.line_type,
      eli.description,
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
      quantity,
      unit,
      unit_price_cents,
      sort_order
    )
    select
      v_invoice.id,
      'labor',
      task_title,
      1,
      'each',
      0,
      (row_number() over (order by room_ord, finding_ord) - 1)::int
    from (
      select
        room_data.room_ord,
        finding_data.finding_ord,
        nullif(trim(finding_data.finding->>'title'), '') as task_title
      from jsonb_array_elements(coalesce(v_job.rooms_with_findings, '[]'::jsonb)) with ordinality as room_data(room_json, room_ord)
      cross join lateral jsonb_array_elements(coalesce(room_data.room_json->'findings', '[]'::jsonb)) with ordinality as finding_data(finding, finding_ord)
    ) task_rows
    where task_title is not null
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
      quantity,
      unit,
      unit_price_cents,
      sort_order
    )
    values (
      v_invoice.id,
      'labor',
      '',
      1,
      'job',
      0,
      0
    );
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'created', true,
    'status', v_invoice.status
  );
end;
$$;

grant execute on function public.servsync_create_invoice_from_estimate(uuid) to authenticated;
grant execute on function public.servsync_create_invoice_from_job(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
