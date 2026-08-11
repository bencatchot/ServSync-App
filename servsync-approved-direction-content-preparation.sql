-- ServSync Approved Direction -> Draft Content Preparation Foundation v1.
--
-- Extends the existing internal Marketing package/content domain with exact,
-- prospective Plan and approved-Direction lineage. Historical preparation
-- packages remain unchanged. Preparation creates drafts only; it cannot submit,
-- approve, schedule, publish, or expose content outside platform administration.

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.marketing_content_preparation_packages') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regclass('public.marketing_content_status_events') is null
     or to_regclass('public.marketing_plans') is null
     or to_regclass('public.marketing_directions') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null
     or to_regprocedure('public.servsync_private_marketing_copy_is_claim_safe(text)') is null
     or to_regprocedure('public.servsync_list_internal_marketing_content(text)') is null
     or (
       to_regprocedure('extensions.digest(bytea,text)') is null
       and to_regprocedure('public.digest(bytea,text)') is null
     ) then
    raise exception 'Missing approved-Direction content preparation prerequisite.';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  if to_regprocedure('public.servsync_ingest_internal_marketing_direction_package(uuid,uuid,bigint,text,text,jsonb)') is not null
     or to_regprocedure('public.servsync_private_guard_marketing_content_lineage()') is not null then
    raise exception 'Approved-Direction content preparation functions already exist; refusing repeated installation.';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'marketing_content_preparation_packages'
       and column_name in ('strategic_source', 'source_plan_id', 'source_plan_revision')
  ) or exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'marketing_content_items'
       and column_name in (
         'source_plan_id', 'source_plan_revision', 'source_plan_item_index',
         'source_direction_id', 'source_direction_revision'
       )
  ) then
    raise exception 'Approved-Direction content preparation columns already exist; refusing partial installation.';
  end if;
end;
$$;

alter table public.marketing_content_preparation_packages
  drop constraint marketing_preparation_packages_recipe_check,
  add column strategic_source text null,
  add column source_plan_id uuid null references public.marketing_plans(id) on delete restrict,
  add column source_plan_revision bigint null,
  add constraint marketing_preparation_packages_recipe_check
    check (recipe_key in (
      'contractor_acquisition', 'homeowner_awareness', 'feature_promotion',
      'approved_direction_plan_v1'
    )),
  add constraint marketing_preparation_packages_strategic_source_check
    check (strategic_source is null or strategic_source = 'approved_direction'),
  add constraint marketing_preparation_packages_source_plan_revision_check
    check (source_plan_revision is null or source_plan_revision >= 1),
  add constraint marketing_preparation_packages_direction_source_shape_check
    check (
      (
        strategic_source is null
        and source_plan_id is null
        and source_plan_revision is null
        and recipe_key <> 'approved_direction_plan_v1'
      )
      or (
        strategic_source = 'approved_direction'
        and source_plan_id is not null
        and source_plan_revision is not null
        and recipe_key = 'approved_direction_plan_v1'
        and preparation_source = 'codex_assisted'
      )
    );

alter table public.marketing_content_items
  add column source_plan_id uuid null references public.marketing_plans(id) on delete restrict,
  add column source_plan_revision bigint null,
  add column source_plan_item_index smallint null,
  add column source_direction_id uuid null references public.marketing_directions(id) on delete restrict,
  add column source_direction_revision bigint null,
  add constraint marketing_content_items_source_plan_revision_check
    check (source_plan_revision is null or source_plan_revision >= 1),
  add constraint marketing_content_items_source_plan_index_check
    check (source_plan_item_index is null or source_plan_item_index between 1 and 7),
  add constraint marketing_content_items_source_direction_revision_check
    check (source_direction_revision is null or source_direction_revision >= 1),
  add constraint marketing_content_items_direction_lineage_shape_check
    check (
      (
        source_plan_id is null
        and source_plan_revision is null
        and source_plan_item_index is null
        and source_direction_id is null
        and source_direction_revision is null
      )
      or (
        source_plan_id is not null
        and source_plan_revision is not null
        and source_plan_item_index is not null
        and source_direction_id is not null
        and source_direction_revision is not null
        and preparation_source = 'codex_assisted'
      )
    );

create index marketing_preparation_packages_source_plan_idx
  on public.marketing_content_preparation_packages(source_plan_id, prepared_at desc)
  where source_plan_id is not null;

create unique index marketing_preparation_packages_primary_direction_plan_idx
  on public.marketing_content_preparation_packages(source_plan_id, source_plan_revision)
  where strategic_source = 'approved_direction';

