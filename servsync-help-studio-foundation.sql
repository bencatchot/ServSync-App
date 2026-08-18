-- ServSync Admin Help Studio + contextual walkthrough foundation v1.
--
-- Adds durable private walkthrough media, immutable help revisions,
-- deterministic retrieval, contextual mappings, and a lightweight support-gap
-- foundation. Authoring remains ServSync platform-admin only. Published
-- playback is role-aware and does not expose private Storage paths.

begin;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'profiles', 'contractor_profiles', 'contractor_team_members',
    'marketing_workspaces', 'marketing_media_assets', 'marketing_media_lifecycles', 'storage.buckets',
    'storage.objects'
  ] loop
    if to_regclass(v_name) is null and to_regclass('public.' || v_name) is null then
      raise exception 'Missing Help Studio prerequisite %.', v_name;
    end if;
  end loop;

  if not exists (
    select 1 from public.marketing_workspaces
     where id = '00000000-0000-4000-8000-000000000037'
       and workspace_key = 'servsync_internal'
       and workspace_kind = 'internal'
       and contractor_id is null
  ) then
    raise exception 'Canonical ServSync internal workspace is missing.';
  end if;

  foreach v_name in array array[
    'help_media_assets', 'help_walkthroughs', 'help_walkthrough_revisions',
    'help_walkthrough_contexts', 'help_support_gaps', 'help_marketing_derivatives'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Help Studio target table public.% already exists.', v_name;
    end if;
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'help-walkthroughs',
  'help-walkthroughs',
  false,
  104857600,
  array['video/mp4', 'image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.help_media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  asset_kind text not null,
  upload_status text not null default 'upload_pending',
  storage_bucket text not null default 'help-walkthroughs',
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  sha256 text null,
  width integer null,
  height integer null,
  duration_seconds numeric(10,3) null,
  source_kind text not null default 'admin_upload',
  source_commit text null,
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  finalized_at timestamptz null,
  constraint help_assets_workspace_identity unique (workspace_id, id),
  constraint help_assets_storage_unique unique (storage_bucket, storage_path),
  constraint help_assets_kind_check check (asset_kind in ('video', 'poster')),
  constraint help_assets_status_check check (upload_status in ('upload_pending', 'ready', 'failed')),
  constraint help_assets_bucket_check check (storage_bucket = 'help-walkthroughs'),
  constraint help_assets_file_name_check check (
    char_length(original_file_name) between 1 and 180
    and original_file_name !~ '[\\/]'
    and original_file_name !~ '[[:cntrl:]]'
  ),
  constraint help_assets_mime_check check (
    (asset_kind = 'video' and mime_type = 'video/mp4')
    or (asset_kind = 'poster' and mime_type in ('image/png', 'image/jpeg', 'image/webp'))
  ),
  constraint help_assets_size_check check (file_size_bytes between 1 and 104857600),
  constraint help_assets_sha_check check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint help_assets_dimensions_check check (
    (width is null and height is null)
    or (width between 320 and 4096 and height between 180 and 2160)
  ),
  constraint help_assets_duration_check check (
    (asset_kind = 'poster' and duration_seconds is null)
    or (asset_kind = 'video' and (duration_seconds is null or duration_seconds between 1 and 600))
  ),
  constraint help_assets_commit_check check (source_commit is null or source_commit ~ '^[a-f0-9]{40}$'),
  constraint help_assets_finalized_check check (
    (upload_status = 'ready' and sha256 is not null and width is not null and height is not null and finalized_at is not null)
    or upload_status <> 'ready'
  )
);

create table public.help_walkthroughs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  slug text not null,
  state text not null default 'draft',
  purpose text not null default 'support',
  current_revision integer not null default 1,
  published_revision integer null,
  supersedes_id uuid null references public.help_walkthroughs(id) on delete restrict,
  deprecated_by_id uuid null references public.help_walkthroughs(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  archived_at timestamptz null,
  constraint help_walkthroughs_workspace_identity unique (workspace_id, id),
  constraint help_walkthroughs_slug_unique unique (workspace_id, slug),
  constraint help_walkthroughs_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 100),
  constraint help_walkthroughs_state_check check (state in ('draft', 'published', 'needs_review', 'deprecated', 'archived')),
  constraint help_walkthroughs_purpose_check check (purpose in ('support', 'marketing', 'both')),
  constraint help_walkthroughs_revision_check check (current_revision >= 1 and (published_revision is null or published_revision between 1 and current_revision)),
  constraint help_walkthroughs_publish_check check (
    (state = 'published' and published_revision is not null and published_at is not null)
    or state <> 'published'
  ),
  constraint help_walkthroughs_archive_check check (
    (state = 'archived' and archived_at is not null) or state <> 'archived'
  ),
  constraint help_walkthroughs_lineage_check check (supersedes_id is distinct from id and deprecated_by_id is distinct from id)
);

