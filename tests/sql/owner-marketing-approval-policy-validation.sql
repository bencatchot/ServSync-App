\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select created->>'content_id' as content_id
from (select public.servsync_create_marketing_content(
  null,
  '48500000-0000-4000-8000-000000000001',
  'Owner direct approval',
  'social_post',
  'Exact owner-reviewed copy.',
  'social'
) created) response \gset internal_
select public.servsync_transition_marketing_content(
  null, :'internal_content_id'::uuid, 1, 'draft', null
);
select public.servsync_transition_marketing_content(
  null, :'internal_content_id'::uuid, 2, 'approved', null
);

reset role;

do $$
declare v_item public.marketing_content_items;
begin
  select * into strict v_item from public.marketing_content_items
    where title = 'Owner direct approval';
  if v_item.status <> 'approved' or v_item.revision_number <> 3
     or v_item.submitted_at is not null or v_item.submitted_by is not null
     or v_item.reviewed_at is null
     or v_item.reviewed_by <> '10000000-0000-4000-8000-000000000001' then
    raise exception 'Direct owner approval audit evidence mismatch.';
  end if;
  if not exists (
    select 1 from public.marketing_content_status_events
    where content_id = v_item.id and content_revision = 3
      and from_status = 'draft' and to_status = 'approved'
      and actor_user_id = '10000000-0000-4000-8000-000000000001'
  ) then raise exception 'Direct owner approval status event is missing.'; end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select created->>'content_id' as content_id
from (select public.servsync_create_marketing_content(
  '20000000-0000-4000-8000-000000000001',
  '48500000-0000-4000-8000-000000000002',
  'Contractor team approval',
  'social_post',
  'Exact team-reviewed copy.',
  'social'
) created) response \gset contractor_
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',
  :'contractor_content_id'::uuid, 1, 'draft', null
);
select set_config('servsync_test.contractor_content_id', :'contractor_content_id', false);
do $$
begin
  begin
    perform public.servsync_transition_marketing_content(
      '20000000-0000-4000-8000-000000000001',
      current_setting('servsync_test.contractor_content_id')::uuid, 2, 'approved', null
    );
    raise exception 'Contractor workspace unexpectedly bypassed team review.';
  exception when sqlstate '55000' then null; end;
end;
$$;
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',
  :'contractor_content_id'::uuid, 2, 'needs_approval', null
);
select public.servsync_transition_marketing_content(
  '20000000-0000-4000-8000-000000000001',
  :'contractor_content_id'::uuid, 3, 'approved', null
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.marketing_content_items
    where title = 'Contractor team approval'
      and status = 'approved' and revision_number = 4
      and submitted_at is not null and submitted_by is not null
      and reviewed_at is not null and reviewed_by is not null
  ) then raise exception 'Contractor team approval lifecycle regressed.'; end if;

  if exists (
    select 1 from public.marketing_publication_events
    where created_at > now() - interval '1 minute' and to_status = 'publishing'
  ) then
    raise exception 'Approval policy validation started provider publishing.';
  end if;

  if not exists (
    select 1 from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    join pg_roles owner on owner.oid = function.proowner
    where namespace.nspname = 'public'
      and function.proname = 'servsync_transition_marketing_content'
      and function.prosecdef and function.provolatile = 'v'
      and owner.rolname = 'postgres'
      and function.proconfig @> array['search_path=pg_catalog, public, auth']
  ) then raise exception 'Owner approval function security metadata mismatch.'; end if;

  if exists (
       select 1 from information_schema.routine_privileges
       where routine_schema = 'public'
         and routine_name = 'servsync_transition_marketing_content'
         and grantee = 'PUBLIC'
     )
     or has_function_privilege('anon', 'public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)', 'EXECUTE') then
    raise exception 'Owner approval function grants mismatch.';
  end if;
end;
$$;

select 'owner Marketing approval policy validation passed' as result;
