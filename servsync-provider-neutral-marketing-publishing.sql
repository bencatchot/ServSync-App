-- ServSync Provider-Neutral Marketing Publishing Foundation v1.
--
-- Adds durable, workspace-scoped provider readiness, immutable approved-copy
-- snapshots, bounded publication lifecycle/history, and purpose-bound worker
-- RPCs. It does not connect a provider or publish a public post.

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.marketing_workspaces') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null then
    raise exception 'Missing Marketing publishing prerequisite.';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'marketing_provider_connections',
    'marketing_publications',
    'marketing_publication_events'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Marketing publishing target public.% already exists.', v_name;
    end if;
  end loop;
end;
$$;

create table public.marketing_provider_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  provider text not null,
  priority smallint not null,
  connection_status text not null default 'setup_required',
  destination_key text null,
  destination_label text null,
  capabilities jsonb not null,
  readiness_note text not null,
  connected_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint marketing_provider_connections_unique unique (workspace_id, provider),
  constraint marketing_provider_connections_provider_check check (provider in ('facebook', 'instagram', 'tiktok')),
  constraint marketing_provider_connections_priority_check check (priority between 1 and 20),
  constraint marketing_provider_connections_status_check check (connection_status in ('setup_required', 'connected', 'disabled', 'error')),
  constraint marketing_provider_connections_destination_check check (
    (connection_status = 'connected' and destination_key is not null and destination_label is not null and connected_at is not null)
    or (connection_status <> 'connected' and destination_key is null and destination_label is null and connected_at is null)
  ),
  constraint marketing_provider_connections_capabilities_check check (
    jsonb_typeof(capabilities) = 'object'
    and jsonb_typeof(capabilities -> 'text') = 'boolean'
    and jsonb_typeof(capabilities -> 'media') = 'boolean'
  ),
  constraint marketing_provider_connections_note_check check (char_length(btrim(readiness_note)) between 3 and 500)
);

create table public.marketing_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  content_id uuid not null references public.marketing_content_items(id) on delete restrict,
  content_revision bigint not null,
  content_snapshot jsonb not null,
  provider_connection_id uuid not null references public.marketing_provider_connections(id) on delete restrict,
  provider text not null,
  provider_destination_key text not null,
  provider_destination_label text not null,
  publication_mode text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 3,
  retry_eligible boolean not null default false,
  client_request_id uuid not null,
  provider_publication_id text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  failure_category text null,
  failure_message text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  publishing_started_at timestamptz null,
  provider_request_started_at timestamptz null,
  published_at timestamptz null,
  cancelled_at timestamptz null,
  constraint marketing_publications_request_unique unique (workspace_id, client_request_id),
  constraint marketing_publications_content_revision_check check (content_revision >= 1),
  constraint marketing_publications_snapshot_check check (
    jsonb_typeof(content_snapshot) = 'object'
    and content_snapshot ? 'title'
    and content_snapshot ? 'body'
    and content_snapshot ? 'content_type'
    and content_snapshot ? 'content_revision'
  ),
  constraint marketing_publications_provider_check check (provider in ('facebook', 'instagram', 'tiktok')),
  constraint marketing_publications_mode_check check (publication_mode in ('publish_now', 'scheduled')),
  constraint marketing_publications_status_check check (status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  constraint marketing_publications_attempt_check check (attempt_count between 0 and max_attempts and max_attempts between 1 and 5),
  constraint marketing_publications_failure_category_check check (
    failure_category is null or failure_category in (
      'provider_auth', 'provider_permission', 'rate_limit', 'content_validation',
      'temporary_provider', 'provider_uncertain', 'unsupported', 'internal'
    )
  ),
  constraint marketing_publications_failure_message_check check (failure_message is null or char_length(failure_message) between 3 and 500),
  constraint marketing_publications_terminal_shape_check check (
    (status = 'published' and provider_publication_id is not null and published_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and published_at is null and provider_publication_id is null)
    or (status in ('scheduled', 'publishing', 'failed') and published_at is null and cancelled_at is null and provider_publication_id is null)
  )
);

