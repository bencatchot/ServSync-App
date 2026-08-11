-- ServSync Accepted Plan -> Marketing Direction Foundation v1.
--
-- Adds first-class, provider-neutral Marketing Directions sourced from exact
-- accepted Marketing Plan items. Directions remain internal, draft-first, and
-- separate from content preparation, approval, scheduling, and publishing.

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.marketing_workspaces') is null
     or to_regclass('public.marketing_business_profiles') is null
     or to_regclass('public.marketing_plans') is null
     or to_regclass('public.marketing_plan_revisions') is null
     or to_regclass('public.marketing_content_preparation_packages') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regclass('public.marketing_content_status_events') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null
     or to_regprocedure('public.servsync_private_marketing_direction_is_safe(text)') is null
     or (
       to_regprocedure('extensions.digest(bytea,text)') is null
       and to_regprocedure('public.digest(bytea,text)') is null
     ) then
    raise exception 'Missing Accepted Plan Marketing Direction prerequisite.';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  if to_regclass('public.marketing_directions') is not null
     or to_regclass('public.marketing_direction_revisions') is not null then
    raise exception 'Accepted Plan Marketing Direction target table already exists; refusing repeated installation.';
  end if;

  foreach v_name in array array[
    'servsync_private_marketing_direction_audience_matches(text,text)',
    'servsync_private_marketing_direction_corrections_valid(jsonb)',
    'servsync_private_marketing_direction_values_valid(jsonb,text,text,text,text,text[],text[],jsonb,text,text[],text,text)',
    'servsync_private_guard_marketing_direction()',
    'servsync_private_guard_marketing_direction_revision()',
    'servsync_get_internal_marketing_directions()',
    'servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb)',
    'servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text)',
    'servsync_approve_internal_marketing_direction(uuid,bigint)'
  ] loop
    if to_regprocedure('public.' || v_name) is not null then
      raise exception 'Accepted Plan Marketing Direction target function public.% already exists; refusing partial installation.', v_name;
    end if;
  end loop;
end;
$$;

