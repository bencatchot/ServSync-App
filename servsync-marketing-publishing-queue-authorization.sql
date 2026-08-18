-- ServSync shared Marketing publishing queue and authorization v1.
--
-- Adds immutable destination-specific packages, explicit preview/approval and
-- publish-now/schedule authorization, a separate global emergency stop, and
-- workspace-aware Facebook connection operations. The emergency stop starts
-- disabled and this migration never calls a public provider.

begin;

do $$
declare v_name text;
begin
  foreach v_name in array array[
    'marketing_workspaces', 'marketing_content_items', 'marketing_media_assets',
    'marketing_media_lifecycles', 'marketing_content_media_pairings',
    'marketing_provider_connections', 'marketing_publications',
    'marketing_publication_events', 'marketing_workspace_entitlements'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Missing Marketing queue prerequisite public.%.', v_name;
    end if;
  end loop;
  if to_regprocedure('public.servsync_private_marketing_workspace_for_context(uuid,text)') is null
     or to_regprocedure('public.servsync_private_effective_marketing_entitlements(uuid)') is null then
    raise exception 'Missing shared Marketing workspace or entitlement prerequisite.';
  end if;
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'Missing pgcrypto digest prerequisite.';
  end if;
  if to_regclass('public.marketing_publication_packages') is not null
     or to_regclass('public.marketing_publishing_controls') is not null then
    raise exception 'Marketing publishing queue target already exists.';
  end if;
end;
$$;

create table public.marketing_publishing_controls (
  singleton boolean primary key default true check (singleton),
  provider_submissions_enabled boolean not null default false,
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  reason text not null default 'Provider submissions remain disabled pending an authorized operational transition.',
  constraint marketing_publishing_controls_reason_check check (
    char_length(btrim(reason)) between 3 and 500
  )
);

insert into public.marketing_publishing_controls (singleton) values (true);

alter table public.marketing_provider_connections
  add column identity_revision bigint not null default 1,
  drop constraint marketing_provider_connections_readiness_check;

update public.marketing_provider_connections
set readiness_status = 'ready',
    readiness_note = 'Connected and ready for an explicitly authorized publication.',
    capabilities = jsonb_set(
      jsonb_set(capabilities, '{text}', 'true'::jsonb, true),
      '{publishing_enabled}', 'true'::jsonb, true
    ),
    updated_at = now()
where provider = 'facebook' and connection_status = 'connected';

alter table public.marketing_provider_connections
  add constraint marketing_provider_connections_readiness_check check (
    readiness_status in (
      'setup_required', 'authorization_pending', 'page_selection_required',
      'ready', 'reconnect_required', 'disconnected', 'error'
    )
  ),
  add constraint marketing_provider_connections_identity_revision_check check (
    identity_revision >= 1
  );

create function public.servsync_private_bump_marketing_provider_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.provider is distinct from old.provider
     or new.destination_key is distinct from old.destination_key
     or new.provider_account_key is distinct from old.provider_account_key
     or new.connected_at is distinct from old.connected_at
     or new.connection_status is distinct from old.connection_status then
    new.identity_revision := old.identity_revision + 1;
  else
    new.identity_revision := old.identity_revision;
  end if;
  return new;
end;
$$;

create trigger marketing_provider_connections_identity_revision
  before update on public.marketing_provider_connections
  for each row execute function public.servsync_private_bump_marketing_provider_identity();

create function public.servsync_private_seed_marketing_provider_connections()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.marketing_provider_connections (
    workspace_id, provider, priority, capabilities, readiness_note
  ) values
    (new.id, 'facebook', 1, '{"text":true,"media":true,"publishing_enabled":true}'::jsonb,
      'Connect a Facebook Page to publish approved posts.'),
    (new.id, 'instagram', 2, '{"text":false,"media":true,"publishing_enabled":false}'::jsonb,
      'Instagram publishing is not available in this release.'),
    (new.id, 'tiktok', 3, '{"text":false,"media":true,"publishing_enabled":false}'::jsonb,
      'TikTok publishing is not available in this release.')
  on conflict (workspace_id, provider) do nothing;
  return new;
end;
$$;

create trigger marketing_workspace_seed_provider_connections
  after insert on public.marketing_workspaces
  for each row execute function public.servsync_private_seed_marketing_provider_connections();

insert into public.marketing_provider_connections (
  workspace_id, provider, priority, capabilities, readiness_note
)
select workspace.id, seed.provider, seed.priority, seed.capabilities, seed.readiness_note
from public.marketing_workspaces workspace
cross join lateral (values
  ('facebook'::text, 1::smallint, '{"text":true,"media":true,"publishing_enabled":true}'::jsonb,
    'Connect a Facebook Page to publish approved posts.'::text),
  ('instagram'::text, 2::smallint, '{"text":false,"media":true,"publishing_enabled":false}'::jsonb,
    'Instagram publishing is not available in this release.'::text),
  ('tiktok'::text, 3::smallint, '{"text":false,"media":true,"publishing_enabled":false}'::jsonb,
    'TikTok publishing is not available in this release.'::text)
) seed(provider, priority, capabilities, readiness_note)
where workspace.workspace_kind = 'contractor'
on conflict (workspace_id, provider) do nothing;

create table public.marketing_publication_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  client_request_id uuid not null,
  package_fingerprint text not null,
  content_id uuid not null,
  content_revision bigint not null,
  content_snapshot jsonb not null,
  media_pairing_id uuid null,
  media_snapshot jsonb null,
  provider_connection_id uuid not null,
  provider_connection_revision bigint not null,
  provider text not null,
  provider_destination_key text not null,
  provider_destination_label text not null,
  required_disclosures jsonb not null default '[]'::jsonb,
  status text not null default 'needs_review',
  previewed_by uuid null references public.profiles(id) on delete set null,
  previewed_at timestamptz null,
  approved_by uuid null references public.profiles(id) on delete set null,
  approved_at timestamptz null,
  retired_reason text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_publication_packages_workspace_identity unique (workspace_id, id),
  constraint marketing_publication_packages_request_unique unique (workspace_id, client_request_id),
  constraint marketing_publication_packages_fingerprint_unique unique (workspace_id, package_fingerprint),
  constraint marketing_publication_packages_workspace_content foreign key (workspace_id, content_id)
    references public.marketing_content_items(workspace_id, id) on delete restrict,
  constraint marketing_publication_packages_workspace_pairing foreign key (workspace_id, media_pairing_id)
    references public.marketing_content_media_pairings(workspace_id, id) on delete restrict,
  constraint marketing_publication_packages_workspace_connection foreign key (workspace_id, provider_connection_id)
    references public.marketing_provider_connections(workspace_id, id) on delete restrict,
  constraint marketing_publication_packages_fingerprint_check check (package_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint marketing_publication_packages_revision_check check (content_revision >= 1 and provider_connection_revision >= 1),
  constraint marketing_publication_packages_snapshot_check check (
    jsonb_typeof(content_snapshot) = 'object'
    and content_snapshot ?& array['title','body','content_type','content_revision']
    and (media_snapshot is null or jsonb_typeof(media_snapshot) = 'object')
    and jsonb_typeof(required_disclosures) = 'array'
  ),
  constraint marketing_publication_packages_provider_check check (provider in ('facebook','instagram','tiktok')),
  constraint marketing_publication_packages_status_check check (
    status in ('needs_review','ready','scheduled','publishing','published','needs_attention','retired')
  ),
  constraint marketing_publication_packages_review_check check (
    (previewed_by is null and previewed_at is null)
    or (previewed_by is not null and previewed_at is not null)
  ),
  constraint marketing_publication_packages_approval_check check (
    ((approved_by is null and approved_at is null)
      or (approved_by is not null and approved_at is not null))
    and (status not in ('ready','scheduled','publishing','published','needs_attention')
      or (approved_by is not null and approved_at is not null))
  ),
  constraint marketing_publication_packages_retired_reason_check check (
    (status = 'retired' and char_length(btrim(coalesce(retired_reason,''))) between 3 and 500)
    or (status <> 'retired' and retired_reason is null)
  )
);

create index marketing_publication_packages_queue_idx
  on public.marketing_publication_packages(workspace_id, status, updated_at desc, id);

alter table public.marketing_publications
  add column package_id uuid null,
  add column package_fingerprint text null,
  add column provider_connection_revision bigint null,
  add column authorization_action text null,
  add column authorization_request_id uuid null,
  add column authorized_by uuid null references public.profiles(id) on delete set null,
  add column authorized_at timestamptz null,
  add column authorization_timezone text null;

insert into public.marketing_publication_packages (
  id, workspace_id, client_request_id, package_fingerprint,
  content_id, content_revision, content_snapshot, media_pairing_id, media_snapshot,
  provider_connection_id, provider_connection_revision, provider,
  provider_destination_key, provider_destination_label, required_disclosures,
  status, previewed_by, previewed_at, approved_by, approved_at,
  created_by, created_at, updated_at
)
select
  gen_random_uuid(), publication.workspace_id, publication.client_request_id,
  encode(extensions.digest(concat_ws('|', publication.workspace_id::text,
    publication.content_id::text, publication.content_revision::text,
    coalesce(publication.media_pairing_id::text, 'text_only'), publication.provider,
    publication.provider_connection_id::text, connection.identity_revision::text,
    publication.provider_destination_key), 'sha256'), 'hex'),
  publication.content_id, publication.content_revision, publication.content_snapshot,
  publication.media_pairing_id, publication.media_snapshot,
  publication.provider_connection_id, connection.identity_revision,
  publication.provider, publication.provider_destination_key,
  publication.provider_destination_label,
  case when coalesce(publication.media_snapshot->>'ai_narration_disclosure_text','') = ''
    then '[]'::jsonb
    else jsonb_build_array(publication.media_snapshot->>'ai_narration_disclosure_text') end,
  case publication.status
    when 'published' then 'published'
    when 'publishing' then 'publishing'
    when 'failed' then 'needs_attention'
    when 'cancelled' then 'retired'
    else 'scheduled' end,
  publication.created_by, publication.created_at,
  publication.created_by, publication.created_at,
  publication.created_by, publication.created_at, publication.updated_at
from public.marketing_publications publication
join public.marketing_provider_connections connection
  on connection.id = publication.provider_connection_id
order by publication.created_at, publication.id;

update public.marketing_publications publication
set package_id = package.id,
    package_fingerprint = package.package_fingerprint,
    provider_connection_revision = package.provider_connection_revision,
    authorization_action = publication.publication_mode,
    authorization_request_id = publication.client_request_id,
    authorized_by = publication.created_by,
    authorized_at = publication.created_at,
    authorization_timezone = 'UTC'
from public.marketing_publication_packages package
where package.workspace_id = publication.workspace_id
  and package.client_request_id = publication.client_request_id;

alter table public.marketing_publications
  alter column package_id set not null,
  alter column package_fingerprint set not null,
  alter column provider_connection_revision set not null,
  alter column authorization_action set not null,
  alter column authorization_request_id set not null,
  alter column authorized_by set not null,
  alter column authorized_at set not null,
  alter column authorization_timezone set not null,
  add constraint marketing_publications_workspace_package foreign key (workspace_id, package_id)
    references public.marketing_publication_packages(workspace_id, id) on delete restrict,
  add constraint marketing_publications_authorization_request_unique unique (workspace_id, authorization_request_id),
  add constraint marketing_publications_package_fingerprint_check check (package_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint marketing_publications_connection_revision_check check (provider_connection_revision >= 1),
  add constraint marketing_publications_authorization_action_check check (authorization_action in ('publish_now','scheduled')),
  add constraint marketing_publications_authorization_timezone_check check (
    char_length(btrim(authorization_timezone)) between 1 and 100
    and authorization_timezone !~ '[[:cntrl:]]'
  );

create function public.servsync_private_marketing_package_fingerprint(
  p_workspace_id uuid, p_content_id uuid, p_content_revision bigint,
  p_media_pairing_id uuid, p_provider text, p_provider_connection_id uuid,
  p_provider_connection_revision bigint, p_destination_key text
)
returns text language sql immutable set search_path = pg_catalog as $$
  select encode(extensions.digest(concat_ws('|', p_workspace_id::text, p_content_id::text,
    p_content_revision::text, coalesce(p_media_pairing_id::text, 'text_only'),
    p_provider, p_provider_connection_id::text, p_provider_connection_revision::text,
    p_destination_key), 'sha256'), 'hex');
$$;

create or replace function public.servsync_private_guard_marketing_publication_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.package_id is distinct from old.package_id
     or new.package_fingerprint is distinct from old.package_fingerprint
     or new.content_id is distinct from old.content_id
     or new.content_revision is distinct from old.content_revision
     or new.content_snapshot is distinct from old.content_snapshot
     or new.media_pairing_id is distinct from old.media_pairing_id
     or new.media_snapshot is distinct from old.media_snapshot
     or new.provider_connection_id is distinct from old.provider_connection_id
     or new.provider_connection_revision is distinct from old.provider_connection_revision
     or new.provider is distinct from old.provider
     or new.provider_destination_key is distinct from old.provider_destination_key
     or new.provider_destination_label is distinct from old.provider_destination_label
     or new.publication_mode is distinct from old.publication_mode
     or new.scheduled_at is distinct from old.scheduled_at
     or new.client_request_id is distinct from old.client_request_id
     or new.authorization_action is distinct from old.authorization_action
     or new.authorization_request_id is distinct from old.authorization_request_id
     or new.authorized_by is distinct from old.authorized_by
     or new.authorized_at is distinct from old.authorized_at
     or new.authorization_timezone is distinct from old.authorization_timezone
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

drop trigger marketing_publications_provider_enabled on public.marketing_publications;
create or replace function public.servsync_private_guard_marketing_publication_provider_enabled()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from public.marketing_provider_connections connection
    where connection.id = new.provider_connection_id
      and connection.workspace_id = new.workspace_id
      and connection.provider = new.provider
      and connection.connection_status = 'connected'
      and connection.readiness_status = 'ready'
      and connection.identity_revision = new.provider_connection_revision
      and connection.destination_key = new.provider_destination_key
      and coalesce((connection.capabilities->>'publishing_enabled')::boolean, false)
  ) then
    raise exception 'Provider destination is not ready.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.marketing_publication_packages package
    where package.id = new.package_id and package.workspace_id = new.workspace_id
      and package.package_fingerprint = new.package_fingerprint
      and package.status = 'ready'
  ) then
    raise exception 'Approved Marketing package is required.' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger marketing_publications_provider_enabled
  before insert on public.marketing_publications
  for each row execute function public.servsync_private_guard_marketing_publication_provider_enabled();