create table public.help_walkthrough_revisions (
  workspace_id uuid not null,
  walkthrough_id uuid not null,
  revision_number integer not null,
  title text not null,
  summary text not null,
  steps text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  feature_area text not null,
  audience_roles text[] not null,
  purpose text not null,
  source_commit text null,
  source_version text null,
  video_asset_id uuid null,
  poster_asset_id uuid null,
  human_paced_review text not null default 'pending',
  sensitive_data_review text not null default 'pending',
  canonical_output_review text not null default 'pending',
  validation_status text not null default 'draft',
  narration_provider text null,
  narration_voice text null,
  narration_disclosure text null,
  transcript text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (walkthrough_id, revision_number),
  constraint help_revisions_workspace_parent foreign key (workspace_id, walkthrough_id)
    references public.help_walkthroughs(workspace_id, id) on delete restrict,
  constraint help_revisions_video_parent foreign key (workspace_id, video_asset_id)
    references public.help_media_assets(workspace_id, id) on delete restrict,
  constraint help_revisions_poster_parent foreign key (workspace_id, poster_asset_id)
    references public.help_media_assets(workspace_id, id) on delete restrict,
  constraint help_revisions_number_check check (revision_number >= 1),
  constraint help_revisions_title_check check (char_length(btrim(title)) between 3 and 140),
  constraint help_revisions_summary_check check (char_length(btrim(summary)) between 10 and 600),
  constraint help_revisions_steps_check check (cardinality(steps) between 1 and 30),
  constraint help_revisions_keywords_check check (cardinality(keywords) between 1 and 40),
  constraint help_revisions_feature_check check (char_length(btrim(feature_area)) between 2 and 80),
  constraint help_revisions_audience_check check (
    cardinality(audience_roles) between 1 and 7
    and audience_roles <@ array['platform_admin','owner','admin','office','field_tech','viewer','homeowner']::text[]
  ),
  constraint help_revisions_purpose_check check (purpose in ('support', 'marketing', 'both')),
  constraint help_revisions_commit_check check (source_commit is null or source_commit ~ '^[a-f0-9]{40}$'),
  constraint help_revisions_review_check check (
    human_paced_review in ('pending','passed','failed')
    and sensitive_data_review in ('pending','passed','failed')
    and canonical_output_review in ('pending','passed','failed')
  ),
  constraint help_revisions_validation_check check (validation_status in ('draft','passed','failed','needs_review')),
  constraint help_revisions_asset_distinct check (poster_asset_id is null or poster_asset_id is distinct from video_asset_id),
  constraint help_revisions_narration_check check (
    (narration_provider is null and narration_voice is null and narration_disclosure is null)
    or (narration_provider is not null and narration_voice is not null and narration_disclosure is not null)
  )
);

create table public.help_walkthrough_contexts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  walkthrough_id uuid not null,
  revision_number integer not null,
  route_context text not null,
  priority smallint not null default 100,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint help_contexts_revision_parent foreign key (walkthrough_id, revision_number)
    references public.help_walkthrough_revisions(walkthrough_id, revision_number) on delete restrict,
  constraint help_contexts_workspace_parent foreign key (workspace_id, walkthrough_id)
    references public.help_walkthroughs(workspace_id, id) on delete restrict,
  constraint help_contexts_unique unique (workspace_id, walkthrough_id, revision_number, route_context),
  constraint help_contexts_route_check check (route_context ~ '^[a-z0-9]+(?:[._/-][a-z0-9]+)*$' and char_length(route_context) between 3 and 120),
  constraint help_contexts_priority_check check (priority between 1 and 1000)
);

create table public.help_support_gaps (
  id uuid primary key default gen_random_uuid(),
  normalized_question text not null,
  route_context text null,
  actor_role text not null,
  occurrence_count integer not null default 1,
  first_requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  resolved_by_walkthrough_id uuid null references public.help_walkthroughs(id) on delete restrict,
  constraint help_gaps_unique unique nulls not distinct (normalized_question, route_context, actor_role),
  constraint help_gaps_question_check check (char_length(normalized_question) between 3 and 240),
  constraint help_gaps_route_check check (route_context is null or char_length(route_context) between 3 and 120),
  constraint help_gaps_role_check check (actor_role in ('platform_admin','owner','admin','office','field_tech','viewer','homeowner')),
  constraint help_gaps_count_check check (occurrence_count >= 1)
);

create table public.help_marketing_derivatives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  walkthrough_id uuid not null,
  walkthrough_revision integer not null,
  help_asset_id uuid not null,
  marketing_asset_id uuid not null,
  source_sha256 text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint help_marketing_derivatives_revision_parent foreign key (walkthrough_id, walkthrough_revision)
    references public.help_walkthrough_revisions(walkthrough_id, revision_number) on delete restrict,
  constraint help_marketing_derivatives_help_asset_parent foreign key (workspace_id, help_asset_id)
    references public.help_media_assets(workspace_id, id) on delete restrict,
  constraint help_marketing_derivatives_marketing_asset_parent foreign key (workspace_id, marketing_asset_id)
    references public.marketing_media_assets(workspace_id, id) on delete restrict,
  constraint help_marketing_derivatives_unique unique (workspace_id, walkthrough_id, walkthrough_revision, marketing_asset_id),
  constraint help_marketing_derivatives_sha_check check (source_sha256 ~ '^[a-f0-9]{64}$')
);

create index help_walkthroughs_state_idx on public.help_walkthroughs (workspace_id, state, updated_at desc);
create index help_revisions_feature_idx on public.help_walkthrough_revisions (workspace_id, lower(feature_area));
create index help_contexts_route_idx on public.help_walkthrough_contexts (route_context, priority, walkthrough_id);
create index help_assets_usage_idx on public.help_media_assets (workspace_id, upload_status, asset_kind);
create index help_gaps_frequency_idx on public.help_support_gaps (occurrence_count desc, last_requested_at desc);
create index help_marketing_derivatives_source_idx on public.help_marketing_derivatives (workspace_id, walkthrough_id, walkthrough_revision);

