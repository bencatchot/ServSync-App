-- ServSync Draft-first Inspection Path Completion v1 hardening.
-- Apply only after explicit environment-specific SQL approval.
--
-- Dependencies:
--   servsync-contractor-team-access.sql
--   servsync-job-lifecycle.sql
--   servsync-home-specific-inspection-templates.sql
--   servsync-field-work-report-delivery.sql
--   servsync-go-live-security-hardening.sql
--
-- This additive policy patch does not mutate inspection, template, report, or
-- customer data. It aligns template management and report/media writes with
-- the contractor roles that can manage the corresponding workflow.

begin;

do $$
begin
  if to_regclass('public.inspection_templates') is null then
    raise exception 'Missing required table: public.inspection_templates';
  end if;
  if to_regclass('public.inspections') is null then
    raise exception 'Missing required table: public.inspections';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'Missing required table: storage.objects';
  end if;
  if to_regprocedure('public.current_user_can_manage_contractor_team(uuid)') is null then
    raise exception 'Missing required function: public.current_user_can_manage_contractor_team(uuid)';
  end if;
  if to_regprocedure('public.current_user_can_write_contractor_jobs(uuid)') is null then
    raise exception 'Missing required function: public.current_user_can_write_contractor_jobs(uuid)';
  end if;
  if to_regprocedure('public.servsync_storage_extension_is_allowed(text,text[])') is null then
    raise exception 'Missing required function: public.servsync_storage_extension_is_allowed(text,text[])';
  end if;
end
$$;

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
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    );
  end if;

  if v_parts[1] = 'contractor-field-work' then
    return exists (
      select 1
        from public.inspections i
       where i.id = v_inspection_id
         and i.contractor_id::text = v_parts[2]
         and i.homeowner_user_id is null
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    );
  end if;

  return false;
end;
$$;

revoke all on function public.servsync_can_upload_field_work_report_path(text) from public;
revoke all on function public.servsync_can_upload_field_work_report_path(text) from anon;
revoke all on function public.servsync_can_upload_field_work_report_path(text) from authenticated;
grant execute on function public.servsync_can_upload_field_work_report_path(text) to authenticated;

drop policy if exists "Inspection templates: contractor team creates" on public.inspection_templates;
create policy "Inspection templates: contractor team creates"
  on public.inspection_templates for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_team(contractor_id)
    and scope in ('contractor', 'home')
  );

drop policy if exists "Inspection templates: contractor team updates" on public.inspection_templates;
create policy "Inspection templates: contractor team updates"
  on public.inspection_templates for update to authenticated
  using (
    public.current_user_can_manage_contractor_team(contractor_id)
    and scope in ('contractor', 'home')
  )
  with check (
    public.current_user_can_manage_contractor_team(contractor_id)
    and scope in ('contractor', 'home')
  );

drop policy if exists "Inspection templates: contractor team deletes" on public.inspection_templates;
create policy "Inspection templates: contractor team deletes"
  on public.inspection_templates for delete to authenticated
  using (
    public.current_user_can_manage_contractor_team(contractor_id)
    and scope in ('contractor', 'home')
  );

revoke all on table public.inspection_templates from public;
revoke all on table public.inspection_templates from anon;
grant select, insert, update, delete on table public.inspection_templates to authenticated;

drop policy if exists "insp_media_upload" on storage.objects;
create policy "insp_media_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-media'
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp','heic','heif']::text[]
    )
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.id::text = (storage.foldername(name))[1]
         and public.current_user_can_write_contractor_jobs(cp.id)
    )
  );

drop policy if exists "insp_media_delete" on storage.objects;
create policy "insp_media_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inspection-media'
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.id::text = (storage.foldername(name))[1]
         and public.current_user_can_write_contractor_jobs(cp.id)
    )
  );

notify pgrst, 'reload schema';

commit;
