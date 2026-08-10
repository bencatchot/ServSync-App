-- ServSync Business Marketing Profile + Planning Foundation v1.
--
-- Adds private, provider-neutral Marketing strategy and planning records on the
-- existing workspace tenant anchor. Current browser authority remains limited
-- to the ServSync internal workspace and platform administrators. No content,
-- campaign, publishing, scheduling, provider, contractor UI, or homeowner UI
-- is created or activated by this migration.

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.marketing_workspaces') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regclass('public.marketing_content_preparation_packages') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null
     or to_regprocedure('public.servsync_private_marketing_direction_is_safe(text)') is null then
    raise exception 'Missing Business Marketing Profile prerequisite.';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'marketing_business_profiles',
    'marketing_business_profile_revisions',
    'marketing_plans',
    'marketing_plan_revisions'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Business Marketing Profile target public.% already exists; refusing partial or repeated installation.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'servsync_private_marketing_text_array_valid(text[],integer,integer,integer)',
    'servsync_private_marketing_plan_items_valid(jsonb)',
    'servsync_private_marketing_planning_revision_guard()',
    'servsync_private_internal_marketing_recent_context(uuid)',
    'servsync_get_internal_marketing_planning()',
    'servsync_update_internal_marketing_profile(bigint,text,text[],text[],text,text[],text,text,text[],text[],text[],text[],text)',
    'servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb)',
    'servsync_update_internal_marketing_plan(uuid,bigint,text,date,date,text,jsonb)',
    'servsync_accept_internal_marketing_plan(uuid,bigint)'
  ] loop
    if to_regprocedure('public.' || v_name) is not null then
      raise exception 'Business Marketing Profile target function public.% already exists; refusing partial installation.', v_name;
    end if;
  end loop;

  if not exists (
    select 1 from public.marketing_workspaces
     where id = '00000000-0000-4000-8000-000000000037'
       and workspace_key = 'servsync_internal'
       and workspace_kind = 'internal'
       and contractor_id is null
  ) then
    raise exception 'Exact ServSync internal Marketing workspace prerequisite is unavailable.';
  end if;
end;
$$;

