-- ServSync Narrated Marketing Media and Publication Snapshot v1.
--
-- Extends the existing private Marketing media boundary with explicit narrated
-- derivative provenance and immutable text-plus-media publication snapshots.
-- It does not enable a provider capability, public-post gate, publication, or
-- outbound provider request.

begin;

do $$
begin
  if to_regclass('public.marketing_media_assets') is null
     or to_regclass('public.marketing_content_media_pairings') is null
     or to_regclass('public.marketing_publications') is null
     or to_regprocedure('public.servsync_review_internal_marketing_media_pairing(uuid,text)') is null
     or to_regprocedure('public.servsync_private_guard_marketing_publication_provider_enabled()') is null then
    raise exception 'Missing narrated Marketing media prerequisite.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='marketing_media_assets'
      and column_name='media_variant'
  ) then
    raise exception 'Narrated Marketing media target already exists.';
  end if;
end;
$$;

alter table public.marketing_media_assets
  add column media_variant text not null default 'silent_product_demo_master',
  add column source_silent_filename text null,
  add column source_silent_sha256 text null,
  add column narration_provider text null,
  add column narration_model text null,
  add column narration_voice text null,
  add column narration_script text null,
  add column narration_script_version smallint null,
  add column narration_audio_duration_seconds numeric(10,3) null,
  add column narration_start_seconds numeric(10,3) null,
  add column narration_end_seconds numeric(10,3) null,
  add column ai_narration_disclosure_required boolean not null default false,
  add column ai_narration_disclosure_text text null,
  add constraint marketing_media_assets_variant_check check (
    media_variant in ('silent_product_demo_master','narrated_marketing_derivative')
  ),
  add constraint marketing_media_assets_narration_shape_check check (
    (
      media_variant='silent_product_demo_master'
      and source_silent_filename is null and source_silent_sha256 is null
      and narration_provider is null and narration_model is null and narration_voice is null
      and narration_script is null and narration_script_version is null
      and narration_audio_duration_seconds is null and narration_start_seconds is null
      and narration_end_seconds is null and not ai_narration_disclosure_required
      and ai_narration_disclosure_text is null
    )
    or (
      media_variant='narrated_marketing_derivative'
      and source_silent_filename ~ '^servsync-[a-z0-9-]+-v[0-9]+-[0-9TZ-]+\.mp4$'
      and source_silent_sha256 ~ '^[a-f0-9]{64}$'
      and narration_provider='OpenAI'
      and char_length(narration_model) between 3 and 100
      and narration_voice ~ '^[a-z0-9_-]{2,40}$'
      and char_length(narration_script) between 10 and 5000
      and narration_script !~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
      and narration_script_version between 1 and 100
      and narration_audio_duration_seconds > 0
      and narration_start_seconds >= 0
      and narration_end_seconds > narration_start_seconds
      and narration_end_seconds <= duration_seconds
      and narration_audio_duration_seconds <= duration_seconds
      and ai_narration_disclosure_required
      and char_length(ai_narration_disclosure_text) between 10 and 200
      and ai_narration_disclosure_text !~ '[[:cntrl:]]'
    )
  );

alter table public.marketing_publications
  add column media_pairing_id uuid null references public.marketing_content_media_pairings(id) on delete restrict,
  add column media_snapshot jsonb null,
  add constraint marketing_publications_media_shape_check check (
    (media_pairing_id is null and media_snapshot is null)
    or (
      media_pairing_id is not null
      and jsonb_typeof(media_snapshot)='object'
      and media_snapshot ?& array[
        'pairing_id','asset_id','storage_bucket','storage_path','mime_type','sha256',
        'file_size_bytes','width','height','duration_seconds','media_variant'
      ]
    )
  );