create function public.servsync_private_marketing_direction_audience_matches(
  p_plan_audience text,
  p_audience_key text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  with normalized as (
    select regexp_replace(lower(btrim(coalesce(p_plan_audience, ''))), '[^a-z0-9]+', ' ', 'g') as value
  )
  select case p_audience_key
    when 'small_contractors' then value = any(array['small contractor', 'small contractors', 'small service contractor', 'small service contractors'])
    when 'hvac_contractors' then value = any(array['hvac', 'hvac contractor', 'hvac contractors'])
    when 'plumbers' then value = any(array['plumber', 'plumbers', 'plumbing', 'plumbing contractor', 'plumbing contractors'])
    when 'electricians' then value = any(array['electrician', 'electricians', 'electrical', 'electrical contractor', 'electrical contractors'])
    when 'carpentry_contractors' then value = any(array['carpenter', 'carpenters', 'carpentry', 'carpentry contractor', 'carpentry contractors'])
    when 'lawn_landscaping_contractors' then value = any(array['landscaper', 'landscapers', 'landscaping', 'landscaping contractor', 'landscaping contractors', 'lawn care', 'lawn care and landscaping', 'lawn care contractor', 'lawn care contractors'])
    when 'pressure_washing_contractors' then value = any(array['pressure washing', 'pressure washer', 'pressure washers', 'pressure washing contractor', 'pressure washing contractors'])
    when 'handyman_contractors' then value = any(array['handyman', 'handymen', 'general maintenance', 'handyman and general maintenance', 'handyman contractor', 'handyman contractors'])
    when 'homeowners' then value = any(array['homeowner', 'homeowners', 'local homeowner', 'local homeowners'])
    else false
  end
  from normalized;
$$;

create function public.servsync_private_marketing_direction_corrections_valid(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_codes text[] := array[]::text[];
  v_code text;
  v_correction text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 4 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select array_agg(key order by key) from jsonb_object_keys(v_item) key) <> array['code', 'correction']::text[] then
      return false;
    end if;
    v_code := v_item ->> 'code';
    v_correction := btrim(coalesce(v_item ->> 'correction', ''));
    if v_code not in (
      'competitor_account_requirement',
      'competitor_app_download_requirement',
      'competitor_subscription_requirement',
      'competitor_inferiority'
    )
       or v_code = any(v_codes)
       or char_length(v_correction) not between 1 and 300
       or v_correction ~ '[[:cntrl:]]' then
      return false;
    end if;
    v_codes := array_append(v_codes, v_code);
  end loop;
  return true;
end;
$$;

create table public.marketing_directions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  preparation_request_id uuid not null,
  request_fingerprint_sha256 text not null,
  source_plan_id uuid not null references public.marketing_plans(id) on delete restrict,
  source_plan_revision bigint not null,
  source_plan_item_index smallint not null,
  source_plan_item_snapshot jsonb not null,
  direction_mode text not null,
  owner_input text null,
  audience_key text not null,
  topic text not null,
  content_role text not null,
  objective text not null,
  statement text not null,
  central_message text not null,
  supporting_points text[] not null default '{}'::text[],
  cautions text[] not null default '{}'::text[],
  corrected_assumptions jsonb not null default '[]'::jsonb,
  recommendation_rationale text null,
  truth_pack_version text not null,
  truth_capability_keys text[] not null,
  preparation_source text not null,
  direction_status text not null default 'draft',
  revision_number bigint not null default 1,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  approved_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz null,
  constraint marketing_directions_logical_unique unique (workspace_id, source_plan_id, source_plan_item_index),
  constraint marketing_directions_request_unique unique (workspace_id, preparation_request_id, source_plan_item_index),
  constraint marketing_directions_request_fingerprint_check check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  constraint marketing_directions_source_revision_check check (source_plan_revision >= 1),
  constraint marketing_directions_source_index_check check (source_plan_item_index between 1 and 7),
  constraint marketing_directions_source_snapshot_check check (jsonb_typeof(source_plan_item_snapshot) = 'object'),
  constraint marketing_directions_mode_check check (direction_mode in ('owner_led', 'recommended')),
  constraint marketing_directions_owner_input_check check (
    (direction_mode = 'owner_led' and owner_input is not null and char_length(btrim(owner_input)) between 1 and 1000 and owner_input !~ '[[:cntrl:]]')
    or (direction_mode = 'recommended' and owner_input is null)
  ),
  constraint marketing_directions_audience_check check (audience_key in (
    'small_contractors', 'hvac_contractors', 'plumbers', 'electricians',
    'carpentry_contractors', 'lawn_landscaping_contractors',
    'pressure_washing_contractors', 'handyman_contractors', 'homeowners'
  )),
  constraint marketing_directions_topic_check check (char_length(btrim(topic)) between 1 and 160 and topic !~ '[[:cntrl:]]'),
  constraint marketing_directions_role_check check (content_role in (
    'facebook_instagram_post', 'linkedin_post', 'educational_post', 'feature_highlight',
    'short_video_concept', 'problem_solution_post', 'local_contractor_connection',
    'feature_announcement', 'contractor_benefit', 'homeowner_benefit'
  )),
  constraint marketing_directions_objective_check check (char_length(btrim(objective)) between 20 and 240 and objective !~ '[[:cntrl:]]'),
  constraint marketing_directions_statement_check check (char_length(btrim(statement)) between 80 and 500 and statement !~ '[[:cntrl:]]'),
  constraint marketing_directions_central_message_check check (char_length(btrim(central_message)) between 20 and 500 and central_message !~ '[[:cntrl:]]'),
  constraint marketing_directions_supporting_points_check check (public.servsync_private_marketing_text_array_valid(supporting_points, 0, 4, 300)),
  constraint marketing_directions_cautions_check check (public.servsync_private_marketing_text_array_valid(cautions, 0, 4, 300)),
  constraint marketing_directions_corrections_check check (public.servsync_private_marketing_direction_corrections_valid(corrected_assumptions)),
  constraint marketing_directions_rationale_check check (
    (direction_mode = 'recommended' and recommendation_rationale is not null and char_length(btrim(recommendation_rationale)) between 20 and 500 and recommendation_rationale !~ '[[:cntrl:]]')
    or (direction_mode = 'owner_led' and recommendation_rationale is null)
  ),
  constraint marketing_directions_truth_pack_check check (truth_pack_version = 'servsync-marketing-truth-v3'),
  constraint marketing_directions_truth_capabilities_check check (
    public.servsync_private_marketing_text_array_valid(truth_capability_keys, 1, 4, 80)
    and truth_capability_keys <@ array[
      'service_requests', 'estimates', 'not_connected_estimate_delivery',
      'jobs_and_reports', 'not_connected_report_delivery', 'invoices',
      'deposit_and_manual_payments', 'home_history', 'contractor_business_profile'
    ]::text[]
  ),
  constraint marketing_directions_source_check check (preparation_source in ('manual', 'codex_assisted', 'runtime_ai', 'approved_provider')),
  constraint marketing_directions_status_check check (direction_status in ('draft', 'approved')),
  constraint marketing_directions_revision_check check (revision_number >= 1),
  constraint marketing_directions_approval_check check (
    (direction_status = 'draft' and approved_at is null and approved_by is null)
    or (direction_status = 'approved' and approved_at is not null and approved_by is not null)
  )
);