create function public.servsync_private_guard_marketing_package_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.client_request_id is distinct from old.client_request_id
     or new.package_fingerprint is distinct from old.package_fingerprint
     or new.content_id is distinct from old.content_id
     or new.content_revision is distinct from old.content_revision
     or new.content_snapshot is distinct from old.content_snapshot
     or new.media_pairing_id is distinct from old.media_pairing_id
     or new.media_snapshot is distinct from old.media_snapshot
     or new.provider_connection_id is distinct from old.provider_connection_id
     or new.provider_connection_revision is distinct from old.provider_connection_revision
     or new.provider is distinct from old.provider
     or new.provider_destination_key is distinct from old.provider_destination_key
     or new.provider_destination_label is distinct from old.provider_destination_label
     or new.required_disclosures is distinct from old.required_disclosures
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Marketing package identity is immutable.';
  end if;
  if old.status in ('published','retired') then
    raise exception 'Terminal Marketing packages are immutable.';
  end if;
  return new;
end;
$$;

create trigger marketing_publication_packages_identity
  before update on public.marketing_publication_packages
  for each row execute function public.servsync_private_guard_marketing_package_identity();

create function public.servsync_private_sync_marketing_publication_package()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_next text;
begin
  v_next := case new.status
    when 'scheduled' then 'scheduled'
    when 'publishing' then 'publishing'
    when 'published' then 'published'
    when 'failed' then 'needs_attention'
    when 'cancelled' then 'ready'
  end;
  if v_next is not null then
    update public.marketing_publication_packages
       set status = v_next, updated_at = now()
     where id = new.package_id and workspace_id = new.workspace_id
       and status not in ('published','retired');
  end if;
  return new;