create or replace function public.servsync_private_guard_marketing_publication_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.content_id is distinct from old.content_id
     or new.content_revision is distinct from old.content_revision
     or new.content_snapshot is distinct from old.content_snapshot
     or new.media_pairing_id is distinct from old.media_pairing_id
     or new.media_snapshot is distinct from old.media_snapshot
     or new.provider_connection_id is distinct from old.provider_connection_id
     or new.provider is distinct from old.provider
     or new.provider_destination_key is distinct from old.provider_destination_key
     or new.provider_destination_label is distinct from old.provider_destination_label
     or new.publication_mode is distinct from old.publication_mode
     or new.scheduled_at is distinct from old.scheduled_at
     or new.client_request_id is distinct from old.client_request_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Marketing publication authorization snapshot is immutable.';
  end if;
  if old.status in ('published','cancelled') then
    raise exception 'Terminal Marketing publications are immutable.';
  end if;
  return new;
end;
$$;

create function public.servsync_private_carry_approved_marketing_media_pairing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_new_pairing record;
begin
  if new.revision_number <> old.revision_number + 1
     or new.title is distinct from old.title
     or new.content_type is distinct from old.content_type
     or new.body is distinct from old.body
     or new.channel_category is distinct from old.channel_category
     or not (
       (old.status='draft' and new.status='needs_approval')
       or (old.status='needs_approval' and new.status='approved')
     ) then
    return new;
  end if;

  for v_new_pairing in
    insert into public.marketing_content_media_pairings (
      workspace_id,content_id,content_revision,source_direction_id,
      source_direction_revision,asset_id,recorder_scenario,claim_demonstrated,
      status,created_by,reviewed_by,reviewed_at
    )
    select pairing.workspace_id,pairing.content_id,new.revision_number,
      pairing.source_direction_id,pairing.source_direction_revision,pairing.asset_id,
      pairing.recorder_scenario,pairing.claim_demonstrated,'approved',
      pairing.created_by,pairing.reviewed_by,pairing.reviewed_at
    from public.marketing_content_media_pairings pairing
    where pairing.workspace_id=new.workspace_id
      and pairing.content_id=new.id
      and pairing.content_revision=old.revision_number
      and pairing.status='approved'
    on conflict do nothing
    returning id,workspace_id
  loop
    insert into public.marketing_content_media_pairing_events (
      workspace_id,pairing_id,from_status,to_status,actor_user_id
    ) values (
      v_new_pairing.workspace_id,v_new_pairing.id,null,'approved',auth.uid()
    );
  end loop;
  return new;
end;
$$;

create trigger marketing_content_carry_approved_media_pairing
  after update of status,revision_number on public.marketing_content_items
  for each row execute function public.servsync_private_carry_approved_marketing_media_pairing();