create index marketing_publications_due_idx
  on public.marketing_publications(status, scheduled_at, id)
  where status in ('scheduled', 'publishing');
create index marketing_publications_workspace_history_idx
  on public.marketing_publications(workspace_id, created_at desc, id);

create table public.marketing_publication_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  publication_id uuid not null references public.marketing_publications(id) on delete restrict,
  event_sequence smallint not null,
  from_status text null,
  to_status text not null,
  reason_category text null,
  reason_message text null,
  attempt_number smallint not null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint marketing_publication_events_sequence_unique unique (publication_id, event_sequence),
  constraint marketing_publication_events_sequence_check check (event_sequence >= 1),
  constraint marketing_publication_events_from_check check (from_status is null or from_status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  constraint marketing_publication_events_to_check check (to_status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  constraint marketing_publication_events_attempt_check check (attempt_number >= 0),
  constraint marketing_publication_events_reason_check check (reason_message is null or char_length(reason_message) between 3 and 500)
);

insert into public.marketing_provider_connections (
  id, workspace_id, provider, priority, capabilities, readiness_note
) values
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000037', 'facebook', 1,
   '{"text":true,"media":false}'::jsonb, 'Setup required: no approved ServSync Facebook Page connection is configured.'),
  ('00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000037', 'instagram', 2,
   '{"text":false,"media":true}'::jsonb, 'Setup required: Instagram media publishing is not connected or enabled.'),
  ('00000000-0000-4000-8000-000000000063', '00000000-0000-4000-8000-000000000037', 'tiktok', 3,
   '{"text":false,"media":true}'::jsonb, 'Setup required: TikTok Content Posting access is not connected or enabled.');

create function public.servsync_private_guard_marketing_publication_event()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Marketing publication history is append-only.';
end;
$$;

create trigger marketing_publication_events_immutable
  before update or delete on public.marketing_publication_events
  for each row execute function public.servsync_private_guard_marketing_publication_event();
create trigger marketing_publication_events_no_truncate
  before truncate on public.marketing_publication_events
  for each statement execute function public.servsync_private_guard_marketing_publication_event();

create function public.servsync_private_guard_marketing_publication_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.content_id is distinct from old.content_id
     or new.content_revision is distinct from old.content_revision
     or new.content_snapshot is distinct from old.content_snapshot
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
  if old.status in ('published', 'cancelled') then
    raise exception 'Terminal Marketing publications are immutable.';
  end if;
  return new;
end;
$$;

create trigger marketing_publications_identity_immutable
  before update on public.marketing_publications
  for each row execute function public.servsync_private_guard_marketing_publication_identity();

create function public.servsync_get_internal_marketing_publishing()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth stable
as $$
declare v_workspace_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select id into v_workspace_id from public.marketing_workspaces
   where workspace_key = 'servsync_internal' and workspace_kind = 'internal' and contractor_id is null;
  return jsonb_build_object(
    'providers', coalesce((select jsonb_agg(jsonb_build_object(
      'connection_id', connection.id, 'provider', connection.provider, 'priority', connection.priority,
      'connection_status', connection.connection_status, 'destination_label', connection.destination_label,
      'capabilities', connection.capabilities, 'readiness_note', connection.readiness_note,
      'connected_at', connection.connected_at
    ) order by connection.priority) from public.marketing_provider_connections connection where connection.workspace_id = v_workspace_id), '[]'::jsonb),
    'publications', coalesce((select jsonb_agg(jsonb_build_object(
      'publication_id', publication.id, 'content_id', publication.content_id,
      'content_revision', publication.content_revision, 'content_snapshot', publication.content_snapshot,
      'provider', publication.provider, 'destination_label', publication.provider_destination_label,
      'publication_mode', publication.publication_mode, 'scheduled_at', publication.scheduled_at,
      'status', publication.status, 'attempt_count', publication.attempt_count,
      'max_attempts', publication.max_attempts, 'retry_eligible', publication.retry_eligible,
      'provider_publication_id', publication.provider_publication_id,
      'failure_category', publication.failure_category, 'failure_message', publication.failure_message,
      'created_at', publication.created_at, 'publishing_started_at', publication.publishing_started_at,
      'published_at', publication.published_at, 'cancelled_at', publication.cancelled_at
    ) order by publication.created_at desc, publication.id) from public.marketing_publications publication where publication.workspace_id = v_workspace_id), '[]'::jsonb)
  );