create unique index marketing_content_items_source_direction_revision_idx
  on public.marketing_content_items(source_direction_id, source_direction_revision)
  where source_direction_id is not null;

create function public.servsync_private_guard_marketing_content_lineage()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.preparation_package_id is distinct from old.preparation_package_id
     or new.preparation_sequence is distinct from old.preparation_sequence
     or new.preparation_source is distinct from old.preparation_source
     or new.intended_audience is distinct from old.intended_audience
     or new.content_role is distinct from old.content_role
     or new.source_plan_id is distinct from old.source_plan_id
     or new.source_plan_revision is distinct from old.source_plan_revision
     or new.source_plan_item_index is distinct from old.source_plan_item_index
     or new.source_direction_id is distinct from old.source_direction_id
     or new.source_direction_revision is distinct from old.source_direction_revision then
    raise exception 'Marketing content preparation lineage is immutable.';
  end if;
  return new;
end;
$$;

create trigger marketing_content_items_lineage_immutable
  before update on public.marketing_content_items
  for each row execute function public.servsync_private_guard_marketing_content_lineage();

drop function public.servsync_list_internal_marketing_content(text);

create function public.servsync_list_internal_marketing_content(
  p_status text default null
)
returns table (
  content_id uuid,
  workspace_key text,
  workspace_kind text,
  title text,
  content_type text,
  body text,
  channel_category text,
  status text,
  revision_number bigint,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  created_by_name text,
  submitted_at timestamptz,
  submitted_by uuid,
  submitted_by_name text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_by_name text,
  review_note text,
  preparation_source text,
  preparation_request_id uuid,
  preparation_recipe_key text,
  truth_pack_version text,
  prepared_at timestamptz,
  preparation_sequence smallint,
  intended_audience text,
  content_role text,
  strategic_source text,
  source_plan_id uuid,
  source_plan_revision bigint,
  source_plan_item_index smallint,
  source_direction_id uuid,
  source_direction_revision bigint,
  source_direction_topic text,
  source_direction_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_status is not null
     and p_status <> 'all'
     and p_status not in ('idea', 'draft', 'needs_approval', 'approved', 'rejected') then
    raise exception 'Invalid marketing content status.' using errcode = '22023';
  end if;

  return query
  select
    item.id,
    workspace.workspace_key,
    workspace.workspace_kind,
    item.title,
    item.content_type,
    item.body,
    item.channel_category,
    item.status,
    item.revision_number,
    item.created_at,
    item.updated_at,
    item.created_by,
    created_profile.full_name,
    item.submitted_at,
    item.submitted_by,
    submitted_profile.full_name,
    item.reviewed_at,
    item.reviewed_by,
    reviewed_profile.full_name,
    item.review_note,
    item.preparation_source,
    package.preparation_request_id,
    package.recipe_key,
    package.truth_pack_version,
    package.prepared_at,
    item.preparation_sequence,
    item.intended_audience,
    item.content_role,
    package.strategic_source,
    item.source_plan_id,
    item.source_plan_revision,
    item.source_plan_item_index,
    item.source_direction_id,
    item.source_direction_revision,
    direction.topic,
    direction.direction_status
  from public.marketing_content_items item
  join public.marketing_workspaces workspace
    on workspace.id = item.workspace_id
   and workspace.workspace_kind = 'internal'
   and workspace.workspace_key = 'servsync_internal'
  left join public.marketing_content_preparation_packages package
    on package.id = item.preparation_package_id
  left join public.marketing_directions direction
    on direction.id = item.source_direction_id
   and direction.workspace_id = item.workspace_id
  left join public.profiles created_profile on created_profile.id = item.created_by
  left join public.profiles submitted_profile on submitted_profile.id = item.submitted_by
  left join public.profiles reviewed_profile on reviewed_profile.id = item.reviewed_by
  where p_status is null or p_status = 'all' or item.status = p_status
  order by
    case item.status
      when 'needs_approval' then 1
      when 'draft' then 2
      when 'idea' then 3
      when 'rejected' then 4
      else 5
    end,
    item.updated_at desc,
    item.id;
end;
$$;

create function public.servsync_ingest_internal_marketing_direction_package(
  p_preparation_request_id uuid,
  p_source_plan_id uuid,
  p_expected_plan_revision bigint,
  p_truth_pack_version text,
  p_contract_key text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_workspace_id uuid;
  v_plan public.marketing_plans;
  v_package public.marketing_content_preparation_packages;
  v_direction public.marketing_directions;
  v_item jsonb;
  v_ordinal bigint;
  v_direction_id uuid;
  v_direction_revision bigint;
  v_title text;
  v_body text;
  v_content_type text;
  v_channel text;
  v_audience text;
  v_content_role text;
  v_truth_version text := btrim(coalesce(p_truth_pack_version, ''));
  v_contract_key text := btrim(coalesce(p_contract_key, ''));
  v_item_count integer;
  v_direction_count integer;
  v_seen_titles text[] := array[]::text[];
  v_seen_bodies text[] := array[]::text[];
  v_seen_directions uuid[] := array[]::uuid[];
  v_normalized text;
  v_fingerprint text;
  v_content_id uuid;
  v_content_ids jsonb;
  v_direction_ids jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select id into v_workspace_id
    from public.marketing_workspaces
   where workspace_key = 'servsync_internal'
     and workspace_kind = 'internal'
     and contractor_id is null;

  if v_workspace_id is null
     or p_preparation_request_id is null
     or p_source_plan_id is null
     or p_expected_plan_revision is null
     or v_truth_version <> 'servsync-marketing-truth-v3'
     or v_contract_key <> 'approved_direction_plan_v1'
     or p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid approved-Direction Marketing package.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':approved-direction-content', 0));

  select plan.* into v_plan
    from public.marketing_plans plan
   where plan.id = p_source_plan_id
     and plan.workspace_id = v_workspace_id
   for share;

  if v_plan.id is null then
    raise exception 'Marketing Plan not found.' using errcode = 'P0002';
  end if;
  if v_plan.plan_status <> 'accepted'
     or v_plan.accepted_at is null
     or v_plan.revision_number <> p_expected_plan_revision then
    raise exception 'Accepted Marketing Plan changed or is no longer eligible.' using errcode = '40001';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count <> jsonb_array_length(v_plan.items) or v_item_count not between 1 and 7 then
    raise exception 'Approved-Direction package must cover every accepted Plan item exactly once.' using errcode = '22023';
  end if;

  select count(*) into v_direction_count
    from public.marketing_directions direction
   where direction.workspace_id = v_workspace_id
     and direction.source_plan_id = v_plan.id
     and direction.source_plan_revision = v_plan.revision_number
     and direction.direction_status = 'approved'
     and direction.approved_at is not null
     and direction.approved_by is not null
     and direction.truth_pack_version = v_truth_version
     and direction.source_plan_item_snapshot = v_plan.items -> (direction.source_plan_item_index - 1);

  if v_direction_count <> v_item_count then
    raise exception 'Every accepted Plan item requires one current approved Marketing Direction.' using errcode = '55000';
  end if;

  for v_item, v_ordinal in
    select value, ordinality
      from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ?& array[
         'direction_id', 'direction_revision', 'title', 'content_type', 'body',
         'channel_category', 'intended_audience', 'content_role'
       ])
       or (select count(*) from jsonb_object_keys(v_item)) <> 8
       or jsonb_typeof(v_item -> 'direction_id') <> 'string'
       or jsonb_typeof(v_item -> 'direction_revision') <> 'number'
       or jsonb_typeof(v_item -> 'title') <> 'string'
       or jsonb_typeof(v_item -> 'content_type') <> 'string'
       or jsonb_typeof(v_item -> 'body') <> 'string'
       or jsonb_typeof(v_item -> 'channel_category') <> 'string'
       or jsonb_typeof(v_item -> 'intended_audience') <> 'string'
       or jsonb_typeof(v_item -> 'content_role') <> 'string' then
      raise exception 'Malformed approved-Direction content at position %.', v_ordinal using errcode = '22023';
    end if;

    begin
      v_direction_id := (v_item ->> 'direction_id')::uuid;
      v_direction_revision := (v_item ->> 'direction_revision')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Malformed approved-Direction identity at position %.', v_ordinal using errcode = '22023';
    end;

    select direction.* into v_direction
      from public.marketing_directions direction
     where direction.id = v_direction_id
       and direction.workspace_id = v_workspace_id
       and direction.source_plan_id = v_plan.id
       and direction.source_plan_item_index = v_ordinal
     for share;

    if v_direction.id is null
       or v_direction.direction_status <> 'approved'
       or v_direction.approved_at is null
       or v_direction.approved_by is null
       or v_direction.revision_number <> v_direction_revision
       or v_direction.source_plan_revision <> v_plan.revision_number
       or v_direction.source_plan_item_snapshot <> v_plan.items -> ((v_ordinal - 1)::integer)
       or v_direction.truth_pack_version <> v_truth_version
       or v_direction_id = any(v_seen_directions) then
      raise exception 'Marketing Direction at position % is stale, unapproved, duplicated, or does not match the accepted Plan.', v_ordinal using errcode = '40001';
    end if;

    v_title := btrim(v_item ->> 'title');
    v_content_type := btrim(v_item ->> 'content_type');
    v_body := btrim(v_item ->> 'body');
    v_channel := btrim(v_item ->> 'channel_category');
    v_audience := btrim(v_item ->> 'intended_audience');
    v_content_role := btrim(v_item ->> 'content_role');

    if char_length(v_title) not between 1 and 160
       or v_title ~ '[[:cntrl:]]'
       or char_length(v_body) not between 1 and 10000
       or v_body ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
       or v_audience <> v_direction.audience_key
       or v_content_role <> v_direction.content_role
       or (
         v_content_role = 'short_video_concept'
         and (v_content_type <> 'other' or v_channel <> 'social')
       )
       or (
         v_content_role <> 'short_video_concept'
         and (v_content_type <> 'social_post' or v_channel <> 'social')
       )
       or not public.servsync_private_marketing_copy_is_claim_safe(v_title || E'\n' || v_body) then
      raise exception 'Invalid, ungrounded, or role-incompatible content at position %.', v_ordinal using errcode = '22023';
    end if;

    v_normalized := lower(regexp_replace(v_title, '[[:space:]]+', ' ', 'g'));
    if v_normalized = any(v_seen_titles) then
      raise exception 'Approved-Direction package contains duplicate titles.' using errcode = '22023';
    end if;
    v_seen_titles := array_append(v_seen_titles, v_normalized);

    v_normalized := lower(regexp_replace(v_body, '[[:space:]]+', ' ', 'g'));
    if v_normalized = any(v_seen_bodies) then
      raise exception 'Approved-Direction package contains duplicate content.' using errcode = '22023';
    end if;
    v_seen_bodies := array_append(v_seen_bodies, v_normalized);
    v_seen_directions := array_append(v_seen_directions, v_direction_id);
  end loop;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'source_plan_id', v_plan.id,
    'source_plan_revision', v_plan.revision_number,
    'truth_pack_version', v_truth_version,
    'contract_key', v_contract_key,
    'items', p_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_package
    from public.marketing_content_preparation_packages package
   where package.workspace_id = v_workspace_id
     and package.preparation_request_id = p_preparation_request_id;

  if v_package.id is not null then
    if v_package.request_fingerprint_sha256 <> v_fingerprint
       or v_package.strategic_source <> 'approved_direction'
       or v_package.source_plan_id <> v_plan.id
       or v_package.source_plan_revision <> v_plan.revision_number
       or v_package.recipe_key <> v_contract_key
       or v_package.truth_pack_version <> v_truth_version
       or v_package.item_count <> v_item_count then
      raise exception 'Marketing preparation request conflicts with an existing request.' using errcode = '23505';
    end if;

    select jsonb_agg(item.id order by item.preparation_sequence),
           jsonb_agg(item.source_direction_id order by item.preparation_sequence)
      into v_content_ids, v_direction_ids
      from public.marketing_content_items item
     where item.preparation_package_id = v_package.id;

    if jsonb_array_length(coalesce(v_content_ids, '[]'::jsonb)) <> v_item_count then
      raise exception 'Marketing preparation package is incomplete.' using errcode = '55000';
    end if;

    return jsonb_build_object(
      'package_id', v_package.id,
      'preparation_request_id', v_package.preparation_request_id,
      'strategic_source', v_package.strategic_source,
      'generator_source', v_package.preparation_source,
      'source_plan_id', v_package.source_plan_id,
      'source_plan_revision', v_package.source_plan_revision,
      'status', 'draft',
      'item_count', v_package.item_count,
      'content_ids', v_content_ids,
      'direction_ids', v_direction_ids,
      'replayed', true
    );
  end if;

  if exists (
    select 1
      from public.marketing_content_preparation_packages package
     where package.source_plan_id = v_plan.id
       and package.source_plan_revision = v_plan.revision_number
       and package.strategic_source = 'approved_direction'
  ) then
    raise exception 'The accepted Marketing Plan already has a primary Direction package.' using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.marketing_content_items existing
     where lower(regexp_replace(btrim(existing.title), '[[:space:]]+', ' ', 'g')) = any(v_seen_titles)
        or lower(regexp_replace(btrim(existing.body), '[[:space:]]+', ' ', 'g')) = any(v_seen_bodies)
  ) then
    raise exception 'Approved-Direction package duplicates existing Marketing content.' using errcode = '22023';
  end if;

  insert into public.marketing_content_preparation_packages (
    workspace_id,
    preparation_request_id,
    preparation_source,
    recipe_key,
    truth_pack_version,
    brief_summary,
    item_count,
    request_fingerprint_sha256,
    prepared_by,
    strategic_source,
    source_plan_id,
    source_plan_revision
  ) values (
    v_workspace_id,
    p_preparation_request_id,
    'codex_assisted',
    v_contract_key,
    v_truth_version,
    'One primary draft for each approved Direction in ' || v_plan.title,
    v_item_count,
    v_fingerprint,
    auth.uid(),
    'approved_direction',
    v_plan.id,
    v_plan.revision_number
  ) returning * into v_package;

  for v_item, v_ordinal in
    select value, ordinality
      from jsonb_array_elements(p_items) with ordinality
  loop
    v_direction_id := (v_item ->> 'direction_id')::uuid;
    v_direction_revision := (v_item ->> 'direction_revision')::bigint;

    insert into public.marketing_content_items (
      workspace_id,
      client_request_id,
      title,
      content_type,
      body,
      channel_category,
      status,
      revision_number,
      created_by,
      preparation_package_id,
      preparation_sequence,
      preparation_source,
      intended_audience,
      content_role,
      source_plan_id,
      source_plan_revision,
      source_plan_item_index,
      source_direction_id,
      source_direction_revision
    ) values (
      v_workspace_id,
      gen_random_uuid(),
      btrim(v_item ->> 'title'),
      btrim(v_item ->> 'content_type'),
      btrim(v_item ->> 'body'),
      btrim(v_item ->> 'channel_category'),
      'draft',
      1,
      auth.uid(),
      v_package.id,
      v_ordinal,
      'codex_assisted',
      btrim(v_item ->> 'intended_audience'),
      btrim(v_item ->> 'content_role'),
      v_plan.id,
      v_plan.revision_number,
      v_ordinal,
      v_direction_id,
      v_direction_revision
    ) returning id into v_content_id;

    insert into public.marketing_content_status_events (
      workspace_id, content_id, content_revision, from_status, to_status, reason, actor_user_id
    ) values (
      v_workspace_id, v_content_id, 1, null, 'draft', null, auth.uid()
    );
  end loop;

  select jsonb_agg(item.id order by item.preparation_sequence),
         jsonb_agg(item.source_direction_id order by item.preparation_sequence)
    into v_content_ids, v_direction_ids
    from public.marketing_content_items item
   where item.preparation_package_id = v_package.id;

  if jsonb_array_length(coalesce(v_content_ids, '[]'::jsonb)) <> v_item_count then
    raise exception 'Marketing preparation package is incomplete.' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'package_id', v_package.id,
    'preparation_request_id', v_package.preparation_request_id,
    'strategic_source', v_package.strategic_source,
    'generator_source', v_package.preparation_source,
    'source_plan_id', v_package.source_plan_id,
    'source_plan_revision', v_package.source_plan_revision,
    'status', 'draft',
    'item_count', v_package.item_count,
    'content_ids', v_content_ids,
    'direction_ids', v_direction_ids,
    'replayed', false
  );
end;
$$;

alter table public.marketing_content_preparation_packages owner to postgres;
alter table public.marketing_content_items owner to postgres;

alter function public.servsync_private_guard_marketing_content_lineage() owner to postgres;
alter function public.servsync_list_internal_marketing_content(text) owner to postgres;
alter function public.servsync_ingest_internal_marketing_direction_package(uuid,uuid,bigint,text,text,jsonb) owner to postgres;

alter table public.marketing_content_preparation_packages enable row level security;
alter table public.marketing_content_preparation_packages force row level security;
alter table public.marketing_content_items enable row level security;
alter table public.marketing_content_items force row level security;

revoke all privileges on table public.marketing_content_preparation_packages from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_content_items from public, anon, authenticated, service_role;

revoke all privileges on function public.servsync_private_guard_marketing_content_lineage() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_list_internal_marketing_content(text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_ingest_internal_marketing_direction_package(uuid,uuid,bigint,text,text,jsonb) from public, anon, authenticated, service_role;

grant execute on function public.servsync_list_internal_marketing_content(text) to authenticated;
grant execute on function public.servsync_ingest_internal_marketing_direction_package(uuid,uuid,bigint,text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
