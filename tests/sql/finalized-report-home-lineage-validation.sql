insert into public.contractor_profiles (id, business_name) values
  ('51000000-0000-4000-8000-000000000001', 'Lineage HVAC'),
  ('51000000-0000-4000-8000-000000000002', 'Other Contractor');

insert into public.contractor_memberships (contractor_id, user_id, can_write_jobs) values
  ('51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000011', true),
  ('51000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000012', true),
  ('51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000013', false);

insert into public.service_requests (id, category, title, description) values
  ('51000000-0000-4000-8000-000000000021', 'HVAC', 'Water heater service', 'Inspect and service the water heater.');

insert into public.service_request_quotes (id, request_id, amount_cents, status) values
  ('51000000-0000-4000-8000-000000000022', '51000000-0000-4000-8000-000000000021', 18500, 'accepted');

insert into public.inspections (
  id, contractor_id, homeowner_user_id, home_id, service_request_id, name
) values
  (
    '51000000-0000-4000-8000-000000000031',
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000041',
    '51000000-0000-4000-8000-000000000051',
    '51000000-0000-4000-8000-000000000021',
    'Water heater service'
  ),
  (
    '51000000-0000-4000-8000-000000000032',
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000041',
    null,
    null,
    'No-property service'
  );

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000011', false);

select public.servsync_finalize_field_work(
  '51000000-0000-4000-8000-000000000031',
  '[{"room":"Utility Room","findings":[{"status":"Pass"}]}]'::jsonb,
  'Completed the agreed water heater service.',
  '51000000-0000-4000-8000-000000000041/field-work/51000000-0000-4000-8000-000000000031/report.pdf',
  'Water heater service report.pdf',
  4096
);

do $$
declare
  v_document public.home_documents;
  v_history public.home_maintenance_log;
begin
  select * into strict v_document
    from public.home_documents
   where storage_path = '51000000-0000-4000-8000-000000000041/field-work/51000000-0000-4000-8000-000000000031/report.pdf';

  select * into strict v_history
    from public.home_maintenance_log
   where inspection_id = '51000000-0000-4000-8000-000000000031';

  if v_document.home_id <> '51000000-0000-4000-8000-000000000051'::uuid then
    raise exception 'Generated document did not inherit the source home.';
  end if;
  if v_history.home_id <> '51000000-0000-4000-8000-000000000051'::uuid then
    raise exception 'Generated Home History row did not inherit the source home.';
  end if;
  if v_document.home_id is distinct from v_history.home_id then
    raise exception 'Generated records disagree on their home lineage.';
  end if;
  if v_history.report_document_id is distinct from v_document.id then
    raise exception 'Home History does not reference the generated report document.';
  end if;
  if v_document.file_size_bytes <> 4096 or v_document.content_type <> 'application/pdf' then
    raise exception 'Report metadata changed unexpectedly.';
  end if;
  if (select count(*) from public.notifications where user_id = v_document.homeowner_user_id and type = 'inspection_report_filed') <> 1 then
    raise exception 'Expected notification behavior changed.';
  end if;
  if (select count(*) from public.home_maintenance_log where home_id = '51000000-0000-4000-8000-000000000051') <> 1 then
    raise exception 'Report is not visible in the source home scope.';
  end if;
  if (select count(*) from public.home_maintenance_log where home_id = '51000000-0000-4000-8000-000000000052') <> 0 then
    raise exception 'Report leaked into another home scope.';
  end if;
  if (select count(*) from public.home_documents) <> 1 or (select count(*) from public.home_maintenance_log) <> 1 then
    raise exception 'One supported finalization did not create exactly one document and one history row.';
  end if;
  if (select job_status from public.inspections where id = '51000000-0000-4000-8000-000000000031') <> 'completed' then
    raise exception 'Job completion behavior changed.';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000012', false);

do $$
begin
  perform public.servsync_finalize_field_work(
    '51000000-0000-4000-8000-000000000032', '[]'::jsonb, '', 'blocked.pdf', 'blocked.pdf', 1
  );
  raise exception 'Cross-tenant finalization unexpectedly succeeded.';
exception
  when others then
    if sqlerrm <> 'Job not found.' then
      raise;
    end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000013', false);

do $$
begin
  perform public.servsync_finalize_field_work(
    '51000000-0000-4000-8000-000000000032', '[]'::jsonb, '', 'blocked.pdf', 'blocked.pdf', 1
  );
  raise exception 'Read-only member finalization unexpectedly succeeded.';
exception
  when others then
    if sqlerrm <> 'Job not found.' then
      raise;
    end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000011', false);

select public.servsync_finalize_field_work(
  '51000000-0000-4000-8000-000000000032',
  '[]'::jsonb,
  'Completed without a property assignment.',
  '51000000-0000-4000-8000-000000000041/field-work/51000000-0000-4000-8000-000000000032/report.pdf',
  'No-property report.pdf',
  2048
);

do $$
begin
  if exists (
    select 1
      from public.home_documents document
      join public.home_maintenance_log history on history.report_document_id = document.id
     where history.inspection_id = '51000000-0000-4000-8000-000000000032'
       and (document.home_id is not null or history.home_id is not null)
  ) then
    raise exception 'Null-home finalization invented property lineage.';
  end if;

  if (select count(*) from public.home_documents) <> 2
     or (select count(*) from public.home_maintenance_log) <> 2
     or (select count(*) from public.notifications) <> 2 then
    raise exception 'Finalization artifact counts changed unexpectedly.';
  end if;
end;
$$;

do $$
declare
  v_acl aclitem[];
begin
  select proacl into v_acl
    from pg_proc
   where oid = 'public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)'::regprocedure;

  if has_function_privilege('public', 'public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)', 'execute') then
    raise exception 'PUBLIC can execute the finalizer.';
  end if;
  if has_function_privilege('anon', 'public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)', 'execute') then
    raise exception 'anon can execute the finalizer.';
  end if;
  if not has_function_privilege('authenticated', 'public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)', 'execute') then
    raise exception 'authenticated lost finalizer execution.';
  end if;
  if not has_function_privilege('service_role', 'public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)', 'execute') then
    raise exception 'service_role execution changed unexpectedly.';
  end if;
end;
$$;