end;
$$;

create function public.servsync_create_internal_marketing_publication(
  p_client_request_id uuid, p_content_id uuid, p_expected_content_revision bigint,
  p_provider text, p_provider_connection_id uuid, p_publication_mode text,
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
  v_schedule timestamptz;
  v_snapshot jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_content_id is null or p_expected_content_revision is null
     or p_provider not in ('facebook', 'instagram', 'tiktok')
     or p_publication_mode not in ('publish_now', 'scheduled') then
    raise exception 'Invalid Marketing publication request.' using errcode = '22023';
  end if;
  v_schedule := case when p_publication_mode = 'publish_now' then now() else p_scheduled_at end;
  if v_schedule is null or (p_publication_mode = 'scheduled' and v_schedule <= now()) then
    raise exception 'Scheduled publication time must be in the future.' using errcode = '22023';
  end if;
  select id into v_workspace_id from public.marketing_workspaces
   where workspace_key = 'servsync_internal' and workspace_kind = 'internal' and contractor_id is null;
  select * into v_content from public.marketing_content_items
   where id = p_content_id and workspace_id = v_workspace_id for share;
  if v_content.id is null then raise exception 'Marketing content not found.' using errcode = 'P0002'; end if;
  if v_content.status <> 'approved' then raise exception 'Approved Marketing content is required.' using errcode = '55000'; end if;
  if v_content.revision_number <> p_expected_content_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode = '40001';
  end if;
  if v_content.content_type <> 'social_post' or v_content.channel_category is distinct from 'social' then
    raise exception 'This content is not eligible for social publishing.' using errcode = '22023';
  end if;
  if v_content.body ~* '(^|[[:space:]])(file://|/users/|/private/tmp/|~/documents/)' then
    raise exception 'Local media paths cannot be published or persisted.' using errcode = '22023';
  end if;
  select * into v_connection from public.marketing_provider_connections
   where id = p_provider_connection_id and workspace_id = v_workspace_id and provider = p_provider for share;
  if v_connection.id is null then raise exception 'Provider destination is unavailable.' using errcode = 'P0002'; end if;
  if v_connection.connection_status <> 'connected' then
    raise exception 'Provider setup is required before publishing.' using errcode = '55000';
  end if;
  if coalesce((v_connection.capabilities ->> 'text')::boolean, false) is not true then
    raise exception 'Provider does not support text publishing in this release.' using errcode = '0A000';
  end if;
  v_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'title', v_content.title, 'body', v_content.body, 'content_type', v_content.content_type,
    'channel_category', v_content.channel_category, 'content_revision', v_content.revision_number,
    'preparation_source', v_content.preparation_source, 'content_role', v_content.content_role,
    'source_plan_id', v_content.source_plan_id, 'source_plan_revision', v_content.source_plan_revision,
    'source_plan_item_index', v_content.source_plan_item_index,
    'source_direction_id', v_content.source_direction_id, 'source_direction_revision', v_content.source_direction_revision
  ));
  insert into public.marketing_publications (
    workspace_id, content_id, content_revision, content_snapshot, provider_connection_id,
    provider, provider_destination_key, provider_destination_label, publication_mode,
    scheduled_at, client_request_id, created_by
  ) values (
    v_workspace_id, v_content.id, v_content.revision_number, v_snapshot, v_connection.id,
    v_connection.provider, v_connection.destination_key, v_connection.destination_label,
    p_publication_mode, v_schedule, p_client_request_id, auth.uid()
  ) on conflict (workspace_id, client_request_id) do nothing returning * into v_publication;
  if v_publication.id is null then
    select * into v_publication from public.marketing_publications
     where workspace_id = v_workspace_id and client_request_id = p_client_request_id;
    if v_publication.content_id <> v_content.id or v_publication.content_revision <> v_content.revision_number
       or v_publication.provider_connection_id <> v_connection.id or v_publication.publication_mode <> p_publication_mode
       or (p_publication_mode = 'scheduled' and v_publication.scheduled_at <> v_schedule) then
      raise exception 'Marketing publication request conflicts with an existing request.' using errcode = '23505';
    end if;
    return jsonb_build_object('publication_id', v_publication.id, 'status', v_publication.status, 'replayed', true);
  end if;
  insert into public.marketing_publication_events (
    workspace_id, publication_id, event_sequence, from_status, to_status, attempt_number, actor_user_id
  ) values (v_workspace_id, v_publication.id, 1, null, 'scheduled', 0, auth.uid());
  return jsonb_build_object('publication_id', v_publication.id, 'status', v_publication.status, 'replayed', false);