create table public.marketing_direction_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  direction_id uuid not null references public.marketing_directions(id) on delete restrict,
  revision_number bigint not null,
  direction_snapshot jsonb not null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint marketing_direction_revisions_unique unique (direction_id, revision_number),
  constraint marketing_direction_revisions_number_check check (revision_number >= 1),
  constraint marketing_direction_revisions_snapshot_check check (jsonb_typeof(direction_snapshot) = 'object')
);

create index marketing_directions_workspace_status_idx
  on public.marketing_directions(workspace_id, direction_status, updated_at desc, id);
create index marketing_directions_source_plan_idx
  on public.marketing_directions(source_plan_id, source_plan_item_index);
create index marketing_direction_revisions_workspace_idx
  on public.marketing_direction_revisions(workspace_id, created_at desc, id);

create function public.servsync_private_marketing_direction_values_valid(
  p_source_item jsonb,
  p_audience_key text,
  p_objective text,
  p_statement text,
  p_central_message text,
  p_supporting_points text[],
  p_cautions text[],
  p_corrected_assumptions jsonb,
  p_recommendation_rationale text,
  p_truth_capability_keys text[],
  p_direction_mode text,
  p_owner_input text
)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    p_source_item is not null
    and jsonb_typeof(p_source_item) = 'object'
    and public.servsync_private_marketing_direction_audience_matches(p_source_item ->> 'audience', p_audience_key)
    and char_length(btrim(coalesce(p_objective, ''))) between 20 and 240
    and char_length(btrim(coalesce(p_statement, ''))) between 80 and 500
    and char_length(btrim(coalesce(p_central_message, ''))) between 20 and 500
    and lower(regexp_replace(btrim(p_statement), '[[:space:]]+', ' ', 'g'))
        <> lower(regexp_replace(btrim(p_source_item ->> 'direction'), '[[:space:]]+', ' ', 'g'))
    and public.servsync_private_marketing_text_array_valid(coalesce(p_supporting_points, array[]::text[]), 0, 4, 300)
    and public.servsync_private_marketing_text_array_valid(coalesce(p_cautions, array[]::text[]), 0, 4, 300)
    and public.servsync_private_marketing_direction_corrections_valid(coalesce(p_corrected_assumptions, '[]'::jsonb))
    and p_truth_capability_keys is not null
    and public.servsync_private_marketing_text_array_valid(p_truth_capability_keys, 1, 4, 80)
    and p_truth_capability_keys <@ array[
      'service_requests', 'estimates', 'not_connected_estimate_delivery',
      'jobs_and_reports', 'not_connected_report_delivery', 'invoices',
      'deposit_and_manual_payments', 'home_history', 'contractor_business_profile'
    ]::text[]
    and (
      (p_direction_mode = 'recommended' and p_owner_input is null
        and char_length(btrim(coalesce(p_recommendation_rationale, ''))) between 20 and 500)
      or (p_direction_mode = 'owner_led'
        and char_length(btrim(coalesce(p_owner_input, ''))) between 1 and 1000
        and p_recommendation_rationale is null)
    )
    and public.servsync_private_marketing_direction_is_safe(concat_ws(E'\n',
      p_statement,
      p_central_message,
      array_to_string(coalesce(p_supporting_points, array[]::text[]), E'\n')
    ))
    and concat_ws(E'\n',
      p_objective,
      p_statement,
      p_central_message,
      array_to_string(coalesce(p_supporting_points, array[]::text[]), E'\n'),
      array_to_string(coalesce(p_cautions, array[]::text[]), E'\n'),
      coalesce(p_corrected_assumptions::text, ''),
      p_recommendation_rationale
    ) !~* '(^|[^a-z0-9])(sk-[a-z0-9_-]{16,}|service[_ -]?role|bearer[[:space:]]+[a-z0-9._-]{12,})([^a-z0-9]|$)';
$$;

