-- Business conflicts must not use PostgreSQL serialization_failure (40001).
-- PostgREST can retry that code indefinitely, including after the client leaves.
-- PT409 returns HTTP 409 without retrying. Apply after the Marketing/Help migrations.
-- Derive each definition from the installed version to preserve later forward fixes.
-- No business rows, grants, ownership, or validation predicates are changed.
-- Idempotent; optional functions absent from an environment are skipped.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $repair$
declare
  v_targets constant text[] := array[
    'public.servsync_abandon_marketing_media(uuid,uuid)',
    'public.servsync_accept_internal_marketing_plan(uuid,bigint)',
    'public.servsync_approve_internal_marketing_direction(uuid,bigint)',
    'public.servsync_authorize_marketing_publication(uuid,uuid,uuid,text,text,timestamp with time zone,text)',
    'public.servsync_complete_abandoned_marketing_upload_purge(uuid,uuid)',
    'public.servsync_complete_marketing_content_creation(uuid,uuid,text,text,bigint,bigint)',
    'public.servsync_complete_marketing_media_purge(uuid,uuid,text,text)',
    'public.servsync_complete_marketing_publication(uuid,integer,text,jsonb)',
    'public.servsync_create_internal_marketing_publication(uuid,uuid,bigint,text,uuid,text,timestamp with time zone)',
    'public.servsync_defer_marketing_provider_reconciliation(uuid,integer,jsonb)',
    'public.servsync_fail_abandoned_marketing_upload_purge(uuid,uuid,text)',
    'public.servsync_fail_marketing_content_creation(uuid,uuid,text,text,text)',
    'public.servsync_fail_marketing_media_purge(uuid,uuid,text)',
    'public.servsync_fail_marketing_publication(uuid,integer,text,text,boolean)',
    'public.servsync_ingest_internal_marketing_direction_package(uuid,uuid,bigint,text,text,jsonb)',
    'public.servsync_mark_marketing_provider_request_started(uuid,integer)',
    'public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb)',
    'public.servsync_prepare_marketing_publication_package(uuid,uuid,uuid,bigint,uuid,text,uuid)',
    'public.servsync_record_marketing_package_preview(uuid,uuid,text)',
    'public.servsync_record_marketing_provider_acceptance(uuid,integer,text,jsonb)',
    'public.servsync_register_and_pair_internal_marketing_media_asset(uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamp with time zone,text)',
    'public.servsync_register_narrated_marketing_media(uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamp with time zone,text,text,text,text,text,text,text,integer,numeric,numeric,numeric,text)',
    'public.servsync_transition_help_recording_job(uuid,text,text,jsonb)',
    'public.servsync_transition_help_walkthrough(uuid,integer,text)',
    'public.servsync_transition_internal_marketing_content(uuid,bigint,text,text)',
    'public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)',
    'public.servsync_update_help_walkthrough(uuid,integer,jsonb)',
    'public.servsync_update_internal_marketing_content(uuid,bigint,text,text,text,text)',
    'public.servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text)',
    'public.servsync_update_internal_marketing_plan(uuid,bigint,text,date,date,text,jsonb)',
    'public.servsync_update_internal_marketing_profile(bigint,text,text[],text[],text,text[],text,text,text[],text[],text[],text[],text)',
    'public.servsync_update_marketing_content(uuid,uuid,bigint,text,text,text,text)'
  ];
  v_signature text;
  v_oid oid;
  v_before pg_proc;
  v_after pg_proc;
  v_definition text;
  v_patched text;
  v_count integer := 0;
begin
  foreach v_signature in array v_targets loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then continue; end if;
    select * into strict v_before from pg_proc where oid = v_oid;
    if v_before.prokind <> 'f' or v_before.prolang <> (select oid from pg_language where lanname = 'plpgsql') then
      raise exception 'Unexpected function type for %', v_signature;
    end if;
    if position('''40001''' in v_before.prosrc) = 0 then continue; end if;
    v_definition := pg_get_functiondef(v_oid);
    v_patched := regexp_replace(v_definition, '(errcode[[:space:]]*=[[:space:]]*)''40001''', '\1''PT409''', 'gi');
    if v_patched = v_definition or position('''40001''' in v_patched) > 0 then
      raise exception 'Unrecognized serialization error usage in %; no changes committed', v_signature;
    end if;
    execute v_patched;
    select * into strict v_after from pg_proc where oid = v_oid;
    -- Parsed default-expression source positions can change during deparsing.
    -- Compare the canonical complete definition (including defaults) separately.
    if (to_jsonb(v_before) - 'prosrc' - 'proargdefaults') is distinct from (to_jsonb(v_after) - 'prosrc' - 'proargdefaults')
       or pg_get_functiondef(v_oid) is distinct from v_patched then
      raise exception 'Function metadata changed for % (%); no changes committed', v_signature, (select string_agg(key, ', ') from jsonb_each(to_jsonb(v_before)-'prosrc') where value is distinct from (to_jsonb(v_after)->key));
    end if;
    v_count := v_count + 1;
  end loop;
  raise notice 'Updated % Marketing/Help functions to non-retryable conflicts', v_count;
end;
$repair$;

commit;