end;
$$;

create function public.servsync_cancel_internal_marketing_publication(p_publication_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_publication public.marketing_publications; v_sequence smallint;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select publication.* into v_publication from public.marketing_publications publication
  join public.marketing_workspaces workspace on workspace.id = publication.workspace_id
  where publication.id = p_publication_id and workspace.workspace_key = 'servsync_internal'
  for update of publication;
  if v_publication.id is null then raise exception 'Marketing publication not found.' using errcode = 'P0002'; end if;
  if v_publication.status <> 'scheduled' then raise exception 'Only scheduled publications can be cancelled.' using errcode = '55000'; end if;
  select coalesce(max(event_sequence), 0) + 1 into v_sequence from public.marketing_publication_events where publication_id = v_publication.id;
  update public.marketing_publications set status='cancelled', cancelled_at=now(), updated_at=now(), retry_eligible=false where id=v_publication.id;
  insert into public.marketing_publication_events values (gen_random_uuid(), v_publication.workspace_id, v_publication.id, v_sequence, 'scheduled', 'cancelled', null, null, v_publication.attempt_count, auth.uid(), now());
  return jsonb_build_object('publication_id', v_publication.id, 'status', 'cancelled');
end;
$$;

create function public.servsync_retry_internal_marketing_publication(p_publication_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_publication public.marketing_publications; v_sequence smallint;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select publication.* into v_publication from public.marketing_publications publication
  join public.marketing_workspaces workspace on workspace.id = publication.workspace_id
  where publication.id = p_publication_id and workspace.workspace_key = 'servsync_internal'
  for update of publication;
  if v_publication.id is null then raise exception 'Marketing publication not found.' using errcode = 'P0002'; end if;
  if v_publication.status <> 'failed' or not v_publication.retry_eligible or v_publication.attempt_count >= v_publication.max_attempts then
    raise exception 'Marketing publication is not eligible for retry.' using errcode = '55000';
  end if;
  select coalesce(max(event_sequence), 0) + 1 into v_sequence from public.marketing_publication_events where publication_id = v_publication.id;
  update public.marketing_publications set status='scheduled', updated_at=now(), retry_eligible=false,
    failure_category=null, failure_message=null, publishing_started_at=null, provider_request_started_at=null where id=v_publication.id;
  insert into public.marketing_publication_events values (gen_random_uuid(), v_publication.workspace_id, v_publication.id, v_sequence, 'failed', 'scheduled', null, null, v_publication.attempt_count, auth.uid(), now());
  return jsonb_build_object('publication_id', v_publication.id, 'status', 'scheduled');
end;
$$;

create function public.servsync_claim_due_marketing_publications(p_limit integer default 5)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 20 then raise exception 'Invalid worker claim limit.' using errcode = '22023'; end if;
  with candidates as (
    select publication.id, publication.status as previous_status from public.marketing_publications publication
    join public.marketing_provider_connections connection on connection.id = publication.provider_connection_id
    where connection.connection_status = 'connected' and (
      (publication.status = 'scheduled' and publication.scheduled_at <= now())
      or (publication.status = 'publishing' and publication.provider_request_started_at is null and publication.publishing_started_at < now() - interval '10 minutes')
    )
    order by publication.scheduled_at, publication.id
    for update of publication skip locked limit p_limit
  ), updated as (
    update public.marketing_publications publication
       set status='publishing', attempt_count=publication.attempt_count+1,
           publishing_started_at=now(), provider_request_started_at=null,
           retry_eligible=false, updated_at=now()
      from candidates where publication.id=candidates.id
      returning publication.*, candidates.previous_status
  ), events as (
    insert into public.marketing_publication_events (
      workspace_id, publication_id, event_sequence, from_status, to_status,
      reason_category, reason_message, attempt_number
    ) select updated.workspace_id, updated.id,
      (select coalesce(max(event_sequence),0)+1 from public.marketing_publication_events where publication_id=updated.id),
      updated.previous_status, 'publishing', null, null, updated.attempt_count from updated
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'publication_id', updated.id, 'attempt_number', updated.attempt_count,
    'provider', updated.provider, 'destination_key', updated.provider_destination_key,
    'content_snapshot', updated.content_snapshot
  )), '[]'::jsonb) into v_result from updated;
  return v_result;
