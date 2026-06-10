-- ServSync job lifecycle support.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Keeps public.inspections as the backing table, but adds job lifecycle fields
-- so the app can treat those records as Jobs without breaking finalized reports.
--
-- Run after:
--   - servsync-estimates.sql
--   - servsync-contractor-team-access.sql
--   - servsync-local-field-work.sql
--   - servsync-field-work-report-delivery.sql

begin;

alter table public.inspections
  add column if not exists job_type text not null default 'service_visit',
  add column if not exists job_status text not null default 'draft',
  add column if not exists estimate_id uuid references public.estimates(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.inspections
  alter column job_type set default 'service_visit',
  alter column job_status set default 'draft';

update public.inspections
   set job_type = 'service_visit'
 where job_type is null or trim(job_type) = '';

update public.inspections
   set job_status = case when status = 'finalized' then 'completed' else 'draft' end
 where job_status is null or trim(job_status) = '';

update public.inspections
   set job_status = case when status = 'finalized' then 'completed' else 'draft' end
 where job_status not in ('draft', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled');

alter table public.inspections
  alter column job_type set not null,
  alter column job_status set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'inspections_job_status_check'
       and conrelid = 'public.inspections'::regclass
  ) then
    alter table public.inspections
      add constraint inspections_job_status_check
      check (job_status in ('draft', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled'));
  end if;
end $$;

update public.inspections
   set job_status = 'completed',
       completed_at = coalesce(completed_at, updated_at, now())
 where status = 'finalized'
   and job_status = 'draft';

create index if not exists inspections_contractor_job_status_updated_idx
  on public.inspections(contractor_id, job_status, updated_at desc);

create index if not exists inspections_estimate_idx
  on public.inspections(estimate_id);

create or replace function public.current_user_can_write_contractor_jobs(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.contractor_profiles cp
     where cp.id = p_contractor_id
       and cp.owner_user_id = auth.uid()
  )
  or exists (
    select 1
      from public.contractor_team_members tm
     where tm.contractor_id = p_contractor_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
       and tm.role in ('admin', 'office', 'field_tech')
  )
  or public.current_user_is_platform_admin();
$$;

grant execute on function public.current_user_can_write_contractor_jobs(uuid) to authenticated;

-- Team-aware RLS for inspections-backed jobs.
drop policy if exists "insp_select_contractor" on public.inspections;
drop policy if exists "insp_insert_contractor" on public.inspections;
drop policy if exists "insp_update_contractor" on public.inspections;
drop policy if exists "insp_delete_contractor" on public.inspections;
drop policy if exists "insp_select_homeowner" on public.inspections;

create policy "insp_select_contractor"
  on public.inspections for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

create policy "insp_insert_contractor"
  on public.inspections for insert to authenticated
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
  );

create policy "insp_update_contractor"
  on public.inspections for update to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
  )
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
  );

create policy "insp_delete_contractor"
  on public.inspections for delete to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
    and status = 'draft'
    and job_status = 'draft'
  );

create policy "insp_select_homeowner"
  on public.inspections for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    and status = 'finalized'
  );