alter table public.help_media_assets enable row level security;
alter table public.help_media_assets force row level security;
alter table public.help_walkthroughs enable row level security;
alter table public.help_walkthroughs force row level security;
alter table public.help_walkthrough_revisions enable row level security;
alter table public.help_walkthrough_revisions force row level security;
alter table public.help_walkthrough_contexts enable row level security;
alter table public.help_walkthrough_contexts force row level security;
alter table public.help_support_gaps enable row level security;
alter table public.help_support_gaps force row level security;
alter table public.help_marketing_derivatives enable row level security;
alter table public.help_marketing_derivatives force row level security;

revoke all on table public.help_media_assets from public, anon, authenticated, service_role;
revoke all on table public.help_walkthroughs from public, anon, authenticated, service_role;
revoke all on table public.help_walkthrough_revisions from public, anon, authenticated, service_role;
revoke all on table public.help_walkthrough_contexts from public, anon, authenticated, service_role;
revoke all on table public.help_support_gaps from public, anon, authenticated, service_role;
revoke all on table public.help_marketing_derivatives from public, anon, authenticated, service_role;

create function public.servsync_private_require_help_admin()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id constant uuid := '00000000-0000-4000-8000-000000000037';
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.marketing_workspaces
     where id = v_workspace_id and workspace_key = 'servsync_internal'
       and workspace_kind = 'internal' and contractor_id is null
  ) then
    raise exception 'ServSync Help workspace is unavailable.' using errcode = '55000';
  end if;
  return v_workspace_id;
end;
$$;

create function public.servsync_private_help_actor_role(p_contractor_id uuid default null)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_profile_role text; v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select role into v_profile_role from public.profiles where id = auth.uid();
  if v_profile_role = 'platform_admin' then return 'platform_admin'; end if;
  if v_profile_role = 'homeowner' then
    if p_contractor_id is not null then raise exception 'Not authorized.' using errcode = '42501'; end if;
    return 'homeowner';
  end if;
  if p_contractor_id is null then raise exception 'Contractor context is required.' using errcode = '42501'; end if;

  select case
    when contractor.owner_user_id = auth.uid() then 'owner'
    else member.role
  end into v_role
  from public.contractor_profiles contractor
  left join public.contractor_team_members member
    on member.contractor_id = contractor.id
   and member.user_id = auth.uid()
   and member.status = 'active'
  where contractor.id = p_contractor_id
    and contractor.account_status = 'active'
    and (contractor.owner_user_id = auth.uid() or member.user_id is not null)
  limit 1;

  if v_role is null or v_role not in ('owner','admin','office','field_tech','viewer') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create function public.servsync_private_normalize_help_payload(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
immutable
as $$
declare
  v_allowed constant text[] := array[
    'title','summary','steps','keywords','feature_area','route_contexts','audience_roles',
    'purpose','source_commit','source_version','video_asset_id','poster_asset_id',
    'human_paced_review','sensitive_data_review','canonical_output_review',
    'validation_status','narration_provider','narration_voice','narration_disclosure','transcript'
  ];
  v_key text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid Help walkthrough payload.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if not v_key = any(v_allowed) then
      raise exception 'Invalid Help walkthrough field.' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_payload->'steps') <> 'array'
     or jsonb_typeof(p_payload->'keywords') <> 'array'
     or jsonb_typeof(p_payload->'route_contexts') <> 'array'
     or jsonb_typeof(p_payload->'audience_roles') <> 'array' then
    raise exception 'Invalid Help walkthrough lists.' using errcode = '22023';
  end if;
  return p_payload;
end;
$$;

