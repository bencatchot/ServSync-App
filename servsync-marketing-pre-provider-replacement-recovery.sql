-- ServSync guarded pre-provider Marketing replacement recovery v1.
--
-- Reopens an exact approved package only when the failed publication is
-- conclusively provider-free and every current package dependency still
-- matches. The failed publication remains immutable history, and a new
-- Publish Now / Schedule authorization is still required.

begin;

do $$
begin
  if to_regclass('public.marketing_publication_packages') is null
     or to_regclass('public.marketing_publications') is null
     or to_regclass('public.marketing_publication_events') is null
     or to_regprocedure('public.servsync_private_marketing_workspace_for_context(uuid,text)') is null
     or to_regprocedure('public.servsync_private_effective_marketing_entitlements(uuid)') is null
     or to_regprocedure('public.servsync_private_marketing_package_fingerprint(uuid,uuid,bigint,uuid,text,uuid,bigint,text)') is null
     or to_regprocedure('public.servsync_get_marketing_publishing(uuid)') is null then
    raise exception 'Marketing replacement recovery prerequisites are missing.';
  end if;
  if to_regprocedure('public.servsync_prepare_marketing_pre_provider_replacement(uuid,uuid,uuid)') is not null then
    raise exception 'Guarded pre-provider Marketing replacement recovery is already installed.';
  end if;
end;
$$;

