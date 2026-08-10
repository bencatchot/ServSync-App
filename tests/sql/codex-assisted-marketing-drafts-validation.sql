\set ON_ERROR_STOP on

do $$
declare
  v_function regprocedure;
  v_grant_count integer;
begin
  if to_regclass('public.marketing_content_preparation_packages') is null then
    raise exception 'Marketing preparation package table is missing.';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'marketing_workspaces',
         'marketing_content_items',
         'marketing_content_status_events',
         'marketing_content_preparation_packages'
       )
       and (
         pg_get_userbyid(c.relowner) <> 'postgres'
         or not c.relrowsecurity
         or not c.relforcerowsecurity
       )
  ) then
    raise exception 'Marketing table ownership or forced-RLS mismatch.';
  end if;

  if exists (
    select 1 from pg_policy
     where polrelid in (
       'public.marketing_workspaces'::regclass,
       'public.marketing_content_items'::regclass,
       'public.marketing_content_status_events'::regclass,
       'public.marketing_content_preparation_packages'::regclass
     )
  ) then
    raise exception 'Private Marketing tables unexpectedly have RLS policies.';
  end if;

  if exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in (
         'marketing_workspaces',
         'marketing_content_items',
         'marketing_content_status_events',
         'marketing_content_preparation_packages'
       )
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Browser or service role has direct Marketing table privileges.';
  end if;

  foreach v_function in array array[
    'public.servsync_list_internal_marketing_content(text)'::regprocedure,
    'public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef from pg_proc where oid = v_function) then
      raise exception 'Marketing RPC security configuration mismatch for %.', v_function;
    end if;
    select count(*) into v_grant_count
      from aclexplode((select proacl from pg_proc where oid = v_function)) acl
     where acl.privilege_type = 'EXECUTE'
       and acl.grantee = (select oid from pg_roles where rolname = 'authenticated');
    if v_grant_count <> 1
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Marketing RPC grant mismatch for %.', v_function;
    end if;
  end loop;

  if (select proconfig from pg_proc where oid = 'public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'::regprocedure)
     <> array['search_path=pg_catalog, public, auth, extensions'] then
    raise exception 'Marketing ingestion RPC search path mismatch.';
  end if;

  if (select pg_get_userbyid(proowner) <> 'postgres'
             or prosecdef
             or proconfig <> array['search_path=pg_catalog']
        from pg_proc
       where oid = 'public.servsync_private_marketing_direction_is_safe(text)'::regprocedure)
     or has_function_privilege('anon', 'public.servsync_private_marketing_direction_is_safe(text)', 'execute')
     or has_function_privilege('authenticated', 'public.servsync_private_marketing_direction_is_safe(text)', 'execute')
     or has_function_privilege('service_role', 'public.servsync_private_marketing_direction_is_safe(text)', 'execute') then
    raise exception 'Private Marketing Direction guard security mismatch.';
  end if;

  if not public.servsync_private_marketing_copy_is_claim_safe('Send an estimate without forcing an account signup')
     or public.servsync_private_marketing_direction_is_safe('Send an estimate without forcing an account signup')
     or not public.servsync_private_marketing_direction_is_safe('Customers can review an eligible estimate through a secure ServSync link.') then
    raise exception 'Versioned Marketing copy-safety boundary mismatch.';
  end if;

  if exists (
    select 1 from public.marketing_content_items
     where preparation_source <> 'manual'
        or preparation_package_id is not null
        or preparation_sequence is not null
        or intended_audience is not null
        or content_role is not null
  ) then
    raise exception 'Existing Marketing content was not preserved as manual content.';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform public.servsync_ingest_internal_marketing_package(
      '41000000-0000-4000-8000-000000000001',
      'contractor_acquisition',
      'servsync-marketing-truth-v1',
      'Unauthorized contractor package.',
      '[{"title":"Denied","content_type":"social_post","body":"Denied content.","channel_category":"social","intended_audience":"small_contractors","content_role":"educational_post"}]'::jsonb
    );
    raise exception 'Contractor package ingestion unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*) from public.marketing_content_preparation_packages';
    raise exception 'Contractor direct package read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
do $$
begin
  begin
    perform public.servsync_ingest_internal_marketing_package(
      '41000000-0000-4000-8000-000000000002',
      'homeowner_awareness',
      'servsync-marketing-truth-v1',
      'Unauthorized homeowner package.',
      '[{"title":"Denied","content_type":"social_post","body":"Denied content.","channel_category":"social","intended_audience":"homeowners","content_role":"educational_post"}]'::jsonb
    );
    raise exception 'Homeowner package ingestion unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

do $$
declare
  v_request_id constant uuid := '41000000-0000-4000-8000-000000000010';
  v_items constant jsonb := '[
    {"title":"A customer can review the estimate before joining ServSync","content_type":"social_post","body":"Send an eligible estimate through a secure link and keep the exact response connected to the work.","channel_category":"social","intended_audience":"hvac_contractors","content_role":"facebook_instagram_post"},
    {"title":"Two useful ways to serve a customer","content_type":"social_post","body":"A document-specific interaction can help with the work in front of you. A connected homeowner relationship can support the service relationship that follows.","channel_category":"social","intended_audience":"hvac_contractors","content_role":"linkedin_post"},
    {"title":"What the two customer paths mean","content_type":"social_post","body":"A customer can use certain secure ServSync documents without an account, while a connected homeowner can use supported ongoing home-service experiences.","channel_category":"social","intended_audience":"hvac_contractors","content_role":"educational_post"}
  ]'::jsonb;
  v_first jsonb;
  v_replay jsonb;
  v_content_id uuid;
  v_revision bigint;
