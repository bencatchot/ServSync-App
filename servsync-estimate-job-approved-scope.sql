-- ServSync accepted estimate -> job approved scope fix.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Run after:
--   - servsync-estimate-to-job.sql
--
-- Replaces servsync_create_job_from_estimate so new jobs created from accepted
-- estimates include an "Approved Scope" section populated from estimate line
-- items. This keeps public.inspections as the backing table.

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
           '- ' || nullif(trim(description), '') ||
           case
             when quantity is null then ''
             else ' (' || trim(to_char(quantity, 'FM999999990.##')) || ' ' || coalesce(nullif(trim(unit), ''), 'unit') || ')'
           end,
           E'\n'
           order by sort_order asc, created_at asc
         )
    into v_line_summary
    from public.estimate_line_items
   where estimate_id = v_estimate.id
     and nullif(trim(description), '') is not null;

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
          'title', coalesce(nullif(trim(eli.description), ''), initcap(coalesce(nullif(trim(eli.line_type), ''), 'Work')) || ' item'),
          'status', 'Monitor',
          'notes', concat_ws(
            E'\n',
            'Approved estimate line item.',
            'Type: ' || coalesce(nullif(trim(eli.line_type), ''), 'work'),
            'Quantity: ' || trim(to_char(coalesce(eli.quantity, 1), 'FM999999990.##')) || ' ' || coalesce(nullif(trim(eli.unit), ''), 'unit'),
            'Unit price: $' || trim(to_char(coalesce(eli.unit_price_cents, 0) / 100.0, 'FM999999990.00')),
            'Line total: $' || trim(to_char((coalesce(eli.quantity, 1) * coalesce(eli.unit_price_cents, 0)) / 100.0, 'FM999999990.00'))
          ),
          'action', 'Complete approved work: ' || coalesce(nullif(trim(eli.description), ''), 'line item'),
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
    local_contact_id,
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
    v_estimate.local_contact_id,
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

grant execute on function public.servsync_create_job_from_estimate(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