end;
$$;

create trigger marketing_publications_sync_package
  after insert or update of status on public.marketing_publications
  for each row execute function public.servsync_private_sync_marketing_publication_package();

create function public.servsync_private_retire_stale_marketing_packages()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public volatile as $$
begin
  if tg_table_name = 'marketing_content_items' then
    update public.marketing_publication_packages
       set status = 'retired', retired_reason = 'Content revision or approval changed.', updated_at = now()
     where workspace_id = new.workspace_id and content_id = new.id
       and status in ('needs_review','ready')
       and (content_revision <> new.revision_number or new.status <> 'approved');
  elsif tg_table_name = 'marketing_content_media_pairings' then
    update public.marketing_publication_packages
       set status = 'retired', retired_reason = 'Media approval changed.', updated_at = now()
     where workspace_id = new.workspace_id and media_pairing_id = new.id
       and status in ('needs_review','ready') and new.status <> 'approved';
  elsif tg_table_name = 'marketing_provider_connections' then
    update public.marketing_publication_packages
       set status = 'retired', retired_reason = 'Publishing destination changed.', updated_at = now()
     where workspace_id = new.workspace_id and provider_connection_id = new.id
       and status in ('needs_review','ready')
       and (provider_connection_revision <> new.identity_revision
         or new.connection_status <> 'connected'
         or new.readiness_status <> 'ready'
         or provider_destination_key is distinct from new.destination_key);
  end if;
  return new;
end;
$$;

create trigger marketing_content_retire_stale_packages
  after update of revision_number, status on public.marketing_content_items
  for each row execute function public.servsync_private_retire_stale_marketing_packages();
create trigger marketing_pairing_retire_stale_packages
  after update of status on public.marketing_content_media_pairings
  for each row execute function public.servsync_private_retire_stale_marketing_packages();
create trigger marketing_connection_retire_stale_packages
  after update of identity_revision, connection_status, readiness_status, destination_key
  on public.marketing_provider_connections
  for each row execute function public.servsync_private_retire_stale_marketing_packages();

create function public.servsync_get_marketing_publishing(p_contractor_id uuid default null)
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

create function public.servsync_get_marketing_media_catalog(p_contractor_id uuid default null)
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

create function public.servsync_create_marketing_media_pairing(
  p_contractor_id uuid, p_pairing_id uuid, p_content_id uuid,
  p_expected_content_revision bigint, p_asset_id uuid, p_claim_demonstrated text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_content public.marketing_content_items;
  v_asset public.marketing_media_assets; v_pairing public.marketing_content_media_pairings;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,'approve');
  if p_pairing_id is null or char_length(btrim(coalesce(p_claim_demonstrated,''))) not between 10 and 500 then
    raise exception 'Invalid Marketing media pairing.' using errcode='22023';
  end if;
  select * into strict v_content from public.marketing_content_items
    where id=p_content_id and workspace_id=v_workspace_id for share;
  if v_content.status<>'approved' or v_content.revision_number<>p_expected_content_revision then
    raise exception 'Approved current Content is required.' using errcode='55000';
  end if;
  select asset.* into strict v_asset from public.marketing_media_assets asset
    join public.marketing_media_lifecycles lifecycle on lifecycle.asset_id=asset.id and lifecycle.workspace_id=asset.workspace_id
    where asset.id=p_asset_id and asset.workspace_id=v_workspace_id
      and lifecycle.state not in ('purging','purged','abandoned');
  insert into public.marketing_content_media_pairings(
    id,workspace_id,content_id,content_revision,source_direction_id,source_direction_revision,
    asset_id,recorder_scenario,claim_demonstrated,status,created_by
  ) values (
    p_pairing_id,v_workspace_id,v_content.id,v_content.revision_number,
    v_content.source_direction_id,v_content.source_direction_revision,v_asset.id,
    coalesce(v_asset.recorder_scenario,'uploaded-marketing-media'),btrim(p_claim_demonstrated),'candidate',auth.uid()
  ) on conflict (workspace_id,content_id,content_revision,asset_id) do nothing returning * into v_pairing;
  if v_pairing.id is null then
    select * into strict v_pairing from public.marketing_content_media_pairings
      where workspace_id=v_workspace_id and content_id=v_content.id
        and content_revision=v_content.revision_number and asset_id=v_asset.id;
  else
    insert into public.marketing_content_media_pairing_events(
      workspace_id,pairing_id,from_status,to_status,actor_user_id
    ) values(v_workspace_id,v_pairing.id,null,'candidate',auth.uid());
  end if;
  return jsonb_build_object('pairing_id',v_pairing.id,'status',v_pairing.status);
end;
$$;

create function public.servsync_review_marketing_media_pairing(
  p_contractor_id uuid, p_pairing_id uuid, p_decision text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_pairing public.marketing_content_media_pairings;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,'approve');
  if p_decision not in ('approved','rejected') then raise exception 'Invalid media review.' using errcode='22023'; end if;
  select * into strict v_pairing from public.marketing_content_media_pairings
    where id=p_pairing_id and workspace_id=v_workspace_id for update;
  if v_pairing.status='candidate' then
    update public.marketing_content_media_pairings set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now()
      where id=v_pairing.id returning * into v_pairing;
    insert into public.marketing_content_media_pairing_events(workspace_id,pairing_id,from_status,to_status,actor_user_id)
      values(v_workspace_id,v_pairing.id,'candidate',p_decision,auth.uid());
  elsif v_pairing.status='approved' and p_decision='rejected' then
    update public.marketing_content_media_pairings set status='rejected',reviewed_by=auth.uid(),reviewed_at=now()
      where id=v_pairing.id returning * into v_pairing;
    insert into public.marketing_content_media_pairing_events(workspace_id,pairing_id,from_status,to_status,actor_user_id)
      values(v_workspace_id,v_pairing.id,'approved','rejected',auth.uid());
  else
    raise exception 'Media pairing is not reviewable.' using errcode='55000';
  end if;
  return jsonb_build_object('pairing_id',v_pairing.id,'status',v_pairing.status);
end;
$$;

