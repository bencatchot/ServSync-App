-- ServSync Internal Marketing Content + Approval Foundation v1.
--
-- Adds the provider-neutral shared Marketing workspace identity and the first
-- private, platform-admin-only content approval queue. This migration creates
-- no publishing integration, campaign, analytics, contractor-facing API, or
-- runtime content fixture.

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.contractor_profiles') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.current_user_is_platform_admin()') is null then
    raise exception 'Missing internal Marketing prerequisite.';
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Missing required database role %.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'marketing_workspaces',
    'marketing_content_items',
    'marketing_content_status_events'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Internal Marketing target public.% already exists; refusing partial or repeated installation.', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'servsync_private_guard_marketing_status_event()',
    'servsync_list_internal_marketing_content(text)',
    'servsync_create_internal_marketing_content(uuid,text,text,text,text)',
    'servsync_update_internal_marketing_content(uuid,bigint,text,text,text,text)',
    'servsync_transition_internal_marketing_content(uuid,bigint,text,text)'
  ] loop
    if to_regprocedure('public.' || v_name) is not null then
      raise exception 'Internal Marketing target function public.% already exists; refusing partial installation.', v_name;
    end if;
  end loop;
end;
$$;

create table public.marketing_workspaces (
  id uuid primary key,
  workspace_key text not null unique,
  workspace_kind text not null,
  contractor_id uuid null references public.contractor_profiles(id) on delete restrict,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_workspaces_key_check
    check (workspace_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint marketing_workspaces_kind_check
    check (workspace_kind in ('internal', 'contractor')),
  constraint marketing_workspaces_scope_check
    check (
      (workspace_kind = 'internal' and contractor_id is null)
      or (workspace_kind = 'contractor' and contractor_id is not null)
    ),
  constraint marketing_workspaces_display_name_check
    check (char_length(btrim(display_name)) between 1 and 120)
);

create unique index marketing_workspaces_single_internal_idx
  on public.marketing_workspaces(workspace_kind)
  where workspace_kind = 'internal';

create unique index marketing_workspaces_contractor_idx
  on public.marketing_workspaces(contractor_id)
  where workspace_kind = 'contractor';

create table public.marketing_content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  client_request_id uuid not null,
  title text not null,
  content_type text not null,
  body text not null default '',
  channel_category text null,
  status text not null default 'idea',
  revision_number bigint not null default 1,
  created_by uuid null references public.profiles(id) on delete set null,
  submitted_at timestamptz null,
  submitted_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  review_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_content_items_request_unique
    unique (workspace_id, client_request_id),
  constraint marketing_content_items_title_check
    check (
      char_length(btrim(title)) between 1 and 160
      and title !~ '[[:cntrl:]]'
    ),
  constraint marketing_content_items_type_check
    check (content_type in ('social_post', 'email', 'website_copy', 'other')),
  constraint marketing_content_items_body_check
    check (char_length(body) <= 10000),
  constraint marketing_content_items_channel_check
    check (channel_category is null or channel_category in ('social', 'email', 'website', 'other')),
  constraint marketing_content_items_status_check
    check (status in ('idea', 'draft', 'needs_approval', 'approved', 'rejected')),
  constraint marketing_content_items_revision_check
    check (revision_number >= 1),
  constraint marketing_content_items_review_note_check
    check (review_note is null or char_length(review_note) between 3 and 1000),
  constraint marketing_content_items_submit_actor_check
    check ((submitted_at is null) = (submitted_by is null)),
  constraint marketing_content_items_review_actor_check
    check ((reviewed_at is null) = (reviewed_by is null))
);

create index marketing_content_items_workspace_status_idx
  on public.marketing_content_items(workspace_id, status, updated_at desc, id);

create table public.marketing_content_status_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  content_id uuid not null references public.marketing_content_items(id) on delete restrict,
  content_revision bigint not null,
  from_status text null,
  to_status text not null,
  reason text null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint marketing_content_status_events_revision_unique
    unique (content_id, content_revision),
  constraint marketing_content_status_events_revision_check
    check (content_revision >= 1),
  constraint marketing_content_status_events_from_check
    check (from_status is null or from_status in ('idea', 'draft', 'needs_approval', 'approved', 'rejected')),
  constraint marketing_content_status_events_to_check
    check (to_status in ('idea', 'draft', 'needs_approval', 'approved', 'rejected')),
  constraint marketing_content_status_events_reason_check
    check (reason is null or char_length(reason) between 3 and 1000)
);

create index marketing_content_status_events_content_idx
  on public.marketing_content_status_events(content_id, created_at desc, id);

insert into public.marketing_workspaces (
  id,
  workspace_key,
  workspace_kind,
  contractor_id,
  display_name
)
values (
  '00000000-0000-4000-8000-000000000037',
  'servsync_internal',
  'internal',
  null,
  'ServSync Internal Marketing'
);

