-- ServSync Field Work -> homeowner maintenance log automation.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after:
--   1) servsync-local-field-work.sql
--   2) servsync-home-documents.sql
--   3) servsync-maintenance-log.sql
--
-- What this does:
--   - Finalized connected-homeowner Field Work still saves the PDF report to Documents.
--   - It also creates a homeowner maintenance log entry automatically.
--   - The log entry links back to the Field Work record and the saved report document.
--   - If the Field Work came from a service request with a quote, the log can carry that cost.

begin;

alter table public.home_maintenance_log
  add column if not exists inspection_id uuid references public.inspections(id) on delete set null,
  add column if not exists report_document_id uuid references public.home_documents(id) on delete set null;

create unique index if not exists maintenance_log_unique_inspection_idx
  on public.home_maintenance_log(inspection_id)
  where inspection_id is not null;

create index if not exists maintenance_log_report_document_idx
  on public.home_maintenance_log(report_document_id);

drop function if exists public.servsync_finalize_field_work(uuid, jsonb, text, text, text, int);

create function public.servsync_finalize_field_work(
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
  v_contractor_id        uuid;
  v_contractor_name      text;
  v_insp                 public.inspections;
  v_report_document_id   uuid;
  v_request_category     text;
  v_request_title        text;
  v_request_description  text;
  v_cost_cents           int;
begin
  select id, business_name
    into v_contractor_id, v_contractor_name
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  select * into v_insp
    from public.inspections
   where id = p_inspection_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_insp.id is null then
    raise exception 'Field work not found.';
  end if;

  update public.inspections
     set status = 'finalized',
         rooms_with_findings = p_rooms_with_findings,
         summary = coalesce(p_summary, ''),
         report_storage_path = p_storage_path,
         report_file_name = p_file_name,
         updated_at = now()
   where id = p_inspection_id;

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
      'Field work report from ' || coalesce(v_contractor_name, 'contractor') || '. Auto-saved from ServSync.'
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
      coalesce(nullif(trim(v_request_category), ''), 'Field Work'),
      coalesce(nullif(trim(v_request_title), ''), nullif(trim(v_insp.name), ''), 'Completed field work'),
      coalesce(nullif(trim(coalesce(p_summary, '')), ''), nullif(trim(v_request_description), ''), 'Field work completed and report filed.'),
      now()::date,
      coalesce(nullif(trim(v_contractor_name), ''), 'Contractor'),
      v_cost_cents,
      'Auto-created when field work was finalized. Report saved in Documents: ' || p_file_name
    )
    on conflict (inspection_id) where inspection_id is not null
    do update set
      report_document_id = excluded.report_document_id,
      description = excluded.description,
      contractor_name = excluded.contractor_name,
      cost_cents = coalesce(excluded.cost_cents, public.home_maintenance_log.cost_cents),
      notes = excluded.notes,
      updated_at = now();

    insert into public.notifications (user_id, type, title, body, request_id)
    values (
      v_insp.homeowner_user_id,
      'inspection_report_filed',
      'Field work report filed',
      coalesce(v_contractor_name, 'Your contractor') || ' filed a field work report for your home. It was saved to Documents and added to your maintenance log.',
      v_insp.service_request_id
    );
  end if;
end;
$$;

grant execute on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, int) to authenticated;

notify pgrst, 'reload schema';

commit;
