-- ServSync guarded Marketing media retirement control v1.
--
-- Keeps the existing authenticated retirement RPC as the only browser mutation
-- boundary, atomically retires unpublished packages that reference the media,
-- invalidates candidate/approved pairings with append-only evidence, and
-- exposes only a derived eligibility bit to the managed-media catalog.

begin;

do $$
begin
  if to_regprocedure('public.servsync_abandon_marketing_media(uuid,uuid)') is null
     or to_regprocedure('public.servsync_get_marketing_media_catalog(uuid)') is null
     or to_regclass('public.marketing_publication_packages') is null
     or to_regclass('public.marketing_publications') is null then
    raise exception 'Marketing media lifecycle and publishing queue must be installed first.';
  end if;
  if coalesce(obj_description(
    'public.servsync_abandon_marketing_media(uuid,uuid)'::regprocedure,
    'pg_proc'
  ), '') = 'servsync-marketing-media-retirement-control-v1' then
    raise exception 'Marketing media retirement control is already installed.';
  end if;
end;
$$;

create or replace function public.servsync_get_marketing_media_catalog(p_contractor_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth stable as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'read');
  return jsonb_build_object(
    'workspace_id',v_workspace_id,
    'assets',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'asset_id',asset.id,'asset_type',asset.asset_type,'source',asset.source,
      'storage_bucket',asset.storage_bucket,'storage_path',case when lifecycle.state='purged' then null else asset.storage_path end,
      'poster_bucket',asset.poster_bucket,'poster_path',asset.poster_path,
      'mime_type',asset.mime_type,'file_size_bytes',asset.file_size_bytes,
      'width',asset.width,'height',asset.height,'duration_seconds',asset.duration_seconds,
      'sha256',asset.sha256,'media_variant',asset.media_variant,
      'lifecycle_state',lifecycle.state,'purged_at',lifecycle.purged_at,
      'retirement_eligible',(
        not lifecycle.retained_permanently
        and lifecycle.state in ('uploaded','needs_review','ready')
        and not exists (
          select 1 from public.marketing_publication_packages package
          where package.workspace_id=lifecycle.workspace_id
            and package.media_snapshot->>'asset_id'=lifecycle.asset_id::text
            and package.status in ('scheduled','publishing','published','needs_attention')
        )
        and not exists (
          select 1 from public.marketing_publications publication
          where publication.workspace_id=lifecycle.workspace_id
            and publication.media_snapshot->>'asset_id'=lifecycle.asset_id::text
            and (
              publication.status in ('scheduled','publishing','published')
              or (publication.status='failed' and publication.provider_publication_id is not null)
            )
        )
      ),
      'ai_narration_disclosure_required',asset.ai_narration_disclosure_required,
      'ai_narration_disclosure_text',asset.ai_narration_disclosure_text,'created_at',asset.created_at
    )) order by asset.created_at desc,asset.id)
      from public.marketing_media_assets asset
      join public.marketing_media_lifecycles lifecycle
        on lifecycle.workspace_id=asset.workspace_id and lifecycle.asset_id=asset.id
      where asset.workspace_id=v_workspace_id),'[]'::jsonb),
    'pairings',coalesce((select jsonb_agg(jsonb_build_object(
      'pairing_id',pairing.id,'content_id',pairing.content_id,
      'content_revision',pairing.content_revision,'asset_id',pairing.asset_id,
      'claim_demonstrated',pairing.claim_demonstrated,'status',pairing.status,
      'created_at',pairing.created_at,'reviewed_at',pairing.reviewed_at
    ) order by pairing.created_at desc,pairing.id)
      from public.marketing_content_media_pairings pairing
      where pairing.workspace_id=v_workspace_id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.servsync_abandon_marketing_media(
  p_contractor_id uuid,
  p_asset_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare
  v_workspace_id uuid;
  v_lifecycle public.marketing_media_lifecycles;
  v_days integer;
  v_retired_package_ids uuid[] := '{}'::uuid[];
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');

  -- Serialize against package preparation/review before taking the lifecycle
  -- lock. Publication authorization already locks the exact package first.
  perform pairing.id
  from public.marketing_content_media_pairings pairing
  where pairing.workspace_id=v_workspace_id and pairing.asset_id=p_asset_id
  order by pairing.id
  for update;

  perform package.id
  from public.marketing_publication_packages package
  where package.workspace_id=v_workspace_id
    and package.media_snapshot->>'asset_id'=p_asset_id::text
  order by package.id
  for update;

  select * into strict v_lifecycle
  from public.marketing_media_lifecycles lifecycle
  where lifecycle.asset_id=p_asset_id and lifecycle.workspace_id=v_workspace_id
  for update;

  if v_lifecycle.state='abandoned' then
    return jsonb_build_object(
      'asset_id',p_asset_id,'state','abandoned','retired_package_count',0,'replayed',true
    );
  end if;

  if v_lifecycle.retained_permanently or v_lifecycle.state='protected' then
    raise exception 'Marketing media is protected or permanent and cannot be retired.' using errcode='55000';
  end if;

  if exists (
    select 1 from public.marketing_publication_packages package
    where package.workspace_id=v_workspace_id
      and package.media_snapshot->>'asset_id'=p_asset_id::text
      and package.status in ('scheduled','publishing','published','needs_attention')
  ) or exists (
    select 1 from public.marketing_publications publication
    where publication.workspace_id=v_workspace_id
      and publication.media_snapshot->>'asset_id'=p_asset_id::text
      and (
        publication.status in ('scheduled','publishing','published')
        or (publication.status='failed' and publication.provider_publication_id is not null)
      )
  ) then
    raise exception 'Marketing media has a publishing dependency and cannot be retired.' using errcode='55000';
  end if;

  if v_lifecycle.state not in ('uploaded','needs_review','ready') then
    raise exception 'Marketing media is no longer eligible for retirement; reload and try again.' using errcode='40001';
  end if;

  select coalesce(array_agg(package.id order by package.id),'{}'::uuid[])
    into v_retired_package_ids
  from public.marketing_publication_packages package
  where package.workspace_id=v_workspace_id
    and package.media_snapshot->>'asset_id'=p_asset_id::text
    and package.status in ('needs_review','ready');

  -- Retire immutable publication packages first. The pairing status trigger
  -- then observes a terminal package and cannot replace this specific reason.
  update public.marketing_publication_packages package
     set status='retired',retired_reason='Managed media retired before publication.',updated_at=now()
   where package.workspace_id=v_workspace_id
     and package.media_snapshot->>'asset_id'=p_asset_id::text
     and package.status in ('needs_review','ready');

  with candidates as (
    select pairing.id,pairing.status as from_status
    from public.marketing_content_media_pairings pairing
    where pairing.workspace_id=v_workspace_id and pairing.asset_id=p_asset_id
      and pairing.status in ('candidate','approved')
    order by pairing.id
    for update
  ), rejected as (
    update public.marketing_content_media_pairings pairing
       set status='rejected',reviewed_by=auth.uid(),reviewed_at=now()
      from candidates
     where pairing.id=candidates.id and pairing.workspace_id=v_workspace_id
    returning pairing.id,pairing.workspace_id,candidates.from_status
  )
  insert into public.marketing_content_media_pairing_events(
    workspace_id,pairing_id,from_status,to_status,actor_user_id
  )
  select rejected.workspace_id,rejected.id,rejected.from_status,'rejected',auth.uid()
  from rejected;

  v_days := (public.servsync_private_effective_marketing_entitlements(v_workspace_id)->>'abandoned_media_expiration_days')::integer;
  update public.marketing_media_lifecycles
     set state='abandoned',retention_started_at=now(),
         purge_after=now()+make_interval(days=>v_days),last_activity_at=now(),updated_at=now()
   where asset_id=p_asset_id and workspace_id=v_workspace_id;

  insert into public.marketing_media_lifecycle_events(
    workspace_id,asset_id,from_state,to_state,reason,metadata,actor_user_id
  ) values (
    v_workspace_id,p_asset_id,v_lifecycle.state,'abandoned',
    'Owner retired unpublished Marketing media.',
    jsonb_build_object(
      'retired_package_ids',to_jsonb(v_retired_package_ids),
      'retired_package_count',cardinality(v_retired_package_ids)
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'asset_id',p_asset_id,'state','abandoned',
    'retired_package_count',cardinality(v_retired_package_ids),'replayed',false
  );
end;
$$;

comment on function public.servsync_abandon_marketing_media(uuid,uuid)
  is 'servsync-marketing-media-retirement-control-v1';
alter function public.servsync_get_marketing_media_catalog(uuid) owner to postgres;
alter function public.servsync_abandon_marketing_media(uuid,uuid) owner to postgres;
revoke all on function public.servsync_get_marketing_media_catalog(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.servsync_abandon_marketing_media(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.servsync_get_marketing_media_catalog(uuid) to authenticated;
grant execute on function public.servsync_abandon_marketing_media(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