create function public.servsync_private_marketing_direction_snapshot(p_direction public.marketing_directions)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select to_jsonb(p_direction) - 'preparation_request_id' - 'request_fingerprint_sha256';
$$;

create function public.servsync_private_guard_marketing_direction()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'Marketing Directions cannot be deleted.';
  end if;
  if new.workspace_id <> old.workspace_id
     or new.preparation_request_id <> old.preparation_request_id
     or new.request_fingerprint_sha256 <> old.request_fingerprint_sha256
     or new.source_plan_id <> old.source_plan_id
     or new.source_plan_revision <> old.source_plan_revision
     or new.source_plan_item_index <> old.source_plan_item_index
     or new.source_plan_item_snapshot <> old.source_plan_item_snapshot
     or new.direction_mode <> old.direction_mode
     or new.owner_input is distinct from old.owner_input
     or new.audience_key <> old.audience_key
     or new.topic <> old.topic
     or new.content_role <> old.content_role
     or new.truth_pack_version <> old.truth_pack_version
     or new.truth_capability_keys <> old.truth_capability_keys
     or new.preparation_source <> old.preparation_source
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Marketing Direction source and provenance are immutable.';
  end if;
  if old.direction_status = 'approved' then
    raise exception 'Approved Marketing Directions are immutable.';
  end if;
  if new.revision_number <> old.revision_number + 1
     or new.direction_status not in ('draft', 'approved')
     or (new.direction_status = 'draft' and (new.approved_at is not null or new.approved_by is not null))
     or (new.direction_status = 'approved' and (new.approved_at is null or new.approved_by is null)) then
    raise exception 'Invalid Marketing Direction revision.';
  end if;
  return new;
end;
$$;

create trigger marketing_directions_guard
  before update or delete on public.marketing_directions
  for each row execute function public.servsync_private_guard_marketing_direction();
create trigger marketing_directions_no_truncate
  before truncate on public.marketing_directions
  for each statement execute function public.servsync_private_guard_marketing_direction();

create function public.servsync_private_guard_marketing_direction_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Marketing Direction revision history is append-only.';
end;
$$;

create trigger marketing_direction_revisions_immutable
  before update or delete on public.marketing_direction_revisions
  for each row execute function public.servsync_private_guard_marketing_direction_revision();
create trigger marketing_direction_revisions_no_truncate
  before truncate on public.marketing_direction_revisions
  for each statement execute function public.servsync_private_guard_marketing_direction_revision();

create function public.servsync_get_internal_marketing_directions()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_workspace public.marketing_workspaces;
  v_plan public.marketing_plans;
  v_directions jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_workspace
    from public.marketing_workspaces
   where workspace_key = 'servsync_internal'
     and workspace_kind = 'internal'
     and contractor_id is null;

  if v_workspace.id is null then
    raise exception 'Internal Marketing workspace is unavailable.' using errcode = '55000';
  end if;

  select * into v_plan
    from public.marketing_plans
   where workspace_id = v_workspace.id
     and plan_status = 'accepted'
   order by accepted_at desc, id desc
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'direction_id', direction.id,
    'workspace_key', v_workspace.workspace_key,
    'source_plan_id', direction.source_plan_id,
    'source_plan_revision', direction.source_plan_revision,
    'source_plan_item_index', direction.source_plan_item_index,
    'source_plan_item', direction.source_plan_item_snapshot,
    'direction_mode', direction.direction_mode,
    'owner_input', direction.owner_input,
    'audience_key', direction.audience_key,
    'topic', direction.topic,
    'content_role', direction.content_role,
    'objective', direction.objective,
    'statement', direction.statement,
    'central_message', direction.central_message,
    'supporting_points', to_jsonb(direction.supporting_points),
    'cautions', to_jsonb(direction.cautions),
    'corrected_assumptions', direction.corrected_assumptions,
    'recommendation_rationale', direction.recommendation_rationale,
    'truth_pack_version', direction.truth_pack_version,
    'truth_capability_keys', to_jsonb(direction.truth_capability_keys),
    'preparation_source', direction.preparation_source,
    'direction_status', direction.direction_status,
    'revision_number', direction.revision_number,
    'created_at', direction.created_at,
    'updated_at', direction.updated_at,
    'approved_at', direction.approved_at
  ) order by plan.accepted_at desc, direction.source_plan_item_index), '[]'::jsonb)
    into v_directions
    from public.marketing_directions direction
    join public.marketing_plans plan on plan.id = direction.source_plan_id
   where direction.workspace_id = v_workspace.id
     and direction.source_plan_id = v_plan.id;

  return jsonb_build_object(
    'accepted_plan', case when v_plan.id is null then null else jsonb_build_object(
      'plan_id', v_plan.id,
      'title', v_plan.title,
      'revision_number', v_plan.revision_number,
      'item_count', jsonb_array_length(v_plan.items),
      'accepted_at', v_plan.accepted_at
    ) end,
    'directions', v_directions
  );