-- Keep the existing create RPC name, but make it compatible with contractor
-- team access. New records still use public.inspections and start as draft jobs.
create or replace function public.servsync_create_field_work(
  p_homeowner_user_id    uuid  default null,
  p_local_contact_id     uuid  default null,
  p_local_home_id        uuid  default null,
  p_service_request_id   uuid  default null,
  p_name                 text  default '',
  p_rooms_with_findings  jsonb default '[]'::jsonb,
  p_template_id          uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request public.service_requests;
  v_local_home public.contractor_local_homes;
  v_new_id uuid;
begin
  select id into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if v_contractor_id is null or not public.current_user_can_write_contractor_jobs(v_contractor_id) then
    raise exception 'Contractor profile not found.';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Job name is required.';
  end if;

  if p_service_request_id is not null then
    select * into v_request
      from public.service_requests
     where id = p_service_request_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_request.id is null then
      raise exception 'Service request not found for this contractor.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_request.homeowner_user_id;
    elsif p_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception 'Job homeowner does not match the service request.';
    end if;
  end if;

  if p_local_home_id is not null then
    select * into v_local_home
      from public.contractor_local_homes
     where id = p_local_home_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_local_home.id is null then
      raise exception 'Local home not found for this contractor.';
    end if;

    if p_local_contact_id is null then
      p_local_contact_id := v_local_home.local_contact_id;
    elsif p_local_contact_id <> v_local_home.local_contact_id then
      raise exception 'Local customer does not match the selected local home.';
    end if;
  end if;

  if p_homeowner_user_id is null and p_local_contact_id is null then
    raise exception 'Choose a homeowner or new customer before starting a job.';
  end if;

  if p_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = p_homeowner_user_id
       and status = 'active'
  ) then
    raise exception 'Homeowner is not connected to this contractor.';
  end if;

  if p_local_contact_id is not null and not exists (
    select 1
      from public.contractor_local_contacts
     where id = p_local_contact_id
       and contractor_id = v_contractor_id
  ) then
    raise exception 'New customer not found for this contractor.';
  end if;

  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    template_id,
    name,
    rooms_with_findings
  ) values (
    v_contractor_id,
    p_homeowner_user_id,
    p_local_contact_id,
    p_local_home_id,
    p_service_request_id,
    p_template_id,
    trim(p_name),
    coalesce(p_rooms_with_findings, '[]'::jsonb)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, text, jsonb, uuid
) to authenticated;

-- Keep the existing update RPC name, but make it team-aware and compatible with
-- draft/scheduled/in-progress job statuses. The existing report status column
-- still controls finalization.
create or replace function public.servsync_update_inspection(
  p_inspection_id       uuid,
  p_rooms_with_findings jsonb,
  p_summary             text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inspections
     set rooms_with_findings = p_rooms_with_findings,
         summary             = coalesce(p_summary, ''),
         updated_at          = now()
   where id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(contractor_id)
     and status = 'draft'
     and job_status in ('draft', 'scheduled', 'in_progress');

  if not found then
    raise exception 'Job not found or already finalized.';
  end if;
end;
$$;

grant execute on function public.servsync_update_inspection(uuid, jsonb, text) to authenticated;

create or replace function public.servsync_delete_inspection(
  p_inspection_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.inspections
   where id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(contractor_id)
     and status = 'draft'
     and job_status = 'draft';

  if not found then
    raise exception 'Draft job not found, already finalized, or not available to this contractor account.';
  end if;
end;
$$;

grant execute on function public.servsync_delete_inspection(uuid) to authenticated;

-- Keep the field-work finalize RPC name for compatibility. Finalizing a report
-- now also marks the job completed.
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

-- Sending the report is the final closeout step for connected homeowners.
create or replace function public.servsync_notify_field_work_report(p_inspection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insp public.inspections;
  v_contractor_name text;
  v_request public.service_requests;
begin
  select i.*
    into v_insp
    from public.inspections i
   where i.id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(i.contractor_id)
   limit 1;

  if v_insp.id is null then
    raise exception 'Job report not found.';
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

  update public.inspections
     set job_status = 'closed',
         completed_at = coalesce(completed_at, now()),
         closed_at = coalesce(closed_at, now()),
         updated_at = now()
   where id = v_insp.id
     and public.current_user_can_write_contractor_jobs(contractor_id);

  if v_insp.service_request_id is not null then
    select *
      into v_request
      from public.service_requests
     where id = v_insp.service_request_id
     limit 1;

    if v_request.id is not null and v_request.status not in ('closed', 'declined') then
      insert into public.service_request_messages (
        request_id,
        actor_user_id,
        actor_role,
        message_type,
        body
      ) values (
        v_request.id,
        auth.uid(),
        'contractor',
        'contractor_closed',
        coalesce(v_contractor_name, 'Your contractor') || ' completed the job and sent the final job report. The report is saved in Documents and your maintenance log.'
      );

      update public.service_requests
         set status = 'closed',
             closing_summary = coalesce(
               nullif(trim(closing_summary), ''),
               'Job completed and final job report sent to homeowner.'
             ),
             updated_at = now()
       where id = v_request.id;
    end if;
  end if;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (
    v_insp.homeowner_user_id,
    'inspection_report_filed',
    'Job report ready',
    coalesce(v_contractor_name, 'Your contractor') || ' sent a job report. It is saved in Documents and your maintenance log.',
    v_insp.service_request_id
  );
end;
$$;

grant execute on function public.servsync_notify_field_work_report(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
