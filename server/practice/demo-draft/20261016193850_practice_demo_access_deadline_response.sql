-- REVIEW DRAFT ONLY: response-only follow-up. Not installed or auto-discovered.
-- Existing installed SQL remains immutable. No pilot, deadline, cycle or Draft mutation.
-- Requires separately approved application to Demo using existing function-owner
-- capability. Do not grant new access or change Auth/RLS/ACLs to run this script.
begin;
do $$ begin
  if current_setting('servsync.reviewed_demo_target', true) is distinct from 'bdytwgejqnlblhrnqxkp'
    or to_regprocedure('servsync_practice_demo.dispatch(text,jsonb)') is null then
    raise exception 'Verified Demo target and installed Practice dispatcher required';
  end if;
end $$;
create or replace function servsync_practice_demo.dispatch(command text, arguments jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,servsync_practice_demo as $$
declare actor uuid:=servsync_practice_demo.request_actor(); p servsync_practice_demo.pilots;
  c servsync_practice_demo.cycles; d servsync_practice_demo.drafts; expected integer; captured_now timestamptz;
begin
  if actor is null then
    raise exception 'Demo pilot required' using errcode='42501';
  end if;
  select * into p from servsync_practice_demo.pilots where user_id=actor;
  if p.user_id is null then raise exception 'Demo pilot required' using errcode='42501'; end if;
  if command is null or command not in ('state','start','save') or jsonb_typeof(arguments) is distinct from 'object' then
    raise exception 'Unsupported Practice operation';
  end if;
  -- Serializes per-pilot starts and saves; the database rechecks the deadline after waiting.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,88421));
  if not exists(select 1 from servsync_practice_demo.pilots where user_id=actor) then
    raise exception 'Demo pilot required' using errcode='42501';
  end if;
  select * into c from servsync_practice_demo.cycles where user_id=actor;
  if command in ('state','start') and arguments<>'{}' then raise exception 'Unexpected Practice arguments'; end if;
  if command='start' and c.id is null then
    captured_now:=clock_timestamp();
    insert into servsync_practice_demo.cycles(user_id,tenant_id,created_at,expires_at)
      values(actor,p.tenant_id,captured_now,captured_now+interval '720 hours') returning * into c;
  end if;
  captured_now:=clock_timestamp();
  if command='start' and c.expires_at<=captured_now then
    raise exception 'Demo pilot cycle expired; renewal requires separate review';
  end if;
  if command='save' then
    if (arguments-array['workspace_id','draft_id','expected_revision','payload'])<>'{}'
      or not(arguments ?& array['workspace_id','draft_id','expected_revision','payload'])
      or jsonb_typeof(arguments->'expected_revision') is distinct from 'number'
      or (arguments->>'expected_revision')!~'^[0-9]+$' then raise exception 'Invalid save arguments'; end if;
    if c.id is null or c.id is distinct from (arguments->>'workspace_id')::uuid or c.expires_at<=clock_timestamp() then
      raise exception 'Active Practice cycle required' using errcode='42501';
    end if;
    perform servsync_practice_demo.validate_payload(arguments->'payload');
    expected:=(arguments->>'expected_revision')::integer;
    select * into d from servsync_practice_demo.drafts where cycle_id=c.id and id=(arguments->>'draft_id')::uuid;
    if d.id is null then
      if expected<>0 then raise exception 'Practice revision conflict' using errcode='PT409'; end if;
      if (select count(*) from servsync_practice_demo.drafts where cycle_id=c.id)>=50 then raise exception 'Practice Draft limit reached'; end if;
      insert into servsync_practice_demo.drafts(id,cycle_id,payload)
        values((arguments->>'draft_id')::uuid,c.id,arguments->'payload') returning * into d;
    elsif d.revision=expected+1 and d.payload=arguments->'payload' then
      null; -- Retry after a lost acknowledgement: identical payload and same revision only.
    else
      if d.revision<>expected then raise exception 'Practice revision conflict' using errcode='PT409'; end if;
      update servsync_practice_demo.drafts set payload=arguments->'payload',revision=revision+1
        where cycle_id=c.id and id=d.id returning * into d;
    end if;
    return jsonb_build_object('id',d.id,'workspace_id',d.cycle_id,'revision',d.revision,'payload',d.payload);
  end if;
  return jsonb_build_object('serverNow',captured_now,
    'accessExpiresAt',(select access_until from servsync_practice_demo.pilots where user_id=actor),
    'status',case when c.id is null then 'not_started' when c.expires_at<=captured_now then 'expired' else 'active' end,
    'workspace',case when c.id is null then null else jsonb_build_object('id',c.id,'created_at',c.created_at,'expires_at',c.expires_at,'revision',1,
      'snapshot',case when c.expires_at>captured_now then servsync_practice_demo.synthetic_snapshot() else null end) end,
    'drafts',case when c.id is null or c.expires_at<=captured_now then '[]'::jsonb else
      coalesce((select jsonb_agg(jsonb_build_object('id',id,'workspace_id',cycle_id,'revision',revision,'payload',payload) order by id)
        from servsync_practice_demo.drafts where cycle_id=c.id),'[]') end);
end $$;
commit;