end;
$$;

create function public.servsync_prepare_internal_marketing_directions(
  p_preparation_request_id uuid,
  p_plan_id uuid,
  p_expected_plan_revision bigint,
  p_truth_pack_version text,
  p_preparation_source text,
  p_direction_mode text,
  p_owner_input text,
  p_directions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_workspace_id uuid;
  v_plan public.marketing_plans;
  v_item jsonb;
  v_source_item jsonb;
  v_direction public.marketing_directions;
  v_ordinal bigint;
  v_index integer;
  v_audience_key text;
  v_objective text;
  v_statement text;
  v_central_message text;
  v_supporting_points text[];
  v_cautions text[];
  v_corrected_assumptions jsonb;
  v_recommendation_rationale text;
  v_truth_capability_keys text[];
  v_fingerprint text;
  v_existing_count integer;
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
     or p_plan_id is null
     or p_truth_pack_version <> 'servsync-marketing-truth-v3'
     or p_preparation_source <> 'codex_assisted'
     or p_direction_mode not in ('owner_led', 'recommended')
     or (p_direction_mode = 'owner_led' and char_length(btrim(coalesce(p_owner_input, ''))) not between 1 and 1000)
     or (p_direction_mode = 'recommended' and p_owner_input is not null)
     or jsonb_typeof(p_directions) <> 'array'
     or jsonb_array_length(p_directions) not between 1 and 7 then
    raise exception 'Invalid Marketing Direction preparation.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || p_preparation_request_id::text, 0));

  select plan.* into v_plan
    from public.marketing_plans plan
   where plan.id = p_plan_id
     and plan.workspace_id = v_workspace_id
   for share;

  if v_plan.id is null then
    raise exception 'Marketing Plan not found.' using errcode = 'P0002';
  end if;
  if v_plan.plan_status <> 'accepted' or v_plan.accepted_at is null then
    raise exception 'Only an accepted Marketing Plan can prepare Directions.' using errcode = '55000';
  end if;
  if (v_plan.plan_mode = 'recommended' and (p_direction_mode <> 'recommended' or p_owner_input is not null))
     or (v_plan.plan_mode = 'owner_directed' and (
       p_direction_mode <> 'owner_led'
       or btrim(coalesce(p_owner_input, '')) <> btrim(coalesce(v_plan.owner_direction, ''))
     )) then
    raise exception 'Marketing Direction mode conflicts with the accepted Plan.' using errcode = '22023';
  end if;
  if p_expected_plan_revision is null or v_plan.revision_number <> p_expected_plan_revision then
    raise exception 'Marketing plan changed; reload and try again.' using errcode = '40001';
  end if;
  if jsonb_array_length(p_directions) <> jsonb_array_length(v_plan.items) then
    raise exception 'Marketing Directions must cover every accepted Plan item exactly once.' using errcode = '22023';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'plan_id', p_plan_id,
    'plan_revision', p_expected_plan_revision,
    'truth_pack_version', p_truth_pack_version,
    'preparation_source', p_preparation_source,
    'direction_mode', p_direction_mode,
    'owner_input', p_owner_input,
    'directions', p_directions
  )::text, 'UTF8'), 'sha256'), 'hex');

  select count(*) into v_existing_count
    from public.marketing_directions
   where workspace_id = v_workspace_id
     and preparation_request_id = p_preparation_request_id;

  if v_existing_count > 0 then
    if v_existing_count <> jsonb_array_length(v_plan.items)
       or exists (
         select 1 from public.marketing_directions
          where workspace_id = v_workspace_id
            and preparation_request_id = p_preparation_request_id
            and (source_plan_id <> p_plan_id
              or source_plan_revision <> p_expected_plan_revision
              or request_fingerprint_sha256 <> v_fingerprint)
       ) then
      raise exception 'Marketing Direction preparation conflicts with an existing request.' using errcode = '23505';
    end if;
    select jsonb_agg(id order by source_plan_item_index) into v_direction_ids
      from public.marketing_directions
     where workspace_id = v_workspace_id
       and preparation_request_id = p_preparation_request_id;
    return jsonb_build_object(
      'preparation_request_id', p_preparation_request_id,
      'source_plan_id', p_plan_id,
      'source_plan_revision', p_expected_plan_revision,
      'direction_count', v_existing_count,
      'direction_ids', v_direction_ids,
      'status', 'draft',
      'replayed', true
    );
  end if;

  if exists (
    select 1 from public.marketing_directions
     where workspace_id = v_workspace_id
       and source_plan_id = p_plan_id
  ) then
    raise exception 'Marketing Directions already exist for this accepted Plan.' using errcode = '23505';
  end if;

  for v_item, v_ordinal in
    select value, ordinality from jsonb_array_elements(p_directions) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object'
       or (select array_agg(key order by key) from jsonb_object_keys(v_item) key) <> array[
         'audience_key', 'cautions', 'central_message', 'corrected_assumptions',
         'objective', 'plan_item_index', 'recommendation_rationale', 'statement',
         'supporting_points', 'truth_capability_keys'
       ]::text[] then
      raise exception 'Invalid Marketing Direction at position %.', v_ordinal using errcode = '22023';
    end if;

    v_index := (v_item ->> 'plan_item_index')::integer;
    if v_index <> v_ordinal then
      raise exception 'Marketing Direction order conflicts with the accepted Plan.' using errcode = '22023';
    end if;
    v_source_item := v_plan.items -> (v_index - 1);
    v_audience_key := btrim(v_item ->> 'audience_key');
    v_objective := btrim(v_item ->> 'objective');
    v_statement := btrim(v_item ->> 'statement');
    v_central_message := btrim(v_item ->> 'central_message');
    select coalesce(array_agg(value order by ordinality), array[]::text[]) into v_supporting_points
      from jsonb_array_elements_text(coalesce(v_item -> 'supporting_points', '[]'::jsonb)) with ordinality;
    select coalesce(array_agg(value order by ordinality), array[]::text[]) into v_cautions
      from jsonb_array_elements_text(coalesce(v_item -> 'cautions', '[]'::jsonb)) with ordinality;
    v_corrected_assumptions := coalesce(v_item -> 'corrected_assumptions', '[]'::jsonb);
    v_recommendation_rationale := nullif(btrim(coalesce(v_item ->> 'recommendation_rationale', '')), '');
    select coalesce(array_agg(value order by ordinality), array[]::text[]) into v_truth_capability_keys
      from jsonb_array_elements_text(coalesce(v_item -> 'truth_capability_keys', '[]'::jsonb)) with ordinality;

    if not public.servsync_private_marketing_direction_values_valid(
      v_source_item, v_audience_key, v_objective, v_statement, v_central_message,
      v_supporting_points, v_cautions, v_corrected_assumptions,
      v_recommendation_rationale, v_truth_capability_keys, p_direction_mode, p_owner_input
    ) then
      raise exception 'Invalid or insufficiently specific Marketing Direction at position %.', v_ordinal using errcode = '22023';
    end if;

    insert into public.marketing_directions (
      workspace_id, preparation_request_id, request_fingerprint_sha256,
      source_plan_id, source_plan_revision, source_plan_item_index, source_plan_item_snapshot,
      direction_mode, owner_input, audience_key, topic, content_role,
      objective, statement, central_message, supporting_points, cautions,
      corrected_assumptions, recommendation_rationale, truth_pack_version,
      truth_capability_keys, preparation_source, direction_status,
      revision_number, created_by, updated_by
    ) values (
      v_workspace_id, p_preparation_request_id, v_fingerprint,
      v_plan.id, v_plan.revision_number, v_index, v_source_item,
      p_direction_mode, nullif(btrim(coalesce(p_owner_input, '')), ''), v_audience_key,
      v_source_item ->> 'topic', v_source_item #>> '{content_roles,0}',
      v_objective, v_statement, v_central_message, v_supporting_points, v_cautions,
      v_corrected_assumptions, v_recommendation_rationale, p_truth_pack_version,
      v_truth_capability_keys, p_preparation_source, 'draft', 1, auth.uid(), auth.uid()
    ) returning * into v_direction;

    insert into public.marketing_direction_revisions (
      workspace_id, direction_id, revision_number, direction_snapshot, actor_user_id
    ) values (
      v_direction.workspace_id, v_direction.id, v_direction.revision_number,
      public.servsync_private_marketing_direction_snapshot(v_direction), auth.uid()
    );
  end loop;

  select jsonb_agg(id order by source_plan_item_index) into v_direction_ids
    from public.marketing_directions
   where workspace_id = v_workspace_id
     and preparation_request_id = p_preparation_request_id;

  return jsonb_build_object(
    'preparation_request_id', p_preparation_request_id,
    'source_plan_id', p_plan_id,
    'source_plan_revision', p_expected_plan_revision,
    'direction_count', jsonb_array_length(v_direction_ids),
    'direction_ids', v_direction_ids,
    'status', 'draft',
    'replayed', false
  );