end;
$$;

create function public.servsync_mark_marketing_provider_request_started(p_publication_id uuid, p_attempt_number integer)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.marketing_publications set provider_request_started_at=now(), updated_at=now()
   where id=p_publication_id and status='publishing' and attempt_count=p_attempt_number and provider_request_started_at is null;
  if not found then raise exception 'Marketing publication claim is stale.' using errcode = '40001'; end if;
end;
$$;

create function public.servsync_complete_marketing_publication(
  p_publication_id uuid, p_attempt_number integer, p_provider_publication_id text, p_provider_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_publication public.marketing_publications; v_sequence smallint;
begin
  if p_provider_publication_id is null or char_length(btrim(p_provider_publication_id)) not between 1 and 300
     or jsonb_typeof(coalesce(p_provider_metadata,'{}'::jsonb)) <> 'object' then
    raise exception 'Invalid provider publication result.' using errcode = '22023';
  end if;
  select * into v_publication from public.marketing_publications where id=p_publication_id for update;
  if v_publication.status <> 'publishing' or v_publication.attempt_count <> p_attempt_number or v_publication.provider_request_started_at is null then
    raise exception 'Marketing publication claim is stale.' using errcode = '40001';
  end if;
  select coalesce(max(event_sequence),0)+1 into v_sequence from public.marketing_publication_events where publication_id=v_publication.id;
  update public.marketing_publications set status='published', provider_publication_id=btrim(p_provider_publication_id),
    provider_metadata=coalesce(p_provider_metadata,'{}'::jsonb), published_at=now(), updated_at=now(), retry_eligible=false where id=v_publication.id;
  insert into public.marketing_publication_events values (gen_random_uuid(), v_publication.workspace_id, v_publication.id, v_sequence, 'publishing', 'published', null, null, v_publication.attempt_count, null, now());
end;
$$;

create function public.servsync_fail_marketing_publication(
  p_publication_id uuid, p_attempt_number integer, p_failure_category text,
  p_failure_message text, p_retry_eligible boolean
)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_publication public.marketing_publications; v_sequence smallint; v_retry boolean;
begin
  if p_failure_category not in ('provider_auth','provider_permission','rate_limit','content_validation','temporary_provider','provider_uncertain','unsupported','internal')
     or char_length(btrim(coalesce(p_failure_message,''))) not between 3 and 500 then
    raise exception 'Invalid publication failure.' using errcode = '22023';
  end if;
  select * into v_publication from public.marketing_publications where id=p_publication_id for update;
  if v_publication.status <> 'publishing' or v_publication.attempt_count <> p_attempt_number then
    raise exception 'Marketing publication claim is stale.' using errcode = '40001';
  end if;
  v_retry := p_retry_eligible and p_failure_category in ('rate_limit','temporary_provider') and v_publication.attempt_count < v_publication.max_attempts and v_publication.provider_request_started_at is null;
  select coalesce(max(event_sequence),0)+1 into v_sequence from public.marketing_publication_events where publication_id=v_publication.id;
  update public.marketing_publications set status='failed', retry_eligible=v_retry,
    failure_category=p_failure_category, failure_message=btrim(p_failure_message), updated_at=now() where id=v_publication.id;
  insert into public.marketing_publication_events values (gen_random_uuid(), v_publication.workspace_id, v_publication.id, v_sequence, 'publishing', 'failed', p_failure_category, btrim(p_failure_message), v_publication.attempt_count, null, now());
end;
$$;

alter table public.marketing_provider_connections owner to postgres;
alter table public.marketing_publications owner to postgres;
alter table public.marketing_publication_events owner to postgres;

alter function public.servsync_private_guard_marketing_publication_event() owner to postgres;
alter function public.servsync_private_guard_marketing_publication_identity() owner to postgres;
alter function public.servsync_get_internal_marketing_publishing() owner to postgres;
alter function public.servsync_create_internal_marketing_publication(uuid,uuid,bigint,text,uuid,text,timestamptz) owner to postgres;
alter function public.servsync_cancel_internal_marketing_publication(uuid) owner to postgres;
alter function public.servsync_retry_internal_marketing_publication(uuid) owner to postgres;
alter function public.servsync_claim_due_marketing_publications(integer) owner to postgres;
alter function public.servsync_mark_marketing_provider_request_started(uuid,integer) owner to postgres;
alter function public.servsync_complete_marketing_publication(uuid,integer,text,jsonb) owner to postgres;
alter function public.servsync_fail_marketing_publication(uuid,integer,text,text,boolean) owner to postgres;

alter table public.marketing_provider_connections enable row level security;
alter table public.marketing_provider_connections force row level security;
alter table public.marketing_publications enable row level security;
alter table public.marketing_publications force row level security;
alter table public.marketing_publication_events enable row level security;
alter table public.marketing_publication_events force row level security;

revoke all on table public.marketing_provider_connections, public.marketing_publications, public.marketing_publication_events from public, anon, authenticated, service_role;

revoke all on function public.servsync_private_guard_marketing_publication_event() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_marketing_publication_identity() from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_internal_marketing_publishing() from public, anon, authenticated, service_role;
revoke all on function public.servsync_create_internal_marketing_publication(uuid,uuid,bigint,text,uuid,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.servsync_cancel_internal_marketing_publication(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_retry_internal_marketing_publication(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_claim_due_marketing_publications(integer) from public, anon, authenticated, service_role;
revoke all on function public.servsync_mark_marketing_provider_request_started(uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.servsync_complete_marketing_publication(uuid,integer,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_fail_marketing_publication(uuid,integer,text,text,boolean) from public, anon, authenticated, service_role;

grant execute on function public.servsync_get_internal_marketing_publishing() to authenticated;
grant execute on function public.servsync_create_internal_marketing_publication(uuid,uuid,bigint,text,uuid,text,timestamptz) to authenticated;
grant execute on function public.servsync_cancel_internal_marketing_publication(uuid) to authenticated;
grant execute on function public.servsync_retry_internal_marketing_publication(uuid) to authenticated;

revoke all on function public.servsync_claim_due_marketing_publications(integer) from public, anon, authenticated;
revoke all on function public.servsync_mark_marketing_provider_request_started(uuid,integer) from public, anon, authenticated;
revoke all on function public.servsync_complete_marketing_publication(uuid,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.servsync_fail_marketing_publication(uuid,integer,text,text,boolean) from public, anon, authenticated;
grant execute on function public.servsync_claim_due_marketing_publications(integer) to service_role;
grant execute on function public.servsync_mark_marketing_provider_request_started(uuid,integer) to service_role;
grant execute on function public.servsync_complete_marketing_publication(uuid,integer,text,jsonb) to service_role;
grant execute on function public.servsync_fail_marketing_publication(uuid,integer,text,text,boolean) to service_role;

notify pgrst, 'reload schema';
commit;
