do $$
declare
  v_bad text;
begin
  if to_regclass('public.servsync_core_authoring_operations') is null then
    raise exception 'Missing core-authoring operation receipt table.';
  end if;
  if not exists (
    select 1 from pg_class where oid='public.servsync_core_authoring_operations'::regclass and relrowsecurity and relforcerowsecurity
  ) then raise exception 'Core-authoring receipts must use forced RLS.'; end if;
  if exists (
    select 1 from pg_policy where polrelid='public.servsync_core_authoring_operations'::regclass
  ) then raise exception 'Core-authoring receipts must not have browser RLS policies.'; end if;
  if has_table_privilege('anon','public.servsync_core_authoring_operations','select')
     or has_table_privilege('authenticated','public.servsync_core_authoring_operations','select')
     or has_table_privilege('service_role','public.servsync_core_authoring_operations','select') then
    raise exception 'Core-authoring receipt table has an unexpected direct grant.';
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'servsync_private_core_authoring_payload_hash','servsync_private_core_authoring_operation_lock',
       'servsync_private_core_authoring_estimate_result','servsync_private_core_authoring_invoice_result',
       'servsync_prepare_service_request_creation','servsync_private_can_upload_prepared_request_media',
       'servsync_commit_service_request_creation','servsync_save_estimate_draft_idempotent',
       'servsync_save_invoice_draft_idempotent'
     )
     and (p.proowner <> 'postgres'::regrole or not p.prosecdef or p.proconfig <> array['search_path=public']);
  if v_bad is not null then raise exception 'Unsafe function ownership/security/search_path: %',v_bad; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in ('servsync_private_core_authoring_operation_lock','servsync_prepare_service_request_creation',
         'servsync_commit_service_request_creation','servsync_save_estimate_draft_idempotent','servsync_save_invoice_draft_idempotent')
       and p.provolatile <> 'v'
  ) then raise exception 'A mutating core-authoring function is not VOLATILE.'; end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='servsync_prepare_service_request_creation') <> 1
     or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='servsync_commit_service_request_creation') <> 1
     or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='servsync_save_estimate_draft_idempotent') <> 1
     or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='servsync_save_invoice_draft_idempotent') <> 1 then
    raise exception 'Core-authoring RPC overload count is ambiguous.';
  end if;

  if not has_function_privilege('authenticated','public.servsync_prepare_service_request_creation(uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.servsync_commit_service_request_creation(uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.servsync_save_estimate_draft_idempotent(uuid,uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.servsync_save_invoice_draft_idempotent(uuid,uuid,jsonb)','execute') then
    raise exception 'An authenticated core-authoring RPC grant is missing.';
  end if;
  if has_function_privilege('anon','public.servsync_prepare_service_request_creation(uuid,jsonb)','execute')
     or has_function_privilege('anon','public.servsync_commit_service_request_creation(uuid,jsonb)','execute')
     or has_function_privilege('anon','public.servsync_save_estimate_draft_idempotent(uuid,uuid,jsonb)','execute')
     or has_function_privilege('anon','public.servsync_save_invoice_draft_idempotent(uuid,uuid,jsonb)','execute') then
    raise exception 'Anon can execute a core-authoring RPC.';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='homeowner_upload_prepared_request_media') then
    raise exception 'Prepared Request media upload policy is missing.';
  end if;
  if not has_function_privilege('authenticated','public.servsync_private_can_upload_prepared_request_media(text)','execute')
     or has_function_privilege('anon','public.servsync_private_can_upload_prepared_request_media(text)','execute') then
    raise exception 'Prepared Request media policy helper grants are incorrect.';
  end if;
  if to_regprocedure('public.servsync_create_service_request(uuid,text,text,text,text,uuid)') is null then
    raise exception 'Legacy Request RPC must remain during the database-ahead-of-app compatibility window.';
  end if;
end;
$$;