create function public.servsync_private_guard_marketing_status_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Marketing content status history is append-only.';
end;
$$;

create trigger marketing_content_status_events_immutable
  before update or delete on public.marketing_content_status_events
  for each row execute function public.servsync_private_guard_marketing_status_event();

create trigger marketing_content_status_events_no_truncate
  before truncate on public.marketing_content_status_events
  for each statement execute function public.servsync_private_guard_marketing_status_event();

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
  review_note text
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
    item.review_note
  from public.marketing_content_items item
  join public.marketing_workspaces workspace
    on workspace.id = item.workspace_id
   and workspace.workspace_kind = 'internal'
   and workspace.workspace_key = 'servsync_internal'
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

create function public.servsync_create_internal_marketing_content(
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
as $$
declare
  v_workspace_id uuid;
  v_item public.marketing_content_items;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_channel text := nullif(btrim(coalesce(p_channel_category, '')), '');
  v_inserted boolean := false;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_client_request_id is null
     or char_length(v_title) not between 1 and 160
     or v_title ~ '[[:cntrl:]]'
     or p_content_type is null
     or p_content_type not in ('social_post', 'email', 'website_copy', 'other')
     or char_length(v_body) > 10000
     or (v_channel is not null and v_channel not in ('social', 'email', 'website', 'other')) then
    raise exception 'Invalid marketing content.' using errcode = '22023';
  end if;

  select id into v_workspace_id
    from public.marketing_workspaces
   where workspace_key = 'servsync_internal'
     and workspace_kind = 'internal'
     and contractor_id is null;

  if v_workspace_id is null then
    raise exception 'Internal Marketing workspace is unavailable.' using errcode = '55000';
  end if;

  insert into public.marketing_content_items (
    workspace_id,
    client_request_id,
    title,
    content_type,
    body,
    channel_category,
    status,
    revision_number,
    created_by
  ) values (
    v_workspace_id,
    p_client_request_id,
    v_title,
    p_content_type,
    v_body,
    v_channel,
    'idea',
    1,
    auth.uid()
  )
  on conflict (workspace_id, client_request_id) do nothing
  returning * into v_item;

  if v_item.id is not null then
    v_inserted := true;
  else
    select * into v_item
      from public.marketing_content_items
     where workspace_id = v_workspace_id
       and client_request_id = p_client_request_id;

    if v_item.id is null
       or v_item.title <> v_title
       or v_item.content_type <> p_content_type
       or v_item.body <> v_body
       or v_item.channel_category is distinct from v_channel then
      raise exception 'Marketing content request conflicts with an existing request.' using errcode = '23505';
    end if;
  end if;

  if v_inserted then
    insert into public.marketing_content_status_events (
      workspace_id,
      content_id,
      content_revision,
      from_status,
      to_status,
      reason,
      actor_user_id
    ) values (
      v_workspace_id,
      v_item.id,
      v_item.revision_number,
      null,
      'idea',
      null,
      auth.uid()
    );
  end if;

  return jsonb_build_object(
    'content_id', v_item.id,
    'status', v_item.status,
    'revision_number', v_item.revision_number
  );
end;
$$;

create function public.servsync_update_internal_marketing_content(
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
as $$
declare
  v_item public.marketing_content_items;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_channel text := nullif(btrim(coalesce(p_channel_category, '')), '');
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_content_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or char_length(v_title) not between 1 and 160
     or v_title ~ '[[:cntrl:]]'
     or p_content_type is null
     or p_content_type not in ('social_post', 'email', 'website_copy', 'other')
     or char_length(v_body) > 10000
     or (v_channel is not null and v_channel not in ('social', 'email', 'website', 'other')) then
    raise exception 'Invalid marketing content.' using errcode = '22023';
  end if;

  select item.* into v_item
    from public.marketing_content_items item
    join public.marketing_workspaces workspace on workspace.id = item.workspace_id
   where item.id = p_content_id
     and workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
   for update of item;

  if v_item.id is null then
    raise exception 'Marketing content not found.' using errcode = 'P0002';
  end if;

  if v_item.revision_number <> p_expected_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode = '40001';
  end if;

  if v_item.status not in ('idea', 'draft') then
    raise exception 'Marketing content cannot be edited in its current status.' using errcode = '55000';
  end if;

  update public.marketing_content_items
     set title = v_title,
         content_type = p_content_type,
         body = v_body,
         channel_category = v_channel,
         revision_number = revision_number + 1,
         updated_at = now()
   where id = v_item.id
  returning * into v_item;

  return jsonb_build_object(
    'content_id', v_item.id,
    'status', v_item.status,
    'revision_number', v_item.revision_number
  );
end;
$$;

create function public.servsync_transition_internal_marketing_content(
  p_content_id uuid,
  p_expected_revision bigint,
  p_to_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_item public.marketing_content_items;
  v_from_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_content_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_to_status is null
     or p_to_status not in ('draft', 'needs_approval', 'approved', 'rejected') then
    raise exception 'Invalid marketing content transition.' using errcode = '22023';
  end if;

  select item.* into v_item
    from public.marketing_content_items item
    join public.marketing_workspaces workspace on workspace.id = item.workspace_id
   where item.id = p_content_id
     and workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
   for update of item;

  if v_item.id is null then
    raise exception 'Marketing content not found.' using errcode = 'P0002';
  end if;

  if v_item.revision_number <> p_expected_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode = '40001';
  end if;

  v_from_status := v_item.status;

  if not (
    (v_from_status = 'idea' and p_to_status = 'draft')
    or (v_from_status = 'draft' and p_to_status = 'needs_approval')
    or (v_from_status = 'needs_approval' and p_to_status in ('approved', 'draft', 'rejected'))
  ) then
    raise exception 'Invalid marketing content transition.' using errcode = '55000';
  end if;

  if v_from_status = 'draft'
     and p_to_status = 'needs_approval'
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

  update public.marketing_content_items
     set status = p_to_status,
         revision_number = revision_number + 1,
         submitted_at = case
           when v_from_status = 'draft' and p_to_status = 'needs_approval' then now()
           else submitted_at
         end,
         submitted_by = case
           when v_from_status = 'draft' and p_to_status = 'needs_approval' then auth.uid()
           else submitted_by
         end,
         reviewed_at = case
           when v_from_status = 'draft' and p_to_status = 'needs_approval' then null
           when v_from_status = 'needs_approval' then now()
           else reviewed_at
         end,
         reviewed_by = case
           when v_from_status = 'draft' and p_to_status = 'needs_approval' then null
           when v_from_status = 'needs_approval' then auth.uid()
           else reviewed_by
         end,
         review_note = case
           when v_from_status = 'draft' and p_to_status = 'needs_approval' then null
           when v_from_status = 'needs_approval' then v_reason
           else review_note
         end,
         updated_at = now()
   where id = v_item.id
  returning * into v_item;

  insert into public.marketing_content_status_events (
    workspace_id,
    content_id,
    content_revision,
    from_status,
    to_status,
    reason,
    actor_user_id
  ) values (
    v_item.workspace_id,
    v_item.id,
    v_item.revision_number,
    v_from_status,
    v_item.status,
    v_reason,
    auth.uid()
  );

  return jsonb_build_object(
    'content_id', v_item.id,
    'status', v_item.status,
    'revision_number', v_item.revision_number
  );
end;
$$;

alter table public.marketing_workspaces owner to postgres;
alter table public.marketing_content_items owner to postgres;
alter table public.marketing_content_status_events owner to postgres;

alter function public.servsync_private_guard_marketing_status_event() owner to postgres;
alter function public.servsync_list_internal_marketing_content(text) owner to postgres;
alter function public.servsync_create_internal_marketing_content(uuid,text,text,text,text) owner to postgres;
alter function public.servsync_update_internal_marketing_content(uuid,bigint,text,text,text,text) owner to postgres;
alter function public.servsync_transition_internal_marketing_content(uuid,bigint,text,text) owner to postgres;

alter table public.marketing_workspaces enable row level security;
alter table public.marketing_workspaces force row level security;
alter table public.marketing_content_items enable row level security;
alter table public.marketing_content_items force row level security;
alter table public.marketing_content_status_events enable row level security;
alter table public.marketing_content_status_events force row level security;

revoke all privileges on table public.marketing_workspaces from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_content_items from public, anon, authenticated, service_role;
revoke all privileges on table public.marketing_content_status_events from public, anon, authenticated, service_role;

revoke all privileges on function public.servsync_private_guard_marketing_status_event() from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_list_internal_marketing_content(text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_create_internal_marketing_content(uuid,text,text,text,text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_update_internal_marketing_content(uuid,bigint,text,text,text,text) from public, anon, authenticated, service_role;
revoke all privileges on function public.servsync_transition_internal_marketing_content(uuid,bigint,text,text) from public, anon, authenticated, service_role;

grant execute on function public.servsync_list_internal_marketing_content(text) to authenticated;
grant execute on function public.servsync_create_internal_marketing_content(uuid,text,text,text,text) to authenticated;
grant execute on function public.servsync_update_internal_marketing_content(uuid,bigint,text,text,text,text) to authenticated;
grant execute on function public.servsync_transition_internal_marketing_content(uuid,bigint,text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
