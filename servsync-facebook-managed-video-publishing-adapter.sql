-- ServSync Facebook Managed Video Publishing Adapter v1.
--
-- Adds exact managed-media preparation and duplicate-safe provider acceptance /
-- reconciliation state. Facebook media capability becomes truthful, while the
-- independent database publishing_enabled gate remains false.

begin;

do $$
begin
  if to_regclass('public.marketing_publications') is null
     or to_regclass('public.marketing_provider_connections') is null
     or to_regclass('public.marketing_content_media_pairings') is null
     or to_regclass('public.marketing_media_assets') is null
     or to_regprocedure('public.servsync_claim_due_marketing_publications(integer)') is null
     or to_regprocedure('public.servsync_complete_marketing_publication(uuid,integer,text,jsonb)') is null then
    raise exception 'Missing Facebook managed-video publishing prerequisite.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='marketing_publications'
      and column_name='provider_operation_state'
  ) then
    raise exception 'Facebook managed-video publishing target already exists.';
  end if;
end;
$$;

alter table public.marketing_publications
  add column provider_operation_state text null,
  add column provider_reconcile_after timestamptz null,
  add column provider_reconciliation_count smallint not null default 0,
  add constraint marketing_publications_provider_operation_state_check check (
    provider_operation_state is null or provider_operation_state in ('accepted','processing','confirmed')
  ),
  add constraint marketing_publications_provider_reconciliation_count_check check (
    provider_reconciliation_count between 0 and 8
  );

alter table public.marketing_publications
  drop constraint marketing_publications_terminal_shape_check,
  add constraint marketing_publications_terminal_shape_check check (
    (
      status='published' and provider_publication_id is not null and published_at is not null
      and cancelled_at is null
      and (
        (media_pairing_id is null and provider_operation_state is null)
        or (media_pairing_id is not null and provider_operation_state='confirmed')
      )
    )
    or (
      status='cancelled' and cancelled_at is not null and published_at is null
      and provider_publication_id is null and provider_operation_state is null
    )
    or (
      status='scheduled' and published_at is null and cancelled_at is null
      and provider_publication_id is null and provider_operation_state is null
    )
    or (
      status='publishing' and published_at is null and cancelled_at is null
      and (
        (provider_publication_id is null and provider_operation_state is null)
        or (
          provider_publication_id is not null
          and provider_operation_state in ('accepted','processing')
          and provider_request_started_at is not null
          and provider_reconcile_after is not null
        )
      )
    )
    or (
      status='failed' and published_at is null and cancelled_at is null
      and (
        (provider_publication_id is null and provider_operation_state is null)
        or (provider_publication_id is not null and provider_operation_state in ('accepted','processing'))
      )
    )
  );

create function public.servsync_private_normalize_facebook_marketing_capabilities()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.provider='facebook' then
    new.capabilities := jsonb_set(jsonb_set(new.capabilities,'{text}','true'::jsonb,true),'{media}','true'::jsonb,true);
  end if;
  return new;
end;
$$;

create trigger marketing_provider_connections_facebook_capabilities
  before insert or update of provider,capabilities on public.marketing_provider_connections
  for each row execute function public.servsync_private_normalize_facebook_marketing_capabilities();

update public.marketing_provider_connections
set capabilities=jsonb_set(capabilities,'{media}','true'::jsonb,true),updated_at=now()
where provider='facebook';

create function public.servsync_prepare_marketing_publication_media(
  p_publication_id uuid,
  p_attempt_number integer
)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,storage
as $$
declare
  v_publication public.marketing_publications;
  v_connection public.marketing_provider_connections;
  v_pairing public.marketing_content_media_pairings;
  v_asset public.marketing_media_assets;
  v_object storage.objects;
