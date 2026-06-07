-- ServSync field work report delivery fix.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Fixes finalizing reports when a contractor files a PDF into the private
-- home-documents bucket, and adds an RPC for re-notifying the homeowner after
-- a report has already been filed.

begin;

alter table public.home_maintenance_log
  add column if not exists inspection_id uuid references public.inspections(id) on delete set null,
  add column if not exists report_document_id uuid references public.home_documents(id) on delete set null;

create unique index if not exists maintenance_log_unique_inspection_idx
  on public.home_maintenance_log(inspection_id)
  where inspection_id is not null;

create index if not exists maintenance_log_report_document_idx
  on public.home_maintenance_log(report_document_id);

create or replace function public.servsync_can_access_inspection(p_inspection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.inspections i
     where i.id = p_inspection_id
       and public.current_user_can_access_contractor(i.contractor_id)
  );
$$;

grant execute on function public.servsync_can_access_inspection(uuid) to authenticated;

create or replace function public.servsync_can_upload_field_work_report_path(p_storage_name text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_parts text[];
  v_inspection_id uuid;
begin
  v_parts := string_to_array(coalesce(p_storage_name, ''), '/');

  if array_length(v_parts, 1) < 4 then
    return false;
  end if;

  begin
    v_inspection_id := v_parts[3]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_parts[2] = 'field-work' then
    return exists (
      select 1
        from public.inspections i
       where i.id = v_inspection_id
         and i.homeowner_user_id::text = v_parts[1]
         and public.current_user_can_access_contractor(i.contractor_id)
    );
  end if;

  if v_parts[1] = 'contractor-field-work' then
    return exists (
      select 1
        from public.inspections i
       where i.id = v_inspection_id
         and i.contractor_id::text = v_parts[2]
         and i.homeowner_user_id is null
         and public.current_user_can_access_contractor(i.contractor_id)
    );
  end if;

  return false;
end;
$$;

grant execute on function public.servsync_can_upload_field_work_report_path(text) to authenticated;

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
     and public.current_user_can_access_contractor(i.contractor_id)
   limit 1;

  if v_insp.id is null then
    raise exception 'Field work not found.';
  end if;

  select business_name
    into v_contractor_name
    from public.contractor_profiles
   where id = v_insp.contractor_id
   limit 1;

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

drop policy if exists "home_docs_upload_contractor_field_work_reports" on storage.objects;
create policy "home_docs_upload_contractor_field_work_reports"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and public.servsync_can_upload_field_work_report_path(name)
  );

create or replace function public.servsync_notify_field_work_report(p_inspection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insp public.inspections;
  v_contractor_name text;
begin
  select i.*
    into v_insp
    from public.inspections i
   where i.id = p_inspection_id
     and public.current_user_can_access_contractor(i.contractor_id)
   limit 1;

  if v_insp.id is null then
    raise exception 'Field work report not found.';
  end if;

  if v_insp.homeowner_user_id is null then
    raise exception 'This report is not connected to a ServSync homeowner.';
  end if;

  if v_insp.status <> 'finalized' or coalesce(v_insp.report_storage_path, '') = '' then
    raise exception 'Finalize and file this report before sending it.';
  end if;

  select business_name
    into v_contractor_name
    from public.contractor_profiles
   where id = v_insp.contractor_id
   limit 1;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (
    v_insp.homeowner_user_id,
    'inspection_report_filed',
    'Field work report ready',
    coalesce(v_contractor_name, 'Your contractor') || ' sent a field work report. It is saved in Documents and your maintenance log.',
    v_insp.service_request_id
  );
end;
$$;

grant execute on function public.servsync_notify_field_work_report(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