create function public.servsync_register_narrated_marketing_media(
  p_asset_id uuid,
  p_pairing_id uuid,
  p_content_id uuid,
  p_expected_content_revision bigint,
  p_recorder_scenario text,
  p_source_commit text,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_duration_seconds numeric,
  p_sha256 text,
  p_pacing_reviewed_at timestamptz,
  p_claim_demonstrated text,
  p_source_silent_filename text,
  p_source_silent_sha256 text,
  p_narration_provider text,
  p_narration_model text,
  p_narration_voice text,
  p_narration_script text,
  p_narration_script_version integer,
  p_narration_audio_duration_seconds numeric,
  p_narration_start_seconds numeric,
  p_narration_end_seconds numeric,
  p_ai_narration_disclosure_text text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth, storage
as $$
declare
  v_workspace_id uuid;
  v_object storage.objects;
  v_expected_path text;
  v_content public.marketing_content_items;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode='42501';
  end if;
  select id into strict v_workspace_id from public.marketing_workspaces
   where workspace_key='servsync_internal' and workspace_kind='internal' and contractor_id is null;
  if p_asset_id is null or p_pairing_id is null or p_content_id is null
     or p_recorder_scenario !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_mime_type <> 'video/mp4'
     or p_file_size_bytes not between 1 and 104857600
     or p_width not between 320 and 4096 or p_height not between 240 and 2160
     or p_duration_seconds <= 0 or p_duration_seconds > 300
     or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_pacing_reviewed_at is null or p_pacing_reviewed_at > now() + interval '1 minute'
     or char_length(btrim(coalesce(p_claim_demonstrated,''))) not between 10 and 500
     or p_source_silent_filename !~ '^servsync-[a-z0-9-]+-v[0-9]+-[0-9TZ-]+\.mp4$'
     or p_source_silent_sha256 !~ '^[a-f0-9]{64}$'
     or p_narration_provider <> 'OpenAI'
     or char_length(btrim(coalesce(p_narration_model,''))) not between 3 and 100
     or p_narration_voice !~ '^[a-z0-9_-]{2,40}$'
     or char_length(btrim(coalesce(p_narration_script,''))) not between 10 and 5000
     or p_narration_script_version not between 1 and 100
     or p_narration_audio_duration_seconds <= 0
     or p_narration_start_seconds < 0
     or p_narration_end_seconds <= p_narration_start_seconds
     or p_narration_end_seconds > p_duration_seconds
     or p_narration_audio_duration_seconds > p_duration_seconds
     or char_length(btrim(coalesce(p_ai_narration_disclosure_text,''))) not between 10 and 200 then
    raise exception 'Invalid narrated Marketing media metadata.' using errcode='22023';
  end if;
  select * into strict v_content from public.marketing_content_items
   where id=p_content_id and workspace_id=v_workspace_id for share;
  if v_content.status not in ('needs_approval','approved') then
    raise exception 'Owner-review or approved Marketing content is required.' using errcode='55000';
  end if;
  if v_content.revision_number <> p_expected_content_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode='40001';
  end if;
  if position(btrim(p_ai_narration_disclosure_text) in v_content.body) = 0 then
    raise exception 'The public AI narration disclosure is missing from the content.' using errcode='22023';
  end if;
  v_expected_path := v_workspace_id::text || '/' || p_asset_id::text || '/' || split_part(p_storage_path,'/',3);
  if p_storage_path <> v_expected_path
     or split_part(p_storage_path,'/',3) !~ '^servsync-[a-z0-9-]+-v[0-9]+-[0-9TZ-]+\.mp4$' then
    raise exception 'Invalid Marketing media storage identity.' using errcode='22023';
  end if;
  select * into strict v_object from storage.objects
   where bucket_id='marketing-assets' and name=p_storage_path;
  if coalesce(v_object.metadata->>'mimetype','') <> p_mime_type
     or coalesce((v_object.metadata->>'size')::bigint,-1) <> p_file_size_bytes then
    raise exception 'Marketing media Storage metadata mismatch.' using errcode='22023';
  end if;
  insert into public.marketing_media_assets (
    id,workspace_id,asset_type,source,recorder_scenario,source_commit,
    storage_path,mime_type,file_size_bytes,width,height,duration_seconds,
    sha256,validation_status,sensitive_data_check,pacing_review,pacing_reviewed_at,
    media_variant,source_silent_filename,source_silent_sha256,narration_provider,
    narration_model,narration_voice,narration_script,narration_script_version,
    narration_audio_duration_seconds,narration_start_seconds,narration_end_seconds,
    ai_narration_disclosure_required,ai_narration_disclosure_text,created_by
  ) values (
    p_asset_id,v_workspace_id,'video','demo_recorder',p_recorder_scenario,p_source_commit,
    p_storage_path,p_mime_type,p_file_size_bytes,p_width,p_height,p_duration_seconds,
    p_sha256,'passed','passed','passed',p_pacing_reviewed_at,
    'narrated_marketing_derivative',p_source_silent_filename,p_source_silent_sha256,'OpenAI',
    btrim(p_narration_model),p_narration_voice,btrim(p_narration_script),p_narration_script_version,
    p_narration_audio_duration_seconds,p_narration_start_seconds,p_narration_end_seconds,
    true,btrim(p_ai_narration_disclosure_text),auth.uid()
  );
  insert into public.marketing_content_media_pairings (
    id,workspace_id,content_id,content_revision,source_direction_id,
    source_direction_revision,asset_id,recorder_scenario,claim_demonstrated,created_by
  ) values (
    p_pairing_id,v_workspace_id,v_content.id,v_content.revision_number,
    v_content.source_direction_id,v_content.source_direction_revision,p_asset_id,
    p_recorder_scenario,btrim(p_claim_demonstrated),auth.uid()
  );
  insert into public.marketing_content_media_pairing_events (
    workspace_id,pairing_id,from_status,to_status,actor_user_id
  ) values (v_workspace_id,p_pairing_id,null,'candidate',auth.uid());
  return jsonb_build_object('asset_id',p_asset_id,'pairing_id',p_pairing_id,'status','candidate');
end;
$$;

create or replace function public.servsync_get_internal_marketing_media()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth stable
as $$
declare v_workspace_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  select id into strict v_workspace_id from public.marketing_workspaces
   where workspace_key='servsync_internal' and workspace_kind='internal' and contractor_id is null;
  return jsonb_build_object(
    'workspace_id',v_workspace_id,
    'assets',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'asset_id',asset.id,'asset_type',asset.asset_type,'source',asset.source,
      'recorder_scenario',asset.recorder_scenario,'source_commit',asset.source_commit,
      'storage_bucket',asset.storage_bucket,'storage_path',asset.storage_path,
      'mime_type',asset.mime_type,'file_size_bytes',asset.file_size_bytes,
      'width',asset.width,'height',asset.height,'duration_seconds',asset.duration_seconds,
      'sha256',asset.sha256,'validation_status',asset.validation_status,
      'sensitive_data_check',asset.sensitive_data_check,'pacing_review',asset.pacing_review,
      'pacing_reviewed_at',asset.pacing_reviewed_at,'media_variant',asset.media_variant,
      'source_silent_filename',asset.source_silent_filename,'source_silent_sha256',asset.source_silent_sha256,
      'narration_provider',asset.narration_provider,'narration_model',asset.narration_model,
      'narration_voice',asset.narration_voice,'narration_script',asset.narration_script,
      'narration_script_version',asset.narration_script_version,
      'narration_audio_duration_seconds',asset.narration_audio_duration_seconds,
      'narration_start_seconds',asset.narration_start_seconds,'narration_end_seconds',asset.narration_end_seconds,
      'ai_narration_disclosure_required',asset.ai_narration_disclosure_required,
      'ai_narration_disclosure_text',asset.ai_narration_disclosure_text,
      'created_at',asset.created_at
    )) order by asset.created_at desc,asset.id) from public.marketing_media_assets asset
      where asset.workspace_id=v_workspace_id),'[]'::jsonb),
    'pairings',coalesce((select jsonb_agg(jsonb_build_object(
      'pairing_id',pairing.id,'content_id',pairing.content_id,'content_revision',pairing.content_revision,
      'source_direction_id',pairing.source_direction_id,'source_direction_revision',pairing.source_direction_revision,
      'asset_id',pairing.asset_id,'recorder_scenario',pairing.recorder_scenario,
      'claim_demonstrated',pairing.claim_demonstrated,'status',pairing.status,
      'created_at',pairing.created_at,'reviewed_at',pairing.reviewed_at
    ) order by pairing.created_at desc,pairing.id) from public.marketing_content_media_pairings pairing
      where pairing.workspace_id=v_workspace_id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.servsync_create_internal_marketing_publication(
  p_client_request_id uuid,p_content_id uuid,p_expected_content_revision bigint,
  p_provider text,p_provider_connection_id uuid,p_publication_mode text,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_workspace_id uuid;
  v_content public.marketing_content_items;
  v_connection public.marketing_provider_connections;
  v_publication public.marketing_publications;
  v_pairing public.marketing_content_media_pairings;
  v_asset public.marketing_media_assets;
  v_schedule timestamptz;
  v_snapshot jsonb;
  v_media_snapshot jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  if p_client_request_id is null or p_content_id is null or p_expected_content_revision is null
     or p_provider not in ('facebook','instagram','tiktok')
     or p_publication_mode not in ('publish_now','scheduled') then
    raise exception 'Invalid Marketing publication request.' using errcode='22023';
  end if;
  v_schedule := case when p_publication_mode='publish_now' then now() else p_scheduled_at end;
  if v_schedule is null or (p_publication_mode='scheduled' and v_schedule <= now()) then
    raise exception 'Scheduled publication time must be in the future.' using errcode='22023';
  end if;
  select id into v_workspace_id from public.marketing_workspaces
   where workspace_key='servsync_internal' and workspace_kind='internal' and contractor_id is null;
  select * into v_content from public.marketing_content_items
   where id=p_content_id and workspace_id=v_workspace_id for share;
  if v_content.id is null then raise exception 'Marketing content not found.' using errcode='P0002'; end if;
  if v_content.status <> 'approved' then raise exception 'Approved Marketing content is required.' using errcode='55000'; end if;
  if v_content.revision_number <> p_expected_content_revision then raise exception 'Marketing content changed; reload and try again.' using errcode='40001'; end if;
  if v_content.content_type <> 'social_post' or v_content.channel_category is distinct from 'social' then
    raise exception 'This content is not eligible for social publishing.' using errcode='22023';
  end if;
  if v_content.body ~* '(^|[[:space:]])(file://|/users/|/private/tmp/|~/documents/)' then
    raise exception 'Local media paths cannot be published or persisted.' using errcode='22023';
  end if;
  select * into v_connection from public.marketing_provider_connections
   where id=p_provider_connection_id and workspace_id=v_workspace_id and provider=p_provider for share;
  if v_connection.id is null then raise exception 'Provider destination is unavailable.' using errcode='P0002'; end if;
  if v_connection.connection_status <> 'connected' then raise exception 'Provider setup is required before publishing.' using errcode='55000'; end if;
  if coalesce((v_connection.capabilities->>'text')::boolean,false) is not true then
    raise exception 'Provider does not support text publishing in this release.' using errcode='0A000';
  end if;

  select pairing.* into v_pairing from public.marketing_content_media_pairings pairing
   where pairing.workspace_id=v_workspace_id and pairing.content_id=v_content.id
     and pairing.content_revision=v_content.revision_number and pairing.status='approved';
  if v_pairing.id is null and exists (
    select 1 from public.marketing_content_media_pairings pairing
    where pairing.workspace_id=v_workspace_id and pairing.content_id=v_content.id
      and pairing.content_revision=v_content.revision_number and pairing.status='candidate'
  ) then
    raise exception 'The paired Marketing media requires owner approval.' using errcode='55000';
  end if;
  if v_pairing.id is not null then
    if coalesce((v_connection.capabilities->>'media')::boolean,false) is not true then
      raise exception 'Provider media publishing is not enabled.' using errcode='0A000';
    end if;
    select * into strict v_asset from public.marketing_media_assets
     where id=v_pairing.asset_id and workspace_id=v_workspace_id;
    if v_asset.ai_narration_disclosure_required
       and position(v_asset.ai_narration_disclosure_text in v_content.body)=0 then
      raise exception 'The required public AI narration disclosure is missing.' using errcode='22023';
    end if;
    v_media_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'pairing_id',v_pairing.id,'asset_id',v_asset.id,'storage_bucket',v_asset.storage_bucket,
      'storage_path',v_asset.storage_path,'mime_type',v_asset.mime_type,'sha256',v_asset.sha256,
      'file_size_bytes',v_asset.file_size_bytes,'width',v_asset.width,'height',v_asset.height,
      'duration_seconds',v_asset.duration_seconds,'media_variant',v_asset.media_variant,
      'recorder_scenario',v_asset.recorder_scenario,'source_commit',v_asset.source_commit,
      'narration_provider',v_asset.narration_provider,'narration_model',v_asset.narration_model,
      'narration_voice',v_asset.narration_voice,'narration_script_version',v_asset.narration_script_version,
      'ai_narration_disclosure_text',v_asset.ai_narration_disclosure_text
    ));
  end if;
  v_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'title',v_content.title,'body',v_content.body,'content_type',v_content.content_type,
    'channel_category',v_content.channel_category,'content_revision',v_content.revision_number,
    'preparation_source',v_content.preparation_source,'content_role',v_content.content_role,
    'source_plan_id',v_content.source_plan_id,'source_plan_revision',v_content.source_plan_revision,
    'source_plan_item_index',v_content.source_plan_item_index,
    'source_direction_id',v_content.source_direction_id,'source_direction_revision',v_content.source_direction_revision
  ));
  insert into public.marketing_publications (
    workspace_id,content_id,content_revision,content_snapshot,media_pairing_id,media_snapshot,
    provider_connection_id,provider,provider_destination_key,provider_destination_label,
    publication_mode,scheduled_at,client_request_id,created_by
  ) values (
    v_workspace_id,v_content.id,v_content.revision_number,v_snapshot,v_pairing.id,v_media_snapshot,
    v_connection.id,v_connection.provider,v_connection.destination_key,v_connection.destination_label,
    p_publication_mode,v_schedule,p_client_request_id,auth.uid()
  ) on conflict (workspace_id,client_request_id) do nothing returning * into v_publication;
  if v_publication.id is null then
    select * into v_publication from public.marketing_publications
     where workspace_id=v_workspace_id and client_request_id=p_client_request_id;
    if v_publication.content_id <> v_content.id or v_publication.content_revision <> v_content.revision_number
       or v_publication.provider_connection_id <> v_connection.id or v_publication.publication_mode <> p_publication_mode
       or v_publication.media_pairing_id is distinct from v_pairing.id
       or (p_publication_mode='scheduled' and v_publication.scheduled_at <> v_schedule) then
      raise exception 'Marketing publication request conflicts with an existing request.' using errcode='23505';
    end if;
    return jsonb_build_object('publication_id',v_publication.id,'status',v_publication.status,'replayed',true);
  end if;
  insert into public.marketing_publication_events (
    workspace_id,publication_id,event_sequence,from_status,to_status,attempt_number,actor_user_id
  ) values (v_workspace_id,v_publication.id,1,null,'scheduled',0,auth.uid());
  return jsonb_build_object('publication_id',v_publication.id,'status',v_publication.status,'replayed',false);