create function public.servsync_private_marketing_text_array_valid(
  p_values text[],
  p_min integer,
  p_max integer,
  p_item_max integer
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value text;
begin
  if p_values is null
     or p_min < 0
     or p_max < p_min
     or p_item_max < 1
     or cardinality(p_values) not between p_min and p_max then
    return false;
  end if;

  foreach v_value in array p_values loop
    if v_value is null
       or v_value <> btrim(v_value)
       or char_length(v_value) not between 1 and p_item_max
       or v_value ~ '[[:cntrl:]]' then
      return false;
    end if;
  end loop;

  return not exists (
    select 1
      from unnest(p_values) value
     group by lower(value)
    having count(*) > 1
  );
end;
$$;

create function public.servsync_private_marketing_plan_items_valid(p_items jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_keys text[];
  v_role jsonb;
  v_role_values text[];
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 7 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;

    select array_agg(key order by key) into v_keys from jsonb_object_keys(v_item) key;
    if v_keys <> array['audience', 'content_roles', 'direction', 'rationale', 'topic']::text[] then
      return false;
    end if;

    if jsonb_typeof(v_item -> 'audience') <> 'string'
       or char_length(btrim(v_item ->> 'audience')) not between 1 and 160
       or (v_item ->> 'audience') ~ '[[:cntrl:]]'
       or jsonb_typeof(v_item -> 'topic') <> 'string'
       or char_length(btrim(v_item ->> 'topic')) not between 1 and 160
       or (v_item ->> 'topic') ~ '[[:cntrl:]]'
       or jsonb_typeof(v_item -> 'direction') <> 'string'
       or char_length(btrim(v_item ->> 'direction')) not between 3 and 1000
       or (v_item ->> 'direction') ~ '[[:cntrl:]]'
       or not public.servsync_private_marketing_direction_is_safe(v_item ->> 'direction')
       or jsonb_typeof(v_item -> 'rationale') <> 'string'
       or char_length(btrim(v_item ->> 'rationale')) not between 3 and 1000
       or (v_item ->> 'rationale') ~ '[[:cntrl:]]'
       or jsonb_typeof(v_item -> 'content_roles') <> 'array'
       or jsonb_array_length(v_item -> 'content_roles') not between 1 and 3 then
      return false;
    end if;

    v_role_values := array[]::text[];
    for v_role in select value from jsonb_array_elements(v_item -> 'content_roles') loop
      if jsonb_typeof(v_role) <> 'string'
         or trim(both '"' from v_role::text) not in (
           'facebook_instagram_post', 'linkedin_post', 'educational_post', 'feature_highlight',
           'short_video_concept', 'problem_solution_post', 'local_contractor_connection',
           'feature_announcement', 'contractor_benefit', 'homeowner_benefit'
         ) then
        return false;
      end if;
      v_role_values := array_append(v_role_values, trim(both '"' from v_role::text));
    end loop;

    if cardinality(v_role_values) <> (select count(distinct role) from unnest(v_role_values) role) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create table public.marketing_business_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.marketing_workspaces(id) on delete restrict,
  marketing_name text null,
  business_summary text not null,
  audience_segments text[] not null,
  service_focus text[] not null,
  primary_goal text not null,
  secondary_goals text[] not null default '{}'::text[],
  geographic_focus text null,
  tone_style text not null,
  offers text[] not null default '{}'::text[],
  preferred_channels text[] not null,
  emphasized_topics text[] not null,
  avoided_topics text[] not null default '{}'::text[],
  owner_notes text not null default '',
  profile_status text not null default 'incomplete',
  profile_version bigint not null default 1,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_business_profiles_name_check
    check (marketing_name is null or (char_length(btrim(marketing_name)) between 1 and 120 and marketing_name !~ '[[:cntrl:]]')),
  constraint marketing_business_profiles_summary_check
    check (char_length(btrim(business_summary)) between 10 and 2000 and business_summary !~ '[[:cntrl:]]'),
  constraint marketing_business_profiles_audiences_check
    check (public.servsync_private_marketing_text_array_valid(audience_segments, 1, 12, 160)),
  constraint marketing_business_profiles_service_focus_check
    check (public.servsync_private_marketing_text_array_valid(service_focus, 1, 20, 160)),
  constraint marketing_business_profiles_primary_goal_check
    check (char_length(btrim(primary_goal)) between 3 and 300 and primary_goal !~ '[[:cntrl:]]'),
  constraint marketing_business_profiles_secondary_goals_check
    check (public.servsync_private_marketing_text_array_valid(secondary_goals, 0, 12, 300)),
  constraint marketing_business_profiles_geography_check
    check (geographic_focus is null or (char_length(btrim(geographic_focus)) between 1 and 300 and geographic_focus !~ '[[:cntrl:]]')),
  constraint marketing_business_profiles_tone_check
    check (char_length(btrim(tone_style)) between 3 and 300 and tone_style !~ '[[:cntrl:]]'),
  constraint marketing_business_profiles_offers_check
    check (public.servsync_private_marketing_text_array_valid(offers, 0, 12, 300)),
  constraint marketing_business_profiles_channels_check
    check (
      public.servsync_private_marketing_text_array_valid(preferred_channels, 1, 5, 32)
      and preferred_channels <@ array['social', 'website', 'video', 'email', 'other']::text[]
    ),
  constraint marketing_business_profiles_emphasis_check
    check (public.servsync_private_marketing_text_array_valid(emphasized_topics, 1, 20, 160)),
  constraint marketing_business_profiles_avoid_check
    check (public.servsync_private_marketing_text_array_valid(avoided_topics, 0, 20, 160)),
  constraint marketing_business_profiles_notes_check
    check (char_length(owner_notes) <= 2000),
  constraint marketing_business_profiles_status_check
    check (profile_status in ('incomplete', 'ready')),
  constraint marketing_business_profiles_version_check
    check (profile_version >= 1)
);

create table public.marketing_business_profile_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  profile_id uuid not null references public.marketing_business_profiles(id) on delete restrict,
  profile_version bigint not null,
  profile_snapshot jsonb not null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint marketing_business_profile_revisions_unique unique (profile_id, profile_version),
  constraint marketing_business_profile_revisions_version_check check (profile_version >= 1),
  constraint marketing_business_profile_revisions_snapshot_check check (jsonb_typeof(profile_snapshot) = 'object')
);