begin
  v_first := public.servsync_ingest_internal_marketing_package(
    v_request_id,
    'contractor_acquisition',
    'servsync-marketing-truth-v2',
    'Show HVAC contractors that ServSync supports immediate customer interactions and an optional longer-term connected homeowner relationship.',
    v_items
  );
  v_replay := public.servsync_ingest_internal_marketing_package(
    v_request_id,
    'contractor_acquisition',
    'servsync-marketing-truth-v2',
    'Show HVAC contractors that ServSync supports immediate customer interactions and an optional longer-term connected homeowner relationship.',
    v_items
  );

  if (v_first ->> 'status') <> 'draft'
     or (v_first ->> 'source') <> 'codex_assisted'
     or (v_first ->> 'item_count')::integer <> 3
     or (v_first ->> 'replayed')::boolean
     or not (v_replay ->> 'replayed')::boolean
     or v_first -> 'content_ids' <> v_replay -> 'content_ids' then
    raise exception 'Marketing package idempotency receipt mismatch.';
  end if;

  if exists (
    select 1 from public.servsync_list_internal_marketing_content('draft')
     where preparation_request_id = v_request_id
       and (
         preparation_source <> 'codex_assisted'
         or preparation_recipe_key <> 'contractor_acquisition'
         or truth_pack_version <> 'servsync-marketing-truth-v2'
         or intended_audience <> 'hvac_contractors'
         or preparation_sequence not between 1 and 3
       )
  ) or (select count(*) from public.servsync_list_internal_marketing_content('draft') where preparation_request_id = v_request_id) <> 3 then
    raise exception 'Prepared draft read/provenance contract mismatch.';
  end if;

  v_content_id := (v_first -> 'content_ids' ->> 0)::uuid;
  select revision_number into v_revision
    from public.servsync_list_internal_marketing_content('draft')
   where content_id = v_content_id;
  perform public.servsync_transition_internal_marketing_content(v_content_id, v_revision, 'needs_approval', null);
  if not exists (
    select 1 from public.servsync_list_internal_marketing_content('needs_approval')
     where content_id = v_content_id
       and preparation_source = 'codex_assisted'
       and preparation_request_id = v_request_id
  ) then
    raise exception 'Existing human approval workflow lost preparation provenance.';
  end if;

  begin
    perform public.servsync_ingest_internal_marketing_package(
      v_request_id,
      'contractor_acquisition',
      'servsync-marketing-truth-v2',
      'Conflicting replay.',
      v_items
    );
    raise exception 'Conflicting package replay unexpectedly succeeded.';
  exception when unique_violation then null;
  end;
end;
$$;

reset role;

begin;
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

do $$
begin
  if (public.servsync_ingest_internal_marketing_package(
    '41000000-0000-4000-8000-000000000090',
    'contractor_acquisition',
    'servsync-marketing-truth-v1',
    'Historical package replay compatibility.',
    '[{"title":"Send an estimate without forcing an account signup","content_type":"social_post","body":"Historical v1 draft copy remains replay-compatible.","channel_category":"social","intended_audience":"hvac_contractors","content_role":"feature_highlight"}]'::jsonb
  ) ->> 'status') <> 'draft' then
    raise exception 'Historical v1 package compatibility failed.';
  end if;

  begin
    perform public.servsync_ingest_internal_marketing_package(
      '41000000-0000-4000-8000-000000000091',
      'contractor_acquisition',
      'servsync-marketing-truth-v2',
      'Unlike competitors, ServSync gives customers a better estimate experience.',
      '[{"title":"A safe title","content_type":"social_post","body":"Customers can review an eligible estimate through a secure link.","channel_category":"social","intended_audience":"hvac_contractors","content_role":"feature_highlight"}]'::jsonb
    );
    raise exception 'Unsafe v2 Marketing Direction unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.servsync_ingest_internal_marketing_package(
      '41000000-0000-4000-8000-000000000092',
      'contractor_acquisition',
      'servsync-marketing-truth-v2',
      'Explain one current ServSync estimate interaction on its own merits.',
      '[{"title":"Send an estimate without forcing an account signup","content_type":"social_post","body":"Customers can review an eligible estimate through a secure link.","channel_category":"social","intended_audience":"hvac_contractors","content_role":"feature_highlight"}]'::jsonb
    );
    raise exception 'Unsafe v2 Marketing copy unexpectedly succeeded.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