begin
  select publication.* into strict v_publication
  from public.marketing_publications publication
  join public.marketing_workspaces workspace on workspace.id=publication.workspace_id
  where publication.id=p_publication_id
    and workspace.workspace_key='servsync_internal'
    and workspace.workspace_kind='internal'
    and workspace.contractor_id is null
  for share of publication;
  if v_publication.status<>'publishing' or v_publication.attempt_count<>p_attempt_number
     or v_publication.provider<>'facebook' or v_publication.media_pairing_id is null
     or jsonb_typeof(v_publication.media_snapshot)<>'object'
     or (v_publication.content_snapshot->>'content_revision')::bigint<>v_publication.content_revision then
    raise exception 'Managed Marketing publication authorization is invalid.' using errcode='55000';
  end if;

  select * into strict v_connection from public.marketing_provider_connections
  where id=v_publication.provider_connection_id and workspace_id=v_publication.workspace_id
    and provider='facebook' and connection_status='connected'
    and destination_key=v_publication.provider_destination_key;
  if coalesce((v_connection.capabilities->>'media')::boolean,false) is not true
     or coalesce((v_connection.capabilities->>'publishing_enabled')::boolean,false) is not true then
    raise exception 'Facebook managed-video publishing is not enabled.' using errcode='55000';
  end if;

  select * into strict v_pairing from public.marketing_content_media_pairings
  where id=v_publication.media_pairing_id and workspace_id=v_publication.workspace_id
    and content_id=v_publication.content_id and content_revision=v_publication.content_revision
    and status='approved';
  select * into strict v_asset from public.marketing_media_assets
  where id=v_pairing.asset_id and workspace_id=v_publication.workspace_id
    and validation_status='passed' and sensitive_data_check='passed' and pacing_review='passed';

  if v_publication.media_snapshot->>'pairing_id'<>v_pairing.id::text
     or v_publication.media_snapshot->>'asset_id'<>v_asset.id::text
     or v_publication.media_snapshot->>'storage_bucket'<>v_asset.storage_bucket
     or v_publication.media_snapshot->>'storage_path'<>v_asset.storage_path
     or v_publication.media_snapshot->>'mime_type'<>v_asset.mime_type
     or v_publication.media_snapshot->>'sha256'<>v_asset.sha256
     or (v_publication.media_snapshot->>'file_size_bytes')::bigint<>v_asset.file_size_bytes
     or v_asset.storage_bucket<>'marketing-assets' or v_asset.mime_type<>'video/mp4'
     or v_asset.file_size_bytes not between 1 and 104857600 then
    raise exception 'Managed Marketing media no longer matches the immutable publication snapshot.' using errcode='55000';
  end if;
  if v_asset.media_variant='narrated_marketing_derivative'
     and position(v_asset.ai_narration_disclosure_text in (v_publication.content_snapshot->>'body'))=0 then
    raise exception 'The required public AI narration disclosure is missing.' using errcode='22023';
  end if;

  select * into strict v_object from storage.objects
  where bucket_id=v_asset.storage_bucket and name=v_asset.storage_path;
  if coalesce(v_object.metadata->>'mimetype','')<>v_asset.mime_type
     or coalesce((v_object.metadata->>'size')::bigint,-1)<>v_asset.file_size_bytes then
    raise exception 'Managed Marketing Storage metadata mismatch.' using errcode='55000';
  end if;

  return jsonb_build_object(
    'pairing_id',v_pairing.id,'asset_id',v_asset.id,
    'storage_bucket',v_asset.storage_bucket,'storage_path',v_asset.storage_path,
    'mime_type',v_asset.mime_type,'file_size_bytes',v_asset.file_size_bytes,
    'sha256',v_asset.sha256
  );
end;
$$;