create index marketing_business_profile_revisions_workspace_idx
  on public.marketing_business_profile_revisions(workspace_id, created_at desc, id);

create table public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  client_request_id uuid not null,
  profile_version bigint not null,
  plan_mode text not null,
  plan_status text not null default 'draft',
  title text not null,
  planning_start date not null,
  planning_end date not null,
  owner_direction text null,
  recent_content_context jsonb not null,
  items jsonb not null,
  revision_number bigint not null default 1,
  created_by uuid null references public.profiles(id) on delete set null,
  accepted_by uuid null references public.profiles(id) on delete set null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_plans_request_unique unique (workspace_id, client_request_id),
  constraint marketing_plans_profile_version_check check (profile_version >= 1),
  constraint marketing_plans_mode_check check (plan_mode in ('owner_directed', 'recommended')),
  constraint marketing_plans_status_check check (plan_status in ('draft', 'accepted')),
  constraint marketing_plans_title_check check (char_length(btrim(title)) between 3 and 160 and title !~ '[[:cntrl:]]'),
  constraint marketing_plans_period_check check (planning_end >= planning_start and planning_end <= planning_start + 93),
  constraint marketing_plans_direction_check check (
    (plan_mode = 'owner_directed' and owner_direction is not null and char_length(btrim(owner_direction)) between 3 and 1000)
    or (plan_mode = 'recommended' and owner_direction is null)
  ),
  constraint marketing_plans_recent_context_check check (
    jsonb_typeof(recent_content_context) = 'object'
    and recent_content_context ->> 'window_limit' = '20'
    and jsonb_typeof(recent_content_context -> 'items') = 'array'
  ),
  constraint marketing_plans_items_check check (public.servsync_private_marketing_plan_items_valid(items)),
  constraint marketing_plans_revision_check check (revision_number >= 1),
  constraint marketing_plans_acceptance_check check ((accepted_at is null) = (accepted_by is null))
);

create index marketing_plans_workspace_idx
  on public.marketing_plans(workspace_id, created_at desc, id);

create table public.marketing_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  plan_id uuid not null references public.marketing_plans(id) on delete restrict,
  revision_number bigint not null,
  plan_snapshot jsonb not null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint marketing_plan_revisions_unique unique (plan_id, revision_number),
  constraint marketing_plan_revisions_version_check check (revision_number >= 1),
  constraint marketing_plan_revisions_snapshot_check check (jsonb_typeof(plan_snapshot) = 'object')
);

create index marketing_plan_revisions_workspace_idx
  on public.marketing_plan_revisions(workspace_id, created_at desc, id);

create function public.servsync_private_marketing_planning_revision_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Marketing planning revision history is append-only.';
end;
$$;

create trigger marketing_business_profile_revisions_immutable
  before update or delete on public.marketing_business_profile_revisions
  for each row execute function public.servsync_private_marketing_planning_revision_guard();

create trigger marketing_business_profile_revisions_no_truncate
  before truncate on public.marketing_business_profile_revisions
  for each statement execute function public.servsync_private_marketing_planning_revision_guard();

create trigger marketing_plan_revisions_immutable
  before update or delete on public.marketing_plan_revisions
  for each row execute function public.servsync_private_marketing_planning_revision_guard();

create trigger marketing_plan_revisions_no_truncate
  before truncate on public.marketing_plan_revisions
  for each statement execute function public.servsync_private_marketing_planning_revision_guard();

