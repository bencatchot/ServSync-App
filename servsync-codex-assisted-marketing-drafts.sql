-- ServSync Codex-Assisted Marketing Draft Preparation v1.
--
-- Adds provider-neutral preparation-package provenance and one bounded,
-- platform-admin-only ingestion RPC. It does not generate, approve, schedule,
-- publish, or expose Marketing content to contractors or homeowners.

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.marketing_workspaces') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regclass('public.marketing_content_status_events') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null
     or to_regprocedure('public.servsync_list_internal_marketing_content(text)') is null
     or (
       to_regprocedure('extensions.digest(bytea,text)') is null
       and to_regprocedure('public.digest(bytea,text)') is null
     ) then
    raise exception 'Missing Codex-assisted Marketing prerequisite.';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  if to_regclass('public.marketing_content_preparation_packages') is not null then
    raise exception 'Codex-assisted Marketing target table already exists; refusing repeated installation.';
  end if;

  foreach v_name in array array[
    'servsync_private_guard_marketing_preparation_package()',
    'servsync_private_marketing_copy_is_claim_safe(text)',
    'servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb)'
  ] loop
    if to_regprocedure('public.' || v_name) is not null then
      raise exception 'Codex-assisted Marketing target function public.% already exists; refusing partial installation.', v_name;
    end if;
  end loop;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'marketing_content_items'
       and column_name in (
         'preparation_package_id',
         'preparation_sequence',
         'preparation_source',
         'intended_audience',
         'content_role'
       )
  ) then
    raise exception 'Codex-assisted Marketing target columns already exist; refusing partial installation.';
  end if;
end;
$$;

create table public.marketing_content_preparation_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  preparation_request_id uuid not null,
  preparation_source text not null,
  recipe_key text not null,
  truth_pack_version text not null,
  brief_summary text not null,
  item_count smallint not null,
  request_fingerprint_sha256 text not null,
  prepared_by uuid null references public.profiles(id) on delete set null,
  prepared_at timestamptz not null default now(),
  constraint marketing_preparation_packages_request_unique
    unique (workspace_id, preparation_request_id),
  constraint marketing_preparation_packages_source_check
    check (preparation_source in ('codex_assisted', 'runtime_ai')),
  constraint marketing_preparation_packages_recipe_check
    check (recipe_key in ('contractor_acquisition', 'homeowner_awareness', 'feature_promotion')),
  constraint marketing_preparation_packages_truth_check
    check (truth_pack_version ~ '^servsync-marketing-truth-v[1-9][0-9]*$'),
  constraint marketing_preparation_packages_brief_check
    check (
      char_length(btrim(brief_summary)) between 1 and 500
      and brief_summary !~ '[[:cntrl:]]'
    ),
  constraint marketing_preparation_packages_count_check
    check (item_count between 1 and 7),
  constraint marketing_preparation_packages_fingerprint_check
    check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$')
);

create index marketing_preparation_packages_workspace_idx
  on public.marketing_content_preparation_packages(workspace_id, prepared_at desc, id);

alter table public.marketing_content_items
  add column preparation_package_id uuid null
    references public.marketing_content_preparation_packages(id) on delete restrict,
  add column preparation_sequence smallint null,
  add column preparation_source text not null default 'manual',
  add column intended_audience text null,
  add column content_role text null,
  add constraint marketing_content_items_preparation_source_check
    check (preparation_source in ('manual', 'codex_assisted', 'runtime_ai')),
  add constraint marketing_content_items_preparation_sequence_check
    check (preparation_sequence is null or preparation_sequence between 1 and 7),
  add constraint marketing_content_items_audience_check
    check (
      intended_audience is null
      or intended_audience in ('small_contractors', 'hvac_contractors', 'plumbers', 'electricians', 'homeowners')
    ),
  add constraint marketing_content_items_role_check
    check (
      content_role is null
      or content_role in (
        'facebook_instagram_post',
        'linkedin_post',
        'educational_post',
        'feature_highlight',
        'short_video_concept',
        'problem_solution_post',
        'local_contractor_connection',
        'feature_announcement',
        'contractor_benefit',
        'homeowner_benefit'
      )
    ),
  add constraint marketing_content_items_preparation_shape_check
    check (
      (
        preparation_source = 'manual'
        and preparation_package_id is null
        and preparation_sequence is null
        and intended_audience is null
        and content_role is null
      )
      or (
        preparation_source <> 'manual'
        and preparation_package_id is not null
        and preparation_sequence is not null
        and intended_audience is not null
        and content_role is not null
      )
    );