create or replace function public.servsync_claim_due_marketing_publications(p_limit integer default 5)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 20 then raise exception 'Invalid worker claim limit.' using errcode='22023'; end if;
  with candidates as (
    select publication.id,publication.status as previous_status,
      case when publication.status='publishing' and publication.provider_publication_id is not null
        then 'reconcile' else 'publish' end as operation
    from public.marketing_publications publication
    join public.marketing_provider_connections connection on connection.id=publication.provider_connection_id
    where connection.connection_status='connected'
      and coalesce((connection.capabilities->>'publishing_enabled')::boolean,false)
      and (
        (publication.status='scheduled' and publication.scheduled_at<=now())
        or (
          publication.status='publishing' and publication.provider_request_started_at is null
          and publication.publishing_started_at<now()-interval '10 minutes'
        )
        or (
          publication.status='publishing' and publication.provider_request_started_at is not null
          and publication.provider_publication_id is not null
          and publication.provider_operation_state in ('accepted','processing')
          and publication.provider_reconcile_after<=now()
          and publication.provider_reconciliation_count<8
        )
      )
    order by publication.scheduled_at,publication.id
    for update of publication skip locked limit p_limit
  ), updated as (
    update public.marketing_publications publication set
      status='publishing',
      attempt_count=case when candidates.operation='publish' then publication.attempt_count+1 else publication.attempt_count end,
      publishing_started_at=case when candidates.operation='publish' then now() else publication.publishing_started_at end,
      provider_request_started_at=case when candidates.operation='publish' then null else publication.provider_request_started_at end,
      provider_reconcile_after=case when candidates.operation='reconcile' then now()+interval '10 minutes' else null end,
      retry_eligible=false,updated_at=now()
    from candidates where publication.id=candidates.id
    returning publication.*,candidates.previous_status,candidates.operation
  ), events as (
    insert into public.marketing_publication_events(
      workspace_id,publication_id,event_sequence,from_status,to_status,
      reason_category,reason_message,attempt_number
    ) select updated.workspace_id,updated.id,
      (select coalesce(max(event_sequence),0)+1 from public.marketing_publication_events where publication_id=updated.id),
      updated.previous_status,'publishing',null,null,updated.attempt_count
    from updated where updated.operation='publish'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'publication_id',updated.id,'attempt_number',updated.attempt_count,'operation',updated.operation,
    'provider',updated.provider,'provider_connection_id',updated.provider_connection_id,
    'destination_key',updated.provider_destination_key,'content_revision',updated.content_revision,
    'content_snapshot',updated.content_snapshot,'media_pairing_id',updated.media_pairing_id,
    'media_snapshot',updated.media_snapshot,'provider_publication_id',updated.provider_publication_id,
    'provider_metadata',updated.provider_metadata,
    'provider_reconciliation_count',updated.provider_reconciliation_count
  )),'[]'::jsonb) into v_result from updated;
  return v_result;
end;
$$;