insert into public.marketing_business_profiles (
  id,
  workspace_id,
  marketing_name,
  business_summary,
  audience_segments,
  service_focus,
  primary_goal,
  secondary_goals,
  geographic_focus,
  tone_style,
  offers,
  preferred_channels,
  emphasized_topics,
  avoided_topics,
  owner_notes,
  profile_status,
  profile_version
) values (
  '00000000-0000-4000-8000-000000000038',
  '00000000-0000-4000-8000-000000000037',
  'ServSync',
  'ServSync connects homeowners and contractors while helping small service businesses keep requests, estimates, approvals, jobs, invoices, customer communication, and property history organized.',
  array['Small contractors', 'HVAC contractors', 'Plumbing contractors', 'Electrical contractors', 'Homeowners'],
  array['Contractor workflow software', 'Homeowner-contractor connections', 'Product education', 'Feature demonstrations'],
  'Increase qualified awareness and consideration of ServSync.',
  array['Educate contractors', 'Educate homeowners', 'Explain current product workflows'],
  null,
  'Practical, plain-language, professional, and approachable.',
  array[]::text[],
  array['social', 'website', 'video'],
  array['Customer requests', 'Estimates and approvals', 'Jobs', 'Invoices', 'Customer communication', 'Home History', 'Secure document links', 'Connected homeowner relationships', 'Product demonstrations'],
  array['Unsupported metrics', 'Invented testimonials', 'Guarantees', 'Unsupported integrations', 'Manufactured competitor claims'],
  'ServSync internal strategy is specific to this workspace and must never become a contractor Marketing default.',
  'ready',
  1
);

insert into public.marketing_business_profile_revisions (
  workspace_id,
  profile_id,
  profile_version,
  profile_snapshot,
  actor_user_id
)
select
  profile.workspace_id,
  profile.id,
  profile.profile_version,
  jsonb_build_object(
    'marketing_name', profile.marketing_name,
    'business_summary', profile.business_summary,
    'audience_segments', to_jsonb(profile.audience_segments),
    'service_focus', to_jsonb(profile.service_focus),
    'primary_goal', profile.primary_goal,
    'secondary_goals', to_jsonb(profile.secondary_goals),
    'geographic_focus', profile.geographic_focus,
    'tone_style', profile.tone_style,
    'offers', to_jsonb(profile.offers),
    'preferred_channels', to_jsonb(profile.preferred_channels),
    'emphasized_topics', to_jsonb(profile.emphasized_topics),
    'avoided_topics', to_jsonb(profile.avoided_topics),
    'owner_notes', profile.owner_notes,
    'profile_status', profile.profile_status
  ),
  null
from public.marketing_business_profiles profile
where profile.id = '00000000-0000-4000-8000-000000000038';

create function public.servsync_private_internal_marketing_recent_context(p_workspace_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with recent as (
    select
      item.id,
      item.title,
      item.status,
      item.intended_audience,
      item.content_role,
      item.updated_at
    from public.marketing_content_items item
    where item.workspace_id = p_workspace_id
    order by item.updated_at desc, item.id
    limit 20
  )
  select jsonb_build_object(
    'window_limit', 20,
    'item_count', count(*),
    'items', coalesce(
      jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'title', recent.title,
        'status', recent.status,
        'intended_audience', recent.intended_audience,
        'content_role', recent.content_role,
        'updated_at', recent.updated_at
      ) order by recent.updated_at desc, recent.id),
      '[]'::jsonb
    )
  )
  from recent;
$$;

