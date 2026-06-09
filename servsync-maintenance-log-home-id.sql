-- ServSync homeowner maintenance log property context.
-- Paste into the Supabase SQL Editor.
--
-- Adds optional home_id support for Maintenance Log / Home History records.
-- Existing entries remain unassigned unless they can safely inherit home_id
-- from an already-linked service request or job/report.

begin;

alter table public.home_maintenance_log
  add column if not exists home_id uuid references public.homes(id) on delete set null;

create index if not exists maintenance_log_homeowner_home_performed_idx
  on public.home_maintenance_log(homeowner_user_id, home_id, performed_at desc);

update public.home_maintenance_log ml
   set home_id = i.home_id
  from public.inspections i
 where ml.inspection_id = i.id
   and ml.home_id is null
   and i.home_id is not null;

update public.home_maintenance_log ml
   set home_id = sr.home_id
  from public.service_requests sr
 where ml.service_request_id = sr.id
   and ml.home_id is null
   and sr.home_id is not null;

create or replace function public.servsync_contractor_update_service_request(
  p_request_id         uuid,
  p_body               text,
  p_new_status         text    default 'contractor_responded',
  p_quote_amount_cents int     default null,
  p_quote_scope        text    default null,
  p_closing_summary    text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id     uuid;
  v_contractor_name   text;
  v_request           public.service_requests;
  v_next_status       text;
  v_body              text;
  v_cost_cents        int;
  v_performed_at      date;
  v_description       text;
begin
  select id, business_name
    into v_contractor_id, v_contractor_name
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  select * into v_request
    from public.service_requests
   where id = p_request_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'This service request is already closed.';
  end if;

  if p_new_status not in ('contractor_responded', 'declined', 'closed') then
    raise exception 'Unsupported service request status.';
  end if;

  v_next_status := p_new_status;
  v_body := coalesce(nullif(trim(p_body), ''), 'Contractor updated this request.');

  insert into public.service_request_messages (
    request_id, actor_user_id, actor_role, message_type, body
  ) values (
    v_request.id,
    auth.uid(),
    'contractor',
    case
      when v_next_status = 'declined' then 'contractor_declined'
      when v_next_status = 'closed' then 'contractor_closed'
      else 'contractor_response'
    end,
    v_body
  );

  update public.service_requests
     set status = v_next_status,
         closing_summary = case
           when v_next_status = 'closed' and p_closing_summary is not null
           then coalesce(nullif(trim(p_closing_summary), ''), '')
           else closing_summary
         end
   where id = v_request.id;

  if p_quote_amount_cents is not null and p_quote_amount_cents >= 0 then
    insert into public.service_request_quotes
      (request_id, contractor_id, amount_cents, scope, status)
    values
      (v_request.id, v_contractor_id, p_quote_amount_cents,
       coalesce(nullif(trim(p_quote_scope), ''), ''), 'pending')
    on conflict (request_id) do update
       set amount_cents = excluded.amount_cents,
           scope = excluded.scope,
           status = 'pending';
  end if;

  if v_next_status = 'closed' then
    select amount_cents into v_cost_cents
      from public.service_request_quotes
     where request_id = v_request.id
     order by (status = 'accepted') desc, created_at desc
     limit 1;

    select (proposed_at at time zone 'UTC')::date into v_performed_at
      from public.service_request_appointments
     where request_id = v_request.id
       and status in ('confirmed', 'completed')
     order by (status = 'completed') desc, proposed_at desc
     limit 1;

    if v_performed_at is null then
      v_performed_at := now()::date;
    end if;

    v_description := coalesce(
      nullif(trim(coalesce(p_closing_summary, '')), ''),
      nullif(trim(v_request.description), ''),
      'Service completed.'
    );

    insert into public.home_maintenance_log (
      homeowner_user_id,
      service_request_id,
      home_id,
      category,
      title,
      description,
      performed_at,
      contractor_name,
      cost_cents,
      notes
    ) values (
      v_request.homeowner_user_id,
      v_request.id,
      v_request.home_id,
      v_request.category,
      v_request.title,
      v_description,
      v_performed_at,
      coalesce(nullif(trim(v_contractor_name), ''), 'Contractor'),
      v_cost_cents,
      'Auto-created when service request was closed.'
    )
    on conflict (service_request_id) where service_request_id is not null
    do nothing;

    insert into public.notifications (user_id, type, title, body, request_id)
    values (
      v_request.homeowner_user_id,
      'maintenance_log_created',
      'Maintenance log updated',
      v_contractor_name || ' closed your service request. A maintenance log entry has been added to your home record.',
      v_request.id
    );
  end if;

  return jsonb_build_object('request_id', v_request.id, 'status', v_next_status);
end;
$$;

grant execute on function public.servsync_contractor_update_service_request(uuid, text, text, int, text, text) to authenticated;

create or replace function public.servsync_finalize_field_work(
  p_inspection_id       uuid,
  p_rooms_with_findings jsonb,
  p_summary             text,
  p_storage_path        text,
  p_file_name           text,
  p_file_size_bytes     int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_name      text;
  v_insp                 public.inspections;
  v_report_document_id   uuid;
  v_request_category     text;
  v_request_title        text;
  v_request_description  text;
  v_cost_cents           int;
begin
  select i.*
    into v_insp
    from public.inspections i
   where i.id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(i.contractor_id)
   limit 1;

  if v_insp.id is null then
    raise exception 'Job not found.';
  end if;

  select business_name
    into v_contractor_name
    from public.contractor_profiles
   where id = v_insp.contractor_id
   limit 1;

  update public.inspections
     set status = 'finalized',
         job_status = case when job_status = 'closed' then 'closed' else 'completed' end,
         completed_at = coalesce(completed_at, now()),
         rooms_with_findings = p_rooms_with_findings,
         summary = coalesce(p_summary, ''),
         report_storage_path = p_storage_path,
         report_file_name = p_file_name,
         updated_at = now()
   where id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(contractor_id);

  if v_insp.homeowner_user_id is not null then
    insert into public.home_documents (
      homeowner_user_id, storage_path, file_name, content_type,
      file_size_bytes, document_type, notes
    ) values (
      v_insp.homeowner_user_id,
      p_storage_path,
      p_file_name,
      'application/pdf',
      p_file_size_bytes,
      'inspection',
      'Job report from ' || coalesce(v_contractor_name, 'contractor') || '. Auto-saved from ServSync.'
    )
    returning id into v_report_document_id;

    if v_insp.service_request_id is not null then
      select category, title, description
        into v_request_category, v_request_title, v_request_description
        from public.service_requests
       where id = v_insp.service_request_id
       limit 1;

      select amount_cents into v_cost_cents
        from public.service_request_quotes
       where request_id = v_insp.service_request_id
       order by (status = 'accepted') desc, created_at desc
       limit 1;
    end if;

    insert into public.home_maintenance_log (
      homeowner_user_id,
      service_request_id,
      inspection_id,
      report_document_id,
      home_id,
      category,
      title,
      description,
      performed_at,
      contractor_name,
      cost_cents,
      notes
    ) values (
      v_insp.homeowner_user_id,
      v_insp.service_request_id,
      v_insp.id,
      v_report_document_id,
      v_insp.home_id,
      coalesce(nullif(trim(v_request_category), ''), 'Job'),
      coalesce(nullif(trim(v_request_title), ''), nullif(trim(v_insp.name), ''), 'Completed job'),
      coalesce(nullif(trim(coalesce(p_summary, '')), ''), nullif(trim(v_request_description), ''), 'Job completed and report filed.'),
      now()::date,
      coalesce(nullif(trim(v_contractor_name), ''), 'Contractor'),
      v_cost_cents,
      'Auto-created when job report was finalized. Report saved in Documents: ' || p_file_name
    )
    on conflict (inspection_id) where inspection_id is not null
    do update set
      report_document_id = excluded.report_document_id,
      home_id = coalesce(excluded.home_id, public.home_maintenance_log.home_id),
      description = excluded.description,
      contractor_name = excluded.contractor_name,
      cost_cents = coalesce(excluded.cost_cents, public.home_maintenance_log.cost_cents),
      notes = excluded.notes,
      updated_at = now();

    insert into public.notifications (user_id, type, title, body, request_id)
    values (
      v_insp.homeowner_user_id,
      'inspection_report_filed',
      'Job report filed',
      coalesce(v_contractor_name, 'Your contractor') || ' filed a job report for your home. It was saved to Documents and added to your maintenance log.',
      v_insp.service_request_id
    );
  end if;
end;
$$;

grant execute on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, int) to authenticated;

notify pgrst, 'reload schema';

commit;