exception
  when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
    raise exception 'Invalid Marketing Direction preparation.' using errcode = '22023';
end;
$$;

create function public.servsync_update_internal_marketing_direction(
  p_direction_id uuid,
  p_expected_revision bigint,
  p_objective text,
  p_statement text,
  p_central_message text,
  p_supporting_points text[],
  p_cautions text[],
  p_corrected_assumptions jsonb,
  p_recommendation_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_direction public.marketing_directions;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select direction.* into v_direction
    from public.marketing_directions direction
    join public.marketing_workspaces workspace on workspace.id = direction.workspace_id
   where direction.id = p_direction_id
     and workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
     and workspace.contractor_id is null
   for update of direction;

  if v_direction.id is null then raise exception 'Marketing Direction not found.' using errcode = 'P0002'; end if;
  if p_expected_revision is null or v_direction.revision_number <> p_expected_revision then
    raise exception 'Marketing Direction changed; reload and try again.' using errcode = '40001';
  end if;
  if v_direction.direction_status <> 'draft' then
    raise exception 'Approved Marketing Directions cannot be edited.' using errcode = '55000';
  end if;
  if not public.servsync_private_marketing_direction_values_valid(
    v_direction.source_plan_item_snapshot,
    v_direction.audience_key,
    btrim(coalesce(p_objective, '')),
    btrim(coalesce(p_statement, '')),
    btrim(coalesce(p_central_message, '')),
    coalesce(p_supporting_points, array[]::text[]),
    coalesce(p_cautions, array[]::text[]),
    coalesce(p_corrected_assumptions, '[]'::jsonb),
    nullif(btrim(coalesce(p_recommendation_rationale, '')), ''),
    v_direction.truth_capability_keys,
    v_direction.direction_mode,
    v_direction.owner_input
  ) then
    raise exception 'Invalid or insufficiently specific Marketing Direction.' using errcode = '22023';
  end if;

  update public.marketing_directions
     set objective = btrim(p_objective),
         statement = btrim(p_statement),
         central_message = btrim(p_central_message),
         supporting_points = coalesce(p_supporting_points, array[]::text[]),
         cautions = coalesce(p_cautions, array[]::text[]),
         corrected_assumptions = coalesce(p_corrected_assumptions, '[]'::jsonb),
         recommendation_rationale = nullif(btrim(coalesce(p_recommendation_rationale, '')), ''),
         revision_number = revision_number + 1,
         updated_by = auth.uid(),
         updated_at = now()
   where id = v_direction.id
  returning * into v_direction;

  insert into public.marketing_direction_revisions (
    workspace_id, direction_id, revision_number, direction_snapshot, actor_user_id
  ) values (
    v_direction.workspace_id, v_direction.id, v_direction.revision_number,
    public.servsync_private_marketing_direction_snapshot(v_direction), auth.uid()
  );

  return jsonb_build_object('direction_id', v_direction.id, 'revision_number', v_direction.revision_number, 'status', v_direction.direction_status);
exception
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception 'Invalid Marketing Direction.' using errcode = '22023';
end;
$$;

create function public.servsync_approve_internal_marketing_direction(
  p_direction_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_direction public.marketing_directions;
  v_plan public.marketing_plans;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select direction.* into v_direction
    from public.marketing_directions direction
    join public.marketing_workspaces workspace on workspace.id = direction.workspace_id
   where direction.id = p_direction_id
     and workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
     and workspace.contractor_id is null
   for update of direction;

  if v_direction.id is null then raise exception 'Marketing Direction not found.' using errcode = 'P0002'; end if;
  if p_expected_revision is null or v_direction.revision_number <> p_expected_revision then
    raise exception 'Marketing Direction changed; reload and try again.' using errcode = '40001';
  end if;
  if v_direction.direction_status <> 'draft' then
    raise exception 'Marketing Direction is already approved.' using errcode = '55000';
  end if;

  select * into v_plan from public.marketing_plans where id = v_direction.source_plan_id for share;
  if v_plan.id is null
     or v_plan.workspace_id <> v_direction.workspace_id
     or v_plan.plan_status <> 'accepted'
     or v_plan.revision_number <> v_direction.source_plan_revision
     or v_plan.items -> (v_direction.source_plan_item_index - 1) <> v_direction.source_plan_item_snapshot then
    raise exception 'Marketing Direction source Plan is no longer valid.' using errcode = '55000';
  end if;

  update public.marketing_directions
     set direction_status = 'approved',
         revision_number = revision_number + 1,
         approved_by = auth.uid(),
         approved_at = now(),
         updated_by = auth.uid(),
         updated_at = now()
   where id = v_direction.id
  returning * into v_direction;

  insert into public.marketing_direction_revisions (
    workspace_id, direction_id, revision_number, direction_snapshot, actor_user_id
  ) values (
    v_direction.workspace_id, v_direction.id, v_direction.revision_number,
    public.servsync_private_marketing_direction_snapshot(v_direction), auth.uid()
  );

  return jsonb_build_object('direction_id', v_direction.id, 'revision_number', v_direction.revision_number, 'status', v_direction.direction_status);
end;
$$;

alter table public.marketing_directions owner to postgres;
alter table public.marketing_direction_revisions owner to postgres;

alter function public.servsync_private_marketing_direction_audience_matches(text,text) owner to postgres;
alter function public.servsync_private_marketing_direction_corrections_valid(jsonb) owner to postgres;
alter function public.servsync_private_marketing_direction_values_valid(jsonb,text,text,text,text,text[],text[],jsonb,text,text[],text,text) owner to postgres;
alter function public.servsync_private_marketing_direction_snapshot(public.marketing_directions) owner to postgres;
alter function public.servsync_private_guard_marketing_direction() owner to postgres;
alter function public.servsync_private_guard_marketing_direction_revision() owner to postgres;
alter function public.servsync_get_internal_marketing_directions() owner to postgres;
alter function public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb) owner to postgres;
alter function public.servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text) owner to postgres;
alter function public.servsync_approve_internal_marketing_direction(uuid,bigint) owner to postgres;

