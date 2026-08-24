-- FB-039E2 Core Record Finalization Durable Idempotency v1.
--
-- Adds replay-safe preparation and commit contracts for:
--   1. canonical Job report finalization, including the private PDF,
--      home_documents registration, Home History lineage, and notification;
--   2. primary-homeowner manual Home History creation, with or without one
--      optional private receipt/invoice document.
--
-- This migration intentionally leaves the legacy six-argument
-- public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)
-- function and its broad pre-receipt report-upload policy in place for the
-- database-ahead-of-application rollout window. That legacy function is a
-- documented compatibility bypass: callers using it do not receive the new
-- operation receipt, payload-conflict, or prepared-upload guarantees. Retire
-- that bypass only in a separately reviewed protected cleanup after the new
-- application path is deployed and observed in every supported environment.

begin;

do $$
declare
  v_missing text;
begin
  if to_regclass('public.servsync_core_record_finalization_operations') is not null then
    raise exception 'FB-039E2 core record finalization durable idempotency is already installed.';
  end if;

  select string_agg(name, ', ' order by name)
    into v_missing
    from (values
      ('public.profiles', to_regclass('public.profiles') is not null),
      ('public.contractor_profiles', to_regclass('public.contractor_profiles') is not null),
      ('public.inspections', to_regclass('public.inspections') is not null),
      ('public.homes', to_regclass('public.homes') is not null),
      ('public.service_requests', to_regclass('public.service_requests') is not null),
      ('public.service_request_quotes', to_regclass('public.service_request_quotes') is not null),
      ('public.home_documents', to_regclass('public.home_documents') is not null),
      ('public.home_maintenance_log', to_regclass('public.home_maintenance_log') is not null),
      ('public.notifications', to_regclass('public.notifications') is not null),
      ('storage.objects', to_regclass('storage.objects') is not null),
      ('storage.foldername(text)', to_regprocedure('storage.foldername(text)') is not null),
      ('extensions.digest(bytea,text)', to_regprocedure('extensions.digest(bytea,text)') is not null),
      ('public.servsync_storage_extension_is_allowed(text,text[])', to_regprocedure('public.servsync_storage_extension_is_allowed(text,text[])') is not null),
      ('public.current_user_can_write_contractor_jobs(uuid)', to_regprocedure('public.current_user_can_write_contractor_jobs(uuid)') is not null)
    ) required(name, present)
   where not present;

  if v_missing is not null then
    raise exception 'FB-039E2 prerequisites are missing: %', v_missing;
  end if;
end;
$$;

create table public.servsync_core_record_finalization_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null
    check (operation_type in ('job_report_finalize', 'manual_home_history_create')),
  operation_key uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid references public.profiles(id) on delete cascade,
  subject_id uuid not null,
  job_id uuid references public.inspections(id) on delete cascade,
  history_id uuid references public.home_maintenance_log(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('prepared', 'succeeded')),
  storage_manifest jsonb not null default '{}'::jsonb
    check (jsonb_typeof(storage_manifest) = 'object'),
  result_kind text check (result_kind in ('job_report', 'manual_home_history')),
  result_id uuid,
  result_payload jsonb not null check (jsonb_typeof(result_payload) = 'object'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (actor_user_id, operation_type, operation_key),
  check (
    (
      operation_type = 'job_report_finalize'
      and contractor_id is not null
      and job_id = subject_id
      and history_id is null
      and (status = 'prepared' or result_id = job_id)
    )
    or
    (
      operation_type = 'manual_home_history_create'
      and contractor_id is null
      and homeowner_user_id = actor_user_id
      and job_id is null
      and (
        (status = 'prepared' and history_id is null)
        or
        (status = 'succeeded' and history_id = result_id)
      )
    )
  ),
  check (
    (status = 'prepared' and result_id is null and completed_at is null and expires_at is not null)
    or
    (status = 'succeeded' and result_id is not null and completed_at is not null)
  )
);

comment on table public.servsync_core_record_finalization_operations is
  'Private purpose-bound receipts for replay-safe Job report and manual Home History finalization. Browser and generic service roles have no direct table access.';

create unique index servsync_record_finalization_one_job_operation_idx
  on public.servsync_core_record_finalization_operations(operation_type, subject_id)
  where operation_type = 'job_report_finalize';

create index servsync_record_finalization_result_idx
  on public.servsync_core_record_finalization_operations(operation_type, result_id)
  where result_id is not null;

create index servsync_record_finalization_expiry_idx
  on public.servsync_core_record_finalization_operations(expires_at)
  where status = 'prepared';

alter table public.servsync_core_record_finalization_operations owner to postgres;
alter table public.servsync_core_record_finalization_operations enable row level security;
alter table public.servsync_core_record_finalization_operations force row level security;
revoke all on table public.servsync_core_record_finalization_operations from public, anon, authenticated, service_role;