create function public.servsync_reserve_help_media_upload(
  p_asset_kind text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_source_commit text default null,
  p_provenance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_workspace_id uuid; v_asset public.help_media_assets; v_extension text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  if p_asset_kind not in ('video','poster')
     or p_file_size_bytes not between 1 and 104857600
     or char_length(coalesce(p_original_file_name,'')) not between 1 and 180
     or p_original_file_name ~ '[\\/]'
     or p_original_file_name ~ '[[:cntrl:]]'
     or (p_asset_kind = 'video' and p_mime_type <> 'video/mp4')
     or (p_asset_kind = 'poster' and p_mime_type not in ('image/png','image/jpeg','image/webp'))
     or (p_source_commit is not null and p_source_commit !~ '^[a-f0-9]{40}$') then
    raise exception 'Invalid Help media upload.' using errcode = '22023';
  end if;
  v_extension := case p_mime_type when 'video/mp4' then 'mp4' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
  insert into public.help_media_assets (
    workspace_id, asset_kind, storage_path, original_file_name, mime_type,
    file_size_bytes, source_commit, provenance, created_by
  ) values (
    v_workspace_id, p_asset_kind,
    v_workspace_id::text || '/' || gen_random_uuid()::text || '/' || p_asset_kind || '.' || v_extension,
    p_original_file_name, p_mime_type, p_file_size_bytes, p_source_commit,
    coalesce(p_provenance, '{}'::jsonb), auth.uid()
  ) returning * into v_asset;
  return jsonb_build_object('asset_id', v_asset.id, 'bucket', v_asset.storage_bucket, 'path', v_asset.storage_path);
end;
$$;

create function public.servsync_finalize_help_media_upload(
  p_asset_id uuid,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_duration_seconds numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, storage
volatile
as $$
declare v_workspace_id uuid; v_asset public.help_media_assets; v_object storage.objects;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_asset from public.help_media_assets
   where id = p_asset_id and workspace_id = v_workspace_id for update;
  if v_asset.id is null then raise exception 'Help media asset not found.' using errcode = 'P0002'; end if;
  if v_asset.upload_status = 'ready' then
    if v_asset.sha256 = p_sha256 and v_asset.width = p_width and v_asset.height = p_height
       and v_asset.duration_seconds is not distinct from p_duration_seconds then
      return jsonb_build_object('asset_id', v_asset.id, 'status', 'ready', 'replayed', true);
    end if;
    raise exception 'Help media finalization conflicts with existing asset.' using errcode = '23505';
  end if;
  if p_sha256 !~ '^[a-f0-9]{64}$' or p_width not between 320 and 4096 or p_height not between 180 and 2160
     or (v_asset.asset_kind = 'video' and p_duration_seconds not between 1 and 600)
     or (v_asset.asset_kind = 'poster' and p_duration_seconds is not null) then
    raise exception 'Invalid Help media metadata.' using errcode = '22023';
  end if;
  select * into v_object from storage.objects
   where bucket_id = v_asset.storage_bucket and name = v_asset.storage_path;
  if v_object.id is null
     or coalesce((v_object.metadata->>'size')::bigint, 0) <> v_asset.file_size_bytes
     or coalesce(v_object.metadata->>'mimetype','') <> v_asset.mime_type then
    raise exception 'Uploaded Help media does not match its reservation.' using errcode = '22023';
  end if;
  update public.help_media_assets set
    upload_status = 'ready', sha256 = p_sha256, width = p_width, height = p_height,
    duration_seconds = p_duration_seconds, finalized_at = now()
  where id = v_asset.id;
  return jsonb_build_object('asset_id', v_asset.id, 'status', 'ready', 'replayed', false);
end;
$$;

create function public.servsync_private_insert_help_revision(
  p_walkthrough_id uuid,
  p_revision integer,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_payload jsonb; v_workspace_id uuid; v_context text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  v_payload := public.servsync_private_normalize_help_payload(p_payload);
  insert into public.help_walkthrough_revisions (
    workspace_id, walkthrough_id, revision_number, title, summary, steps, keywords,
    feature_area, audience_roles, purpose, source_commit, source_version,
    video_asset_id, poster_asset_id, human_paced_review, sensitive_data_review,
    canonical_output_review, validation_status, narration_provider,
    narration_voice, narration_disclosure, transcript, created_by
  ) values (
    v_workspace_id, p_walkthrough_id, p_revision,
    btrim(v_payload->>'title'), btrim(v_payload->>'summary'),
    array(select btrim(value) from jsonb_array_elements_text(v_payload->'steps') value where btrim(value) <> ''),
    array(select lower(btrim(value)) from jsonb_array_elements_text(v_payload->'keywords') value where btrim(value) <> ''),
    btrim(v_payload->>'feature_area'),
    array(select lower(btrim(value)) from jsonb_array_elements_text(v_payload->'audience_roles') value where btrim(value) <> ''),
    lower(btrim(v_payload->>'purpose')), nullif(v_payload->>'source_commit',''),
    nullif(btrim(v_payload->>'source_version'),''), nullif(v_payload->>'video_asset_id','')::uuid,
    nullif(v_payload->>'poster_asset_id','')::uuid,
    coalesce(nullif(v_payload->>'human_paced_review',''),'pending'),
    coalesce(nullif(v_payload->>'sensitive_data_review',''),'pending'),
    coalesce(nullif(v_payload->>'canonical_output_review',''),'pending'),
    coalesce(nullif(v_payload->>'validation_status',''),'draft'),
    nullif(btrim(v_payload->>'narration_provider'),''), nullif(btrim(v_payload->>'narration_voice'),''),
    nullif(btrim(v_payload->>'narration_disclosure'),''), nullif(btrim(v_payload->>'transcript'),''), auth.uid()
  );
  for v_context in
    select distinct lower(btrim(value)) from jsonb_array_elements_text(v_payload->'route_contexts') value where btrim(value) <> ''
  loop
    insert into public.help_walkthrough_contexts (
      workspace_id, walkthrough_id, revision_number, route_context, created_by
    ) values (v_workspace_id, p_walkthrough_id, p_revision, v_context, auth.uid());
  end loop;
end;
$$;

create function public.servsync_create_help_walkthrough(p_slug text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_workspace_id uuid; v_walkthrough public.help_walkthroughs; v_purpose text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  v_purpose := lower(btrim(p_payload->>'purpose'));
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_slug) not between 3 and 100 then
    raise exception 'Invalid Help walkthrough slug.' using errcode = '22023';
  end if;
  insert into public.help_walkthroughs (
    workspace_id, slug, purpose, created_by, updated_by
  ) values (v_workspace_id, p_slug, v_purpose, auth.uid(), auth.uid()) returning * into v_walkthrough;
  perform public.servsync_private_insert_help_revision(v_walkthrough.id, 1, p_payload);
  return jsonb_build_object('walkthrough_id', v_walkthrough.id, 'revision', 1, 'state', 'draft');
end;
$$;

create function public.servsync_update_help_walkthrough(
  p_walkthrough_id uuid,
  p_expected_revision integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_workspace_id uuid; v_walkthrough public.help_walkthroughs; v_next integer; v_purpose text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_walkthrough from public.help_walkthroughs
   where id = p_walkthrough_id and workspace_id = v_workspace_id for update;
  if v_walkthrough.id is null then raise exception 'Help walkthrough not found.' using errcode = 'P0002'; end if;
  if v_walkthrough.current_revision <> p_expected_revision then
    raise exception 'Help walkthrough changed; reload before saving.' using errcode = '40001';
  end if;
  if v_walkthrough.state = 'archived' then raise exception 'Archived walkthroughs cannot be edited.' using errcode = '55000'; end if;
  v_next := v_walkthrough.current_revision + 1;
  v_purpose := lower(btrim(p_payload->>'purpose'));
  perform public.servsync_private_insert_help_revision(p_walkthrough_id, v_next, p_payload);
  update public.help_walkthroughs set
    current_revision = v_next, purpose = v_purpose, updated_by = auth.uid(), updated_at = now(),
    state = case when state = 'published' then 'needs_review' else state end
  where id = p_walkthrough_id;
  return jsonb_build_object('walkthrough_id', p_walkthrough_id, 'revision', v_next,
    'state', case when v_walkthrough.state = 'published' then 'needs_review' else v_walkthrough.state end);
end;
$$;

create function public.servsync_transition_help_walkthrough(
  p_walkthrough_id uuid,
  p_expected_revision integer,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_workspace_id uuid; v_walkthrough public.help_walkthroughs; v_revision public.help_walkthrough_revisions; v_state text;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into v_walkthrough from public.help_walkthroughs
   where id = p_walkthrough_id and workspace_id = v_workspace_id for update;
  if v_walkthrough.id is null then raise exception 'Help walkthrough not found.' using errcode = 'P0002'; end if;
  if v_walkthrough.current_revision <> p_expected_revision then
    raise exception 'Help walkthrough changed; reload before continuing.' using errcode = '40001';
  end if;
  select * into v_revision from public.help_walkthrough_revisions
   where walkthrough_id = p_walkthrough_id and revision_number = p_expected_revision;

  if p_action = 'publish' then
    if v_revision.video_asset_id is null or v_revision.poster_asset_id is null
       or v_revision.human_paced_review <> 'passed'
       or v_revision.sensitive_data_review <> 'passed'
       or v_revision.canonical_output_review <> 'passed'
       or v_revision.validation_status <> 'passed'
       or not exists (
         select 1 from public.help_media_assets
          where id = v_revision.video_asset_id and workspace_id = v_workspace_id
            and asset_kind = 'video' and upload_status = 'ready'
       )
       or not exists (
         select 1 from public.help_media_assets
          where id = v_revision.poster_asset_id and workspace_id = v_workspace_id
            and asset_kind = 'poster' and upload_status = 'ready'
       ) then
      raise exception 'Walkthrough media and quality reviews must pass before publication.' using errcode = '55000';
    end if;
    v_state := 'published';
    update public.help_walkthroughs set state = v_state, published_revision = current_revision,
      published_at = now(), archived_at = null, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'unpublish' then
    v_state := 'draft';
    update public.help_walkthroughs set state = v_state, published_revision = null,
      published_at = null, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'needs_review' then
    v_state := 'needs_review';
    update public.help_walkthroughs set state = v_state, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'deprecate' then
    v_state := 'deprecated';
    update public.help_walkthroughs set state = v_state, updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  elsif p_action = 'archive' then
    v_state := 'archived';
    update public.help_walkthroughs set state = v_state, published_revision = null,
      archived_at = now(), updated_by = auth.uid(), updated_at = now()
    where id = p_walkthrough_id;
  else
    raise exception 'Invalid Help walkthrough action.' using errcode = '22023';
  end if;
  return jsonb_build_object('walkthrough_id', p_walkthrough_id, 'revision', p_expected_revision, 'state', v_state);
end;
$$;

create function public.servsync_list_help_walkthroughs(p_query text default null)
returns table (
  walkthrough_id uuid, slug text, state text, purpose text, current_revision integer,
  published_revision integer, title text, summary text, steps text[], keywords text[],
  feature_area text, route_contexts text[], audience_roles text[], source_commit text,
  source_version text, video_asset_id uuid, poster_asset_id uuid,
  human_paced_review text, sensitive_data_review text, canonical_output_review text,
  validation_status text, narration_provider text, narration_voice text,
  narration_disclosure text, transcript text, video_file_name text,
  video_bytes bigint, video_duration numeric, video_width integer, video_height integer,
  poster_file_name text, created_at timestamptz, updated_at timestamptz, published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  return query
  select walkthrough.id, walkthrough.slug, walkthrough.state, walkthrough.purpose,
    walkthrough.current_revision, walkthrough.published_revision, revision.title,
    revision.summary, revision.steps, revision.keywords, revision.feature_area,
    coalesce(array_agg(distinct context.route_context) filter (where context.route_context is not null), '{}'::text[]),
    revision.audience_roles, revision.source_commit, revision.source_version,
    revision.video_asset_id, revision.poster_asset_id, revision.human_paced_review,
    revision.sensitive_data_review, revision.canonical_output_review,
    revision.validation_status, revision.narration_provider, revision.narration_voice,
    revision.narration_disclosure, revision.transcript, video.original_file_name,
    video.file_size_bytes, video.duration_seconds, video.width, video.height,
    poster.original_file_name, walkthrough.created_at, walkthrough.updated_at, walkthrough.published_at
  from public.help_walkthroughs walkthrough
  join public.help_walkthrough_revisions revision
    on revision.walkthrough_id = walkthrough.id and revision.revision_number = walkthrough.current_revision
  left join public.help_walkthrough_contexts context
    on context.walkthrough_id = walkthrough.id and context.revision_number = walkthrough.current_revision
  left join public.help_media_assets video on video.id = revision.video_asset_id
  left join public.help_media_assets poster on poster.id = revision.poster_asset_id
  where walkthrough.workspace_id = v_workspace_id
    and (coalesce(btrim(p_query),'') = '' or
      to_tsvector('simple', revision.title || ' ' || revision.summary || ' ' || revision.feature_area || ' '
        || array_to_string(revision.keywords, ' ') || ' ' || array_to_string(revision.steps, ' ') || ' '
        || coalesce(revision.transcript, '')) @@ websearch_to_tsquery('simple', p_query))
  group by walkthrough.id, revision.walkthrough_id, revision.revision_number,
    video.id, poster.id
  order by walkthrough.updated_at desc;
end;
$$;

create function public.servsync_find_help(
  p_query text default null,
  p_route_context text default null,
  p_contractor_id uuid default null,
  p_limit integer default 10
)
returns table (
  walkthrough_id uuid, slug text, revision integer, title text, summary text,
  steps text[], keywords text[], feature_area text, purpose text,
  route_contexts text[], video_asset_id uuid, poster_asset_id uuid,
  duration_seconds numeric, width integer, height integer,
  narration_disclosure text, rank real
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_role text; v_query tsquery;
begin
  v_role := public.servsync_private_help_actor_role(p_contractor_id);
  if p_limit not between 1 and 20 or char_length(coalesce(p_query,'')) > 240
     or char_length(coalesce(p_route_context,'')) > 120 then
    raise exception 'Invalid Help search.' using errcode = '22023';
  end if;
  v_query := case when coalesce(btrim(p_query),'') = '' then null else websearch_to_tsquery('simple', p_query) end;
  return query
  select walkthrough.id, walkthrough.slug, walkthrough.published_revision,
    revision.title, revision.summary, revision.steps, revision.keywords,
    revision.feature_area, revision.purpose,
    coalesce(array_agg(distinct context.route_context) filter (where context.route_context is not null), '{}'::text[]),
    revision.video_asset_id, revision.poster_asset_id, video.duration_seconds,
    video.width, video.height, revision.narration_disclosure,
    (case when p_route_context is not null and bool_or(context.route_context = p_route_context) then 5 else 0 end
      + case when v_query is null then 0 else ts_rank_cd(
        to_tsvector('simple', revision.title || ' ' || revision.summary || ' ' || revision.feature_area || ' '
          || array_to_string(revision.keywords, ' ') || ' ' || array_to_string(revision.steps, ' ') || ' '
          || coalesce(revision.transcript, '')), v_query) end)::real
  from public.help_walkthroughs walkthrough
  join public.help_walkthrough_revisions revision
    on revision.walkthrough_id = walkthrough.id and revision.revision_number = walkthrough.published_revision
  join public.help_media_assets video
    on video.id = revision.video_asset_id and video.upload_status = 'ready'
  left join public.help_walkthrough_contexts context
    on context.walkthrough_id = walkthrough.id and context.revision_number = walkthrough.published_revision
  where walkthrough.workspace_id = '00000000-0000-4000-8000-000000000037'
    and walkthrough.state in ('published','needs_review')
    and walkthrough.published_revision is not null
    and v_role = any(revision.audience_roles)
    and (v_query is null or to_tsvector('simple', revision.title || ' ' || revision.summary || ' '
      || revision.feature_area || ' ' || array_to_string(revision.keywords, ' ') || ' '
      || array_to_string(revision.steps, ' ') || ' ' || coalesce(revision.transcript, '')) @@ v_query)
    and (p_route_context is null or exists (
      select 1 from public.help_walkthrough_contexts route_match
       where route_match.walkthrough_id = walkthrough.id
         and route_match.revision_number = walkthrough.published_revision
         and route_match.route_context = p_route_context
    ) or v_query is not null)
  group by walkthrough.id, revision.walkthrough_id, revision.revision_number, video.id
  order by 16 desc, revision.title
  limit p_limit;
end;
$$;

create function public.servsync_get_help_playback_grant(
  p_walkthrough_id uuid,
  p_contractor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_role text; v_row record; v_is_admin boolean; v_target_revision integer;
begin
  v_role := public.servsync_private_help_actor_role(p_contractor_id);
  v_is_admin := v_role = 'platform_admin';
  select case when v_is_admin then current_revision else published_revision end
    into v_target_revision
    from public.help_walkthroughs where id = p_walkthrough_id;
  select walkthrough.id, walkthrough.published_revision, revision.video_asset_id,
    revision.poster_asset_id, revision.title, revision.steps, revision.summary
  into v_row
  from public.help_walkthroughs walkthrough
  join public.help_walkthrough_revisions revision
    on revision.walkthrough_id = walkthrough.id and revision.revision_number = v_target_revision
  join public.help_media_assets asset on asset.id = revision.video_asset_id and asset.upload_status = 'ready'
  where walkthrough.id = p_walkthrough_id
    and (v_is_admin or (walkthrough.state in ('published','needs_review') and walkthrough.published_revision is not null))
    and (v_is_admin or v_role = any(revision.audience_roles));
  if v_row.id is null then raise exception 'Published walkthrough not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object('walkthrough_id', v_row.id, 'revision', v_target_revision,
    'video_asset_id', v_row.video_asset_id, 'poster_asset_id', v_row.poster_asset_id,
    'title', v_row.title, 'summary', v_row.summary, 'steps', v_row.steps);
end;
$$;

create function public.servsync_get_help_media_for_service(p_asset_id uuid)
returns table (
  asset_id uuid, storage_bucket text, storage_path text, mime_type text,
  sha256 text, file_size_bytes bigint, duration_seconds numeric,
  width integer, height integer
)
language sql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
  select asset.id, asset.storage_bucket, asset.storage_path, asset.mime_type,
    asset.sha256, asset.file_size_bytes, asset.duration_seconds,
    asset.width, asset.height
  from public.help_media_assets asset
  where asset.id = p_asset_id and asset.upload_status = 'ready';
$$;

create function public.servsync_get_help_media_usage()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  return (
    select jsonb_build_object(
      'total_assets', count(*) filter (where upload_status = 'ready'),
      'total_bytes', coalesce(sum(file_size_bytes) filter (where upload_status = 'ready'), 0),
      'video_assets', count(*) filter (where upload_status = 'ready' and asset_kind = 'video'),
      'poster_assets', count(*) filter (where upload_status = 'ready' and asset_kind = 'poster'),
      'published_walkthroughs', (select count(*) from public.help_walkthroughs where workspace_id = v_workspace_id and published_revision is not null),
      'unpublished_walkthroughs', (select count(*) from public.help_walkthroughs where workspace_id = v_workspace_id and published_revision is null)
    ) from public.help_media_assets where workspace_id = v_workspace_id
  );
end;
$$;

create function public.servsync_list_help_marketing_sources()
returns table (
  walkthrough_id uuid, revision integer, title text, summary text,
  video_asset_id uuid, poster_asset_id uuid, sha256 text, mime_type text,
  file_size_bytes bigint, duration_seconds numeric, width integer, height integer,
  narration_disclosure text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  return query
  select walkthrough.id, walkthrough.published_revision, revision.title, revision.summary,
    video.id, revision.poster_asset_id, video.sha256, video.mime_type,
    video.file_size_bytes, video.duration_seconds, video.width, video.height,
    revision.narration_disclosure
  from public.help_walkthroughs walkthrough
  join public.help_walkthrough_revisions revision
    on revision.walkthrough_id = walkthrough.id and revision.revision_number = walkthrough.published_revision
  join public.help_media_assets video on video.id = revision.video_asset_id and video.upload_status = 'ready'
  where walkthrough.workspace_id = v_workspace_id
    and walkthrough.state in ('published','needs_review') and walkthrough.published_revision is not null
    and walkthrough.purpose in ('marketing','both')
  order by walkthrough.updated_at desc;
end;
$$;

create function public.servsync_register_help_marketing_derivative(
  p_walkthrough_id uuid,
  p_walkthrough_revision integer,
  p_help_asset_id uuid,
  p_marketing_asset_id uuid,
  p_source_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_walkthrough public.help_walkthroughs;
  v_revision public.help_walkthrough_revisions;
  v_help_asset public.help_media_assets;
  v_marketing_asset public.marketing_media_assets;
  v_link public.help_marketing_derivatives;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  select * into strict v_walkthrough from public.help_walkthroughs
   where id = p_walkthrough_id and workspace_id = v_workspace_id
     and published_revision = p_walkthrough_revision and state in ('published','needs_review')
     and purpose in ('marketing','both');
  select * into strict v_revision from public.help_walkthrough_revisions
   where walkthrough_id = v_walkthrough.id and revision_number = p_walkthrough_revision
     and video_asset_id = p_help_asset_id;
  select * into strict v_help_asset from public.help_media_assets
   where id = p_help_asset_id and workspace_id = v_workspace_id and asset_kind = 'video'
     and upload_status = 'ready' and sha256 = p_source_sha256;
  select asset.* into strict v_marketing_asset
  from public.marketing_media_assets asset
  join public.marketing_media_lifecycles lifecycle
    on lifecycle.asset_id = asset.id and lifecycle.workspace_id = asset.workspace_id
  where asset.id = p_marketing_asset_id and asset.workspace_id = v_workspace_id
    and asset.source = 'marketing_upload' and asset.ephemeral
    and asset.asset_type = 'video' and asset.mime_type = 'video/mp4'
    and asset.sha256 = v_help_asset.sha256 and asset.file_size_bytes = v_help_asset.file_size_bytes
    and lifecycle.state not in ('purging','purged','abandoned');
  insert into public.help_marketing_derivatives (
    workspace_id, walkthrough_id, walkthrough_revision, help_asset_id,
    marketing_asset_id, source_sha256, created_by
  ) values (
    v_workspace_id, v_walkthrough.id, v_revision.revision_number, v_help_asset.id,
    v_marketing_asset.id, v_help_asset.sha256, auth.uid()
  )
  on conflict (workspace_id, walkthrough_id, walkthrough_revision, marketing_asset_id)
  do nothing returning * into v_link;
  if v_link.id is null then
    select * into strict v_link from public.help_marketing_derivatives
     where workspace_id = v_workspace_id and walkthrough_id = v_walkthrough.id
       and walkthrough_revision = v_revision.revision_number
       and marketing_asset_id = v_marketing_asset.id
       and help_asset_id = v_help_asset.id and source_sha256 = v_help_asset.sha256;
  end if;
  return jsonb_build_object(
    'link_id', v_link.id, 'walkthrough_id', v_walkthrough.id,
    'walkthrough_revision', v_revision.revision_number,
    'marketing_asset_id', v_marketing_asset.id
  );
exception
  when no_data_found then
    raise exception 'Help Marketing derivative identity could not be verified.' using errcode = '22023';
end;
$$;

create function public.servsync_record_help_gap(
  p_question text,
  p_route_context text default null,
  p_contractor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare v_role text; v_question text;
begin
  v_role := public.servsync_private_help_actor_role(p_contractor_id);
  v_question := lower(regexp_replace(btrim(p_question), E'\\s+', ' ', 'g'));
  if char_length(v_question) not between 3 and 240
     or char_length(coalesce(p_route_context,'')) > 120 then
    raise exception 'Invalid Help request.' using errcode = '22023';
  end if;
  insert into public.help_support_gaps (normalized_question, route_context, actor_role)
  values (v_question, nullif(lower(btrim(p_route_context)),''), v_role)
  on conflict (normalized_question, route_context, actor_role) do update set
    occurrence_count = public.help_support_gaps.occurrence_count + 1,
    last_requested_at = now();
end;
$$;

create function public.servsync_private_can_upload_help_object(p_name text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
  select auth.uid() is not null
    and public.current_user_is_platform_admin()
    and exists (
      select 1 from public.help_media_assets asset
       where asset.storage_bucket = 'help-walkthroughs'
         and asset.storage_path = p_name
         and asset.upload_status = 'upload_pending'
         and asset.created_by = auth.uid()
    );
$$;

drop policy if exists help_walkthroughs_admin_upload on storage.objects;
create policy help_walkthroughs_admin_upload on storage.objects
for insert to authenticated
with check (bucket_id = 'help-walkthroughs' and public.servsync_private_can_upload_help_object(name));

alter function public.servsync_private_require_help_admin() owner to postgres;
alter function public.servsync_private_help_actor_role(uuid) owner to postgres;
alter function public.servsync_private_normalize_help_payload(jsonb) owner to postgres;
alter function public.servsync_reserve_help_media_upload(text,text,text,bigint,text,jsonb) owner to postgres;
alter function public.servsync_finalize_help_media_upload(uuid,text,integer,integer,numeric) owner to postgres;
alter function public.servsync_private_insert_help_revision(uuid,integer,jsonb) owner to postgres;
alter function public.servsync_create_help_walkthrough(text,jsonb) owner to postgres;
alter function public.servsync_update_help_walkthrough(uuid,integer,jsonb) owner to postgres;
alter function public.servsync_transition_help_walkthrough(uuid,integer,text) owner to postgres;
alter function public.servsync_list_help_walkthroughs(text) owner to postgres;
alter function public.servsync_find_help(text,text,uuid,integer) owner to postgres;
alter function public.servsync_get_help_playback_grant(uuid,uuid) owner to postgres;
alter function public.servsync_get_help_media_for_service(uuid) owner to postgres;
alter function public.servsync_get_help_media_usage() owner to postgres;
alter function public.servsync_list_help_marketing_sources() owner to postgres;
alter function public.servsync_register_help_marketing_derivative(uuid,integer,uuid,uuid,text) owner to postgres;
alter function public.servsync_record_help_gap(text,text,uuid) owner to postgres;
alter function public.servsync_private_can_upload_help_object(text) owner to postgres;

revoke all on function public.servsync_private_require_help_admin() from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_help_actor_role(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_normalize_help_payload(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_reserve_help_media_upload(text,text,text,bigint,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_finalize_help_media_upload(uuid,text,integer,integer,numeric) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_insert_help_revision(uuid,integer,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_create_help_walkthrough(text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_update_help_walkthrough(uuid,integer,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.servsync_transition_help_walkthrough(uuid,integer,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_help_walkthroughs(text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_find_help(text,text,uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_help_playback_grant(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_help_media_for_service(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_help_media_usage() from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_help_marketing_sources() from public, anon, authenticated, service_role;
revoke all on function public.servsync_register_help_marketing_derivative(uuid,integer,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_record_help_gap(text,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_can_upload_help_object(text) from public, anon, authenticated, service_role;

grant execute on function public.servsync_reserve_help_media_upload(text,text,text,bigint,text,jsonb) to authenticated;
grant execute on function public.servsync_finalize_help_media_upload(uuid,text,integer,integer,numeric) to authenticated;
grant execute on function public.servsync_create_help_walkthrough(text,jsonb) to authenticated;
grant execute on function public.servsync_update_help_walkthrough(uuid,integer,jsonb) to authenticated;
grant execute on function public.servsync_transition_help_walkthrough(uuid,integer,text) to authenticated;
grant execute on function public.servsync_list_help_walkthroughs(text) to authenticated;
grant execute on function public.servsync_find_help(text,text,uuid,integer) to authenticated;
grant execute on function public.servsync_get_help_playback_grant(uuid,uuid) to authenticated;
grant execute on function public.servsync_get_help_media_for_service(uuid) to service_role;
grant execute on function public.servsync_get_help_media_usage() to authenticated;
grant execute on function public.servsync_list_help_marketing_sources() to authenticated;
grant execute on function public.servsync_register_help_marketing_derivative(uuid,integer,uuid,uuid,text) to authenticated;
grant execute on function public.servsync_record_help_gap(text,text,uuid) to authenticated;
-- Storage evaluates these boolean helpers as the authenticated caller. They
-- disclose no rows or paths and remain purpose-bound to exact object names.
grant execute on function public.servsync_private_can_upload_help_object(text) to authenticated;

commit;