create function public.servsync_get_internal_marketing_planning()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare
  v_workspace public.marketing_workspaces;
  v_profile public.marketing_business_profiles;
  v_plan public.marketing_plans;
  v_recent jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_workspace
    from public.marketing_workspaces
   where workspace_key = 'servsync_internal'
     and workspace_kind = 'internal'
     and contractor_id is null;

  select * into v_profile
    from public.marketing_business_profiles
   where workspace_id = v_workspace.id;

  if v_workspace.id is null or v_profile.id is null then
    raise exception 'Internal Marketing Profile is unavailable.' using errcode = '55000';
  end if;

  select * into v_plan
    from public.marketing_plans
   where workspace_id = v_workspace.id
   order by created_at desc, id desc
   limit 1;

  v_recent := public.servsync_private_internal_marketing_recent_context(v_workspace.id);

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'profile_id', v_profile.id,
      'workspace_key', v_workspace.workspace_key,
      'workspace_kind', v_workspace.workspace_kind,
      'contractor_id', v_workspace.contractor_id,
      'business_name', coalesce(v_profile.marketing_name, v_workspace.display_name),
      'business_summary', v_profile.business_summary,
      'audience_segments', to_jsonb(v_profile.audience_segments),
      'service_focus', to_jsonb(v_profile.service_focus),
      'primary_goal', v_profile.primary_goal,
      'secondary_goals', to_jsonb(v_profile.secondary_goals),
      'geographic_focus', v_profile.geographic_focus,
      'tone_style', v_profile.tone_style,
      'offers', to_jsonb(v_profile.offers),
      'preferred_channels', to_jsonb(v_profile.preferred_channels),
      'emphasized_topics', to_jsonb(v_profile.emphasized_topics),
      'avoided_topics', to_jsonb(v_profile.avoided_topics),
      'owner_notes', v_profile.owner_notes,
      'profile_status', v_profile.profile_status,
      'profile_version', v_profile.profile_version,
      'updated_at', v_profile.updated_at
    ),
    'plan', case when v_plan.id is null then null else jsonb_build_object(
      'plan_id', v_plan.id,
      'workspace_key', v_workspace.workspace_key,
      'plan_mode', v_plan.plan_mode,
      'plan_status', v_plan.plan_status,
      'title', v_plan.title,
      'planning_start', v_plan.planning_start,
      'planning_end', v_plan.planning_end,
      'owner_direction', v_plan.owner_direction,
      'profile_version', v_plan.profile_version,
      'recent_content_context', v_plan.recent_content_context,
      'items', v_plan.items,
      'revision_number', v_plan.revision_number,
      'created_at', v_plan.created_at,
      'updated_at', v_plan.updated_at,
      'accepted_at', v_plan.accepted_at
    ) end,
    'recent_content', v_recent
  );
end;
$$;

