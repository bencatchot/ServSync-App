-- ServSync shared Marketing workspace and tenant security foundation v1.
--
-- Adds one authoritative workspace-access contract and database-enforced
-- same-workspace lineage across the existing Marketing domain. This migration
-- creates no provider connection, publication, media, entitlement, or queue.

begin;

do $$
declare
  v_name text;
  v_internal_count integer;
begin
  foreach v_name in array array[
    'profiles', 'contractor_profiles', 'contractor_team_members',
    'marketing_workspaces', 'marketing_business_profiles',
    'marketing_business_profile_revisions', 'marketing_plans',
    'marketing_plan_revisions', 'marketing_directions',
    'marketing_direction_revisions', 'marketing_content_preparation_packages',
    'marketing_content_items', 'marketing_content_status_events',
    'marketing_media_assets', 'marketing_content_media_pairings',
    'marketing_content_media_pairing_events', 'marketing_provider_connections',
    'marketing_provider_connection_secrets', 'marketing_facebook_oauth_sessions',
    'marketing_publications', 'marketing_publication_events'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Missing shared Marketing prerequisite public.%.', v_name;
    end if;
  end loop;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  if to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null then
    raise exception 'Missing shared Marketing identity prerequisite.';
  end if;

  foreach v_name in array array[
    'servsync_private_marketing_contractor_role(uuid)',
    'servsync_private_require_marketing_workspace(uuid,text)',
    'servsync_private_marketing_workspace_for_context(uuid,text)',
    'servsync_get_marketing_workspace_access(uuid)',
    'servsync_ensure_contractor_marketing_workspace(uuid)',
    'servsync_list_marketing_content(uuid,text)',
    'servsync_create_marketing_content(uuid,uuid,text,text,text,text)',
    'servsync_update_marketing_content(uuid,uuid,bigint,text,text,text,text)',
    'servsync_transition_marketing_content(uuid,uuid,bigint,text,text)'
  ] loop
    if to_regprocedure('public.' || v_name) is not null then
      raise exception 'Shared Marketing target function public.% already exists.', v_name;
    end if;
  end loop;

  select count(*) into v_internal_count
    from public.marketing_workspaces
   where workspace_kind = 'internal';

  if v_internal_count <> 1 or not exists (
    select 1
      from public.marketing_workspaces
     where id = '00000000-0000-4000-8000-000000000037'
       and workspace_key = 'servsync_internal'
       and workspace_kind = 'internal'
       and contractor_id is null
  ) then
    raise exception 'ServSync internal Marketing workspace identity is ambiguous.';
  end if;

  if exists (
    select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relkind = 'r'
       and relation.relname like 'marketing_%'
       and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ) then
    raise exception 'Every existing Marketing table must have forced RLS before shared access is installed.';
  end if;
end;
$$;

-- Redundant workspace/id identities allow child relationships to enforce that
-- their parent belongs to the same workspace, not merely that each UUID exists.
alter table public.marketing_business_profiles
  add constraint marketing_profiles_workspace_identity unique (workspace_id, id);
alter table public.marketing_plans
  add constraint marketing_plans_workspace_identity unique (workspace_id, id);
alter table public.marketing_directions
  add constraint marketing_directions_workspace_identity unique (workspace_id, id);
alter table public.marketing_content_preparation_packages
  add constraint marketing_packages_workspace_identity unique (workspace_id, id);
alter table public.marketing_content_items
  add constraint marketing_content_workspace_identity unique (workspace_id, id);
alter table public.marketing_media_assets
  add constraint marketing_assets_workspace_identity unique (workspace_id, id);
alter table public.marketing_content_media_pairings
  add constraint marketing_pairings_workspace_identity unique (workspace_id, id);
alter table public.marketing_provider_connections
  add constraint marketing_connections_workspace_identity unique (workspace_id, id);
alter table public.marketing_publications
  add constraint marketing_publications_workspace_identity unique (workspace_id, id);

alter table public.marketing_business_profile_revisions
  add constraint marketing_profile_revisions_workspace_parent
  foreign key (workspace_id, profile_id)
  references public.marketing_business_profiles(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_plan_revisions
  add constraint marketing_plan_revisions_workspace_parent
  foreign key (workspace_id, plan_id)
  references public.marketing_plans(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_directions
  add constraint marketing_directions_workspace_plan
  foreign key (workspace_id, source_plan_id)
  references public.marketing_plans(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_direction_revisions
  add constraint marketing_direction_revisions_workspace_parent
  foreign key (workspace_id, direction_id)
  references public.marketing_directions(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_content_preparation_packages
  add constraint marketing_packages_workspace_plan
  foreign key (workspace_id, source_plan_id)
  references public.marketing_plans(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_content_items
  add constraint marketing_content_workspace_package
  foreign key (workspace_id, preparation_package_id)
  references public.marketing_content_preparation_packages(workspace_id, id)
  on delete restrict not valid,
  add constraint marketing_content_workspace_plan
  foreign key (workspace_id, source_plan_id)
  references public.marketing_plans(workspace_id, id)
  on delete restrict not valid,
  add constraint marketing_content_workspace_direction
  foreign key (workspace_id, source_direction_id)
  references public.marketing_directions(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_content_status_events
  add constraint marketing_content_events_workspace_parent
  foreign key (workspace_id, content_id)
  references public.marketing_content_items(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_content_media_pairings
  add constraint marketing_pairings_workspace_content
  foreign key (workspace_id, content_id)
  references public.marketing_content_items(workspace_id, id)
  on delete restrict not valid,
  add constraint marketing_pairings_workspace_asset
  foreign key (workspace_id, asset_id)
  references public.marketing_media_assets(workspace_id, id)
  on delete restrict not valid,
  add constraint marketing_pairings_workspace_direction
  foreign key (workspace_id, source_direction_id)
  references public.marketing_directions(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_content_media_pairing_events
  add constraint marketing_pairing_events_workspace_parent
  foreign key (workspace_id, pairing_id)
  references public.marketing_content_media_pairings(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_provider_connection_secrets
  add constraint marketing_secrets_workspace_connection
  foreign key (workspace_id, connection_id)
  references public.marketing_provider_connections(workspace_id, id)
  on delete cascade not valid;
alter table public.marketing_facebook_oauth_sessions
  add constraint marketing_oauth_workspace_connection
  foreign key (workspace_id, connection_id)
  references public.marketing_provider_connections(workspace_id, id)
  on delete cascade not valid;
alter table public.marketing_publications
  add constraint marketing_publications_workspace_content
  foreign key (workspace_id, content_id)
  references public.marketing_content_items(workspace_id, id)
  on delete restrict not valid,
  add constraint marketing_publications_workspace_connection
  foreign key (workspace_id, provider_connection_id)
  references public.marketing_provider_connections(workspace_id, id)
  on delete restrict not valid,
  add constraint marketing_publications_workspace_pairing
  foreign key (workspace_id, media_pairing_id)
  references public.marketing_content_media_pairings(workspace_id, id)
  on delete restrict not valid;
alter table public.marketing_publication_events
  add constraint marketing_publication_events_workspace_parent
  foreign key (workspace_id, publication_id)
  references public.marketing_publications(workspace_id, id)
  on delete restrict not valid;

alter table public.marketing_business_profile_revisions validate constraint marketing_profile_revisions_workspace_parent;
alter table public.marketing_plan_revisions validate constraint marketing_plan_revisions_workspace_parent;
alter table public.marketing_directions validate constraint marketing_directions_workspace_plan;
alter table public.marketing_direction_revisions validate constraint marketing_direction_revisions_workspace_parent;
alter table public.marketing_content_preparation_packages validate constraint marketing_packages_workspace_plan;
alter table public.marketing_content_items validate constraint marketing_content_workspace_package;
alter table public.marketing_content_items validate constraint marketing_content_workspace_plan;
alter table public.marketing_content_items validate constraint marketing_content_workspace_direction;
alter table public.marketing_content_status_events validate constraint marketing_content_events_workspace_parent;
alter table public.marketing_content_media_pairings validate constraint marketing_pairings_workspace_content;
alter table public.marketing_content_media_pairings validate constraint marketing_pairings_workspace_asset;
alter table public.marketing_content_media_pairings validate constraint marketing_pairings_workspace_direction;
alter table public.marketing_content_media_pairing_events validate constraint marketing_pairing_events_workspace_parent;
alter table public.marketing_provider_connection_secrets validate constraint marketing_secrets_workspace_connection;
alter table public.marketing_facebook_oauth_sessions validate constraint marketing_oauth_workspace_connection;
alter table public.marketing_publications validate constraint marketing_publications_workspace_content;
alter table public.marketing_publications validate constraint marketing_publications_workspace_connection;
alter table public.marketing_publications validate constraint marketing_publications_workspace_pairing;
alter table public.marketing_publication_events validate constraint marketing_publication_events_workspace_parent;

create function public.servsync_private_marketing_contractor_role(p_contractor_id uuid)
returns text
language sql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
  select case
    when contractor.owner_user_id = auth.uid() then 'owner'
    else (
      select member.role
        from public.contractor_team_members member
       where member.contractor_id = contractor.id
         and member.user_id = auth.uid()
         and member.status = 'active'
       limit 1
    )
  end
  from public.contractor_profiles contractor
  where contractor.id = p_contractor_id
    and contractor.account_status = 'active';
$$;

create function public.servsync_private_require_marketing_workspace(
  p_workspace_id uuid,
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare
  v_workspace public.marketing_workspaces;
  v_role text;
begin
  if auth.uid() is null
     or p_workspace_id is null
     or p_capability not in ('read', 'create_edit', 'approve', 'provider_connection', 'publish') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_workspace
    from public.marketing_workspaces
   where id = p_workspace_id;
  if v_workspace.id is null then
    raise exception 'Marketing workspace not found.' using errcode = 'P0002';
  end if;

  if v_workspace.workspace_kind = 'internal' then
    if v_workspace.workspace_key <> 'servsync_internal'
       or v_workspace.contractor_id is not null
       or not public.current_user_is_platform_admin() then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
    v_role := 'platform_admin';
  elsif v_workspace.workspace_kind = 'contractor' then
    v_role := public.servsync_private_marketing_contractor_role(v_workspace.contractor_id);
    if v_role is null or v_role not in ('owner', 'admin', 'office') then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
  else
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'workspace_id', v_workspace.id,
    'workspace_key', v_workspace.workspace_key,
    'workspace_kind', v_workspace.workspace_kind,
    'contractor_id', v_workspace.contractor_id,
    'display_name', v_workspace.display_name,
    'marketing_role', v_role,
    'capabilities', jsonb_build_object(
      'read', true,
      'create_edit', true,
      'approve', true,
      'provider_connection', true,
      'publish', true
    )
  );
end;
$$;

create function public.servsync_private_marketing_workspace_for_context(
  p_contractor_id uuid,
  p_capability text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare
  v_workspace_id uuid;
begin
  if p_contractor_id is null then
    select id into v_workspace_id
      from public.marketing_workspaces
     where id = '00000000-0000-4000-8000-000000000037'
       and workspace_key = 'servsync_internal'
       and workspace_kind = 'internal'
       and contractor_id is null;
  else
    select id into v_workspace_id
      from public.marketing_workspaces
     where workspace_kind = 'contractor'
       and contractor_id = p_contractor_id;
  end if;

  if v_workspace_id is null then
    raise exception 'Marketing workspace is unavailable.' using errcode = '55000';
  end if;
  perform public.servsync_private_require_marketing_workspace(v_workspace_id, p_capability);
  return v_workspace_id;
end;
$$;

create function public.servsync_get_marketing_workspace_access(p_contractor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'read');
  return public.servsync_private_require_marketing_workspace(v_workspace_id, 'read');
end;
$$;

create function public.servsync_ensure_contractor_marketing_workspace(p_contractor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_contractor public.contractor_profiles;
  v_role text;
  v_workspace_id uuid;
begin
  if auth.uid() is null or p_contractor_id is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  v_role := public.servsync_private_marketing_contractor_role(p_contractor_id);
  if v_role is null or v_role not in ('owner', 'admin', 'office') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select * into v_contractor
    from public.contractor_profiles
   where id = p_contractor_id
     and account_status = 'active';
  if v_contractor.id is null then
    raise exception 'Active contractor is required.' using errcode = '55000';
  end if;

  insert into public.marketing_workspaces (
    id, workspace_key, workspace_kind, contractor_id, display_name
  ) values (
    gen_random_uuid(),
    'contractor_' || replace(p_contractor_id::text, '-', ''),
    'contractor', p_contractor_id,
    coalesce(nullif(btrim(v_contractor.business_name), ''), 'Contractor Marketing')
  )
  on conflict (contractor_id) where workspace_kind = 'contractor' do nothing;

  select id into v_workspace_id
    from public.marketing_workspaces
   where workspace_kind = 'contractor'
     and contractor_id = p_contractor_id;

  return public.servsync_private_require_marketing_workspace(v_workspace_id, 'create_edit');
end;
$$;

create function public.servsync_list_marketing_content(
  p_contractor_id uuid default null,
  p_status text default null
)
returns table (
  content_id uuid, workspace_key text, workspace_kind text, title text,
  content_type text, body text, channel_category text, status text,
  revision_number bigint, created_at timestamptz, updated_at timestamptz,
  created_by uuid, created_by_name text, submitted_at timestamptz,
  submitted_by uuid, submitted_by_name text, reviewed_at timestamptz,
  reviewed_by uuid, reviewed_by_name text, review_note text,
  preparation_source text, preparation_request_id uuid,
  preparation_recipe_key text, truth_pack_version text, prepared_at timestamptz,
  preparation_sequence smallint, intended_audience text, content_role text,
  strategic_source text, source_plan_id uuid, source_plan_revision bigint,
  source_plan_item_index smallint, source_direction_id uuid,
  source_direction_revision bigint, source_direction_topic text,
  source_direction_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'read');
  if p_status is not null and p_status <> 'all'
     and p_status not in ('idea', 'draft', 'needs_approval', 'approved', 'rejected') then
    raise exception 'Invalid Marketing content status.' using errcode = '22023';
  end if;

  return query
  select item.id, workspace.workspace_key, workspace.workspace_kind, item.title,
    item.content_type, item.body, item.channel_category, item.status,
    item.revision_number, item.created_at, item.updated_at,
    item.created_by, created_profile.full_name, item.submitted_at,
    item.submitted_by, submitted_profile.full_name, item.reviewed_at,
    item.reviewed_by, reviewed_profile.full_name, item.review_note,
    item.preparation_source, package.preparation_request_id, package.recipe_key,
    package.truth_pack_version, package.prepared_at, item.preparation_sequence,
    item.intended_audience, item.content_role, package.strategic_source,
    item.source_plan_id, item.source_plan_revision, item.source_plan_item_index,
    item.source_direction_id, item.source_direction_revision, direction.topic,
    direction.direction_status
  from public.marketing_content_items item
  join public.marketing_workspaces workspace on workspace.id = item.workspace_id
  left join public.marketing_content_preparation_packages package
    on package.id = item.preparation_package_id
   and package.workspace_id = item.workspace_id
  left join public.marketing_directions direction
    on direction.id = item.source_direction_id
   and direction.workspace_id = item.workspace_id
  left join public.profiles created_profile on created_profile.id = item.created_by
  left join public.profiles submitted_profile on submitted_profile.id = item.submitted_by
  left join public.profiles reviewed_profile on reviewed_profile.id = item.reviewed_by
  where item.workspace_id = v_workspace_id
    and (p_status is null or p_status = 'all' or item.status = p_status)
  order by case item.status when 'needs_approval' then 1 when 'draft' then 2
    when 'idea' then 3 when 'rejected' then 4 else 5 end,
    item.updated_at desc, item.id;
end;
$$;

create function public.servsync_create_marketing_content(
  p_contractor_id uuid,
  p_client_request_id uuid,
  p_title text,
  p_content_type text,
  p_body text default '',
  p_channel_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_item public.marketing_content_items;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_channel text := nullif(btrim(coalesce(p_channel_category, '')), '');
  v_inserted boolean := false;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  if p_client_request_id is null or char_length(v_title) not between 1 and 160
     or v_title ~ '[[:cntrl:]]'
     or p_content_type not in ('social_post', 'email', 'website_copy', 'other')
     or char_length(v_body) > 10000
     or (v_channel is not null and v_channel not in ('social', 'email', 'website', 'other')) then
    raise exception 'Invalid Marketing content.' using errcode = '22023';
  end if;

  insert into public.marketing_content_items (
    workspace_id, client_request_id, title, content_type, body,
    channel_category, status, revision_number, created_by
  ) values (
    v_workspace_id, p_client_request_id, v_title, p_content_type, v_body,
    v_channel, 'idea', 1, auth.uid()
  ) on conflict (workspace_id, client_request_id) do nothing returning * into v_item;

  if v_item.id is not null then
    v_inserted := true;
  else
    select * into v_item from public.marketing_content_items
     where workspace_id = v_workspace_id and client_request_id = p_client_request_id;
    if v_item.id is null or v_item.title <> v_title or v_item.content_type <> p_content_type
       or v_item.body <> v_body or v_item.channel_category is distinct from v_channel then
      raise exception 'Marketing content request conflicts with an existing request.' using errcode = '23505';
    end if;
  end if;

  if v_inserted then
    insert into public.marketing_content_status_events (
      workspace_id, content_id, content_revision, from_status, to_status,
      reason, actor_user_id
    ) values (v_workspace_id, v_item.id, 1, null, 'idea', null, auth.uid());
  end if;
  return jsonb_build_object('content_id', v_item.id, 'status', v_item.status,
    'revision_number', v_item.revision_number);
end;
$$;

create function public.servsync_update_marketing_content(
  p_contractor_id uuid,
  p_content_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_content_type text,
  p_body text,
  p_channel_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_item public.marketing_content_items;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_channel text := nullif(btrim(coalesce(p_channel_category, '')), '');
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id, 'create_edit');
  if p_content_id is null or p_expected_revision is null or p_expected_revision < 1
     or char_length(v_title) not between 1 and 160 or v_title ~ '[[:cntrl:]]'
     or p_content_type not in ('social_post', 'email', 'website_copy', 'other')
     or char_length(v_body) > 10000
     or (v_channel is not null and v_channel not in ('social', 'email', 'website', 'other')) then
    raise exception 'Invalid Marketing content.' using errcode = '22023';
  end if;

  select * into v_item from public.marketing_content_items
   where id = p_content_id and workspace_id = v_workspace_id for update;
  if v_item.id is null then raise exception 'Marketing content not found.' using errcode = 'P0002'; end if;
  if v_item.revision_number <> p_expected_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode = '40001';
  end if;
  if v_item.status not in ('idea', 'draft') then
    raise exception 'Marketing content cannot be edited in its current status.' using errcode = '55000';
  end if;
  update public.marketing_content_items set title = v_title, content_type = p_content_type,
    body = v_body, channel_category = v_channel, revision_number = revision_number + 1,
    updated_at = now() where id = v_item.id returning * into v_item;
  return jsonb_build_object('content_id', v_item.id, 'status', v_item.status,
    'revision_number', v_item.revision_number);
end;
$$;

create function public.servsync_transition_marketing_content(
  p_contractor_id uuid,
  p_content_id uuid,
  p_expected_revision bigint,
  p_to_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_item public.marketing_content_items;
  v_from_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,
    case when p_to_status in ('approved', 'rejected') then 'approve' else 'create_edit' end);
  if p_content_id is null or p_expected_revision is null or p_expected_revision < 1
     or p_to_status not in ('draft', 'needs_approval', 'approved', 'rejected') then
    raise exception 'Invalid Marketing content transition.' using errcode = '22023';
  end if;
  select * into v_item from public.marketing_content_items
   where id = p_content_id and workspace_id = v_workspace_id for update;
  if v_item.id is null then raise exception 'Marketing content not found.' using errcode = 'P0002'; end if;
  if v_item.revision_number <> p_expected_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode = '40001';
  end if;
  v_from_status := v_item.status;
  if not ((v_from_status = 'idea' and p_to_status = 'draft')
    or (v_from_status = 'draft' and p_to_status = 'needs_approval')
    or (v_from_status = 'needs_approval' and p_to_status in ('approved', 'draft', 'rejected'))) then
    raise exception 'Invalid Marketing content transition.' using errcode = '55000';
  end if;
  if v_from_status = 'draft' and p_to_status = 'needs_approval'
     and char_length(btrim(v_item.body)) = 0 then
    raise exception 'Marketing content body is required before approval.' using errcode = '22023';
  end if;
  if v_from_status = 'needs_approval' and p_to_status in ('draft', 'rejected') then
    if v_reason is null or char_length(v_reason) not between 3 and 1000 then
      raise exception 'A review reason between 3 and 1000 characters is required.' using errcode = '22023';
    end if;
  elsif v_reason is not null then
    raise exception 'A review reason is not valid for this transition.' using errcode = '22023';
  end if;

  update public.marketing_content_items set status = p_to_status,
    revision_number = revision_number + 1,
    submitted_at = case when v_from_status = 'draft' and p_to_status = 'needs_approval' then now() else submitted_at end,
    submitted_by = case when v_from_status = 'draft' and p_to_status = 'needs_approval' then auth.uid() else submitted_by end,
    reviewed_at = case when v_from_status = 'draft' and p_to_status = 'needs_approval' then null when v_from_status = 'needs_approval' then now() else reviewed_at end,
    reviewed_by = case when v_from_status = 'draft' and p_to_status = 'needs_approval' then null when v_from_status = 'needs_approval' then auth.uid() else reviewed_by end,
    review_note = case when v_from_status = 'draft' and p_to_status = 'needs_approval' then null when v_from_status = 'needs_approval' then v_reason else review_note end,
    updated_at = now() where id = v_item.id returning * into v_item;
  insert into public.marketing_content_status_events (
    workspace_id, content_id, content_revision, from_status, to_status, reason, actor_user_id
  ) values (v_item.workspace_id, v_item.id, v_item.revision_number, v_from_status,
    v_item.status, v_reason, auth.uid());
  return jsonb_build_object('content_id', v_item.id, 'status', v_item.status,
    'revision_number', v_item.revision_number);
end;
$$;

alter function public.servsync_private_marketing_contractor_role(uuid) owner to postgres;
alter function public.servsync_private_require_marketing_workspace(uuid,text) owner to postgres;
alter function public.servsync_private_marketing_workspace_for_context(uuid,text) owner to postgres;
alter function public.servsync_get_marketing_workspace_access(uuid) owner to postgres;
alter function public.servsync_ensure_contractor_marketing_workspace(uuid) owner to postgres;
alter function public.servsync_list_marketing_content(uuid,text) owner to postgres;
alter function public.servsync_create_marketing_content(uuid,uuid,text,text,text,text) owner to postgres;
alter function public.servsync_update_marketing_content(uuid,uuid,bigint,text,text,text,text) owner to postgres;
alter function public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text) owner to postgres;

do $$
declare v_table text;
begin
  for v_table in
    select relation.relname
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relkind = 'r'
       and relation.relname like 'marketing_%'
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated, service_role', v_table);
  end loop;
end;
$$;

revoke all on function public.servsync_private_marketing_contractor_role(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_require_marketing_workspace(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_private_marketing_workspace_for_context(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_get_marketing_workspace_access(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_ensure_contractor_marketing_workspace(uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_list_marketing_content(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_create_marketing_content(uuid,uuid,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_update_marketing_content(uuid,uuid,bigint,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text) from public, anon, authenticated, service_role;

grant execute on function public.servsync_get_marketing_workspace_access(uuid) to authenticated;
grant execute on function public.servsync_ensure_contractor_marketing_workspace(uuid) to authenticated;
grant execute on function public.servsync_list_marketing_content(uuid,text) to authenticated;
grant execute on function public.servsync_create_marketing_content(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.servsync_update_marketing_content(uuid,uuid,bigint,text,text,text,text) to authenticated;
grant execute on function public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
