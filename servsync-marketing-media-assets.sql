-- ServSync Marketing Media Assets and Content Pairing v1.
--
-- Adds a private, platform-admin-only asset boundary for validated Demo-recorder
-- MP4s and immutable exact-revision content/media pairings. This migration does
-- not enable provider media publishing or create a public publication.

begin;

do $$
begin
  if to_regclass('public.marketing_workspaces') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null then
    raise exception 'Missing Marketing media prerequisite.';
  end if;
  if to_regclass('public.marketing_media_assets') is not null
     or to_regclass('public.marketing_content_media_pairings') is not null
     or to_regclass('public.marketing_content_media_pairing_events') is not null then
    raise exception 'Marketing media target already exists.';
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-assets', 'marketing-assets', false, 104857600, array['video/mp4']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.marketing_media_assets (
  id uuid primary key,
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  asset_type text not null,
  source text not null,
  recorder_scenario text not null,
  source_commit text not null,
  storage_bucket text not null default 'marketing-assets',
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  width integer not null,
  height integer not null,
  duration_seconds numeric(10,3) not null,
  sha256 text not null,
  validation_status text not null,
  sensitive_data_check text not null,
  pacing_review text not null,
  pacing_reviewed_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint marketing_media_assets_storage_unique unique (storage_bucket, storage_path),
  constraint marketing_media_assets_checksum_unique unique (workspace_id, sha256),
  constraint marketing_media_assets_type_check check (asset_type = 'video'),
  constraint marketing_media_assets_source_check check (source = 'demo_recorder'),
  constraint marketing_media_assets_scenario_check check (recorder_scenario ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint marketing_media_assets_commit_check check (source_commit ~ '^[a-f0-9]{40}$'),
  constraint marketing_media_assets_bucket_check check (storage_bucket = 'marketing-assets'),
  constraint marketing_media_assets_path_check check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/servsync-[a-z0-9-]+-v[0-9]+-[0-9TZ-]+\.mp4$'
  ),
  constraint marketing_media_assets_mime_check check (mime_type = 'video/mp4'),
  constraint marketing_media_assets_size_check check (file_size_bytes between 1 and 104857600),
  constraint marketing_media_assets_dimensions_check check (width between 320 and 4096 and height between 240 and 2160),
  constraint marketing_media_assets_duration_check check (duration_seconds > 0 and duration_seconds <= 300),
  constraint marketing_media_assets_sha_check check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint marketing_media_assets_validation_check check (validation_status = 'passed'),
  constraint marketing_media_assets_sensitive_check check (sensitive_data_check = 'passed'),
  constraint marketing_media_assets_pacing_check check (pacing_review = 'passed')
);

