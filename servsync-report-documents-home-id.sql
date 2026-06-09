-- ServSync contractor-filed report document property context.
-- Paste into the Supabase SQL Editor.
--
-- Ensures homeowner-facing report documents created during contractor report
-- finalization inherit the connected homeowner job's home_id.

begin;

alter table public.home_documents
  add column if not exists home_id uuid references public.homes(id) on delete set null;

create index if not exists home_documents_owner_home_created_idx
  on public.home_documents(homeowner_user_id, home_id, created_at desc);

update public.home_documents hd
   set home_id = ml.home_id
  from public.home_maintenance_log ml
 where hd.id = ml.report_document_id
   and hd.home_id is null
   and ml.home_id is not null;

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
      homeowner_user_id,
      home_id,
      storage_path,
      file_name,
      content_type,
      file_size_bytes,
      document_type,
      notes
    ) values (
      v_insp.homeowner_user_id,
      v_insp.home_id,
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