create function public.servsync_prepare_marketing_publication_package(
  p_contractor_id uuid, p_client_request_id uuid, p_content_id uuid,
  p_expected_content_revision bigint, p_media_pairing_id uuid,
  p_provider text, p_provider_connection_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_content public.marketing_content_items;
  v_connection public.marketing_provider_connections; v_pairing public.marketing_content_media_pairings;
  v_asset public.marketing_media_assets; v_package public.marketing_publication_packages;
  v_content_snapshot jsonb; v_media_snapshot jsonb; v_disclosures jsonb := '[]'::jsonb; v_fingerprint text;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,'approve');
  if p_client_request_id is null or p_provider not in ('facebook','instagram','tiktok') then
    raise exception 'Invalid Marketing package request.' using errcode='22023';
  end if;
  select * into strict v_content from public.marketing_content_items
    where id=p_content_id and workspace_id=v_workspace_id for share;
  if v_content.revision_number<>p_expected_content_revision or v_content.status<>'approved'
     or v_content.content_type<>'social_post' or v_content.channel_category is distinct from 'social' then
    raise exception 'Approved Marketing Content changed or is not publishable.' using errcode='40001';
  end if;
  select * into strict v_connection from public.marketing_provider_connections
    where id=p_provider_connection_id and workspace_id=v_workspace_id and provider=p_provider for share;
  if v_connection.connection_status<>'connected' or v_connection.readiness_status<>'ready'
     or v_connection.destination_key is null
     or coalesce((v_connection.capabilities->>'text')::boolean,false) is not true then
    raise exception 'Provider setup is required before preparing this post.' using errcode='55000';
  end if;
  if p_media_pairing_id is not null then
    select * into strict v_pairing from public.marketing_content_media_pairings
      where id=p_media_pairing_id and workspace_id=v_workspace_id
        and content_id=v_content.id and content_revision=v_content.revision_number for share;
    select asset.* into strict v_asset from public.marketing_media_assets asset
      join public.marketing_media_lifecycles lifecycle on lifecycle.asset_id=asset.id and lifecycle.workspace_id=asset.workspace_id
      where asset.id=v_pairing.asset_id and asset.workspace_id=v_workspace_id
        and lifecycle.state not in ('purging','purged','abandoned');
    if coalesce((v_connection.capabilities->>'media')::boolean,false) is not true then
      raise exception 'This destination does not support the selected media.' using errcode='0A000';
    end if;
    v_media_snapshot := jsonb_build_object(
      'pairing_id',v_pairing.id,'pairing_status',v_pairing.status,'asset_id',v_asset.id,
      'asset_type',v_asset.asset_type,'storage_bucket',v_asset.storage_bucket,
      'storage_path',v_asset.storage_path,'poster_bucket',v_asset.poster_bucket,
      'poster_path',v_asset.poster_path,'mime_type',v_asset.mime_type,
      'sha256',v_asset.sha256,'file_size_bytes',v_asset.file_size_bytes,
      'width',v_asset.width,'height',v_asset.height,'duration_seconds',v_asset.duration_seconds,
      'media_variant',v_asset.media_variant,'ai_narration_disclosure_text',v_asset.ai_narration_disclosure_text
    );
    if v_asset.ai_narration_disclosure_required then
      v_disclosures := jsonb_build_array(v_asset.ai_narration_disclosure_text);
    end if;
  elsif exists(select 1 from public.marketing_content_media_pairings pairing
    where pairing.workspace_id=v_workspace_id and pairing.content_id=v_content.id
      and pairing.content_revision=v_content.revision_number and pairing.status='approved') then
    raise exception 'Select the approved media pairing for this post.' using errcode='55000';
  end if;
  v_content_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'title',v_content.title,'body',v_content.body,'content_type',v_content.content_type,
    'channel_category',v_content.channel_category,'content_revision',v_content.revision_number,
    'source_direction_id',v_content.source_direction_id,
    'source_direction_revision',v_content.source_direction_revision
  ));
  v_fingerprint := public.servsync_private_marketing_package_fingerprint(v_workspace_id,
    v_content.id,v_content.revision_number,v_pairing.id,p_provider,v_connection.id,
    v_connection.identity_revision,v_connection.destination_key);
  select * into v_package from public.marketing_publication_packages
    where workspace_id=v_workspace_id and package_fingerprint=v_fingerprint;
  if v_package.id is not null then
    return jsonb_build_object('package_id',v_package.id,'package_fingerprint',v_package.package_fingerprint,
      'status',v_package.status,'replayed',true);
  end if;
  insert into public.marketing_publication_packages(
    workspace_id,client_request_id,package_fingerprint,content_id,content_revision,content_snapshot,
    media_pairing_id,media_snapshot,provider_connection_id,provider_connection_revision,
    provider,provider_destination_key,provider_destination_label,required_disclosures,created_by
  ) values (
    v_workspace_id,p_client_request_id,v_fingerprint,v_content.id,v_content.revision_number,v_content_snapshot,
    v_pairing.id,v_media_snapshot,v_connection.id,v_connection.identity_revision,
    v_connection.provider,v_connection.destination_key,v_connection.destination_label,v_disclosures,auth.uid()
  ) returning * into v_package;
  return jsonb_build_object('package_id',v_package.id,'package_fingerprint',v_package.package_fingerprint,
    'status',v_package.status,'replayed',false);
end;
$$;

create function public.servsync_record_marketing_package_preview(
  p_contractor_id uuid, p_package_id uuid, p_expected_fingerprint text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_package public.marketing_publication_packages;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,'approve');
  select * into strict v_package from public.marketing_publication_packages
    where id=p_package_id and workspace_id=v_workspace_id for update;
  if v_package.package_fingerprint<>p_expected_fingerprint or v_package.status in ('published','retired') then
    raise exception 'Marketing package changed; reload and try again.' using errcode='40001';
  end if;
  update public.marketing_publication_packages set previewed_by=auth.uid(),previewed_at=now(),updated_at=now()
    where id=v_package.id returning * into v_package;
  return jsonb_build_object('package_id',v_package.id,'status',v_package.status,'previewed_at',v_package.previewed_at);
end;
$$;

create function public.servsync_approve_marketing_publication_package(
  p_contractor_id uuid, p_package_id uuid, p_expected_fingerprint text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_package public.marketing_publication_packages;
  v_limit integer; v_count integer;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,'approve');
  select * into strict v_package from public.marketing_publication_packages
    where id=p_package_id and workspace_id=v_workspace_id for update;
  if v_package.package_fingerprint<>p_expected_fingerprint or v_package.status<>'needs_review'
     or v_package.previewed_at is null then
    raise exception 'Preview the exact Marketing package before approval.' using errcode='55000';
  end if;
  if not exists(select 1 from public.marketing_content_items content
    where content.id=v_package.content_id and content.workspace_id=v_workspace_id
      and content.revision_number=v_package.content_revision and content.status='approved') then
    raise exception 'Approved current Content is required.' using errcode='55000';
  end if;
  if v_package.media_pairing_id is not null and not exists(select 1
    from public.marketing_content_media_pairings pairing
    join public.marketing_media_lifecycles lifecycle on lifecycle.asset_id=pairing.asset_id and lifecycle.workspace_id=pairing.workspace_id
    where pairing.id=v_package.media_pairing_id and pairing.workspace_id=v_workspace_id
      and pairing.status='approved' and lifecycle.state not in ('purging','purged','abandoned')) then
    raise exception 'Approved available media is required.' using errcode='55000';
  end if;
  if exists(select 1 from jsonb_array_elements_text(v_package.required_disclosures) disclosure
    where position(disclosure in (v_package.content_snapshot->>'body'))=0) then
    raise exception 'Required public disclosure is missing.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text,37039));
  v_limit := (public.servsync_private_effective_marketing_entitlements(v_workspace_id)->>'ready_scheduled_post_limit')::integer;
  select count(*) into v_count from public.marketing_publication_packages
    where workspace_id=v_workspace_id and status in ('ready','scheduled','publishing');
  if v_count>=v_limit then raise exception 'The beta prepared-post allowance is full.' using errcode='54000'; end if;
  update public.marketing_publication_packages set status='ready',approved_by=auth.uid(),approved_at=now(),updated_at=now()
    where id=v_package.id returning * into v_package;
  return jsonb_build_object('package_id',v_package.id,'status',v_package.status);
end;
$$;

