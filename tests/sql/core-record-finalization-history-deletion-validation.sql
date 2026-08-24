insert into public.profiles(id) values ('10000000-0000-4000-8000-000000000001');
insert into public.homes(id, homeowner_user_id)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

do $$
declare
  v_actor constant uuid := '10000000-0000-4000-8000-000000000001';
  v_home constant uuid := '20000000-0000-4000-8000-000000000001';
  v_operation constant uuid := '30000000-0000-4000-8000-000000000001';
  v_payload jsonb := jsonb_build_object(
    'home_id', v_home,
    'service_request_id', null,
    'category', 'Maintenance',
    'title', 'No-document tombstone regression',
    'description', 'Completed entry that the homeowner later deletes.',
    'performed_at', '2026-08-24',
    'contractor_name', 'Self',
    'cost_cents', 0,
    'notes', '',
    'document', null
  );
  v_first jsonb;
  v_replay jsonb;
  v_result_id uuid;
begin
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  set local role authenticated;
  v_first := public.servsync_commit_manual_home_history_creation(v_operation, v_payload);
  v_result_id := (v_first ->> 'maintenance_log_id')::uuid;
  delete from public.home_maintenance_log where id = v_result_id;
  v_replay := public.servsync_commit_manual_home_history_creation(v_operation, v_payload);
  reset role;

  if v_replay ->> 'status' <> 'succeeded'
     or (v_replay ->> 'idempotent')::boolean is not true
     or (v_replay ->> 'maintenance_log_id')::uuid <> v_result_id then
    raise exception 'Document-free deleted History replay did not return the canonical tombstone result: %', v_replay;
  end if;
  if (select count(*) from public.home_maintenance_log) <> 0
     or (select count(*) from public.home_documents) <> 0 then
    raise exception 'Document-free deleted History replay resurrected canonical rows.';
  end if;
  if not exists (
    select 1
      from public.servsync_core_record_finalization_operations operation
     where operation.operation_key = v_operation
       and operation.status = 'succeeded'
       and operation.result_id = v_result_id
       and operation.history_id is null
       and operation.result_payload ->> 'maintenance_log_id' = v_result_id::text
  ) then
    raise exception 'Document-free terminal receipt was not preserved as a tombstone.';
  end if;
end;
$$;

do $$
declare
  v_actor constant uuid := '10000000-0000-4000-8000-000000000001';
  v_home constant uuid := '20000000-0000-4000-8000-000000000001';
  v_operation constant uuid := '30000000-0000-4000-8000-000000000002';
  v_sha constant text := repeat('a', 64);
  v_payload jsonb := jsonb_build_object(
    'home_id', v_home,
    'service_request_id', null,
    'category', 'Maintenance',
    'title', 'Document tombstone regression',
    'description', 'Completed entry with one receipt that the homeowner later deletes.',
    'performed_at', '2026-08-24',
    'contractor_name', 'Example Contractor',
    'cost_cents', 12500,
    'notes', 'Paid',
    'document', jsonb_build_object(
      'file_name', 'receipt.pdf',
      'content_type', 'application/pdf',
      'file_size_bytes', 7,
      'sha256', v_sha
    )
  );
  v_prepared jsonb;
  v_first jsonb;
  v_replay jsonb;
  v_result_id uuid;
  v_document_id uuid;
begin
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  set local role authenticated;
  v_prepared := public.servsync_prepare_manual_home_history_creation(v_operation, v_payload);
  reset role;

  insert into storage.objects(bucket_id, name, owner_id, metadata, user_metadata)
  values (
    'home-documents',
    v_prepared ->> 'storage_path',
    v_actor::text,
    jsonb_build_object('size', 7, 'mimetype', 'application/pdf'),
    jsonb_build_object('servsync_sha256', v_sha, 'servsync_operation_key', v_operation)
  );

  set local role authenticated;
  v_first := public.servsync_commit_manual_home_history_creation(v_operation, v_payload);
  v_result_id := (v_first ->> 'maintenance_log_id')::uuid;
  v_document_id := (v_first ->> 'document_id')::uuid;
  delete from public.home_maintenance_log where id = v_result_id;
  v_replay := public.servsync_commit_manual_home_history_creation(v_operation, v_payload);
  reset role;

  if v_replay ->> 'status' <> 'succeeded'
     or (v_replay ->> 'idempotent')::boolean is not true
     or (v_replay ->> 'maintenance_log_id')::uuid <> v_result_id
     or (v_replay ->> 'document_id')::uuid <> v_document_id then
    raise exception 'Document-backed deleted History replay did not return the canonical tombstone result: %', v_replay;
  end if;
  if (select count(*) from public.home_maintenance_log) <> 0
     or (select count(*) from public.home_documents where id = v_document_id) <> 1
     or (select count(*) from public.home_documents) <> 1
     or (select count(*) from storage.objects) <> 1 then
    raise exception 'Document-backed deleted History replay resurrected or duplicated canonical rows or objects.';
  end if;
  if not exists (
    select 1
      from public.servsync_core_record_finalization_operations operation
     where operation.operation_key = v_operation
       and operation.status = 'succeeded'
       and operation.result_id = v_result_id
       and operation.history_id is null
       and operation.result_payload ->> 'document_id' = v_document_id::text
  ) then
    raise exception 'Document-backed terminal receipt was not preserved as a tombstone.';
  end if;
end;
$$;