alter table public.marketing_directions enable row level security;
alter table public.marketing_directions force row level security;
alter table public.marketing_direction_revisions enable row level security;
alter table public.marketing_direction_revisions force row level security;

revoke all privileges on table public.marketing_directions from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_direction_revisions from public, anon, authenticated, service_role;

revoke all privileges on function public.servsync_private_marketing_direction_audience_matches(text,text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_marketing_direction_corrections_valid(jsonb) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_marketing_direction_values_valid(jsonb,text,text,text,text,text[],text[],jsonb,text,text[],text,text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_marketing_direction_snapshot(public.marketing_directions) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_guard_marketing_direction() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_guard_marketing_direction_revision() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_get_internal_marketing_directions() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_approve_internal_marketing_direction(uuid,bigint) from public, anon, authenticated, service_role;

grant execute on function public.servsync_get_internal_marketing_directions() to authenticated;
grant execute on function public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb) to authenticated;
grant execute on function public.servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text) to authenticated;
grant execute on function public.servsync_approve_internal_marketing_direction(uuid,bigint) to authenticated;

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.servsync_get_internal_marketing_directions()'::regprocedure,
    'public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb)'::regprocedure,
    'public.servsync_update_internal_marketing_direction(uuid,bigint,text,text,text,text[],text[],jsonb,text)'::regprocedure,
    'public.servsync_approve_internal_marketing_direction(uuid,bigint)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef or proconfig <> array['search_path=pg_catalog, public, auth'] from pg_proc where oid = v_function)
       and v_function <> 'public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb)'::regprocedure then
      raise exception 'Marketing Direction RPC security mismatch for %.', v_function;
    end if;
    if v_function = 'public.servsync_prepare_internal_marketing_directions(uuid,uuid,bigint,text,text,text,text,jsonb)'::regprocedure
       and (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef or proconfig <> array['search_path=pg_catalog, public, auth, extensions'] from pg_proc where oid = v_function) then
      raise exception 'Marketing Direction preparation RPC security mismatch.';
    end if;
    if not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Marketing Direction RPC grant mismatch for %.', v_function;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('marketing_directions', 'marketing_direction_revisions')
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Marketing Direction direct-table grant mismatch.';
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');

commit;