end;
$$;

create or replace function public.servsync_claim_due_marketing_publications(p_limit integer default 5)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 20 then raise exception 'Invalid worker claim limit.' using errcode='22023'; end if;
  with candidates as (
    select publication.id,publication.status as previous_status
    from public.marketing_publications publication
    join public.marketing_provider_connections connection on connection.id=publication.provider_connection_id
    where connection.connection_status='connected'
      and coalesce((connection.capabilities->>'publishing_enabled')::boolean,false)
      and ((publication.status='scheduled' and publication.scheduled_at <= now())
        or (publication.status='publishing' and publication.provider_request_started_at is null
          and publication.publishing_started_at < now()-interval '10 minutes'))
    order by publication.scheduled_at,publication.id
    for update of publication skip locked limit p_limit
  ), updated as (
    update public.marketing_publications publication set
      status='publishing',attempt_count=publication.attempt_count+1,publishing_started_at=now(),
      provider_request_started_at=null,retry_eligible=false,updated_at=now()
    from candidates where publication.id=candidates.id
    returning publication.*,candidates.previous_status
  ), events as (
    insert into public.marketing_publication_events(
      workspace_id,publication_id,event_sequence,from_status,to_status,
      reason_category,reason_message,attempt_number
    ) select updated.workspace_id,updated.id,
      (select coalesce(max(event_sequence),0)+1 from public.marketing_publication_events where publication_id=updated.id),
      updated.previous_status,'publishing',null,null,updated.attempt_count from updated
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'publication_id',updated.id,'attempt_number',updated.attempt_count,
    'provider',updated.provider,'provider_connection_id',updated.provider_connection_id,
    'destination_key',updated.provider_destination_key,'content_snapshot',updated.content_snapshot,
    'media_pairing_id',updated.media_pairing_id,'media_snapshot',updated.media_snapshot
  )),'[]'::jsonb) into v_result from updated;
  return v_result;