create function public.servsync_update_internal_marketing_profile(
  p_expected_version bigint,
  p_business_summary text,
  p_audience_segments text[],
  p_service_focus text[],
  p_primary_goal text,
  p_secondary_goals text[],
  p_geographic_focus text,
  p_tone_style text,
  p_offers text[],
  p_preferred_channels text[],
  p_emphasized_topics text[],
  p_avoided_topics text[],
  p_owner_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_profile public.marketing_business_profiles;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select profile.* into v_profile
    from public.marketing_business_profiles profile
    join public.marketing_workspaces workspace on workspace.id = profile.workspace_id
   where workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
     and workspace.contractor_id is null
   for update of profile;

  if v_profile.id is null then
    raise exception 'Internal Marketing Profile is unavailable.' using errcode = '55000';
  end if;
  if p_expected_version is null or v_profile.profile_version <> p_expected_version then
    raise exception 'Marketing profile changed; reload and try again.' using errcode = '40001';
  end if;

  update public.marketing_business_profiles
     set business_summary = btrim(coalesce(p_business_summary, '')),
         audience_segments = p_audience_segments,
         service_focus = p_service_focus,
         primary_goal = btrim(coalesce(p_primary_goal, '')),
         secondary_goals = coalesce(p_secondary_goals, array[]::text[]),
         geographic_focus = nullif(btrim(coalesce(p_geographic_focus, '')), ''),
         tone_style = btrim(coalesce(p_tone_style, '')),
         offers = coalesce(p_offers, array[]::text[]),
         preferred_channels = p_preferred_channels,
         emphasized_topics = p_emphasized_topics,
         avoided_topics = coalesce(p_avoided_topics, array[]::text[]),
         owner_notes = coalesce(p_owner_notes, ''),
         profile_status = 'ready',
         profile_version = profile_version + 1,
         updated_by = auth.uid(),
         updated_at = now()
   where id = v_profile.id
  returning * into v_profile;

  insert into public.marketing_business_profile_revisions (
    workspace_id, profile_id, profile_version, profile_snapshot, actor_user_id
  ) values (
    v_profile.workspace_id,
    v_profile.id,
    v_profile.profile_version,
    jsonb_build_object(
      'marketing_name', v_profile.marketing_name,
      'business_summary', v_profile.business_summary,
      'audience_segments', to_jsonb(v_profile.audience_segments),
      'service_focus', to_jsonb(v_profile.service_focus),
      'primary_goal', v_profile.primary_goal,
      'secondary_goals', to_jsonb(v_profile.secondary_goals),
      'geographic_focus', v_profile.geographic_focus,
      'tone_style', v_profile.tone_style,
      'offers', to_jsonb(v_profile.offers),
      'preferred_channels', to_jsonb(v_profile.preferred_channels),
      'emphasized_topics', to_jsonb(v_profile.emphasized_topics),
      'avoided_topics', to_jsonb(v_profile.avoided_topics),
      'owner_notes', v_profile.owner_notes,
      'profile_status', v_profile.profile_status
    ),
    auth.uid()
  );

  return jsonb_build_object('profile_id', v_profile.id, 'revision_number', v_profile.profile_version);
exception
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception 'Invalid Marketing Profile.' using errcode = '22023';
end;
$$;

create function public.servsync_create_internal_marketing_plan(
  p_client_request_id uuid,
  p_profile_version bigint,
  p_mode text,
  p_title text,
  p_planning_start date,
  p_planning_end date,
  p_owner_direction text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_workspace_id uuid;
  v_profile public.marketing_business_profiles;
  v_plan public.marketing_plans;
  v_direction text := nullif(btrim(coalesce(p_owner_direction, '')), '');
  v_recent jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select workspace.id into v_workspace_id
    from public.marketing_workspaces workspace
   where workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
     and workspace.contractor_id is null;

  if p_client_request_id is null then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_workspace_id::text || ':' || p_client_request_id::text, 0)
  );

  select * into v_plan
    from public.marketing_plans
   where workspace_id = v_workspace_id
     and client_request_id = p_client_request_id;

  if v_plan.id is not null then
    if v_plan.profile_version <> p_profile_version
       or v_plan.plan_mode <> p_mode
       or v_plan.title <> btrim(coalesce(p_title, ''))
       or v_plan.planning_start <> p_planning_start
       or v_plan.planning_end <> p_planning_end
       or v_plan.owner_direction is distinct from v_direction
       or v_plan.items <> p_items then
      raise exception 'Marketing plan request conflicts with an existing request.' using errcode = '23505';
    end if;
    return jsonb_build_object('plan_id', v_plan.id, 'revision_number', v_plan.revision_number);
  end if;

  select * into v_profile
    from public.marketing_business_profiles
   where workspace_id = v_workspace_id
   for share;

  if v_profile.id is null
     or v_profile.profile_status <> 'ready'
     or v_profile.profile_version <> p_profile_version
     or p_mode not in ('owner_directed', 'recommended')
     or char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or p_planning_start is null
     or p_planning_end is null
     or p_planning_end < p_planning_start
     or p_planning_end > p_planning_start + 93
     or (p_mode = 'owner_directed' and (v_direction is null or not public.servsync_private_marketing_direction_is_safe(v_direction)))
     or (p_mode = 'recommended' and v_direction is not null)
     or not public.servsync_private_marketing_plan_items_valid(p_items) then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
  end if;

  v_recent := public.servsync_private_internal_marketing_recent_context(v_workspace_id);

  insert into public.marketing_plans (
    workspace_id, client_request_id, profile_version, plan_mode, plan_status,
    title, planning_start, planning_end, owner_direction, recent_content_context,
    items, revision_number, created_by
  ) values (
    v_workspace_id, p_client_request_id, p_profile_version, p_mode, 'draft',
    btrim(p_title), p_planning_start, p_planning_end, v_direction, v_recent,
    p_items, 1, auth.uid()
  ) returning * into v_plan;

  insert into public.marketing_plan_revisions (
    workspace_id, plan_id, revision_number, plan_snapshot, actor_user_id
  ) values (
    v_plan.workspace_id,
    v_plan.id,
    v_plan.revision_number,
    to_jsonb(v_plan) - 'client_request_id',
    auth.uid()
  );

  return jsonb_build_object('plan_id', v_plan.id, 'revision_number', v_plan.revision_number);