create unique index marketing_content_items_package_sequence_idx
  on public.marketing_content_items(preparation_package_id, preparation_sequence)
  where preparation_package_id is not null;

create function public.servsync_private_guard_marketing_preparation_package()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Marketing preparation provenance is immutable.';
end;
$$;

create trigger marketing_preparation_packages_immutable
  before update or delete on public.marketing_content_preparation_packages
  for each row execute function public.servsync_private_guard_marketing_preparation_package();

create trigger marketing_preparation_packages_no_truncate
  before truncate on public.marketing_content_preparation_packages
  for each statement execute function public.servsync_private_guard_marketing_preparation_package();

create function public.servsync_private_marketing_copy_is_claim_safe(p_text text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_text is not null
    and lower(p_text) !~ '(^|[^a-z])(guarantee(d|s)?|award[- ]winning|five[- ]star|top[- ]rated|best[- ]in[- ]class)([^a-z]|$)'
    and lower(p_text) !~ '(^|[^a-z0-9])#1([^a-z0-9]|$)|(^|[^a-z])number[[:space:]]+one([^a-z]|$)'
    and lower(p_text) !~ '[0-9]+([.][0-9]+)?[[:space:]]*%'
    and lower(p_text) !~ '(trusted by|used by|serving)[[:space:]]+[0-9]+'
    and lower(p_text) !~ '(save|saves|saved|reduce|reduces|increase|increases)[^.!?]{0,60}[0-9]+'
    and lower(p_text) !~ '(quickbooks integration|google calendar sync|outlook calendar sync|live stripe payments|automatic sms|automated email campaign|ai-powered diagnostics)'
    and p_text !~* '(^|[^a-z0-9])(sk-[a-z0-9_-]{16,}|service[_ -]?role|bearer[[:space:]]+[a-z0-9._-]{12,})([^a-z0-9]|$)';
$$;

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
  content_role text
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
    item.content_role
  from public.marketing_content_items item
  join public.marketing_workspaces workspace
    on workspace.id = item.workspace_id
   and workspace.workspace_kind = 'internal'
   and workspace.workspace_key = 'servsync_internal'
  left join public.marketing_content_preparation_packages package
    on package.id = item.preparation_package_id
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

create function public.servsync_ingest_internal_marketing_package(
  p_preparation_request_id uuid,
  p_recipe_key text,
  p_truth_pack_version text,
  p_brief_summary text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_workspace_id uuid;
  v_package public.marketing_content_preparation_packages;
  v_item jsonb;
  v_ordinal bigint;
  v_title text;
  v_body text;
  v_content_type text;
  v_channel text;
  v_audience text;
  v_content_role text;
  v_recipe text := btrim(coalesce(p_recipe_key, ''));
  v_truth_version text := btrim(coalesce(p_truth_pack_version, ''));
  v_brief text := btrim(coalesce(p_brief_summary, ''));
  v_fingerprint text;
  v_item_count integer;
  v_seen_titles text[] := array[]::text[];
  v_seen_bodies text[] := array[]::text[];
  v_seen_roles text[] := array[]::text[];
  v_normalized text;
  v_inserted boolean := false;
  v_content_ids jsonb;
  v_content_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_preparation_request_id is null
     or v_recipe not in ('contractor_acquisition', 'homeowner_awareness', 'feature_promotion')
     or v_truth_version <> 'servsync-marketing-truth-v1'
     or char_length(v_brief) not between 1 and 500
     or v_brief ~ '[[:cntrl:]]'
     or p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid Marketing preparation package.' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count not between 1 and 7 then
    raise exception 'Marketing preparation package must contain 1 to 7 items.' using errcode = '22023';
  end if;

  for v_item, v_ordinal in
    select value, ordinality
      from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ?& array[
         'title', 'content_type', 'body', 'channel_category', 'intended_audience', 'content_role'
       ])
       or (select count(*) from jsonb_object_keys(v_item)) <> 6
       or jsonb_typeof(v_item -> 'title') <> 'string'
       or jsonb_typeof(v_item -> 'content_type') <> 'string'
       or jsonb_typeof(v_item -> 'body') <> 'string'
       or jsonb_typeof(v_item -> 'channel_category') <> 'string'
       or jsonb_typeof(v_item -> 'intended_audience') <> 'string'
       or jsonb_typeof(v_item -> 'content_role') <> 'string' then
      raise exception 'Malformed Marketing preparation item at position %.', v_ordinal using errcode = '22023';
    end if;

    v_title := btrim(v_item ->> 'title');
    v_content_type := btrim(v_item ->> 'content_type');
    v_body := btrim(v_item ->> 'body');
    v_channel := btrim(v_item ->> 'channel_category');
    v_audience := btrim(v_item ->> 'intended_audience');
    v_content_role := btrim(v_item ->> 'content_role');

    if char_length(v_title) not between 1 and 160
       or v_title ~ '[[:cntrl:]]'
       or v_content_type not in ('social_post', 'email', 'website_copy', 'other')
       or char_length(v_body) not between 1 and 10000
       or v_channel not in ('social', 'email', 'website', 'other')
       or v_audience not in ('small_contractors', 'hvac_contractors', 'plumbers', 'electricians', 'homeowners')
       or v_content_role not in (
         'facebook_instagram_post',
         'linkedin_post',
         'educational_post',
         'feature_highlight',
         'short_video_concept',
         'problem_solution_post',
         'local_contractor_connection',
         'feature_announcement',
         'contractor_benefit',
         'homeowner_benefit'
       )
       or (
         v_recipe = 'contractor_acquisition'
         and (
           v_audience not in ('small_contractors', 'hvac_contractors', 'plumbers', 'electricians')
           or v_content_role not in (
             'facebook_instagram_post', 'linkedin_post', 'educational_post', 'feature_highlight', 'short_video_concept'
           )
         )
       )
       or (
         v_recipe = 'homeowner_awareness'
         and (
           v_audience <> 'homeowners'
           or v_content_role not in (
             'educational_post', 'problem_solution_post', 'feature_highlight', 'local_contractor_connection', 'short_video_concept'
           )
         )
       )
       or (
         v_recipe = 'feature_promotion'
         and v_content_role not in (
           'feature_announcement', 'contractor_benefit', 'homeowner_benefit', 'educational_post', 'short_video_concept'
         )
       )
       or (
         v_content_role = 'short_video_concept'
         and (v_content_type <> 'other' or v_channel <> 'social')
       )
       or (
         v_content_role <> 'short_video_concept'
         and (v_content_type <> 'social_post' or v_channel <> 'social')
       )
       or not public.servsync_private_marketing_copy_is_claim_safe(v_title || E'\n' || v_body) then
      raise exception 'Invalid or unsupported Marketing preparation content at position %.', v_ordinal using errcode = '22023';
    end if;

    v_normalized := lower(regexp_replace(v_title, '[[:space:]]+', ' ', 'g'));
    if v_normalized = any(v_seen_titles) then
      raise exception 'Duplicate Marketing preparation title.' using errcode = '22023';
    end if;
    v_seen_titles := array_append(v_seen_titles, v_normalized);

    v_normalized := lower(regexp_replace(v_body, '[[:space:]]+', ' ', 'g'));
    if v_normalized = any(v_seen_bodies) then
      raise exception 'Duplicate Marketing preparation content.' using errcode = '22023';
    end if;
    v_seen_bodies := array_append(v_seen_bodies, v_normalized);

    if v_content_role = any(v_seen_roles) then
      raise exception 'Duplicate Marketing preparation content role.' using errcode = '22023';
    end if;
    v_seen_roles := array_append(v_seen_roles, v_content_role);
  end loop;

  select id into v_workspace_id
    from public.marketing_workspaces
   where workspace_key = 'servsync_internal'
     and workspace_kind = 'internal'
     and contractor_id is null;

  if v_workspace_id is null then
    raise exception 'Internal Marketing workspace is unavailable.' using errcode = '55000';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'recipe_key', v_recipe,
    'truth_pack_version', v_truth_version,
    'brief_summary', v_brief,
    'items', p_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.marketing_content_preparation_packages (
    workspace_id,
    preparation_request_id,
    preparation_source,
    recipe_key,
    truth_pack_version,
    brief_summary,
    item_count,
    request_fingerprint_sha256,
    prepared_by
  ) values (
    v_workspace_id,
    p_preparation_request_id,
    'codex_assisted',
    v_recipe,
    v_truth_version,
    v_brief,
    v_item_count,
    v_fingerprint,
    auth.uid()
  )
  on conflict (workspace_id, preparation_request_id) do nothing
  returning * into v_package;

  if v_package.id is not null then
    v_inserted := true;
  else
    select * into v_package
      from public.marketing_content_preparation_packages
     where workspace_id = v_workspace_id
       and preparation_request_id = p_preparation_request_id;

    if v_package.id is null or v_package.request_fingerprint_sha256 <> v_fingerprint then
      raise exception 'Marketing preparation request conflicts with an existing request.' using errcode = '23505';
    end if;
  end if;

  if v_inserted then
    for v_item, v_ordinal in
      select value, ordinality
        from jsonb_array_elements(p_items) with ordinality
    loop
      v_title := btrim(v_item ->> 'title');
      v_content_type := btrim(v_item ->> 'content_type');
      v_body := btrim(v_item ->> 'body');
      v_channel := btrim(v_item ->> 'channel_category');
      v_audience := btrim(v_item ->> 'intended_audience');
      v_content_role := btrim(v_item ->> 'content_role');

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
        content_role
      ) values (
        v_workspace_id,
        gen_random_uuid(),
        v_title,
        v_content_type,
        v_body,
        v_channel,
        'draft',
        1,
        auth.uid(),
        v_package.id,
        v_ordinal,
        'codex_assisted',
        v_audience,
        v_content_role
      )
      returning id into v_content_id;

      insert into public.marketing_content_status_events (
        workspace_id,
        content_id,
        content_revision,
        from_status,
        to_status,
        reason,
        actor_user_id
      ) values (
        v_package.workspace_id,
        v_content_id,
        1,
        null,
        'draft',
        null,
        auth.uid()
      );
    end loop;
  end if;

  select jsonb_agg(item.id order by item.preparation_sequence)
    into v_content_ids
    from public.marketing_content_items item
   where item.preparation_package_id = v_package.id;

  if jsonb_array_length(coalesce(v_content_ids, '[]'::jsonb)) <> v_package.item_count then
    raise exception 'Marketing preparation package is incomplete.' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'package_id', v_package.id,
    'preparation_request_id', v_package.preparation_request_id,
    'source', v_package.preparation_source,
    'status', 'draft',
    'item_count', v_package.item_count,
    'content_ids', v_content_ids,
    'replayed', not v_inserted
  );
end;
$$;

alter table public.marketing_content_preparation_packages owner to postgres;
alter table public.marketing_content_items owner to postgres;

alter function public.servsync_private_guard_marketing_preparation_package() owner to postgres;
alter function public.servsync_private_marketing_copy_is_claim_safe(text) owner to postgres;
alter function public.servsync_list_internal_marketing_content(text) owner to postgres;
alter function public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb) owner to postgres;

alter table public.marketing_content_preparation_packages enable row level security;
alter table public.marketing_content_preparation_packages force row level security;

revoke all privileges on table public.marketing_content_preparation_packages from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_content_items from public, anon, authenticated, service_role;

revoke all privileges on function public.servsync_private_guard_marketing_preparation_package() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_private_marketing_copy_is_claim_safe(text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_list_internal_marketing_content(text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;

grant execute on function public.servsync_list_internal_marketing_content(text) to authenticated;
grant execute on function public.servsync_ingest_internal_marketing_package(uuid,text,text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