create function public.servsync_authorize_marketing_publication(
  p_contractor_id uuid, p_authorization_request_id uuid,
  p_package_id uuid, p_expected_fingerprint text,
  p_publication_mode text, p_scheduled_at timestamptz,
  p_timezone text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_package public.marketing_publication_packages;
  v_existing public.marketing_publications; v_publication public.marketing_publications; v_when timestamptz;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,'publish');
  if p_authorization_request_id is null then raise exception 'Invalid publication authorization.' using errcode='22023'; end if;
  select * into v_existing from public.marketing_publications
    where workspace_id=v_workspace_id and authorization_request_id=p_authorization_request_id;
  if v_existing.id is not null then
    if v_existing.package_id<>p_package_id or v_existing.package_fingerprint<>p_expected_fingerprint
       or v_existing.publication_mode<>p_publication_mode then
      raise exception 'Publication authorization conflicts with an existing request.' using errcode='23505';
    end if;
    return jsonb_build_object('publication_id',v_existing.id,'package_id',v_existing.package_id,
      'status',v_existing.status,'replayed',true,'provider_publication_id',v_existing.provider_publication_id);
  end if;
  if p_publication_mode not in ('publish_now','scheduled')
     or char_length(btrim(coalesce(p_timezone,''))) not between 1 and 100
     or p_timezone ~ '[[:cntrl:]]' then
    raise exception 'Invalid publication authorization.' using errcode='22023';
  end if;
  v_when := case when p_publication_mode='publish_now' then now() else p_scheduled_at end;
  if v_when is null or (p_publication_mode='scheduled' and v_when<=now()) then
    raise exception 'Scheduled publication time must be in the future.' using errcode='22023';
  end if;
  select * into strict v_package from public.marketing_publication_packages
    where id=p_package_id and workspace_id=v_workspace_id for update;
  if v_package.package_fingerprint<>p_expected_fingerprint or v_package.status<>'ready'
     or v_package.approved_at is null then
    raise exception 'Approved exact Marketing package is required.' using errcode='55000';
  end if;
  if not exists(select 1 from public.marketing_content_items content
    where content.id=v_package.content_id and content.workspace_id=v_workspace_id
      and content.revision_number=v_package.content_revision and content.status='approved') then
    raise exception 'Marketing Content changed; reload and prepare a new package.' using errcode='40001';
  end if;
  if v_package.media_pairing_id is not null and not exists(select 1
    from public.marketing_content_media_pairings pairing
    join public.marketing_media_lifecycles lifecycle
      on lifecycle.asset_id=pairing.asset_id and lifecycle.workspace_id=pairing.workspace_id
    where pairing.id=v_package.media_pairing_id and pairing.workspace_id=v_workspace_id
      and pairing.status='approved' and lifecycle.state not in ('purging','purged','abandoned')) then
    raise exception 'Approved package media changed or is unavailable.' using errcode='55000';
  end if;
  insert into public.marketing_publications(
    workspace_id,package_id,package_fingerprint,content_id,content_revision,content_snapshot,
    media_pairing_id,media_snapshot,provider_connection_id,provider_connection_revision,
    provider,provider_destination_key,provider_destination_label,publication_mode,scheduled_at,
    client_request_id,authorization_action,authorization_request_id,authorized_by,authorized_at,
    authorization_timezone,created_by
  ) values (
    v_workspace_id,v_package.id,v_package.package_fingerprint,v_package.content_id,v_package.content_revision,
    v_package.content_snapshot,v_package.media_pairing_id,v_package.media_snapshot,
    v_package.provider_connection_id,v_package.provider_connection_revision,v_package.provider,
    v_package.provider_destination_key,v_package.provider_destination_label,p_publication_mode,v_when,
    p_authorization_request_id,p_publication_mode,p_authorization_request_id,auth.uid(),now(),btrim(p_timezone),auth.uid()
  ) returning * into v_publication;
  insert into public.marketing_publication_events(
    workspace_id,publication_id,event_sequence,from_status,to_status,reason_category,reason_message,
    attempt_number,actor_user_id
  ) values(v_workspace_id,v_publication.id,1,null,'scheduled','user_authorization',
    case when p_publication_mode='publish_now' then 'Publish Now authorized for the exact package.'
      else 'Scheduled publication authorized for the exact package.' end,0,auth.uid());
  return jsonb_build_object('publication_id',v_publication.id,'package_id',v_publication.package_id,
    'status',v_publication.status,'replayed',false);
end;
$$;

create function public.servsync_cancel_marketing_publication(p_contractor_id uuid,p_publication_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_publication public.marketing_publications; v_sequence smallint;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'publish');
  select * into strict v_publication from public.marketing_publications
    where id=p_publication_id and workspace_id=v_workspace_id for update;
  if v_publication.status<>'scheduled' then raise exception 'Only scheduled publications can be cancelled.' using errcode='55000'; end if;
  select coalesce(max(event_sequence),0)+1 into v_sequence from public.marketing_publication_events where publication_id=v_publication.id;
  update public.marketing_publications set status='cancelled',cancelled_at=now(),retry_eligible=false,updated_at=now() where id=v_publication.id;
  insert into public.marketing_publication_events(workspace_id,publication_id,event_sequence,from_status,to_status,reason_category,reason_message,attempt_number,actor_user_id)
    values(v_workspace_id,v_publication.id,v_sequence,'scheduled','cancelled','user_authorization','Scheduled publication cancelled by an authorized workspace user.',v_publication.attempt_count,auth.uid());
  return jsonb_build_object('publication_id',v_publication.id,'package_id',v_publication.package_id,'status','cancelled');
end;
$$;

create function public.servsync_reschedule_marketing_publication(
  p_contractor_id uuid,p_publication_id uuid,p_authorization_request_id uuid,
  p_scheduled_at timestamptz,p_timezone text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_old public.marketing_publications; v_new public.marketing_publications; v_sequence smallint;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'publish');
  select * into v_new from public.marketing_publications where workspace_id=v_workspace_id and authorization_request_id=p_authorization_request_id;
  if v_new.id is not null then return jsonb_build_object('publication_id',v_new.id,'package_id',v_new.package_id,'status',v_new.status,'replayed',true); end if;
  if p_scheduled_at is null or p_scheduled_at<=now() or char_length(btrim(coalesce(p_timezone,''))) not between 1 and 100 then
    raise exception 'Invalid reschedule authorization.' using errcode='22023';
  end if;
  select * into strict v_old from public.marketing_publications where id=p_publication_id and workspace_id=v_workspace_id for update;
  if v_old.status<>'scheduled' or v_old.provider_request_started_at is not null then
    raise exception 'Publication can no longer be rescheduled.' using errcode='55000';
  end if;
  update public.marketing_publications set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_old.id;
  select coalesce(max(event_sequence),0)+1 into v_sequence from public.marketing_publication_events where publication_id=v_old.id;
  insert into public.marketing_publication_events(workspace_id,publication_id,event_sequence,from_status,to_status,reason_category,reason_message,attempt_number,actor_user_id)
    values(v_workspace_id,v_old.id,v_sequence,'scheduled','cancelled','schedule_changed','Schedule replaced by a new explicit authorization.',v_old.attempt_count,auth.uid());
  update public.marketing_publication_packages set status='ready',updated_at=now() where id=v_old.package_id and status<>'retired';
  insert into public.marketing_publications(
    workspace_id,package_id,package_fingerprint,content_id,content_revision,content_snapshot,
    media_pairing_id,media_snapshot,provider_connection_id,provider_connection_revision,
    provider,provider_destination_key,provider_destination_label,publication_mode,scheduled_at,
    client_request_id,authorization_action,authorization_request_id,authorized_by,authorized_at,
    authorization_timezone,created_by
  ) values (
    v_old.workspace_id,v_old.package_id,v_old.package_fingerprint,v_old.content_id,v_old.content_revision,v_old.content_snapshot,
    v_old.media_pairing_id,v_old.media_snapshot,v_old.provider_connection_id,v_old.provider_connection_revision,
    v_old.provider,v_old.provider_destination_key,v_old.provider_destination_label,'scheduled',p_scheduled_at,
    p_authorization_request_id,'scheduled',p_authorization_request_id,auth.uid(),now(),btrim(p_timezone),auth.uid()
  ) returning * into v_new;
  insert into public.marketing_publication_events(workspace_id,publication_id,event_sequence,from_status,to_status,reason_category,reason_message,attempt_number,actor_user_id)
    values(v_workspace_id,v_new.id,1,null,'scheduled','schedule_changed','Changed schedule authorized for the exact package.',0,auth.uid());
  return jsonb_build_object('publication_id',v_new.id,'package_id',v_new.package_id,'status',v_new.status,'replayed',false);
end;
$$;

create function public.servsync_retry_marketing_publication(
  p_contractor_id uuid,p_publication_id uuid,p_retry_request_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth volatile as $$
declare v_workspace_id uuid; v_publication public.marketing_publications; v_sequence smallint;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'publish');
  select * into strict v_publication from public.marketing_publications where id=p_publication_id and workspace_id=v_workspace_id for update;
  if v_publication.status<>'failed' or not v_publication.retry_eligible
     or v_publication.provider_request_started_at is not null or v_publication.provider_publication_id is not null
     or v_publication.attempt_count>=v_publication.max_attempts then
    raise exception 'A safe retry cannot be proven for this publication.' using errcode='55000';
  end if;
  if exists(select 1 from public.marketing_publication_events where publication_id=v_publication.id
    and reason_category='safe_retry' and reason_message=p_retry_request_id::text) then
    return jsonb_build_object('publication_id',v_publication.id,'package_id',v_publication.package_id,'status',v_publication.status,'replayed',true);
  end if;
  select coalesce(max(event_sequence),0)+1 into v_sequence from public.marketing_publication_events where publication_id=v_publication.id;
  update public.marketing_publications set status='scheduled',retry_eligible=false,failure_category=null,
    failure_message=null,publishing_started_at=null,provider_request_started_at=null,updated_at=now() where id=v_publication.id;
  insert into public.marketing_publication_events(workspace_id,publication_id,event_sequence,from_status,to_status,reason_category,reason_message,attempt_number,actor_user_id)
    values(v_workspace_id,v_publication.id,v_sequence,'failed','scheduled','safe_retry',p_retry_request_id::text,v_publication.attempt_count,auth.uid());
  return jsonb_build_object('publication_id',v_publication.id,'package_id',v_publication.package_id,'status','scheduled','replayed',false);
