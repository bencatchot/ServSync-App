-- ServSync structured line item conversion RPC preservation.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Run after:
--   - servsync-estimate-invoice-home-id.sql
--   - servsync-structured-line-items-foundation.sql
--
-- Replaces the conversion RPC definitions so structured estimate line item
-- fields survive estimate -> invoice, job -> invoice, and approved-scope
-- job creation paths. This does not add schema, RLS, or table grants.

begin;

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
  v_summary text;
  v_approved_scope jsonb;
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

    return jsonb_build_object(
      'estimate_id', v_estimate.id,
      'job_id', v_existing_job_id,
      'created', false
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

  v_summary := concat_ws(
    E'\n\n',
    nullif(trim(v_estimate.scope), ''),
    case when nullif(trim(coalesce(v_line_summary, '')), '') is not null
      then 'Approved estimate line items:' || E'\n' || v_line_summary
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
        'notes', coalesce(nullif(trim(v_estimate.scope), ''), 'Accepted estimate did not include line items. Review the approved estimate before starting work.'),
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

  return jsonb_build_object(
    'estimate_id', v_estimate.id,
    'job_id', v_job_id,
    'created', true,
    'job_status', v_job_status
  );
end;
$$;

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
    update public.invoices
       set home_id = coalesce(home_id, v_estimate.home_id),
           local_home_id = coalesce(local_home_id, v_estimate.local_home_id)
     where id = v_existing.id;

    return jsonb_build_object(
      'invoice_id', v_existing.id,
      'created', false,
      'status', v_existing.status
    );
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
    v_estimate.home_id,
    v_estimate.local_contact_id,
    v_estimate.local_home_id,
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
    line_title,
    customer_description,
    model_spec,
    supply_status,
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

grant execute on function public.servsync_create_job_from_estimate(uuid) to authenticated;
grant execute on function public.servsync_create_invoice_from_estimate(uuid) to authenticated;
grant execute on function public.servsync_create_invoice_from_job(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