end;
$$;

create or replace function public.servsync_get_internal_marketing_publishing()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth stable
as $$
declare v_workspace_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  select id into v_workspace_id from public.marketing_workspaces where workspace_key='servsync_internal' and workspace_kind='internal' and contractor_id is null;
  return jsonb_build_object(
    'providers',coalesce((select jsonb_agg(jsonb_build_object(
      'connection_id',connection.id,'provider',connection.provider,'priority',connection.priority,
      'connection_status',connection.connection_status,'readiness_status',connection.readiness_status,
      'destination_label',connection.destination_label,'capabilities',connection.capabilities,
      'readiness_note',connection.readiness_note,'connected_at',connection.connected_at,
      'last_validated_at',connection.last_validated_at,'token_expires_at',connection.token_expires_at
    ) order by connection.priority) from public.marketing_provider_connections connection where connection.workspace_id=v_workspace_id),'[]'::jsonb),
    'facebook_setup',coalesce((select jsonb_build_object(
      'session_id',session.id,'status',session.status,'candidate_pages',session.candidate_pages,'expires_at',session.expires_at
    ) from public.marketing_facebook_oauth_sessions session where session.workspace_id=v_workspace_id
      and session.status='page_selection_required' and session.expires_at>now()
      order by session.created_at desc limit 1),'null'::jsonb),
    'publications',coalesce((select jsonb_agg(jsonb_build_object(
      'publication_id',publication.id,'content_id',publication.content_id,'content_revision',publication.content_revision,
      'content_snapshot',publication.content_snapshot,'media_pairing_id',publication.media_pairing_id,
      'media_snapshot',publication.media_snapshot,'provider',publication.provider,
      'destination_label',publication.provider_destination_label,'publication_mode',publication.publication_mode,
      'scheduled_at',publication.scheduled_at,'status',publication.status,'attempt_count',publication.attempt_count,
      'max_attempts',publication.max_attempts,'retry_eligible',publication.retry_eligible,
      'provider_publication_id',publication.provider_publication_id,'failure_category',publication.failure_category,
      'failure_message',publication.failure_message,'created_at',publication.created_at,
      'publishing_started_at',publication.publishing_started_at,'published_at',publication.published_at,
      'cancelled_at',publication.cancelled_at
    ) order by publication.created_at desc,publication.id) from public.marketing_publications publication
      where publication.workspace_id=v_workspace_id),'[]'::jsonb)
  );
end;
$$;

alter function public.servsync_private_carry_approved_marketing_media_pairing() owner to postgres;
alter function public.servsync_register_narrated_marketing_media(
  uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamptz,text,
  text,text,text,text,text,text,integer,numeric,numeric,numeric,text
) owner to postgres;

revoke all on function public.servsync_private_carry_approved_marketing_media_pairing() from public,anon,authenticated,service_role;
revoke all on function public.servsync_register_narrated_marketing_media(
  uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamptz,text,
  text,text,text,text,text,text,integer,numeric,numeric,numeric,text
) from public,anon,authenticated,service_role;
grant execute on function public.servsync_register_narrated_marketing_media(
  uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamptz,text,
  text,text,text,text,text,text,integer,numeric,numeric,numeric,text
) to authenticated;

notify pgrst,'reload schema';

commit;