end;
$$;

create or replace function public.servsync_claim_due_marketing_publications(p_limit integer default 5)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public volatile as $$
declare v_result jsonb; v_provider_submissions_enabled boolean;
begin
  if p_limit not between 1 and 20 then raise exception 'Invalid worker claim limit.' using errcode='22023'; end if;
  select provider_submissions_enabled into strict v_provider_submissions_enabled
    from public.marketing_publishing_controls where singleton;
  with candidates as (
    select publication.id,publication.status as previous_status,
      case when publication.status='publishing' and publication.provider_publication_id is not null then 'reconcile' else 'publish' end as operation
    from public.marketing_publications publication
    join public.marketing_publication_packages package on package.id=publication.package_id and package.workspace_id=publication.workspace_id
    join public.marketing_provider_connections connection on connection.id=publication.provider_connection_id and connection.workspace_id=publication.workspace_id
    where connection.connection_status='connected' and connection.readiness_status='ready'
      and connection.identity_revision=publication.provider_connection_revision
      and connection.destination_key=publication.provider_destination_key
      and coalesce((connection.capabilities->>'publishing_enabled')::boolean,false)
      and publication.authorized_by is not null and publication.authorized_at is not null
      and publication.authorization_request_id is not null
      and package.package_fingerprint=publication.package_fingerprint
      and package.status in ('scheduled','publishing')
      and (v_provider_submissions_enabled
        or (publication.status='publishing' and publication.provider_request_started_at is not null
          and publication.provider_publication_id is not null))
      and ((publication.status='scheduled' and publication.scheduled_at<=now())
        or (publication.status='publishing' and publication.provider_request_started_at is null
          and publication.publishing_started_at<now()-interval '10 minutes')
        or (publication.status='publishing' and publication.provider_request_started_at is not null
          and publication.provider_publication_id is not null
          and publication.provider_operation_state in ('accepted','processing')
          and publication.provider_reconcile_after<=now()
          and publication.provider_reconciliation_count<8))
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
    insert into public.marketing_publication_events(workspace_id,publication_id,event_sequence,from_status,to_status,reason_category,reason_message,attempt_number)
    select updated.workspace_id,updated.id,(select coalesce(max(event_sequence),0)+1 from public.marketing_publication_events where publication_id=updated.id),
      updated.previous_status,'publishing',null,null,updated.attempt_count from updated where updated.operation='publish'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'publication_id',updated.id,'attempt_number',updated.attempt_count,'operation',updated.operation,
    'provider',updated.provider,'provider_connection_id',updated.provider_connection_id,
    'destination_key',updated.provider_destination_key,'content_revision',updated.content_revision,
    'content_snapshot',updated.content_snapshot,'media_pairing_id',updated.media_pairing_id,
    'media_snapshot',updated.media_snapshot,'provider_publication_id',updated.provider_publication_id,
    'provider_metadata',updated.provider_metadata,'provider_reconciliation_count',updated.provider_reconciliation_count
  )),'[]'::jsonb) into v_result from updated;
  return v_result;
end;
$$;

create or replace function public.servsync_prepare_marketing_publication_media(p_publication_id uuid,p_attempt_number integer)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,storage stable as $$
declare v_publication public.marketing_publications; v_connection public.marketing_provider_connections;
  v_pairing public.marketing_content_media_pairings; v_asset public.marketing_media_assets; v_object storage.objects;
begin
  select * into strict v_publication from public.marketing_publications where id=p_publication_id for share;
  if v_publication.status<>'publishing' or v_publication.attempt_count<>p_attempt_number
     or v_publication.provider<>'facebook' or v_publication.media_pairing_id is null
     or jsonb_typeof(v_publication.media_snapshot)<>'object' then
    raise exception 'Managed Marketing publication authorization is invalid.' using errcode='55000';
  end if;
  select * into strict v_connection from public.marketing_provider_connections
    where id=v_publication.provider_connection_id and workspace_id=v_publication.workspace_id
      and provider='facebook' and connection_status='connected' and readiness_status='ready'
      and identity_revision=v_publication.provider_connection_revision
      and destination_key=v_publication.provider_destination_key;
  select * into strict v_pairing from public.marketing_content_media_pairings
    where id=v_publication.media_pairing_id and workspace_id=v_publication.workspace_id
      and content_id=v_publication.content_id and content_revision=v_publication.content_revision and status='approved';
  select * into strict v_asset from public.marketing_media_assets
    where id=v_pairing.asset_id and workspace_id=v_publication.workspace_id;
  if v_publication.media_snapshot->>'asset_id'<>v_asset.id::text
     or v_publication.media_snapshot->>'sha256'<>v_asset.sha256
     or v_publication.media_snapshot->>'storage_path'<>v_asset.storage_path
     or v_asset.mime_type<>'video/mp4' then
    raise exception 'Managed Marketing media no longer matches the immutable package.' using errcode='55000';
  end if;
  select * into strict v_object from storage.objects where bucket_id=v_asset.storage_bucket and name=v_asset.storage_path;
  return jsonb_build_object('pairing_id',v_pairing.id,'asset_id',v_asset.id,
    'storage_bucket',v_asset.storage_bucket,'storage_path',v_asset.storage_path,
    'mime_type',v_asset.mime_type,'file_size_bytes',v_asset.file_size_bytes,'sha256',v_asset.sha256);
end;
$$;

create function public.servsync_get_marketing_publishing_controls()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth stable as $$
declare v_control public.marketing_publishing_controls;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  select * into strict v_control from public.marketing_publishing_controls where singleton;
  return jsonb_build_object('provider_submissions_enabled',v_control.provider_submissions_enabled,
    'updated_at',v_control.updated_at,'reason',v_control.reason);
end;
$$;