create table public.marketing_content_media_pairings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  content_id uuid not null references public.marketing_content_items(id) on delete restrict,
  content_revision bigint not null,
  source_direction_id uuid null,
  source_direction_revision bigint null,
  asset_id uuid not null references public.marketing_media_assets(id) on delete restrict,
  recorder_scenario text not null,
  claim_demonstrated text not null,
  status text not null default 'candidate',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_by uuid null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz null,
  constraint marketing_content_media_pairings_unique unique (workspace_id, content_id, content_revision, asset_id),
  constraint marketing_content_media_pairings_revision_check check (content_revision >= 1),
  constraint marketing_content_media_pairings_direction_check check (
    (source_direction_id is null and source_direction_revision is null)
    or (source_direction_id is not null and source_direction_revision >= 1)
  ),
  constraint marketing_content_media_pairings_scenario_check check (recorder_scenario ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint marketing_content_media_pairings_claim_check check (char_length(btrim(claim_demonstrated)) between 10 and 500),
  constraint marketing_content_media_pairings_status_check check (status in ('candidate', 'approved', 'rejected')),
  constraint marketing_content_media_pairings_review_check check (
    (status = 'candidate' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index marketing_content_media_one_approved_idx
  on public.marketing_content_media_pairings(workspace_id, content_id, content_revision)
  where status = 'approved';

create table public.marketing_content_media_pairing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  pairing_id uuid not null references public.marketing_content_media_pairings(id) on delete restrict,
  from_status text null,
  to_status text not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint marketing_content_media_pairing_events_status_check check (
    (from_status is null or from_status in ('candidate', 'approved'))
    and to_status in ('candidate', 'approved', 'rejected')
  )
);

create function public.servsync_private_guard_marketing_media_asset()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Marketing media assets are immutable.';
end;
$$;

create trigger marketing_media_assets_immutable
  before update or delete on public.marketing_media_assets
  for each row execute function public.servsync_private_guard_marketing_media_asset();

create trigger marketing_media_assets_no_truncate
  before truncate on public.marketing_media_assets
  for each statement execute function public.servsync_private_guard_marketing_media_asset();

create function public.servsync_private_guard_marketing_media_pairing()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.content_id is distinct from old.content_id
     or new.content_revision is distinct from old.content_revision
     or new.source_direction_id is distinct from old.source_direction_id
     or new.source_direction_revision is distinct from old.source_direction_revision
     or new.asset_id is distinct from old.asset_id
     or new.recorder_scenario is distinct from old.recorder_scenario
     or new.claim_demonstrated is distinct from old.claim_demonstrated
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Marketing content/media pairing identity is immutable.';
  end if;
  if old.status = 'rejected'
     or (old.status = 'approved' and new.status <> 'rejected')
     or (old.status = 'candidate' and new.status not in ('approved', 'rejected')) then
    raise exception 'Invalid Marketing content/media pairing transition.';
  end if;
  return new;
end;
$$;

create trigger marketing_content_media_pairing_identity
  before update on public.marketing_content_media_pairings
  for each row execute function public.servsync_private_guard_marketing_media_pairing();

create trigger marketing_content_media_pairings_no_truncate
  before truncate on public.marketing_content_media_pairings
  for each statement execute function public.servsync_private_guard_marketing_media_asset();

create function public.servsync_private_guard_marketing_media_pairing_event()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Marketing media review history is append-only.';
end;
$$;

create trigger marketing_content_media_pairing_events_immutable
  before update or delete on public.marketing_content_media_pairing_events
  for each row execute function public.servsync_private_guard_marketing_media_pairing_event();

create trigger marketing_content_media_pairing_events_no_truncate
  before truncate on public.marketing_content_media_pairing_events
  for each statement execute function public.servsync_private_guard_marketing_media_pairing_event();

create function public.servsync_private_marketing_asset_is_registered(p_storage_path text)
returns boolean
language sql security definer
set search_path = pg_catalog, public stable
as $$
  select public.current_user_is_platform_admin() and exists (
    select 1 from public.marketing_media_assets asset
    where asset.storage_bucket = 'marketing-assets' and asset.storage_path = p_storage_path
  );
$$;

create function public.servsync_register_and_pair_internal_marketing_media_asset(
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
  p_claim_demonstrated text
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
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select id into strict v_workspace_id from public.marketing_workspaces
   where workspace_key = 'servsync_internal' and workspace_kind = 'internal' and contractor_id is null;
  if p_asset_id is null or p_pairing_id is null or p_content_id is null
     or p_recorder_scenario !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_mime_type <> 'video/mp4'
     or p_file_size_bytes not between 1 and 104857600
     or p_width not between 320 and 4096
     or p_height not between 240 and 2160
     or p_duration_seconds <= 0 or p_duration_seconds > 300
     or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_pacing_reviewed_at is null or p_pacing_reviewed_at > now() + interval '1 minute'
     or char_length(btrim(coalesce(p_claim_demonstrated, ''))) not between 10 and 500 then
    raise exception 'Invalid Marketing media metadata.' using errcode = '22023';
  end if;
  select * into strict v_content from public.marketing_content_items
   where id = p_content_id and workspace_id = v_workspace_id for share;
  if v_content.status <> 'approved' then
    raise exception 'Marketing content is not approved.' using errcode = '55000';
  end if;
  if v_content.revision_number <> p_expected_content_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode = '40001';
  end if;
  v_expected_path := v_workspace_id::text || '/' || p_asset_id::text || '/' || split_part(p_storage_path, '/', 3);
  if p_storage_path <> v_expected_path
     or split_part(p_storage_path, '/', 3) !~ '^servsync-[a-z0-9-]+-v[0-9]+-[0-9TZ-]+\.mp4$' then
    raise exception 'Invalid Marketing media storage identity.' using errcode = '22023';
  end if;
  select * into strict v_object from storage.objects
   where bucket_id = 'marketing-assets' and name = p_storage_path;
  if coalesce(v_object.metadata->>'mimetype', '') <> p_mime_type
     or coalesce((v_object.metadata->>'size')::bigint, -1) <> p_file_size_bytes then
    raise exception 'Marketing media Storage metadata mismatch.' using errcode = '22023';
  end if;
  insert into public.marketing_media_assets (
    id, workspace_id, asset_type, source, recorder_scenario, source_commit,
    storage_path, mime_type, file_size_bytes, width, height, duration_seconds,
    sha256, validation_status, sensitive_data_check, pacing_review,
    pacing_reviewed_at, created_by
  ) values (
    p_asset_id, v_workspace_id, 'video', 'demo_recorder', p_recorder_scenario, p_source_commit,
    p_storage_path, p_mime_type, p_file_size_bytes, p_width, p_height, p_duration_seconds,
    p_sha256, 'passed', 'passed', 'passed', p_pacing_reviewed_at, auth.uid()
  );
  insert into public.marketing_content_media_pairings (
    id, workspace_id, content_id, content_revision, source_direction_id,
    source_direction_revision, asset_id, recorder_scenario, claim_demonstrated,
    created_by
  ) values (
    p_pairing_id, v_workspace_id, v_content.id, v_content.revision_number,
    v_content.source_direction_id, v_content.source_direction_revision,
    p_asset_id, p_recorder_scenario, btrim(p_claim_demonstrated), auth.uid()
  );
  insert into public.marketing_content_media_pairing_events (
    workspace_id, pairing_id, from_status, to_status, actor_user_id
  ) values (v_workspace_id, p_pairing_id, null, 'candidate', auth.uid());
  return jsonb_build_object(
    'asset_id', p_asset_id,
    'pairing_id', p_pairing_id,
    'status', 'candidate'
  );
end;
$$;

create function public.servsync_review_internal_marketing_media_pairing(
  p_pairing_id uuid,
  p_decision text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_workspace_id uuid;
  v_pairing public.marketing_content_media_pairings;
  v_from text;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid media review decision.' using errcode = '22023'; end if;
  select id into strict v_workspace_id from public.marketing_workspaces
   where workspace_key = 'servsync_internal' and workspace_kind = 'internal' and contractor_id is null;
  select * into strict v_pairing from public.marketing_content_media_pairings
   where id = p_pairing_id and workspace_id = v_workspace_id for update;
  v_from := v_pairing.status;
  if v_from = 'rejected' or (v_from = 'approved' and p_decision = 'approved') then
    raise exception 'Media pairing decision is already terminal.' using errcode = '55000';
  end if;
  update public.marketing_content_media_pairings set
    status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_pairing_id;
  insert into public.marketing_content_media_pairing_events (
    workspace_id, pairing_id, from_status, to_status, actor_user_id
  ) values (v_workspace_id, p_pairing_id, v_from, p_decision, auth.uid());
  return jsonb_build_object('pairing_id', p_pairing_id, 'status', p_decision);
end;
$$;

create function public.servsync_get_internal_marketing_media()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth stable
as $$
declare v_workspace_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select id into strict v_workspace_id from public.marketing_workspaces
   where workspace_key = 'servsync_internal' and workspace_kind = 'internal' and contractor_id is null;
  return jsonb_build_object(
    'workspace_id', v_workspace_id,
    'assets', coalesce((select jsonb_agg(jsonb_build_object(
      'asset_id', asset.id, 'asset_type', asset.asset_type, 'source', asset.source,
      'recorder_scenario', asset.recorder_scenario, 'source_commit', asset.source_commit,
      'storage_bucket', asset.storage_bucket, 'storage_path', asset.storage_path,
      'mime_type', asset.mime_type, 'file_size_bytes', asset.file_size_bytes,
      'width', asset.width, 'height', asset.height, 'duration_seconds', asset.duration_seconds,
      'sha256', asset.sha256, 'validation_status', asset.validation_status,
      'sensitive_data_check', asset.sensitive_data_check, 'pacing_review', asset.pacing_review,
      'pacing_reviewed_at', asset.pacing_reviewed_at, 'created_at', asset.created_at
    ) order by asset.created_at desc, asset.id) from public.marketing_media_assets asset
      where asset.workspace_id = v_workspace_id), '[]'::jsonb),
    'pairings', coalesce((select jsonb_agg(jsonb_build_object(
      'pairing_id', pairing.id, 'content_id', pairing.content_id,
      'content_revision', pairing.content_revision, 'source_direction_id', pairing.source_direction_id,
      'source_direction_revision', pairing.source_direction_revision, 'asset_id', pairing.asset_id,
      'recorder_scenario', pairing.recorder_scenario, 'claim_demonstrated', pairing.claim_demonstrated,
      'status', pairing.status, 'created_at', pairing.created_at,
      'reviewed_at', pairing.reviewed_at
    ) order by pairing.created_at desc, pairing.id) from public.marketing_content_media_pairings pairing
      where pairing.workspace_id = v_workspace_id), '[]'::jsonb)
  );
end;
$$;

alter table public.marketing_media_assets enable row level security;
alter table public.marketing_media_assets force row level security;
alter table public.marketing_content_media_pairings enable row level security;
alter table public.marketing_content_media_pairings force row level security;
alter table public.marketing_content_media_pairing_events enable row level security;
alter table public.marketing_content_media_pairing_events force row level security;

drop policy if exists marketing_assets_platform_admin_read on storage.objects;
create policy marketing_assets_platform_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'marketing-assets' and public.current_user_is_platform_admin());
drop policy if exists marketing_assets_platform_admin_upload on storage.objects;
create policy marketing_assets_platform_admin_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketing-assets'
    and public.current_user_is_platform_admin()
    and name ~ '^00000000-0000-4000-8000-000000000037/[0-9a-f-]{36}/servsync-[a-z0-9-]+-v[0-9]+-[0-9TZ-]+\.mp4$'
  );
drop policy if exists marketing_assets_platform_admin_cleanup on storage.objects;
create policy marketing_assets_platform_admin_cleanup on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketing-assets'
    and public.current_user_is_platform_admin()
    and not public.servsync_private_marketing_asset_is_registered(name)
  );

alter function public.servsync_private_guard_marketing_media_asset() owner to postgres;
alter function public.servsync_private_guard_marketing_media_pairing() owner to postgres;
alter function public.servsync_private_guard_marketing_media_pairing_event() owner to postgres;
alter function public.servsync_private_marketing_asset_is_registered(text) owner to postgres;
alter function public.servsync_register_and_pair_internal_marketing_media_asset(uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamptz,text) owner to postgres;
alter function public.servsync_review_internal_marketing_media_pairing(uuid,text) owner to postgres;
alter function public.servsync_get_internal_marketing_media() owner to postgres;

revoke all on table public.marketing_media_assets, public.marketing_content_media_pairings,
  public.marketing_content_media_pairing_events from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_marketing_media_asset() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_marketing_media_pairing() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_guard_marketing_media_pairing_event() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_marketing_asset_is_registered(text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_register_and_pair_internal_marketing_media_asset(uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamptz,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_review_internal_marketing_media_pairing(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_internal_marketing_media() from public, anon, authenticated, service_role;

grant execute on function public.servsync_private_marketing_asset_is_registered(text) to authenticated;
grant execute on function public.servsync_register_and_pair_internal_marketing_media_asset(uuid,uuid,uuid,bigint,text,text,text,text,bigint,integer,integer,numeric,text,timestamptz,text) to authenticated;
grant execute on function public.servsync_review_internal_marketing_media_pairing(uuid,text) to authenticated;
grant execute on function public.servsync_get_internal_marketing_media() to authenticated;

commit;