create function public.servsync_private_marketing_pre_provider_replacement_eligible(
  p_publication_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
  select exists (
    select 1
    from public.marketing_publications publication
    join public.marketing_publication_packages package
      on package.id = publication.package_id
     and package.workspace_id = publication.workspace_id
    join public.marketing_content_items content
      on content.id = package.content_id
     and content.workspace_id = package.workspace_id
    join public.marketing_provider_connections connection
      on connection.id = package.provider_connection_id
     and connection.workspace_id = package.workspace_id
    where publication.id = p_publication_id
      and publication.status = 'failed'
      and publication.provider_request_started_at is null
      and publication.provider_publication_id is null
      and package.status = 'needs_attention'
      and package.previewed_at is not null
      and package.approved_at is not null
      and package.package_fingerprint = publication.package_fingerprint
      and package.content_id = publication.content_id
      and package.content_revision = publication.content_revision
      and package.content_snapshot = publication.content_snapshot
      and package.media_pairing_id is not distinct from publication.media_pairing_id
      and package.media_snapshot is not distinct from publication.media_snapshot
      and package.provider_connection_id = publication.provider_connection_id
      and package.provider_connection_revision = publication.provider_connection_revision
      and package.provider = publication.provider
      and package.provider_destination_key = publication.provider_destination_key
      and package.provider_destination_label = publication.provider_destination_label
      and content.status = 'approved'
      and content.revision_number = package.content_revision
      and package.content_snapshot = jsonb_strip_nulls(jsonb_build_object(
        'title', content.title,
        'body', content.body,
        'content_type', content.content_type,
        'channel_category', content.channel_category,
        'content_revision', content.revision_number,
        'source_direction_id', content.source_direction_id,
        'source_direction_revision', content.source_direction_revision
      ))
      and connection.provider = package.provider
      and connection.connection_status = 'connected'
      and connection.readiness_status = 'ready'
      and connection.identity_revision = package.provider_connection_revision
      and connection.destination_key = package.provider_destination_key
      and connection.destination_label = package.provider_destination_label
      and coalesce((connection.capabilities->>'text')::boolean, false)
      and coalesce((connection.capabilities->>'publishing_enabled')::boolean, false)
      and package.package_fingerprint = public.servsync_private_marketing_package_fingerprint(
        package.workspace_id,
        package.content_id,
        package.content_revision,
        package.media_pairing_id,
        package.provider,
        package.provider_connection_id,
        package.provider_connection_revision,
        package.provider_destination_key
      )
      and not exists (
        select 1
        from jsonb_array_elements_text(package.required_disclosures) disclosure
        where position(disclosure in (package.content_snapshot->>'body')) = 0
      )
      and (
        (package.media_pairing_id is null and package.media_snapshot is null)
        or exists (
          select 1
          from public.marketing_content_media_pairings pairing
          join public.marketing_media_assets asset
            on asset.id = pairing.asset_id
           and asset.workspace_id = pairing.workspace_id
          join public.marketing_media_lifecycles lifecycle
            on lifecycle.asset_id = asset.id
           and lifecycle.workspace_id = asset.workspace_id
          where pairing.id = package.media_pairing_id
            and pairing.workspace_id = package.workspace_id
            and pairing.content_id = package.content_id
            and pairing.content_revision = package.content_revision
            and pairing.status = 'approved'
            and lifecycle.state not in ('purging', 'purged', 'abandoned')
            and coalesce((connection.capabilities->>'media')::boolean, false)
            and package.media_snapshot = jsonb_build_object(
              'pairing_id', pairing.id,
              'pairing_status', pairing.status,
              'asset_id', asset.id,
              'asset_type', asset.asset_type,
              'storage_bucket', asset.storage_bucket,
              'storage_path', asset.storage_path,
              'poster_bucket', asset.poster_bucket,
              'poster_path', asset.poster_path,
              'mime_type', asset.mime_type,
              'sha256', asset.sha256,
              'file_size_bytes', asset.file_size_bytes,
              'width', asset.width,
              'height', asset.height,
              'duration_seconds', asset.duration_seconds,
              'media_variant', asset.media_variant,
              'ai_narration_disclosure_text', asset.ai_narration_disclosure_text
            )
        )
      )
      and not exists (
        select 1
        from public.marketing_publications conflict
        where conflict.workspace_id = publication.workspace_id
          and conflict.package_id = publication.package_id
          and conflict.id <> publication.id
          and (
            conflict.status in ('scheduled', 'publishing', 'published')
            or conflict.provider_request_started_at is not null
            or conflict.provider_publication_id is not null
          )
      )
  );
$$;

create or replace function public.servsync_get_marketing_publishing(p_contractor_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare v_workspace_id uuid; v_entitlements jsonb;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'read');
  v_entitlements := public.servsync_private_effective_marketing_entitlements(v_workspace_id);
  return jsonb_build_object(
    'workspace', (select jsonb_build_object('workspace_id',workspace.id,
      'workspace_kind',workspace.workspace_kind,'display_name',workspace.display_name)
      from public.marketing_workspaces workspace where workspace.id=v_workspace_id),
    'operation_available', (select provider_submissions_enabled from public.marketing_publishing_controls where singleton),
    'prepared_limit', (v_entitlements->>'ready_scheduled_post_limit')::integer,
    'prepared_count', (select count(*) from public.marketing_publication_packages
      where workspace_id=v_workspace_id and status in ('ready','scheduled','publishing')),
    'providers', coalesce((select jsonb_agg(jsonb_build_object(
      'connection_id',connection.id,'provider',connection.provider,'priority',connection.priority,
      'connection_status',connection.connection_status,'readiness_status',connection.readiness_status,
      'destination_label',connection.destination_label,'capabilities',connection.capabilities,
      'readiness_note',connection.readiness_note,'connected_at',connection.connected_at,
      'last_validated_at',connection.last_validated_at,'token_expires_at',connection.token_expires_at,
      'identity_revision',connection.identity_revision
    ) order by connection.priority) from public.marketing_provider_connections connection
      where connection.workspace_id=v_workspace_id),'[]'::jsonb),
    'facebook_setup', coalesce((select jsonb_build_object(
      'session_id',session.id,'status',session.status,
      'candidate_pages',session.candidate_pages,'expires_at',session.expires_at
    ) from public.marketing_facebook_oauth_sessions session
      where session.workspace_id=v_workspace_id and session.status='page_selection_required'
        and session.expires_at>now() order by session.created_at desc limit 1),'null'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object(
      'package_id',package.id,'package_fingerprint',package.package_fingerprint,
      'content_id',package.content_id,'content_revision',package.content_revision,
      'content_snapshot',package.content_snapshot,'media_pairing_id',package.media_pairing_id,
      'media_snapshot',package.media_snapshot,'provider',package.provider,
      'connection_id',package.provider_connection_id,'connection_revision',package.provider_connection_revision,
      'destination_label',package.provider_destination_label,'status',package.status,
      'previewed_at',package.previewed_at,'approved_at',package.approved_at,
      'required_disclosures',package.required_disclosures,'retired_reason',package.retired_reason,
      'created_at',package.created_at,'updated_at',package.updated_at
    ) order by package.updated_at desc,package.id) from public.marketing_publication_packages package
      where package.workspace_id=v_workspace_id),'[]'::jsonb),
    'publications', coalesce((select jsonb_agg(jsonb_build_object(
      'publication_id',publication.id,'package_id',publication.package_id,
      'package_fingerprint',publication.package_fingerprint,
      'content_id',publication.content_id,'content_revision',publication.content_revision,
      'content_snapshot',publication.content_snapshot,'media_pairing_id',publication.media_pairing_id,
      'media_snapshot',publication.media_snapshot,'provider',publication.provider,
      'destination_label',publication.provider_destination_label,
      'publication_mode',publication.publication_mode,'scheduled_at',publication.scheduled_at,
      'authorization_timezone',publication.authorization_timezone,'status',publication.status,
      'attempt_count',publication.attempt_count,'max_attempts',publication.max_attempts,
      'retry_eligible',publication.retry_eligible,
      'replacement_eligible',public.servsync_private_marketing_pre_provider_replacement_eligible(publication.id),
      'provider_publication_id',publication.provider_publication_id,
      'provider_permalink',nullif(publication.provider_metadata->>'permalink_url',''),
      'failure_category',publication.failure_category,'failure_message',publication.failure_message,
      'created_at',publication.created_at,'publishing_started_at',publication.publishing_started_at,
      'published_at',publication.published_at,'cancelled_at',publication.cancelled_at
    ) order by publication.created_at desc,publication.id) from public.marketing_publications publication
      where publication.workspace_id=v_workspace_id),'[]'::jsonb)
  );
