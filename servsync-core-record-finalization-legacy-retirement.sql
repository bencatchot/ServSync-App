-- FB-039E2 Core Record Finalization Legacy Bypass Retirement v1.
--
-- Apply only after the durable-idempotency migration is accepted, the new
-- application path is deployed in the target environment, and report
-- finalization has been observed. This staged forward fix removes authenticated
-- access to the pre-receipt report finalizer and its broad report-upload policy.

begin;

do $$
declare
  v_missing text;
begin
  select string_agg(name, ', ' order by name)
    into v_missing
    from (values
      ('public.servsync_core_record_finalization_operations', to_regclass('public.servsync_core_record_finalization_operations') is not null),
      ('public.servsync_prepare_job_report_finalization(uuid,uuid,jsonb)', to_regprocedure('public.servsync_prepare_job_report_finalization(uuid,uuid,jsonb)') is not null),
      ('public.servsync_commit_job_report_finalization(uuid,uuid,jsonb)', to_regprocedure('public.servsync_commit_job_report_finalization(uuid,uuid,jsonb)') is not null),
      ('public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)', to_regprocedure('public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)') is not null),
      ('public.servsync_can_upload_field_work_report_path(text)', to_regprocedure('public.servsync_can_upload_field_work_report_path(text)') is not null),
      ('storage.objects', to_regclass('storage.objects') is not null),
      (
        'storage policy home_docs_upload_contractor_field_work_reports',
        exists (
          select 1
            from pg_policies
           where schemaname = 'storage'
             and tablename = 'objects'
             and policyname = 'home_docs_upload_contractor_field_work_reports'
        )
      )
    ) required(name, present)
   where not present;

  if v_missing is not null then
    raise exception 'FB-039E2 legacy retirement prerequisites are missing: %', v_missing;
  end if;
end;
$$;

revoke all on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.servsync_can_upload_field_work_report_path(text)
  from public, anon, authenticated, service_role;

drop policy "home_docs_upload_contractor_field_work_reports" on storage.objects;

comment on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) is
  'Retired FB-039E2 pre-receipt Job report finalizer. Kept only for dependency-safe catalog compatibility; no client role may execute it.';
comment on function public.servsync_can_upload_field_work_report_path(text) is
  'Retired FB-039E2 broad report-upload predicate. Durable receipt-bound uploads use servsync_can_upload_prepared_record_finalization(text).';

notify pgrst, 'reload schema';

commit;