rollback;

do $$
begin
  if (select count(*) from public.marketing_content_preparation_packages where preparation_request_id = '41000000-0000-4000-8000-000000000010') <> 1
     or (select count(*) from public.marketing_content_items where preparation_source = 'codex_assisted') <> 3
     or (select count(*) from public.marketing_content_status_events event join public.marketing_content_items item on item.id = event.content_id where item.preparation_source = 'codex_assisted' and event.from_status is null and event.to_status = 'draft') <> 3 then
    raise exception 'Marketing package was not atomically persisted once.';
  end if;
end;
$$;

do $$
declare
  v_packages integer := (select count(*) from public.marketing_content_preparation_packages);
  v_items integer := (select count(*) from public.marketing_content_items);
  v_payload jsonb;
begin
  foreach v_payload in array array[
    '[]'::jsonb,
    '[{"title":"Missing fields"}]'::jsonb,
    '[{"title":"Status injection","content_type":"social_post","body":"Body.","channel_category":"social","intended_audience":"homeowners","content_role":"educational_post","status":"approved"}]'::jsonb,
    '[{"title":"Unknown type","content_type":"video","body":"Body.","channel_category":"social","intended_audience":"homeowners","content_role":"educational_post"}]'::jsonb,
    '[{"title":"Unsafe claim","content_type":"social_post","body":"Guaranteed results for every contractor.","channel_category":"social","intended_audience":"small_contractors","content_role":"educational_post"}]'::jsonb,
    '[{"title":"Secret","content_type":"social_post","body":"Use bearer abcdefghijklmnopqrstuvwxyz.","channel_category":"social","intended_audience":"small_contractors","content_role":"educational_post"}]'::jsonb,
    '[{"title":"Wrong audience","content_type":"social_post","body":"Audience does not match recipe.","channel_category":"social","intended_audience":"homeowners","content_role":"educational_post"}]'::jsonb,
    '[{"title":"Wrong role","content_type":"social_post","body":"Role does not match recipe.","channel_category":"social","intended_audience":"small_contractors","content_role":"homeowner_benefit"}]'::jsonb,
    '[{"title":"Wrong role shape","content_type":"social_post","body":"Video role does not match type.","channel_category":"social","intended_audience":"small_contractors","content_role":"short_video_concept"}]'::jsonb,
    '[{"title":"First role","content_type":"social_post","body":"First distinct body.","channel_category":"social","intended_audience":"small_contractors","content_role":"educational_post"},{"title":"Second role","content_type":"social_post","body":"Second distinct body.","channel_category":"social","intended_audience":"small_contractors","content_role":"educational_post"}]'::jsonb,
    '[{"title":"Duplicate","content_type":"social_post","body":"Same body.","channel_category":"social","intended_audience":"small_contractors","content_role":"educational_post"},{"title":"Duplicate","content_type":"social_post","body":"Different body.","channel_category":"social","intended_audience":"small_contractors","content_role":"feature_highlight"}]'::jsonb
  ] loop
    begin
      perform public.servsync_ingest_internal_marketing_package(
        gen_random_uuid(),
        'contractor_acquisition',
        'servsync-marketing-truth-v1',
        'Invalid package must remain atomic.',
        v_payload
      );
      raise exception 'Malformed package unexpectedly succeeded: %', v_payload;
    exception when invalid_parameter_value then null;
    end;
  end loop;

  if (select count(*) from public.marketing_content_preparation_packages) <> v_packages
     or (select count(*) from public.marketing_content_items) <> v_items then
    raise exception 'Rejected Marketing package left partial residue.';
  end if;
end;
$$;

reset role;

do $$
begin
  begin
    update public.marketing_content_preparation_packages set brief_summary = 'Rewritten provenance';
    raise exception 'Marketing package provenance update unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm <> 'Marketing preparation provenance is immutable.' then raise; end if;
  end;
  begin
    delete from public.marketing_content_preparation_packages;
    raise exception 'Marketing package provenance delete unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm <> 'Marketing preparation provenance is immutable.' then raise; end if;
  end;
end;
$$;