create function public.servsync_update_marketing_publishing_controls(p_enabled boolean,p_reason text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth volatile as $$
declare v_control public.marketing_publishing_controls;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Not authorized.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'A control reason is required.' using errcode='22023'; end if;
  update public.marketing_publishing_controls set provider_submissions_enabled=p_enabled,
    reason=btrim(p_reason),updated_by=auth.uid(),updated_at=now() where singleton returning * into v_control;
  return jsonb_build_object('provider_submissions_enabled',v_control.provider_submissions_enabled,
    'updated_at',v_control.updated_at,'reason',v_control.reason);
end;
$$;

create function public.servsync_begin_marketing_facebook_oauth(
  p_contractor_id uuid,p_state_hash bytea,p_redirect_uri text,p_provider_app_key text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,vault volatile as $$
declare v_workspace_id uuid; v_connection public.marketing_provider_connections; v_session_id uuid; v_old_secret_id uuid;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'provider_connection');
  if octet_length(p_state_hash)<>32 or char_length(p_redirect_uri) not between 12 and 500
     or p_redirect_uri !~ '^https://[^[:space:]#]+$' or p_provider_app_key !~ '^[0-9]{3,40}$' then
    raise exception 'Invalid Facebook authorization request.' using errcode='22023';
  end if;
  select * into strict v_connection from public.marketing_provider_connections
    where workspace_id=v_workspace_id and provider='facebook' for update;
  if v_connection.connection_status='connected' then raise exception 'Disconnect Facebook before changing Pages.' using errcode='55000'; end if;
  for v_old_secret_id in select user_token_vault_secret_id from public.marketing_facebook_oauth_sessions
    where workspace_id=v_workspace_id and status in ('pending','callback_received','page_selection_required') and user_token_vault_secret_id is not null
  loop delete from vault.secrets where id=v_old_secret_id; end loop;
  update public.marketing_facebook_oauth_sessions set status='expired',candidate_pages='[]'::jsonb,
    user_token_vault_secret_id=null,updated_at=now() where workspace_id=v_workspace_id and status in ('pending','callback_received','page_selection_required');
  insert into public.marketing_facebook_oauth_sessions(workspace_id,connection_id,state_hash,initiated_by,redirect_uri,provider_app_key,expires_at)
    values(v_workspace_id,v_connection.id,p_state_hash,auth.uid(),p_redirect_uri,p_provider_app_key,now()+interval '10 minutes') returning id into v_session_id;
  update public.marketing_provider_connections set connection_status='setup_required',readiness_status='authorization_pending',
    provider_app_key=p_provider_app_key,readiness_note='Facebook authorization is waiting for consent.',disconnected_at=null,updated_at=now()
    where id=v_connection.id;
  return jsonb_build_object('session_id',v_session_id,'expires_at',now()+interval '10 minutes');
end;
$$;

create function public.servsync_authorize_marketing_facebook_page_selection(
  p_contractor_id uuid,p_session_id uuid,p_page_id text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth stable as $$
declare v_workspace_id uuid; v_session public.marketing_facebook_oauth_sessions; v_page jsonb;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'provider_connection');
  select * into strict v_session from public.marketing_facebook_oauth_sessions
    where id=p_session_id and workspace_id=v_workspace_id and initiated_by=auth.uid()
      and status='page_selection_required' and expires_at>now() for share;
  select value into v_page from jsonb_array_elements(v_session.candidate_pages) where value->>'page_id'=p_page_id;
  if v_page is null or coalesce((v_page->>'eligible')::boolean,false) is not true then raise exception 'Select an eligible Page.' using errcode='22023'; end if;
  return jsonb_build_object('session_id',v_session.id,'connection_id',v_session.connection_id,'page_id',p_page_id);
end;
$$;

create function public.servsync_authorize_marketing_facebook_recheck(p_contractor_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth stable as $$
declare v_workspace_id uuid; v_connection public.marketing_provider_connections;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'provider_connection');
  select * into strict v_connection from public.marketing_provider_connections
    where workspace_id=v_workspace_id and provider='facebook' and connection_status='connected';
  return jsonb_build_object('connection_id',v_connection.id,'page_id',v_connection.destination_key,'page_name',v_connection.destination_label);
end;
$$;

create function public.servsync_disconnect_marketing_facebook(p_contractor_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,vault volatile as $$
declare v_workspace_id uuid; v_connection public.marketing_provider_connections; v_secret_id uuid; v_session_secret_id uuid;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'provider_connection');
  select * into strict v_connection from public.marketing_provider_connections
    where workspace_id=v_workspace_id and provider='facebook' for update;
  select vault_secret_id into v_secret_id from public.marketing_provider_connection_secrets where connection_id=v_connection.id;
  delete from public.marketing_provider_connection_secrets where connection_id=v_connection.id;
  if v_secret_id is not null then delete from vault.secrets where id=v_secret_id; end if;
  for v_session_secret_id in select user_token_vault_secret_id from public.marketing_facebook_oauth_sessions
    where connection_id=v_connection.id and user_token_vault_secret_id is not null
  loop delete from vault.secrets where id=v_session_secret_id; end loop;
  update public.marketing_facebook_oauth_sessions set status=case when status='connected' then status else 'expired' end,
    candidate_pages='[]'::jsonb,user_token_vault_secret_id=null,updated_at=now()
    where connection_id=v_connection.id and status not in ('failed','expired');
  update public.marketing_provider_connections set connection_status='disabled',readiness_status='disconnected',
    destination_key=null,destination_label=null,provider_account_key=null,granted_capabilities='[]'::jsonb,
    token_expires_at=null,connected_by=null,connected_at=null,last_validated_at=null,disconnected_at=now(),
    capabilities='{"text":true,"media":true,"publishing_enabled":true}'::jsonb,
    readiness_note='Facebook is disconnected. Connect again to authorize a Page.',updated_at=now() where id=v_connection.id;
  return jsonb_build_object('connection_id',v_connection.id,'readiness_status','disconnected');
end;
$$;

create or replace function public.servsync_private_complete_marketing_facebook_page(
  p_session_id uuid,p_page_id text,p_page_name text,p_page_tasks jsonb,
  p_page_access_token text,p_token_expires_at timestamptz
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,vault volatile as $$
declare v_session public.marketing_facebook_oauth_sessions; v_candidate jsonb; v_secret_id uuid; v_old_secret_id uuid;
begin
  if p_page_id!~'^[0-9]{3,80}$' or char_length(btrim(p_page_name)) not between 1 and 200
     or jsonb_typeof(p_page_tasks)<>'array' or not (p_page_tasks @> '["CREATE_CONTENT"]'::jsonb)
     or char_length(coalesce(p_page_access_token,''))<20 then raise exception 'Invalid Facebook Page result.' using errcode='22023'; end if;
  select * into strict v_session from public.marketing_facebook_oauth_sessions where id=p_session_id for update;
  if v_session.status<>'page_selection_required' or v_session.expires_at<=now() then raise exception 'Facebook Page selection is unavailable.' using errcode='55000'; end if;
  select value into v_candidate from jsonb_array_elements(v_session.candidate_pages) where value->>'page_id'=p_page_id;
  if v_candidate is null or coalesce((v_candidate->>'eligible')::boolean,false) is not true then raise exception 'Facebook Page was not authorized.' using errcode='22023'; end if;
  v_secret_id:=vault.create_secret(p_page_access_token,'servsync-marketing-facebook-page-'||v_session.connection_id::text,'Workspace-scoped Facebook Page access token.');
  select vault_secret_id into v_old_secret_id from public.marketing_provider_connection_secrets where connection_id=v_session.connection_id;
  delete from public.marketing_provider_connection_secrets where connection_id=v_session.connection_id;
  if v_old_secret_id is not null then delete from vault.secrets where id=v_old_secret_id; end if;
  insert into public.marketing_provider_connection_secrets(connection_id,workspace_id,provider,vault_secret_id,token_kind)
    values(v_session.connection_id,v_session.workspace_id,'facebook',v_secret_id,'page_access_token');
  update public.marketing_provider_connections set connection_status='connected',readiness_status='ready',
    destination_key=p_page_id,destination_label=btrim(p_page_name),
    capabilities='{"text":true,"media":true,"publishing_enabled":true}'::jsonb,
    readiness_note='Connected and ready for an explicitly authorized publication.',
    token_expires_at=coalesce(p_token_expires_at,v_session.token_expires_at),connected_by=v_session.initiated_by,
    connected_at=now(),last_validated_at=now(),disconnected_at=null,updated_at=now() where id=v_session.connection_id;
  delete from vault.secrets where id=v_session.user_token_vault_secret_id;
  update public.marketing_facebook_oauth_sessions set status='connected',candidate_pages='[]'::jsonb,
    user_token_vault_secret_id=null,completed_at=now(),updated_at=now() where id=v_session.id;
  return jsonb_build_object('connection_id',v_session.connection_id,'page_id',p_page_id,'readiness_status','ready');
exception when others then
  if v_secret_id is not null then delete from vault.secrets where id=v_secret_id; end if;
  raise;
end;
$$;

create or replace function public.servsync_private_record_marketing_facebook_recheck(
  p_connection_id uuid,p_page_id text,p_page_name text,p_page_tasks jsonb
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public volatile as $$
begin
  if jsonb_typeof(p_page_tasks)<>'array' or not (p_page_tasks @> '["CREATE_CONTENT"]'::jsonb) then raise exception 'Invalid Facebook capability result.' using errcode='22023'; end if;
  update public.marketing_provider_connections set destination_label=btrim(p_page_name),readiness_status='ready',
    capabilities=jsonb_set(jsonb_set(capabilities,'{media}','true'::jsonb,true),'{publishing_enabled}','true'::jsonb,true),
    readiness_note='Connected and ready for an explicitly authorized publication.',last_validated_at=now(),updated_at=now()
    where id=p_connection_id and provider='facebook' and connection_status='connected' and destination_key=p_page_id;
  if not found then raise exception 'Facebook Page identity changed or is unavailable.' using errcode='55000'; end if;
  return jsonb_build_object('connection_id',p_connection_id,'readiness_status','ready');
end;
$$;

-- Existing publication completion/failure functions drive package status via
-- the trigger above. Purge claims must also protect approved/authorized package
-- media before a publication row exists.
create or replace function public.servsync_claim_marketing_media_purges(p_limit integer default 5)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public volatile as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 20 then raise exception 'Invalid Marketing media purge limit.' using errcode='22023'; end if;
  with eligible as (
    select lifecycle.asset_id,lifecycle.workspace_id,lifecycle.state as previous_state,gen_random_uuid() as claim_token
    from public.marketing_media_lifecycles lifecycle
    join public.marketing_media_assets asset on asset.id=lifecycle.asset_id and asset.workspace_id=lifecycle.workspace_id
    where not lifecycle.retained_permanently
      and ((lifecycle.state in ('retention','abandoned') and lifecycle.purge_after<=now())
        or (lifecycle.state='uploaded' and lifecycle.last_activity_at<=now()-make_interval(days =>
          (public.servsync_private_effective_marketing_entitlements(lifecycle.workspace_id)->>'abandoned_media_expiration_days')::integer)))
      and not exists(select 1 from public.marketing_publication_packages package
        where package.workspace_id=lifecycle.workspace_id and package.media_snapshot->>'asset_id'=lifecycle.asset_id::text
          and package.status in ('ready','scheduled','publishing','needs_attention'))
      and not exists(select 1 from public.marketing_publications publication
        where publication.workspace_id=lifecycle.workspace_id and publication.media_snapshot->>'asset_id'=lifecycle.asset_id::text
          and (publication.status in ('scheduled','publishing') or (publication.status='failed' and publication.provider_publication_id is not null)))
    order by coalesce(lifecycle.purge_after,lifecycle.last_activity_at),lifecycle.asset_id
    for update of lifecycle skip locked limit p_limit
  ), updated as (
    update public.marketing_media_lifecycles lifecycle set state='purging',purge_claimed_at=now(),
      purge_claim_token=eligible.claim_token,purge_previous_state=eligible.previous_state,updated_at=now()
    from eligible where lifecycle.asset_id=eligible.asset_id returning lifecycle.*,eligible.previous_state
  ), events as (
    insert into public.marketing_media_lifecycle_events(workspace_id,asset_id,from_state,to_state,reason,metadata)
    select workspace_id,asset_id,previous_state,'purging','Exact managed-media purge claimed.',jsonb_build_object('claim_token',purge_claim_token) from updated
  )
  select coalesce(jsonb_agg(jsonb_build_object('workspace_id',updated.workspace_id,'asset_id',updated.asset_id,
    'claim_token',updated.purge_claim_token,'storage_bucket',asset.storage_bucket,'storage_path',asset.storage_path,
    'sha256',asset.sha256,'file_size_bytes',asset.file_size_bytes,'poster_bucket',asset.poster_bucket,
    'poster_path',asset.poster_path,'source_kind',intake.source_kind,'source_bucket',intake.source_bucket,
    'source_path',intake.source_path,'delete_source_with_asset',intake.source_kind='marketing_upload' and intake.source_path=asset.storage_path,
    'previous_state',updated.previous_state) order by updated.asset_id),'[]'::jsonb) into v_result
  from updated join public.marketing_media_assets asset on asset.id=updated.asset_id
  left join public.marketing_media_intakes intake on intake.id=asset.source_intake_id;
  return v_result;
end;
$$;

alter table public.marketing_publication_packages enable row level security;
alter table public.marketing_publication_packages force row level security;
alter table public.marketing_publishing_controls enable row level security;
alter table public.marketing_publishing_controls force row level security;

revoke all on table public.marketing_publication_packages,public.marketing_publishing_controls
  from public,anon,authenticated,service_role;

do $$ declare v_signature text; begin
  foreach v_signature in array array[
    'servsync_private_bump_marketing_provider_identity()',
    'servsync_private_seed_marketing_provider_connections()',
    'servsync_private_marketing_package_fingerprint(uuid,uuid,bigint,uuid,text,uuid,bigint,text)',
    'servsync_private_guard_marketing_package_identity()',
    'servsync_private_sync_marketing_publication_package()',
    'servsync_private_retire_stale_marketing_packages()',
    'servsync_get_marketing_publishing(uuid)',
    'servsync_get_marketing_media_catalog(uuid)',
    'servsync_create_marketing_media_pairing(uuid,uuid,uuid,bigint,uuid,text)',
    'servsync_review_marketing_media_pairing(uuid,uuid,text)',
    'servsync_prepare_marketing_publication_package(uuid,uuid,uuid,bigint,uuid,text,uuid)',
    'servsync_record_marketing_package_preview(uuid,uuid,text)',
    'servsync_approve_marketing_publication_package(uuid,uuid,text)',
    'servsync_authorize_marketing_publication(uuid,uuid,uuid,text,text,timestamptz,text)',
    'servsync_cancel_marketing_publication(uuid,uuid)',
    'servsync_reschedule_marketing_publication(uuid,uuid,uuid,timestamptz,text)',
    'servsync_retry_marketing_publication(uuid,uuid,uuid)',
    'servsync_get_marketing_publishing_controls()',
    'servsync_update_marketing_publishing_controls(boolean,text)',
    'servsync_begin_marketing_facebook_oauth(uuid,bytea,text,text)',
    'servsync_authorize_marketing_facebook_page_selection(uuid,uuid,text)',
    'servsync_authorize_marketing_facebook_recheck(uuid)',
    'servsync_disconnect_marketing_facebook(uuid)'
  ] loop
    execute format('alter function public.%s owner to postgres',v_signature);
    execute format('revoke all on function public.%s from public,anon,authenticated,service_role',v_signature);
  end loop;
end $$;

grant execute on function public.servsync_get_marketing_publishing(uuid) to authenticated;
grant execute on function public.servsync_get_marketing_media_catalog(uuid) to authenticated;
grant execute on function public.servsync_create_marketing_media_pairing(uuid,uuid,uuid,bigint,uuid,text) to authenticated;
grant execute on function public.servsync_review_marketing_media_pairing(uuid,uuid,text) to authenticated;
grant execute on function public.servsync_prepare_marketing_publication_package(uuid,uuid,uuid,bigint,uuid,text,uuid) to authenticated;
grant execute on function public.servsync_record_marketing_package_preview(uuid,uuid,text) to authenticated;
grant execute on function public.servsync_approve_marketing_publication_package(uuid,uuid,text) to authenticated;
grant execute on function public.servsync_authorize_marketing_publication(uuid,uuid,uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.servsync_cancel_marketing_publication(uuid,uuid) to authenticated;
grant execute on function public.servsync_reschedule_marketing_publication(uuid,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.servsync_retry_marketing_publication(uuid,uuid,uuid) to authenticated;
grant execute on function public.servsync_get_marketing_publishing_controls() to authenticated;
grant execute on function public.servsync_update_marketing_publishing_controls(boolean,text) to authenticated;
grant execute on function public.servsync_begin_marketing_facebook_oauth(uuid,bytea,text,text) to authenticated;
grant execute on function public.servsync_authorize_marketing_facebook_page_selection(uuid,uuid,text) to authenticated;
grant execute on function public.servsync_authorize_marketing_facebook_recheck(uuid) to authenticated;
grant execute on function public.servsync_disconnect_marketing_facebook(uuid) to authenticated;

revoke all on function public.servsync_claim_due_marketing_publications(integer) from public,anon,authenticated;
revoke all on function public.servsync_prepare_marketing_publication_media(uuid,integer) from public,anon,authenticated;
revoke all on function public.servsync_claim_marketing_media_purges(integer) from public,anon,authenticated;
grant execute on function public.servsync_claim_due_marketing_publications(integer) to service_role;
grant execute on function public.servsync_prepare_marketing_publication_media(uuid,integer) to service_role;
grant execute on function public.servsync_claim_marketing_media_purges(integer) to service_role;

notify pgrst,'reload schema';
commit;