create function public.servsync_record_marketing_provider_acceptance(
  p_publication_id uuid,p_attempt_number integer,p_provider_publication_id text,
  p_provider_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_publication public.marketing_publications; v_sequence smallint;
begin
  if p_provider_publication_id is null or btrim(p_provider_publication_id)!~ '^\d{3,80}$'
     or jsonb_typeof(coalesce(p_provider_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid provider acceptance.' using errcode='22023';
  end if;
  select * into strict v_publication from public.marketing_publications where id=p_publication_id for update;
  if v_publication.status<>'publishing' or v_publication.attempt_count<>p_attempt_number
     or v_publication.provider_request_started_at is null or v_publication.provider_publication_id is not null
     or v_publication.media_pairing_id is null then
    raise exception 'Marketing publication claim is stale.' using errcode='40001';
  end if;
  select coalesce(max(event_sequence),0)+1 into v_sequence from public.marketing_publication_events where publication_id=v_publication.id;
  update public.marketing_publications set
    provider_publication_id=btrim(p_provider_publication_id),provider_metadata=coalesce(p_provider_metadata,'{}'::jsonb),
    provider_operation_state='accepted',provider_reconcile_after=now(),provider_reconciliation_count=0,updated_at=now()
  where id=v_publication.id;
  insert into public.marketing_publication_events(
    workspace_id,publication_id,event_sequence,from_status,to_status,reason_category,
    reason_message,attempt_number
  ) values (
    v_publication.workspace_id,v_publication.id,v_sequence,'publishing','publishing',
    null,'Facebook accepted the managed video; public confirmation is pending.',
    v_publication.attempt_count
  );
end;
$$;

create function public.servsync_defer_marketing_provider_reconciliation(
  p_publication_id uuid,p_attempt_number integer,p_provider_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_publication public.marketing_publications;
begin
  if jsonb_typeof(coalesce(p_provider_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid provider reconciliation metadata.' using errcode='22023';
  end if;
  select * into strict v_publication from public.marketing_publications where id=p_publication_id for update;
  if v_publication.status<>'publishing' or v_publication.attempt_count<>p_attempt_number
     or v_publication.provider_request_started_at is null or v_publication.provider_publication_id is null
     or v_publication.provider_operation_state not in ('accepted','processing')
     or v_publication.provider_reconciliation_count>=8 then
    raise exception 'Marketing publication reconciliation is stale.' using errcode='40001';
  end if;
  update public.marketing_publications set
    provider_metadata=provider_metadata||coalesce(p_provider_metadata,'{}'::jsonb),
    provider_operation_state='processing',provider_reconcile_after=now()+interval '15 minutes',
    provider_reconciliation_count=provider_reconciliation_count+1,updated_at=now()
  where id=v_publication.id;
end;
$$;

create or replace function public.servsync_complete_marketing_publication(
  p_publication_id uuid,p_attempt_number integer,p_provider_publication_id text,
  p_provider_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_publication public.marketing_publications; v_sequence smallint;
begin
  if p_provider_publication_id is null or char_length(btrim(p_provider_publication_id)) not between 1 and 300
     or jsonb_typeof(coalesce(p_provider_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid provider publication result.' using errcode='22023';
  end if;
  select * into v_publication from public.marketing_publications where id=p_publication_id for update;
  if v_publication.status<>'publishing' or v_publication.attempt_count<>p_attempt_number
     or v_publication.provider_request_started_at is null
     or (v_publication.provider_publication_id is not null and v_publication.provider_publication_id<>btrim(p_provider_publication_id)) then
    raise exception 'Marketing publication claim is stale.' using errcode='40001';
  end if;
  select coalesce(max(event_sequence),0)+1 into v_sequence from public.marketing_publication_events where publication_id=v_publication.id;
  update public.marketing_publications set status='published',provider_publication_id=btrim(p_provider_publication_id),
    provider_metadata=coalesce(p_provider_metadata,'{}'::jsonb),
    provider_operation_state=case when media_pairing_id is null then null else 'confirmed' end,
    provider_reconcile_after=null,published_at=now(),updated_at=now(),retry_eligible=false
  where id=v_publication.id;
  insert into public.marketing_publication_events values (
    gen_random_uuid(),v_publication.workspace_id,v_publication.id,v_sequence,'publishing','published',
    null,null,v_publication.attempt_count,null,now()
  );
end;
$$;

alter function public.servsync_private_normalize_facebook_marketing_capabilities() owner to postgres;
alter function public.servsync_prepare_marketing_publication_media(uuid,integer) owner to postgres;
alter function public.servsync_record_marketing_provider_acceptance(uuid,integer,text,jsonb) owner to postgres;
alter function public.servsync_defer_marketing_provider_reconciliation(uuid,integer,jsonb) owner to postgres;

revoke all on function public.servsync_private_normalize_facebook_marketing_capabilities() from public,anon,authenticated,service_role;
revoke all on function public.servsync_prepare_marketing_publication_media(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.servsync_record_marketing_provider_acceptance(uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.servsync_defer_marketing_provider_reconciliation(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.servsync_prepare_marketing_publication_media(uuid,integer) to service_role;
grant execute on function public.servsync_record_marketing_provider_acceptance(uuid,integer,text,jsonb) to service_role;
grant execute on function public.servsync_defer_marketing_provider_reconciliation(uuid,integer,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