end;
$$;

create function public.servsync_prepare_marketing_pre_provider_replacement(
  p_contractor_id uuid,
  p_publication_id uuid,
  p_recovery_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_publication public.marketing_publications;
  v_package public.marketing_publication_packages;
  v_limit integer;
  v_count integer;
  v_sequence smallint;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'publish');
  if p_publication_id is null or p_recovery_request_id is null then
    raise exception 'Invalid Marketing replacement recovery request.' using errcode = '22023';
  end if;

  select * into strict v_publication
  from public.marketing_publications
  where id = p_publication_id and workspace_id = v_workspace_id
  for update;

  select * into strict v_package
  from public.marketing_publication_packages
  where id = v_publication.package_id and workspace_id = v_workspace_id
  for update;

  if exists (
    select 1
    from public.marketing_publication_events
    where publication_id = v_publication.id
      and reason_category = 'pre_provider_replacement'
      and reason_message = p_recovery_request_id::text
  ) then
    return jsonb_build_object(
      'publication_id', v_publication.id,
      'package_id', v_package.id,
      'status', v_package.status,
      'replayed', true
    );
  end if;

  if not public.servsync_private_marketing_pre_provider_replacement_eligible(v_publication.id) then
    raise exception 'A safe pre-provider replacement cannot be proven for this publication.' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 37039));
  v_limit := (public.servsync_private_effective_marketing_entitlements(v_workspace_id)->>'ready_scheduled_post_limit')::integer;
  select count(*) into v_count
  from public.marketing_publication_packages
  where workspace_id = v_workspace_id and status in ('ready', 'scheduled', 'publishing');
  if v_count >= v_limit then
    raise exception 'The beta prepared-post allowance is full.' using errcode = '54000';
  end if;

  update public.marketing_publication_packages
  set status = 'ready', updated_at = now()
  where id = v_package.id;

  select coalesce(max(event_sequence), 0) + 1 into v_sequence
  from public.marketing_publication_events
  where publication_id = v_publication.id;

  insert into public.marketing_publication_events(
    workspace_id, publication_id, event_sequence, from_status, to_status,
    reason_category, reason_message, attempt_number, actor_user_id
  ) values (
    v_workspace_id, v_publication.id, v_sequence, 'failed', 'failed',
    'pre_provider_replacement', p_recovery_request_id::text,
    v_publication.attempt_count, auth.uid()
  );

  return jsonb_build_object(
    'publication_id', v_publication.id,
    'package_id', v_package.id,
    'status', 'ready',
    'replayed', false
  );
end;
$$;

comment on function public.servsync_prepare_marketing_pre_provider_replacement(uuid,uuid,uuid)
  is 'servsync-marketing-pre-provider-replacement-recovery-v1';

alter function public.servsync_private_marketing_pre_provider_replacement_eligible(uuid) owner to postgres;
alter function public.servsync_get_marketing_publishing(uuid) owner to postgres;
alter function public.servsync_prepare_marketing_pre_provider_replacement(uuid,uuid,uuid) owner to postgres;

revoke all on function public.servsync_private_marketing_pre_provider_replacement_eligible(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_marketing_publishing(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.servsync_prepare_marketing_pre_provider_replacement(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.servsync_get_marketing_publishing(uuid) to authenticated;
grant execute on function public.servsync_prepare_marketing_pre_provider_replacement(uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