create function public.servsync_private_record_finalization_payload_hash(p_payload jsonb)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select encode(extensions.digest(convert_to(coalesce(p_payload, 'null'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
$$;

alter function public.servsync_private_record_finalization_payload_hash(jsonb) owner to postgres;
revoke all on function public.servsync_private_record_finalization_payload_hash(jsonb) from public, anon, authenticated, service_role;

create function public.servsync_private_record_finalization_operation_lock(
  p_actor_user_id uuid,
  p_operation_type text,
  p_operation_key uuid
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  select pg_advisory_xact_lock(
    hashtextextended(p_actor_user_id::text || ':' || p_operation_type || ':' || p_operation_key::text, 0)
  );
$$;

alter function public.servsync_private_record_finalization_operation_lock(uuid, text, uuid) owner to postgres;
revoke all on function public.servsync_private_record_finalization_operation_lock(uuid, text, uuid) from public, anon, authenticated, service_role;

create function public.servsync_private_record_finalization_subject_lock(
  p_operation_type text,
  p_subject_id uuid
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended(p_operation_type || ':subject:' || p_subject_id::text, 0));
$$;

alter function public.servsync_private_record_finalization_subject_lock(text, uuid) owner to postgres;
revoke all on function public.servsync_private_record_finalization_subject_lock(text, uuid) from public, anon, authenticated, service_role;

create function public.servsync_private_record_finalization_extension(p_file_name text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select lower(coalesce(substring(trim(coalesce(p_file_name, '')) from '\.([^.]+)$'), ''));
$$;

alter function public.servsync_private_record_finalization_extension(text) owner to postgres;
revoke all on function public.servsync_private_record_finalization_extension(text) from public, anon, authenticated, service_role;

create function public.servsync_private_record_finalization_storage_size(p_object storage.objects)
returns bigint
language sql
immutable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(p_object.metadata ->> 'size', '')::bigint,
    nullif(p_object.metadata ->> 'contentLength', '')::bigint,
    -1
  );
$$;

alter function public.servsync_private_record_finalization_storage_size(storage.objects) owner to postgres;
revoke all on function public.servsync_private_record_finalization_storage_size(storage.objects) from public, anon, authenticated, service_role;

create function public.servsync_private_record_finalization_storage_mimetype(p_object storage.objects)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select lower(coalesce(p_object.metadata ->> 'mimetype', p_object.metadata ->> 'contentType', ''));
$$;

alter function public.servsync_private_record_finalization_storage_mimetype(storage.objects) owner to postgres;
revoke all on function public.servsync_private_record_finalization_storage_mimetype(storage.objects) from public, anon, authenticated, service_role;

create function public.servsync_prepare_job_report_finalization(
  p_operation_key uuid,
  p_inspection_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_insp public.inspections;
  v_existing public.servsync_core_record_finalization_operations;
  v_canonical jsonb;
  v_hash text;
  v_file_name text;
  v_file_size bigint;
  v_file_sha text;
  v_storage_path text;
  v_manifest jsonb;
  v_history_id uuid;
  v_document_id uuid;
  v_notification_id uuid;
  v_result jsonb;
  v_storage_object_exists boolean;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_operation_key is null or p_inspection_id is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'This report could not be prepared. Review the Job and try again.' using errcode = '22023';
  end if;

  perform public.servsync_private_record_finalization_operation_lock(v_actor, 'job_report_finalize', p_operation_key);
  perform public.servsync_private_record_finalization_subject_lock('job_report_finalize', p_inspection_id);

  select inspection.*
    into v_insp
    from public.inspections inspection
   where inspection.id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(inspection.contractor_id)
   for update;

  if v_insp.id is null then
    raise exception 'Job not found.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'rooms_with_findings', '[]'::jsonb)) <> 'array' then
    raise exception 'The report checklist is invalid. Review the Job and try again.' using errcode = '22023';
  end if;

  v_file_name := trim(coalesce(p_payload ->> 'file_name', ''));
  v_file_sha := lower(trim(coalesce(p_payload ->> 'file_sha256', '')));
  begin
    v_file_size := nullif(p_payload ->> 'file_size_bytes', '')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'The report file metadata is invalid. Generate the PDF again.' using errcode = '22023';
  end;

  if v_file_name = '' or length(v_file_name) > 255
     or public.servsync_private_record_finalization_extension(v_file_name) <> 'pdf'
     or v_file_sha !~ '^[0-9a-f]{64}$'
     or v_file_size is null or v_file_size < 5 or v_file_size > 52428800 then
    raise exception 'The report PDF metadata is invalid. Generate the PDF again.' using errcode = '22023';
  end if;

  v_canonical := jsonb_build_object(
    'inspection_id', v_insp.id,
    'rooms_with_findings', coalesce(p_payload -> 'rooms_with_findings', '[]'::jsonb),
    'summary', coalesce(p_payload ->> 'summary', ''),
    'include_summary', coalesce((p_payload ->> 'include_summary')::boolean, true),
    'include_value_add', coalesce((p_payload ->> 'include_value_add')::boolean, true),
    'value_add_text', coalesce(p_payload ->> 'value_add_text', '')
  );
  v_hash := public.servsync_private_record_finalization_payload_hash(v_canonical);

  select operation.*
    into v_existing
    from public.servsync_core_record_finalization_operations operation
   where operation.operation_type = 'job_report_finalize'
     and operation.subject_id = v_insp.id
   for update;

  if v_existing.id is not null then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'This Job report was already prepared with different details. Refresh the Job before trying again.' using errcode = '22023';
    end if;
    if v_existing.status = 'succeeded' then
      return v_existing.result_payload || jsonb_build_object('idempotent', true);
    end if;
    if v_existing.expires_at <= now() then
      update public.servsync_core_record_finalization_operations
         set expires_at = now() + interval '30 days',
             updated_at = now()
       where id = v_existing.id
       returning * into v_existing;
    end if;

    select exists (
      select 1
        from storage.objects object
       where object.bucket_id = v_existing.storage_manifest ->> 'bucket_id'
         and object.name = v_existing.storage_manifest ->> 'storage_path'
    ) into v_storage_object_exists;

    -- jsPDF may emit different bytes when the same semantic report is
    -- regenerated later. If no object was ever accepted at the deterministic
    -- path, refresh only the prepared file fingerprint/size. Once an object
    -- exists, its original manifest remains canonical and retries reuse it.
    if not v_storage_object_exists then
      v_manifest := v_existing.storage_manifest
        || jsonb_build_object(
          'file_size_bytes', v_file_size,
          'file_sha256', v_file_sha
        );
      v_result := v_existing.result_payload
        || jsonb_build_object(
          'storage_manifest', v_manifest,
          'file_size_bytes', v_file_size,
          'file_sha256', v_file_sha,
          'expires_at', v_existing.expires_at
        );
      update public.servsync_core_record_finalization_operations
         set storage_manifest = v_manifest,
             result_payload = v_result,
             updated_at = now()
       where id = v_existing.id
       returning * into v_existing;
    end if;
  end if;

  -- A report finalized through the temporary legacy function is immutable from
  -- the new path. Adopt its existing result without creating replacement rows
  -- or a replacement Storage object. Historical payload equivalence cannot be
  -- proven because the legacy function stored no canonical fingerprint.
  if v_existing.id is null and v_insp.status = 'finalized' and nullif(v_insp.report_storage_path, '') is not null then
    select history.id, history.report_document_id
      into v_history_id, v_document_id
      from public.home_maintenance_log history
     where history.inspection_id = v_insp.id
     limit 1;

    select notification.id
      into v_notification_id
      from public.notifications notification
     where notification.user_id = v_insp.homeowner_user_id
       and notification.type = 'inspection_report_filed'
       and notification.request_id is not distinct from v_insp.service_request_id
     order by notification.created_at desc, notification.id
     limit 1;

    v_result := jsonb_build_object(
      'status', 'succeeded',
      'operation_key', p_operation_key,
      'inspection_id', v_insp.id,
      'report_document_id', v_document_id,
      'document_id', v_document_id,
      'maintenance_log_id', v_history_id,
      'notification_id', v_notification_id,
      'storage_path', v_insp.report_storage_path,
      'report_storage_path', v_insp.report_storage_path,
      'report_file_name', v_insp.report_file_name,
      'legacy_reconciled', true,
      'idempotent', true
    );

    insert into public.servsync_core_record_finalization_operations (
      operation_type, operation_key, actor_user_id, contractor_id,
      homeowner_user_id, subject_id, job_id, home_id, payload_sha256, status,
      storage_manifest, result_kind, result_id, result_payload, completed_at
    ) values (
      'job_report_finalize', p_operation_key, v_actor, v_insp.contractor_id,
      v_insp.homeowner_user_id, v_insp.id, v_insp.id, v_insp.home_id, v_hash, 'succeeded',
      jsonb_build_object('bucket_id', 'home-documents', 'storage_path', v_insp.report_storage_path),
      'job_report', v_insp.id, v_result, now()
    );
    return v_result;
  end if;

  if v_existing.id is not null then
    return v_existing.result_payload || jsonb_build_object(
      'status', 'prepared',
      'operation_key', v_existing.operation_key,
      'expires_at', v_existing.expires_at,
      'file_size_bytes', (v_existing.storage_manifest ->> 'file_size_bytes')::bigint,
      'file_sha256', v_existing.storage_manifest ->> 'file_sha256',
      'idempotent', true
    );
  end if;

  v_storage_path := case
    when v_insp.homeowner_user_id is not null then
      v_insp.homeowner_user_id::text || '/field-work/' || v_insp.id::text || '/' || v_insp.id::text || '.pdf'
    else
      'contractor-field-work/' || v_insp.contractor_id::text || '/' || v_insp.id::text || '/' || v_insp.id::text || '.pdf'
  end;
  v_manifest := jsonb_build_object(
    'bucket_id', 'home-documents',
    'storage_path', v_storage_path,
    'file_name', v_file_name,
    'content_type', 'application/pdf',
    'file_size_bytes', v_file_size,
    'file_sha256', v_file_sha,
    'operation_key', p_operation_key,
    'payload_sha256', v_hash
  );
  v_result := jsonb_build_object(
    'status', 'prepared',
    'operation_key', p_operation_key,
    'inspection_id', v_insp.id,
    'storage_path', v_storage_path,
    'report_storage_path', v_storage_path,
    'report_file_name', v_file_name,
    'file_size_bytes', v_file_size,
    'file_sha256', v_file_sha,
    'storage_manifest', v_manifest,
    'expires_at', now() + interval '30 days',
    'idempotent', false
  );

  insert into public.servsync_core_record_finalization_operations (
    operation_type, operation_key, actor_user_id, contractor_id,
    homeowner_user_id, subject_id, job_id, home_id, payload_sha256, status,
    storage_manifest, result_payload, expires_at
  ) values (
    'job_report_finalize', p_operation_key, v_actor, v_insp.contractor_id,
    v_insp.homeowner_user_id, v_insp.id, v_insp.id, v_insp.home_id, v_hash, 'prepared',
    v_manifest, v_result, now() + interval '30 days'
  );

  return v_result;
end;
$$;

alter function public.servsync_prepare_job_report_finalization(uuid, uuid, jsonb) owner to postgres;
revoke all on function public.servsync_prepare_job_report_finalization(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_prepare_job_report_finalization(uuid, uuid, jsonb) to authenticated;

create function public.servsync_can_upload_prepared_record_finalization(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.servsync_core_record_finalization_operations operation
        where operation.status = 'prepared'
          and operation.expires_at > now()
          and operation.storage_manifest ->> 'storage_path' = p_storage_path
          and (
            (
              operation.operation_type = 'job_report_finalize'
              and public.current_user_can_write_contractor_jobs(operation.contractor_id)
            )
            or
            (
              operation.operation_type = 'manual_home_history_create'
              and operation.actor_user_id = auth.uid()
            )
          )
     );
$$;

alter function public.servsync_can_upload_prepared_record_finalization(text) owner to postgres;
revoke all on function public.servsync_can_upload_prepared_record_finalization(text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_can_upload_prepared_record_finalization(text) to authenticated;

-- Keep ordinary primary-homeowner uploads unchanged while reserving the
-- durable Home History namespace for an exact prepared operation. The
-- existing manual-documents reservation exclusion remains intact.
drop policy if exists "home_docs_upload" on storage.objects;
create policy "home_docs_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((storage.foldername(name))[2], '') not in ('manual-documents', 'home-history', 'field-work')
    and public.servsync_storage_extension_is_allowed(
      name,
      array['pdf','jpg','jpeg','png','webp','heic','heif']::text[]
    )
  );

drop policy if exists "home_docs_upload_prepared_record_finalizations" on storage.objects;
create policy "home_docs_upload_prepared_record_finalizations"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and public.servsync_can_upload_prepared_record_finalization(name)
    and public.servsync_storage_extension_is_allowed(
      name,
      array['pdf','jpg','jpeg','png','webp','heic','heif']::text[]
    )
  );

create function public.servsync_commit_job_report_finalization(
  p_operation_key uuid,
  p_inspection_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_prepared jsonb;
  v_operation public.servsync_core_record_finalization_operations;
  v_insp public.inspections;
  v_object storage.objects;
  v_contractor_name text;
  v_request_category text;
  v_request_title text;
  v_request_description text;
  v_cost_cents integer;
  v_document public.home_documents;
  v_history public.home_maintenance_log;
  v_notification public.notifications;
  v_object_size bigint;
  v_object_sha text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  perform public.servsync_private_record_finalization_operation_lock(v_actor, 'job_report_finalize', p_operation_key);
  perform public.servsync_private_record_finalization_subject_lock('job_report_finalize', p_inspection_id);
  v_prepared := public.servsync_prepare_job_report_finalization(p_operation_key, p_inspection_id, p_payload);
  if v_prepared ->> 'status' = 'succeeded' then
    return v_prepared || jsonb_build_object('idempotent', true);
  end if;

  select operation.*
    into strict v_operation
    from public.servsync_core_record_finalization_operations operation
   where operation.operation_type = 'job_report_finalize'
     and operation.subject_id = p_inspection_id
   for update;

  if v_operation.status = 'succeeded' then
    return v_operation.result_payload || jsonb_build_object('idempotent', true);
  end if;
  if v_operation.expires_at <= now() then
    raise exception 'This prepared report expired. Prepare the same report again before uploading.' using errcode = '22023';
  end if;

  select inspection.*
    into v_insp
    from public.inspections inspection
   where inspection.id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(inspection.contractor_id)
   for update;
  if v_insp.id is null then
    raise exception 'Job not found.' using errcode = '42501';
  end if;

  select object.*
    into v_object
    from storage.objects object
     where object.bucket_id = v_operation.storage_manifest ->> 'bucket_id'
       and object.name = v_operation.storage_manifest ->> 'storage_path'
     for share;

  v_object_size := public.servsync_private_record_finalization_storage_size(v_object);
  v_object_sha := lower(coalesce(v_object.user_metadata ->> 'servsync_sha256', ''));
  if v_object.id is null
     -- The scoped Storage policy proves the uploader had current write access
     -- to this exact Job operation. Keep cross-member replay valid when a
     -- different authorized teammate completes an interrupted preparation.
     or v_object.owner_id is null
     or v_object_size < 5
     or v_object_size > 52428800
     or public.servsync_private_record_finalization_storage_mimetype(v_object)
          <> 'application/pdf'
     or v_object_sha !~ '^[0-9a-f]{64}$'
     or coalesce(v_object.user_metadata ->> 'servsync_operation_key', '')
          <> v_operation.operation_key::text then
    raise exception 'The prepared report PDF could not be verified. Retry the prepared upload.' using errcode = '22023';
  end if;

  -- jsPDF can regenerate different byte metadata for the same semantic report.
  -- The first valid object at the receipt-bound deterministic path wins; the
  -- transaction adopts its exact Storage metadata before any canonical row is
  -- written, so concurrent uploaders converge instead of replacing it.
  v_operation.storage_manifest := v_operation.storage_manifest || jsonb_build_object(
    'file_size_bytes', v_object_size,
    'file_sha256', v_object_sha
  );

  if v_insp.status = 'finalized' and v_insp.report_storage_path is distinct from (v_operation.storage_manifest ->> 'storage_path') then
    raise exception 'This Job already has a different finalized report. Refresh the Job before trying again.' using errcode = '22023';
  end if;

  select contractor.business_name
    into v_contractor_name
    from public.contractor_profiles contractor
   where contractor.id = v_insp.contractor_id;

  update public.inspections
     set status = 'finalized',
         job_status = case when job_status = 'closed' then 'closed' else 'completed' end,
         completed_at = coalesce(completed_at, now()),
         rooms_with_findings = coalesce(p_payload -> 'rooms_with_findings', '[]'::jsonb),
         summary = coalesce(p_payload ->> 'summary', ''),
         report_storage_path = v_operation.storage_manifest ->> 'storage_path',
         report_file_name = v_operation.storage_manifest ->> 'file_name',
         updated_at = now()
   where id = v_insp.id;

  if v_insp.homeowner_user_id is not null then
    select document.*
      into v_document
      from public.home_documents document
     where document.storage_path = v_operation.storage_manifest ->> 'storage_path'
       and document.homeowner_user_id = v_insp.homeowner_user_id
     order by document.created_at, document.id
     limit 1
     for update;

    if v_document.id is not null and (
      v_document.home_id is distinct from v_insp.home_id
      or v_document.file_name <> v_operation.storage_manifest ->> 'file_name'
      or lower(v_document.content_type) <> 'application/pdf'
      or v_document.file_size_bytes is distinct from v_object_size::integer
      or v_document.document_type <> 'inspection'
      or coalesce(v_document.upload_source, '') <> 'contractor_report'
    ) then
      raise exception 'The prepared report conflicts with an existing document record. Refresh the Job before trying again.' using errcode = '22023';
    end if;

    if v_document.id is null then
      insert into public.home_documents (
        homeowner_user_id, home_id, storage_path, file_name, content_type,
        file_size_bytes, document_type, notes, upload_source
      ) values (
        v_insp.homeowner_user_id,
        v_insp.home_id,
        v_operation.storage_manifest ->> 'storage_path',
        v_operation.storage_manifest ->> 'file_name',
        'application/pdf',
        (v_operation.storage_manifest ->> 'file_size_bytes')::integer,
        'inspection',
        'Job report from ' || coalesce(nullif(trim(v_contractor_name), ''), 'contractor') || '. Auto-saved from ServSync.',
        'contractor_report'
      ) returning * into v_document;
    end if;

    if v_insp.service_request_id is not null then
      select request.category, request.title, request.description
        into v_request_category, v_request_title, v_request_description
        from public.service_requests request
       where request.id = v_insp.service_request_id;

      select quote.amount_cents
        into v_cost_cents
        from public.service_request_quotes quote
       where quote.request_id = v_insp.service_request_id
       order by (quote.status = 'accepted') desc, quote.created_at desc
       limit 1;
    end if;

    insert into public.home_maintenance_log (
      homeowner_user_id, service_request_id, inspection_id,
      report_document_id, home_id, category, title, description,
      performed_at, contractor_name, cost_cents, notes
    ) values (
      v_insp.homeowner_user_id,
      v_insp.service_request_id,
      v_insp.id,
      v_document.id,
      v_insp.home_id,
      coalesce(nullif(trim(v_request_category), ''), 'Job'),
      coalesce(nullif(trim(v_request_title), ''), nullif(trim(v_insp.name), ''), 'Completed job'),
      coalesce(nullif(trim(coalesce(p_payload ->> 'summary', '')), ''), nullif(trim(v_request_description), ''), 'Job completed and report filed.'),
      now()::date,
      coalesce(nullif(trim(v_contractor_name), ''), 'Contractor'),
      v_cost_cents,
      'Auto-created when job report was finalized. Report saved in Documents: ' || (v_operation.storage_manifest ->> 'file_name')
    )
    on conflict (inspection_id) where inspection_id is not null
    do update set
      report_document_id = excluded.report_document_id,
      home_id = coalesce(excluded.home_id, public.home_maintenance_log.home_id),
      description = excluded.description,
      contractor_name = excluded.contractor_name,
      cost_cents = coalesce(excluded.cost_cents, public.home_maintenance_log.cost_cents),
      notes = excluded.notes,
      updated_at = now()
    returning * into v_history;

    insert into public.notifications (user_id, type, title, body, request_id)
    values (
      v_insp.homeowner_user_id,
      'inspection_report_filed',
      'Job report filed',
      coalesce(nullif(trim(v_contractor_name), ''), 'Your contractor') || ' filed a job report for your home. It was saved to Documents and added to your maintenance log.',
      v_insp.service_request_id
    ) returning * into v_notification;
  end if;

  v_result := jsonb_build_object(
    'status', 'succeeded',
    'operation_key', v_operation.operation_key,
    'inspection_id', v_insp.id,
    'report_document_id', v_document.id,
    'document_id', v_document.id,
    'maintenance_log_id', v_history.id,
    'notification_id', v_notification.id,
    'storage_path', v_operation.storage_manifest ->> 'storage_path',
    'report_storage_path', v_operation.storage_manifest ->> 'storage_path',
    'report_file_name', v_operation.storage_manifest ->> 'file_name',
    'legacy_reconciled', false,
    'idempotent', false
  );

  update public.servsync_core_record_finalization_operations
     set status = 'succeeded',
         result_kind = 'job_report',
         result_id = v_insp.id,
         storage_manifest = v_operation.storage_manifest,
         result_payload = v_result,
         completed_at = now(),
         updated_at = now()
   where id = v_operation.id;

  return v_result;
end;
$$;

alter function public.servsync_commit_job_report_finalization(uuid, uuid, jsonb) owner to postgres;
revoke all on function public.servsync_commit_job_report_finalization(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_commit_job_report_finalization(uuid, uuid, jsonb) to authenticated;

create function public.servsync_prepare_manual_home_history_creation(
  p_operation_key uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_home public.homes;
  v_request public.service_requests;
  v_request_id uuid;
  v_requested_home_id uuid;
  v_home_id uuid;
  v_performed_at date;
  v_cost_cents integer;
  v_document jsonb;
  v_extension text;
  v_file_name text;
  v_content_type text;
  v_file_size bigint;
  v_file_sha text;
  v_canonical jsonb;
  v_hash text;
  v_existing public.servsync_core_record_finalization_operations;
  v_storage_path text;
  v_manifest jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_operation_key is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'This Home History entry could not be prepared. Review the details and try again.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_payload ->> 'title', '')), '') is null then
    raise exception 'Add a title before saving Home History.' using errcode = '22023';
  end if;

  begin
    v_requested_home_id := nullif(p_payload ->> 'home_id', '')::uuid;
    v_request_id := nullif(p_payload ->> 'service_request_id', '')::uuid;
    v_performed_at := (p_payload ->> 'performed_at')::date;
    v_cost_cents := nullif(p_payload ->> 'cost_cents', '')::integer;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'One Home History field is invalid. Review the property, date, and cost.' using errcode = '22023';
  end;

  if v_performed_at is null or v_cost_cents < 0 then
    raise exception 'Add a valid Home History date and non-negative cost.' using errcode = '22023';
  end if;

  if v_request_id is not null then
    select request.*
      into v_request
      from public.service_requests request
     where request.id = v_request_id
       and request.homeowner_user_id = v_actor
     for key share;
    if v_request.id is null then
      raise exception 'The linked service request is not available.' using errcode = '42501';
    end if;
    if v_request.home_id is not null and v_requested_home_id is not null and v_request.home_id <> v_requested_home_id then
      raise exception 'The linked request belongs to a different property.' using errcode = '22023';
    end if;
  end if;

  v_home_id := coalesce(v_request.home_id, v_requested_home_id);
  if v_home_id is null then
    raise exception 'Choose one of your properties before saving Home History.' using errcode = '22023';
  end if;

  select home.*
    into v_home
    from public.homes home
   where home.id = v_home_id
     and home.homeowner_user_id = v_actor
   for key share;
  if v_home.id is null then
    raise exception 'Choose one of your properties before saving Home History.' using errcode = '42501';
  end if;

  v_document := p_payload -> 'document';
  if v_document is not null and jsonb_typeof(v_document) = 'null' then
    v_document := null;
  end if;
  if v_document is not null and jsonb_typeof(v_document) <> 'object' then
    raise exception 'The attached receipt metadata is invalid.' using errcode = '22023';
  end if;

  if v_document is not null then
    v_file_name := trim(coalesce(v_document ->> 'file_name', ''));
    v_content_type := lower(trim(coalesce(v_document ->> 'content_type', '')));
    v_file_sha := lower(trim(coalesce(v_document ->> 'sha256', '')));
    v_extension := public.servsync_private_record_finalization_extension(v_file_name);
    begin
      v_file_size := nullif(v_document ->> 'file_size_bytes', '')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'The attached receipt metadata is invalid.' using errcode = '22023';
    end;

    if v_file_name = '' or length(v_file_name) > 255
       or v_file_sha !~ '^[0-9a-f]{64}$'
       or v_file_size is null or v_file_size < 1 or v_file_size > 52428800
       or v_extension not in ('pdf','jpg','jpeg','png','webp','heic','heif')
       or v_content_type not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif') then
      raise exception 'Use a supported PDF or image receipt no larger than 50 MB.' using errcode = '22023';
    end if;
  end if;

  v_canonical := jsonb_build_object(
    'home_id', v_home.id,
    'service_request_id', v_request_id,
    'category', coalesce(p_payload ->> 'category', ''),
    'title', trim(p_payload ->> 'title'),
    'description', coalesce(p_payload ->> 'description', ''),
    'performed_at', v_performed_at,
    'contractor_name', coalesce(p_payload ->> 'contractor_name', ''),
    'cost_cents', v_cost_cents,
    'notes', coalesce(p_payload ->> 'notes', ''),
    'document', case when v_document is null then null else jsonb_build_object(
      'file_name', v_file_name,
      'content_type', v_content_type,
      'file_size_bytes', v_file_size,
      'sha256', v_file_sha
    ) end
  );
  v_hash := public.servsync_private_record_finalization_payload_hash(v_canonical);

  perform public.servsync_private_record_finalization_operation_lock(v_actor, 'manual_home_history_create', p_operation_key);
  select operation.*
    into v_existing
    from public.servsync_core_record_finalization_operations operation
   where operation.actor_user_id = v_actor
     and operation.operation_type = 'manual_home_history_create'
     and operation.operation_key = p_operation_key
   for update;

  if v_existing.id is not null then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'This Home History attempt belongs to different details. Start a new entry and try again.' using errcode = '22023';
    end if;
    if v_existing.status = 'succeeded' then
      return v_existing.result_payload || jsonb_build_object('idempotent', true);
    end if;
    if v_existing.expires_at <= now() then
      update public.servsync_core_record_finalization_operations
         set expires_at = now() + interval '30 days',
             updated_at = now()
       where id = v_existing.id
       returning * into v_existing;
    end if;
    return v_existing.result_payload || jsonb_build_object(
      'status', 'prepared',
      'expires_at', v_existing.expires_at,
      'idempotent', true
    );
  end if;

  if v_document is not null then
    v_storage_path := v_actor::text || '/home-history/' || p_operation_key::text || '.' || v_extension;
    v_manifest := jsonb_build_object(
      'bucket_id', 'home-documents',
      'storage_path', v_storage_path,
      'file_name', v_file_name,
      'content_type', v_content_type,
      'file_size_bytes', v_file_size,
      'file_sha256', v_file_sha,
      'operation_key', p_operation_key,
      'payload_sha256', v_hash
    );
  end if;

  v_result := jsonb_build_object(
    'status', 'prepared',
    'operation_key', p_operation_key,
    'home_id', v_home.id,
    'storage_path', v_storage_path,
    'file_size_bytes', v_file_size,
    'file_sha256', v_file_sha,
    'storage_manifest', v_manifest,
    'expires_at', now() + interval '30 days',
    'idempotent', false
  );

  insert into public.servsync_core_record_finalization_operations (
    operation_type, operation_key, actor_user_id, homeowner_user_id,
    subject_id, home_id, payload_sha256, status, storage_manifest,
    result_payload, expires_at
  ) values (
    'manual_home_history_create', p_operation_key, v_actor, v_actor,
    p_operation_key, v_home.id, v_hash, 'prepared', v_manifest,
    v_result, now() + interval '30 days'
  );

  return v_result;
end;
$$;

alter function public.servsync_prepare_manual_home_history_creation(uuid, jsonb) owner to postgres;
revoke all on function public.servsync_prepare_manual_home_history_creation(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_prepare_manual_home_history_creation(uuid, jsonb) to authenticated;

create function public.servsync_commit_manual_home_history_creation(
  p_operation_key uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_prepared jsonb;
  v_operation public.servsync_core_record_finalization_operations;
  v_object storage.objects;
  v_document public.home_documents;
  v_history public.home_maintenance_log;
  v_request_id uuid;
  v_performed_at date;
  v_cost_cents integer;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  perform public.servsync_private_record_finalization_operation_lock(v_actor, 'manual_home_history_create', p_operation_key);
  v_prepared := public.servsync_prepare_manual_home_history_creation(p_operation_key, p_payload);
  if v_prepared ->> 'status' = 'succeeded' then
    return v_prepared || jsonb_build_object('idempotent', true);
  end if;

  select operation.*
    into strict v_operation
    from public.servsync_core_record_finalization_operations operation
   where operation.actor_user_id = v_actor
     and operation.operation_type = 'manual_home_history_create'
     and operation.operation_key = p_operation_key
   for update;

  if v_operation.status = 'succeeded' then
    return v_operation.result_payload || jsonb_build_object('idempotent', true);
  end if;
  if v_operation.expires_at <= now() then
    raise exception 'This Home History upload expired. Prepare the same entry again before saving.' using errcode = '22023';
  end if;

  if v_operation.storage_manifest <> '{}'::jsonb then
    select object.*
      into v_object
      from storage.objects object
     where object.bucket_id = v_operation.storage_manifest ->> 'bucket_id'
       and object.name = v_operation.storage_manifest ->> 'storage_path'
       and object.owner_id = v_actor::text
     for share;

    if v_object.id is null
       or public.servsync_private_record_finalization_storage_size(v_object)
            <> (v_operation.storage_manifest ->> 'file_size_bytes')::bigint
       or public.servsync_private_record_finalization_storage_mimetype(v_object)
            <> lower(v_operation.storage_manifest ->> 'content_type')
       or lower(coalesce(v_object.user_metadata ->> 'servsync_sha256', ''))
            <> v_operation.storage_manifest ->> 'file_sha256'
       or coalesce(v_object.user_metadata ->> 'servsync_operation_key', '')
            <> v_operation.operation_key::text then
      raise exception 'The prepared receipt could not be verified. Retry the prepared upload.' using errcode = '22023';
    end if;

    insert into public.home_documents (
      homeowner_user_id, home_id, storage_path, file_name, content_type,
      file_size_bytes, document_type, notes, upload_source
    ) values (
      v_actor,
      v_operation.home_id,
      v_operation.storage_manifest ->> 'storage_path',
      v_operation.storage_manifest ->> 'file_name',
      v_operation.storage_manifest ->> 'content_type',
      (v_operation.storage_manifest ->> 'file_size_bytes')::integer,
      'receipt',
      'Invoice/receipt for Home History: ' || trim(p_payload ->> 'title'),
      'home_history_receipt'
    ) returning * into v_document;
  end if;

  begin
    v_request_id := nullif(p_payload ->> 'service_request_id', '')::uuid;
    v_performed_at := (p_payload ->> 'performed_at')::date;
    v_cost_cents := nullif(p_payload ->> 'cost_cents', '')::integer;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'One Home History field is invalid. Review the property, date, and cost.' using errcode = '22023';
  end;

  insert into public.home_maintenance_log (
    homeowner_user_id, service_request_id, home_id, invoice_document_id,
    category, title, description, performed_at, contractor_name,
    cost_cents, notes
  ) values (
    v_actor,
    v_request_id,
    v_operation.home_id,
    v_document.id,
    coalesce(p_payload ->> 'category', ''),
    trim(p_payload ->> 'title'),
    coalesce(p_payload ->> 'description', ''),
    v_performed_at,
    coalesce(p_payload ->> 'contractor_name', ''),
    v_cost_cents,
    concat_ws(
      E'\n',
      nullif(coalesce(p_payload ->> 'notes', ''), ''),
      case when v_document.id is not null then 'Invoice saved in Documents: ' || v_document.file_name end
    )
  ) returning * into v_history;

  v_result := jsonb_build_object(
    'status', 'succeeded',
    'operation_key', v_operation.operation_key,
    'home_id', v_operation.home_id,
    'maintenance_log_id', v_history.id,
    'document_id', v_document.id,
    'storage_path', case when v_document.id is null then null else v_document.storage_path end,
    'idempotent', false
  );

  update public.servsync_core_record_finalization_operations
     set status = 'succeeded',
         result_kind = 'manual_home_history',
         result_id = v_history.id,
         history_id = v_history.id,
         result_payload = v_result,
         completed_at = now(),
         updated_at = now()
   where id = v_operation.id;

  return v_result;
end;
$$;

alter function public.servsync_commit_manual_home_history_creation(uuid, jsonb) owner to postgres;
revoke all on function public.servsync_commit_manual_home_history_creation(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_commit_manual_home_history_creation(uuid, jsonb) to authenticated;

comment on function public.servsync_prepare_job_report_finalization(uuid, uuid, jsonb) is
  'Prepares or replays one canonical Job report operation. The stable report path retains the established external-delivery-compatible UUID filename shape.';
comment on function public.servsync_commit_job_report_finalization(uuid, uuid, jsonb) is
  'Verifies the prepared private PDF and atomically finalizes the Job plus canonical connected-homeowner document, Home History, and notification results.';
comment on function public.servsync_prepare_manual_home_history_creation(uuid, jsonb) is
  'Prepares or renews one primary-homeowner manual Home History operation and optional receipt upload without expanding shared-home authority.';
comment on function public.servsync_commit_manual_home_history_creation(uuid, jsonb) is
  'Verifies any prepared receipt and atomically creates exactly one private document and manual Home History result for the primary homeowner.';

notify pgrst, 'reload schema';

commit;