exception
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
end;
$$;

create function public.servsync_update_internal_marketing_plan(
  p_plan_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_planning_start date,
  p_planning_end date,
  p_owner_direction text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_plan public.marketing_plans;
  v_direction text := nullif(btrim(coalesce(p_owner_direction, '')), '');
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select plan.* into v_plan
    from public.marketing_plans plan
    join public.marketing_workspaces workspace on workspace.id = plan.workspace_id
   where plan.id = p_plan_id
     and workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
     and workspace.contractor_id is null
   for update of plan;

  if v_plan.id is null then raise exception 'Marketing Plan not found.' using errcode = 'P0002'; end if;
  if p_expected_revision is null or v_plan.revision_number <> p_expected_revision then
    raise exception 'Marketing plan changed; reload and try again.' using errcode = '40001';
  end if;
  if v_plan.plan_status <> 'draft' then
    raise exception 'Accepted Marketing Plans cannot be edited.' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or p_planning_start is null
     or p_planning_end is null
     or p_planning_end < p_planning_start
     or p_planning_end > p_planning_start + 93
     or (v_plan.plan_mode = 'owner_directed' and (v_direction is null or not public.servsync_private_marketing_direction_is_safe(v_direction)))
     or (v_plan.plan_mode = 'recommended' and v_direction is not null)
     or not public.servsync_private_marketing_plan_items_valid(p_items) then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
  end if;

  update public.marketing_plans
     set title = btrim(p_title),
         planning_start = p_planning_start,
         planning_end = p_planning_end,
         owner_direction = v_direction,
         items = p_items,
         revision_number = revision_number + 1,
         updated_at = now()
   where id = v_plan.id
  returning * into v_plan;

  insert into public.marketing_plan_revisions (
    workspace_id, plan_id, revision_number, plan_snapshot, actor_user_id
  ) values (
    v_plan.workspace_id, v_plan.id, v_plan.revision_number,
    to_jsonb(v_plan) - 'client_request_id', auth.uid()
  );

  return jsonb_build_object('plan_id', v_plan.id, 'revision_number', v_plan.revision_number);
exception
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
end;
$$;

create function public.servsync_accept_internal_marketing_plan(
  p_plan_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_plan public.marketing_plans;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select plan.* into v_plan
    from public.marketing_plans plan
    join public.marketing_workspaces workspace on workspace.id = plan.workspace_id
   where plan.id = p_plan_id
     and workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
     and workspace.contractor_id is null
   for update of plan;

  if v_plan.id is null then raise exception 'Marketing Plan not found.' using errcode = 'P0002'; end if;
  if p_expected_revision is null or v_plan.revision_number <> p_expected_revision then
    raise exception 'Marketing plan changed; reload and try again.' using errcode = '40001';
  end if;
  if v_plan.plan_status <> 'draft' then
    raise exception 'Marketing Plan is already accepted.' using errcode = '55000';
  end if;

  update public.marketing_plans
     set plan_status = 'accepted',
         revision_number = revision_number + 1,
         accepted_by = auth.uid(),
         accepted_at = now(),
         updated_at = now()
   where id = v_plan.id
  returning * into v_plan;

  insert into public.marketing_plan_revisions (
    workspace_id, plan_id, revision_number, plan_snapshot, actor_user_id
  ) values (
    v_plan.workspace_id, v_plan.id, v_plan.revision_number,
    to_jsonb(v_plan) - 'client_request_id', auth.uid()
  );

  return jsonb_build_object('plan_id', v_plan.id, 'revision_number', v_plan.revision_number);
end;
$$;

alter table public.marketing_business_profiles owner to postgres;
alter table public.marketing_business_profile_revisions owner to postgres;
alter table public.marketing_plans owner to postgres;
alter table public.marketing_plan_revisions owner to postgres;

alter function public.servsync_private_marketing_text_array_valid(text[],integer,integer,integer) owner to postgres;
alter function public.servsync_private_marketing_plan_items_valid(jsonb) owner to postgres;
alter function public.servsync_private_marketing_planning_revision_guard() owner to postgres;
alter function public.servsync_private_internal_marketing_recent_context(uuid) owner to postgres;
alter function public.servsync_get_internal_marketing_planning() owner to postgres;
alter function public.servsync_update_internal_marketing_profile(bigint,text,text[],text[],text,text[],text,text,text[],text[],text[],text[],text) owner to postgres;
alter function public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb) owner to postgres;
alter function public.servsync_update_internal_marketing_plan(uuid,bigint,text,date,date,text,jsonb) owner to postgres;
alter function public.servsync_accept_internal_marketing_plan(uuid,bigint) owner to postgres;

alter table public.marketing_business_profiles enable row level security;
alter table public.marketing_business_profiles force row level security;
alter table public.marketing_business_profile_revisions enable row level security;
alter table public.marketing_business_profile_revisions force row level security;
alter table public.marketing_plans enable row level security;
alter table public.marketing_plans force row level security;
alter table public.marketing_plan_revisions enable row level security;
alter table public.marketing_plan_revisions force row level security;

revoke all privileges on table public.marketing_business_profiles from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_business_profile_revisions from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_plans from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_plan_revisions from public, anon, authenticated, service_role;

revoke all privileges on function public.servsync_private_marketing_text_array_valid(text[],integer,integer,integer) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_marketing_plan_items_valid(jsonb) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_marketing_planning_revision_guard() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_internal_marketing_recent_context(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_get_internal_marketing_planning() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_update_internal_marketing_profile(bigint,text,text[],text[],text,text[],text,text,text[],text[],text[],text[],text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_update_internal_marketing_plan(uuid,bigint,text,date,date,text,jsonb) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_accept_internal_marketing_plan(uuid,bigint) from public, anon, authenticated, service_role;

grant execute on function public.servsync_get_internal_marketing_planning() to authenticated;
grant execute on function public.servsync_update_internal_marketing_profile(bigint,text,text[],text[],text,text[],text,text,text[],text[],text[],text[],text) to authenticated;
grant execute on function public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb) to authenticated;
grant execute on function public.servsync_update_internal_marketing_plan(uuid,bigint,text,date,date,text,jsonb) to authenticated;
grant execute on function public.servsync_accept_internal_marketing_plan(uuid,bigint) to authenticated;

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.servsync_get_internal_marketing_planning()'::regprocedure,
    'public.servsync_update_internal_marketing_profile(bigint,text,text[],text[],text,text[],text,text,text[],text[],text[],text[],text)'::regprocedure,
    'public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb)'::regprocedure,
    'public.servsync_update_internal_marketing_plan(uuid,bigint,text,date,date,text,jsonb)'::regprocedure,
    'public.servsync_accept_internal_marketing_plan(uuid,bigint)'::regprocedure
  ] loop
    if (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef or proconfig <> array['search_path=pg_catalog, public, auth'] from pg_proc where oid = v_function)
       or not has_function_privilege('authenticated', v_function, 'execute')
       or has_function_privilege('anon', v_function, 'execute')
       or has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'Business Marketing Profile RPC security mismatch for %.', v_function;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in (
         'marketing_business_profiles', 'marketing_business_profile_revisions',
         'marketing_plans', 'marketing_plan_revisions'
       )
       and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Business Marketing Profile direct-table grant mismatch.';
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');

commit;
