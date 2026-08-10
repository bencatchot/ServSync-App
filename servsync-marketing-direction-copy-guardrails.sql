-- ServSync Marketing Direction + Copy Guardrails v1
-- Additive compatibility update for Truth Pack v2 and unsupported competitor framing.

begin;

do $$
declare
  v_ingest_definition text;
begin
  if to_regclass('public.marketing_content_preparation_packages') is null
     or to_regprocedure('public.servsync_private_marketing_copy_is_claim_safe(text)') is null
     or to_regprocedure('public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)') is null then
    raise exception 'Marketing Direction requires the complete Codex-assisted Marketing foundation.';
  end if;

  if to_regprocedure('public.servsync_private_marketing_direction_is_safe(text)') is not null then
    raise exception 'Marketing Direction correction is already or partially installed.';
  end if;

  select pg_get_functiondef('public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'::regprocedure)
    into v_ingest_definition;

  if position('or v_truth_version <> ''servsync-marketing-truth-v1''' in v_ingest_definition) = 0
     or position('or v_brief ~ ''[[:cntrl:]]''' in v_ingest_definition) = 0
     or position('or not public.servsync_private_marketing_copy_is_claim_safe(v_title || E''\n'' || v_body)' in v_ingest_definition) = 0 then
    raise exception 'Marketing Direction ingestion prerequisite differs or the correction is already installed.';
  end if;
end;
$$;

create function public.servsync_private_marketing_direction_is_safe(p_text text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    public.servsync_private_marketing_copy_is_claim_safe(p_text)
    and lower(p_text) !~ '(^|[^a-z])(unlike|compared[[:space:]]+(with|to))[[:space:]]+(competitors?|competing|other)([^a-z]|$)'
    and lower(p_text) !~ '(competitors?|competing|other)[[:space:]]+(apps?|software|platforms?|tools?)[^.!?]{0,100}(force|require|make|lack|cannot|can''t|don''t|doesn''t|inferior|harder|difficult|expensive|fragmented)'
    and lower(p_text) !~ 'no more[[:space:]]+(being[[:space:]]+)?forced to'
    and lower(p_text) !~ 'without forcing';
$$;

do $migration$
declare
  v_ingest_definition text;
begin
  select pg_get_functiondef('public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'::regprocedure)
    into v_ingest_definition;

  v_ingest_definition := replace(
    v_ingest_definition,
    'or v_truth_version <> ''servsync-marketing-truth-v1''',
    'or v_truth_version not in (''servsync-marketing-truth-v1'', ''servsync-marketing-truth-v2'')'
  );
  v_ingest_definition := replace(
    v_ingest_definition,
    'or v_brief ~ ''[[:cntrl:]]''
     or p_items is null',
    'or v_brief ~ ''[[:cntrl:]]''
     or (
       v_truth_version = ''servsync-marketing-truth-v2''
       and not public.servsync_private_marketing_direction_is_safe(v_brief)
     )
     or p_items is null'
  );
  v_ingest_definition := replace(
    v_ingest_definition,
    'or not public.servsync_private_marketing_copy_is_claim_safe(v_title || E''\n'' || v_body) then',
    'or not public.servsync_private_marketing_copy_is_claim_safe(v_title || E''\n'' || v_body)
       or (
         v_truth_version = ''servsync-marketing-truth-v2''
         and not public.servsync_private_marketing_direction_is_safe(v_title || E''\n'' || v_body)
       ) then'
  );

  if position('servsync-marketing-truth-v2' in v_ingest_definition) = 0
     or position('servsync_private_marketing_direction_is_safe(v_brief)' in v_ingest_definition) = 0
     or position('servsync_private_marketing_direction_is_safe(v_title' in v_ingest_definition) = 0 then
    raise exception 'Marketing Direction ingestion correction could not be constructed exactly.';
  end if;

  execute v_ingest_definition;
end;
$migration$;

alter function public.servsync_private_marketing_direction_is_safe(text) owner to postgres;
alter function public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb) owner to postgres;

revoke all privileges on function public.servsync_private_marketing_direction_is_safe(text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb) to authenticated;

do $$
declare
  v_ingest_definition text;
begin
  select pg_get_functiondef('public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'::regprocedure)
    into v_ingest_definition;

  if position('servsync-marketing-truth-v1' in v_ingest_definition) = 0
     or position('servsync-marketing-truth-v2' in v_ingest_definition) = 0
     or position('servsync_private_marketing_direction_is_safe(v_brief)' in v_ingest_definition) = 0
     or position('servsync_private_marketing_direction_is_safe(v_title' in v_ingest_definition) = 0 then
    raise exception 'Marketing Direction ingestion postflight mismatch.';
  end if;

  if (select pg_get_userbyid(proowner) <> 'postgres'
             or not prosecdef
             or proconfig <> array['search_path=pg_catalog, public, auth, extensions']
        from pg_proc
       where oid = 'public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'::regprocedure) then
    raise exception 'Marketing ingestion ownership, security mode, or search path changed unexpectedly.';
  end if;

  if (select pg_get_userbyid(proowner) <> 'postgres'
             or prosecdef
             or proconfig <> array['search_path=pg_catalog']
        from pg_proc
       where oid = 'public.servsync_private_marketing_direction_is_safe(text)'::regprocedure) then
    raise exception 'Private Marketing Direction guard security mismatch.';
  end if;

  if has_function_privilege('anon', 'public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.servsync_private_marketing_direction_is_safe(text)', 'execute')
     or has_function_privilege('authenticated', 'public.servsync_private_marketing_direction_is_safe(text)', 'execute')
     or has_function_privilege('service_role', 'public.servsync_private_marketing_direction_is_safe(text)', 'execute') then
    raise exception 'Marketing Direction function grants changed unexpectedly.';
  end if;

  if not public.servsync_private_marketing_copy_is_claim_safe('Send an estimate without forcing an account signup')
     or public.servsync_private_marketing_direction_is_safe('Send an estimate without forcing an account signup')
     or not public.servsync_private_marketing_direction_is_safe('Customers can review an eligible estimate through a secure ServSync link.') then
    raise exception 'Marketing Direction versioned copy guard mismatch.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
