-- ServSync Project Collaboration Slice 1 hidden foundation.
--
-- Adds durable project identity, commercial project parties, individual
-- memberships, individual authority assignments, append-only project events,
-- one-project-per-job association, and fail-closed runtime/allowlist gating
-- for future Project Collaboration work.
--
-- This patch does not add UI, Project Board, assignments, invitations,
-- project billing, financial sharing, estimate/invoice RLS changes, production
-- feature enablement, or production allowlist entries.

begin;

create extension if not exists pgcrypto;

-- Reuse/create the private runtime settings table without overwriting any
-- operator-controlled values that may already exist.
create table if not exists public.servsync_runtime_settings (
  setting_key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  notes text
);

insert into public.servsync_runtime_settings (
  setting_key,
  enabled,
  notes
) values (
  'project_collaboration_mutations_enabled',
  false,
  'Project Collaboration hidden foundation mutation gate. Defaults disabled everywhere.'
)
on conflict (setting_key) do nothing;

alter table public.servsync_runtime_settings enable row level security;

revoke all on table public.servsync_runtime_settings from public;
revoke all on table public.servsync_runtime_settings from anon;
revoke all on table public.servsync_runtime_settings from authenticated;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'active',
  home_id uuid references public.homes(id) on delete restrict,
  local_home_id uuid references public.contractor_local_homes(id) on delete restrict,
  original_creator_user_id uuid not null references public.profiles(id) on delete restrict,
  original_creator_party_type text not null,
  original_creator_contractor_id uuid references public.contractor_profiles(id) on delete restrict,
  original_creator_homeowner_user_id uuid references public.profiles(id) on delete restrict,
  paused_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_title_not_blank check (length(trim(title)) > 0),
  constraint projects_title_length check (char_length(title) <= 140),
  constraint projects_description_length check (char_length(description) <= 2000),
  constraint projects_status_check check (status in ('active', 'paused', 'closed')),
  constraint projects_exactly_one_property_check check (
    (home_id is not null and local_home_id is null)
    or (home_id is null and local_home_id is not null)
  ),
  constraint projects_original_creator_party_type_check check (
    original_creator_party_type in ('contractor_company', 'homeowner')
  ),
  constraint projects_original_creator_shape_check check (
    (
      original_creator_party_type = 'contractor_company'
      and original_creator_contractor_id is not null
      and original_creator_homeowner_user_id is null
    )
    or (
      original_creator_party_type = 'homeowner'
      and original_creator_contractor_id is null
      and original_creator_homeowner_user_id is not null
    )
  ),
  constraint projects_pause_close_timestamp_check check (
    (status <> 'paused' or paused_at is not null)
    and (status <> 'closed' or closed_at is not null)
  )
);

comment on table public.projects is
  'Hidden Project Collaboration foundation. Not user-facing; mutations are runtime-gated and allowlisted.';
comment on column public.projects.original_creator_user_id is
  'Historical creator user. Current Project Lead authority is stored in project_authority_assignments.';

create index if not exists projects_home_status_idx
  on public.projects(home_id, status, updated_at desc)
  where home_id is not null;

create index if not exists projects_local_home_status_idx
  on public.projects(local_home_id, status, updated_at desc)
  where local_home_id is not null;

create index if not exists projects_original_contractor_idx
  on public.projects(original_creator_contractor_id, status, updated_at desc)
  where original_creator_contractor_id is not null;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create table if not exists public.project_parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  party_type text not null,
  contractor_id uuid references public.contractor_profiles(id) on delete restrict,
  homeowner_user_id uuid references public.profiles(id) on delete restrict,
  display_name_snapshot text not null default '',
  status text not null default 'active',
  created_by_user_id uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  paused_at timestamptz,
  left_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_parties_party_type_check check (party_type in ('contractor_company', 'homeowner')),
  constraint project_parties_status_check check (status in ('invited', 'active', 'paused', 'left', 'removed')),
  constraint project_parties_shape_check check (
    (
      party_type = 'contractor_company'
      and contractor_id is not null
      and homeowner_user_id is null
    )
    or (
      party_type = 'homeowner'
      and contractor_id is null
      and homeowner_user_id is not null
    )
  )
);

comment on table public.project_parties is
  'Commercial/relationship parties for Project Collaboration. Membership here never grants financial document access.';

create unique index if not exists project_parties_project_contractor_uidx
  on public.project_parties(project_id, contractor_id)
  where contractor_id is not null;

create unique index if not exists project_parties_project_homeowner_uidx
  on public.project_parties(project_id, homeowner_user_id)
  where homeowner_user_id is not null;

create index if not exists project_parties_project_status_idx
  on public.project_parties(project_id, status, created_at desc);

drop trigger if exists project_parties_touch_updated_at on public.project_parties;
create trigger project_parties_touch_updated_at
  before update on public.project_parties
  for each row execute function public.touch_updated_at();

create table if not exists public.project_party_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  project_party_id uuid not null references public.project_parties(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  contractor_team_member_id uuid references public.contractor_team_members(id) on delete set null,
  company_role_snapshot text not null default '',
  status text not null default 'active',
  activated_at timestamptz,
  paused_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_party_memberships_status_check check (status in ('active', 'paused', 'revoked')),
  constraint project_party_memberships_company_role_snapshot_check check (
    company_role_snapshot = ''
    or company_role_snapshot in ('owner', 'admin', 'office', 'field_tech', 'viewer')
  )
);

comment on table public.project_party_memberships is
  'Individual users acting under a project party. Current company access remains authoritative.';

create unique index if not exists project_party_memberships_active_user_uidx
  on public.project_party_memberships(project_party_id, user_id)
  where status = 'active';

create index if not exists project_party_memberships_project_user_idx
  on public.project_party_memberships(project_id, user_id, status);

drop trigger if exists project_party_memberships_touch_updated_at on public.project_party_memberships;
create trigger project_party_memberships_touch_updated_at
  before update on public.project_party_memberships
  for each row execute function public.touch_updated_at();

create table if not exists public.project_authority_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  project_party_id uuid not null references public.project_parties(id) on delete restrict,
  project_party_membership_id uuid not null references public.project_party_memberships(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  authority_role text not null,
  status text not null default 'active',
  assigned_by_user_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_by_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  superseded_by_assignment_id uuid references public.project_authority_assignments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_authority_assignments_role_check check (
    authority_role in ('project_lead', 'controller', 'manager')
  ),
  constraint project_authority_assignments_status_check check (status in ('active', 'revoked', 'superseded')),
  constraint project_authority_assignments_revocation_check check (
    (status = 'active' and revoked_at is null)
    or (status in ('revoked', 'superseded'))
  )
);

comment on table public.project_authority_assignments is
  'Individual Project Collaboration authority. One active Project Lead assignment is canonical for the current lead.';

create unique index if not exists project_authority_assignments_one_active_lead_uidx
  on public.project_authority_assignments(project_id)
  where authority_role = 'project_lead' and status = 'active';

create index if not exists project_authority_assignments_project_user_idx
  on public.project_authority_assignments(project_id, user_id, authority_role, status);

drop trigger if exists project_authority_assignments_touch_updated_at on public.project_authority_assignments;
create trigger project_authority_assignments_touch_updated_at
  before update on public.project_authority_assignments
  for each row execute function public.touch_updated_at();

create table if not exists public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_project_party_id uuid references public.project_parties(id) on delete restrict,
  subject_project_party_id uuid references public.project_parties(id) on delete restrict,
  subject_authority_assignment_id uuid references public.project_authority_assignments(id) on delete restrict,
  related_inspection_id uuid references public.inspections(id) on delete restrict,
  visibility_scope text not null,
  visible_project_party_id uuid references public.project_parties(id) on delete restrict,
  event_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint project_events_event_type_check check (
    event_type in (
      'project_created',
      'project_metadata_updated',
      'creator_party_activated',
      'creator_membership_activated',
      'project_lead_assigned',
      'job_attached'
    )
  ),
  constraint project_events_visibility_scope_check check (
    visibility_scope in (
      'all_active_participants',
      'lead_controllers_managers',
      'specific_project_party',
      'assigned_contractor_and_lead',
      'platform_admin_only'
    )
  ),
  constraint project_events_specific_party_visibility_check check (
    (visibility_scope = 'specific_project_party' and visible_project_party_id is not null)
    or (visibility_scope <> 'specific_project_party')
  )
);

comment on table public.project_events is
  'Append-only Project Collaboration event history with structured visibility. Browser roles cannot write or delete events.';

create index if not exists project_events_project_created_idx
  on public.project_events(project_id, created_at desc);

create index if not exists project_events_actor_party_idx
  on public.project_events(actor_project_party_id, created_at desc)
  where actor_project_party_id is not null;

create index if not exists project_events_visible_party_idx
  on public.project_events(visible_project_party_id, created_at desc)
  where visible_project_party_id is not null;

create index if not exists project_events_related_inspection_idx
  on public.project_events(related_inspection_id, created_at desc)
  where related_inspection_id is not null;

create table if not exists public.project_collaboration_allowed_profiles (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  enabled boolean not null default true,
  approved_by_user_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz not null default now(),
  approval_reason text not null default '',
  expires_at timestamptz,
  revoked_by_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_collaboration_allowed_profiles_reason_length check (char_length(approval_reason) <= 500),
  constraint project_collaboration_allowed_profiles_revoked_check check (
    (revoked_at is null and revoked_by_user_id is null)
    or revoked_at is not null
  )
);

comment on table public.project_collaboration_allowed_profiles is
  'Private allowlist for hidden Project Collaboration mutation testing. Browser roles have no direct access.';

create index if not exists project_collaboration_allowed_profiles_active_idx
  on public.project_collaboration_allowed_profiles(profile_id, enabled, expires_at)
  where revoked_at is null;

drop trigger if exists project_collaboration_allowed_profiles_touch_updated_at
  on public.project_collaboration_allowed_profiles;
create trigger project_collaboration_allowed_profiles_touch_updated_at
  before update on public.project_collaboration_allowed_profiles
  for each row execute function public.touch_updated_at();

alter table public.inspections
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'inspections_project_id_fkey'
       and conrelid = 'public.inspections'::regclass
  ) then
    alter table public.inspections
      add constraint inspections_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete restrict;
  end if;
end $$;

create index if not exists inspections_project_idx
  on public.inspections(project_id)
  where project_id is not null;

alter table public.projects enable row level security;
alter table public.project_parties enable row level security;
alter table public.project_party_memberships enable row level security;
alter table public.project_authority_assignments enable row level security;
alter table public.project_events enable row level security;
alter table public.project_collaboration_allowed_profiles enable row level security;

revoke all on table public.projects from public;
revoke all on table public.projects from anon;
revoke all on table public.projects from authenticated;
revoke all on table public.project_parties from public;
revoke all on table public.project_parties from anon;
revoke all on table public.project_parties from authenticated;
revoke all on table public.project_party_memberships from public;
revoke all on table public.project_party_memberships from anon;
revoke all on table public.project_party_memberships from authenticated;
revoke all on table public.project_authority_assignments from public;
revoke all on table public.project_authority_assignments from anon;
revoke all on table public.project_authority_assignments from authenticated;
revoke all on table public.project_events from public;
revoke all on table public.project_events from anon;
revoke all on table public.project_events from authenticated;
revoke all on table public.project_collaboration_allowed_profiles from public;
revoke all on table public.project_collaboration_allowed_profiles from anon;
revoke all on table public.project_collaboration_allowed_profiles from authenticated;

create or replace function public.current_user_project_collaboration_allowed()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and coalesce((
      select rs.enabled
        from public.servsync_runtime_settings rs
       where rs.setting_key = 'project_collaboration_mutations_enabled'
    ), false)
    and exists (
      select 1
        from public.project_collaboration_allowed_profiles ap
       where ap.profile_id = auth.uid()
         and ap.enabled = true
         and ap.revoked_at is null
         and (ap.expires_at is null or ap.expires_at > now())
    );
$$;

revoke all on function public.current_user_project_collaboration_allowed() from public;
revoke all on function public.current_user_project_collaboration_allowed() from anon;
revoke all on function public.current_user_project_collaboration_allowed() from authenticated;

create or replace function public.current_user_project_company_role(p_contractor_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when exists (
      select 1
        from public.contractor_profiles cp
       where cp.id = p_contractor_id
         and cp.owner_user_id = auth.uid()
    ) then 'owner'
    else coalesce((
      select tm.role
        from public.contractor_team_members tm
       where tm.contractor_id = p_contractor_id
         and tm.user_id = auth.uid()
         and tm.status = 'active'
       order by case tm.role
         when 'admin' then 1
         when 'office' then 2
         when 'field_tech' then 3
         when 'viewer' then 4
         else 5
       end
       limit 1
    ), '')
  end;
$$;

revoke all on function public.current_user_project_company_role(uuid) from public;
revoke all on function public.current_user_project_company_role(uuid) from anon;
revoke all on function public.current_user_project_company_role(uuid) from authenticated;

create or replace function public.current_user_can_create_hidden_project_for_contractor(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_project_company_role(p_contractor_id) in ('owner', 'admin');
$$;

revoke all on function public.current_user_can_create_hidden_project_for_contractor(uuid) from public;
revoke all on function public.current_user_can_create_hidden_project_for_contractor(uuid) from anon;
revoke all on function public.current_user_can_create_hidden_project_for_contractor(uuid) from authenticated;

create or replace function public.current_user_can_manage_hidden_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.project_authority_assignments aa
      join public.project_parties pp on pp.id = aa.project_party_id
      join public.project_party_memberships pm on pm.id = aa.project_party_membership_id
     where aa.project_id = p_project_id
       and aa.user_id = auth.uid()
       and aa.authority_role = 'project_lead'
       and aa.status = 'active'
       and pp.status = 'active'
       and pm.status = 'active'
       and pp.party_type = 'contractor_company'
       and pp.contractor_id is not null
       and public.current_user_project_company_role(pp.contractor_id) in ('owner', 'admin')
  );
$$;

revoke all on function public.current_user_can_manage_hidden_project(uuid) from public;
revoke all on function public.current_user_can_manage_hidden_project(uuid) from anon;
revoke all on function public.current_user_can_manage_hidden_project(uuid) from authenticated;

create or replace function public.current_user_can_view_project_event(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.project_events pe
     where pe.id = p_event_id
       and (
         public.current_user_is_platform_admin()
         or (
           pe.visibility_scope = 'all_active_participants'
           and exists (
             select 1
               from public.project_party_memberships pm
               join public.project_parties pp on pp.id = pm.project_party_id
              where pm.project_id = pe.project_id
                and pm.user_id = auth.uid()
                and pm.status = 'active'
                and pp.status = 'active'
           )
         )
         or (
           pe.visibility_scope = 'lead_controllers_managers'
           and exists (
             select 1
               from public.project_authority_assignments aa
               join public.project_party_memberships pm on pm.id = aa.project_party_membership_id
               join public.project_parties pp on pp.id = aa.project_party_id
              where aa.project_id = pe.project_id
                and aa.user_id = auth.uid()
                and aa.status = 'active'
                and aa.authority_role in ('project_lead', 'controller', 'manager')
                and pm.status = 'active'
                and pp.status = 'active'
           )
         )
         or (
           pe.visibility_scope in ('specific_project_party', 'assigned_contractor_and_lead')
           and exists (
             select 1
               from public.project_party_memberships pm
               join public.project_parties pp on pp.id = pm.project_party_id
              where pm.project_id = pe.project_id
                and pm.project_party_id = pe.visible_project_party_id
                and pm.user_id = auth.uid()
                and pm.status = 'active'
                and pp.status = 'active'
           )
         )
       )
  );
$$;

revoke all on function public.current_user_can_view_project_event(uuid) from public;
revoke all on function public.current_user_can_view_project_event(uuid) from anon;
revoke all on function public.current_user_can_view_project_event(uuid) from authenticated;

create or replace function public.servsync_create_project(
  p_contractor_id uuid,
  p_title text,
  p_description text default '',
  p_home_id uuid default null,
  p_local_home_id uuid default null
)
returns table (
  project_id uuid,
  title text,
  description text,
  status text,
  home_id uuid,
  local_home_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_contractor public.contractor_profiles;
  v_home public.homes;
  v_local_home public.contractor_local_homes;
  v_company_role text;
  v_project public.projects;
  v_party public.project_parties;
  v_membership public.project_party_memberships;
  v_authority public.project_authority_assignments;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_project_collaboration_allowed() then
    raise exception 'Project Collaboration is not enabled for this account.';
  end if;

  if p_contractor_id is null then
    raise exception 'Contractor company is required.';
  end if;

  select *
    into v_contractor
    from public.contractor_profiles
   where id = p_contractor_id;

  if v_contractor.id is null then
    raise exception 'Contractor company not found.';
  end if;

  if not public.current_user_can_create_hidden_project_for_contractor(p_contractor_id) then
    raise exception 'Only contractor owners or admins can create hidden project foundations.';
  end if;

  v_company_role := public.current_user_project_company_role(p_contractor_id);

  if length(v_title) = 0 then
    raise exception 'Project title is required.';
  end if;

  if char_length(v_title) > 140 then
    raise exception 'Project title is too long.';
  end if;

  if char_length(v_description) > 2000 then
    raise exception 'Project description is too long.';
  end if;

  if (p_home_id is null and p_local_home_id is null)
     or (p_home_id is not null and p_local_home_id is not null) then
    raise exception 'Choose exactly one project property context.';
  end if;

  if p_home_id is not null then
    select *
      into v_home
      from public.homes
     where id = p_home_id;

    if v_home.id is null then
      raise exception 'Connected property not found.';
    end if;

    if not exists (
      select 1
        from public.homeowner_contractor_connections c
        join public.connection_shared_properties csp on csp.connection_id = c.id
       where c.contractor_id = p_contractor_id
         and c.homeowner_user_id = v_home.homeowner_user_id
         and c.status = 'active'
         and csp.home_id = p_home_id
    ) then
      raise exception 'Selected property is not shared for this contractor connection.';
    end if;
  end if;

  if p_local_home_id is not null then
    select *
      into v_local_home
      from public.contractor_local_homes
     where id = p_local_home_id
       and contractor_id = p_contractor_id;

    if v_local_home.id is null then
      raise exception 'Local property not found for this contractor.';
    end if;
  end if;

  insert into public.projects (
    title,
    description,
    status,
    home_id,
    local_home_id,
    original_creator_user_id,
    original_creator_party_type,
    original_creator_contractor_id
  ) values (
    v_title,
    v_description,
    'active',
    p_home_id,
    p_local_home_id,
    v_actor_id,
    'contractor_company',
    p_contractor_id
  )
  returning * into v_project;

  insert into public.project_parties (
    project_id,
    party_type,
    contractor_id,
    display_name_snapshot,
    status,
    created_by_user_id,
    activated_at
  ) values (
    v_project.id,
    'contractor_company',
    p_contractor_id,
    coalesce(nullif(trim(v_contractor.business_name), ''), 'Contractor company'),
    'active',
    v_actor_id,
    now()
  )
  returning * into v_party;

  insert into public.project_party_memberships (
    project_id,
    project_party_id,
    user_id,
    contractor_team_member_id,
    company_role_snapshot,
    status,
    activated_at
  ) values (
    v_project.id,
    v_party.id,
    v_actor_id,
    (
      select tm.id
        from public.contractor_team_members tm
       where tm.contractor_id = p_contractor_id
         and tm.user_id = v_actor_id
         and tm.status = 'active'
       limit 1
    ),
    v_company_role,
    'active',
    now()
  )
  returning * into v_membership;

  insert into public.project_authority_assignments (
    project_id,
    project_party_id,
    project_party_membership_id,
    user_id,
    authority_role,
    status,
    assigned_by_user_id
  ) values (
    v_project.id,
    v_party.id,
    v_membership.id,
    v_actor_id,
    'project_lead',
    'active',
    v_actor_id
  )
  returning * into v_authority;

  insert into public.project_events (
    project_id,
    event_type,
    actor_user_id,
    actor_project_party_id,
    subject_project_party_id,
    visibility_scope,
    event_details
  ) values
    (
      v_project.id,
      'project_created',
      v_actor_id,
      v_party.id,
      v_party.id,
      'lead_controllers_managers',
      jsonb_build_object('title', v_project.title, 'status', v_project.status)
    ),
    (
      v_project.id,
      'creator_party_activated',
      v_actor_id,
      v_party.id,
      v_party.id,
      'lead_controllers_managers',
      jsonb_build_object('party_type', v_party.party_type)
    ),
    (
      v_project.id,
      'creator_membership_activated',
      v_actor_id,
      v_party.id,
      v_party.id,
      'lead_controllers_managers',
      jsonb_build_object('membership_status', v_membership.status)
    ),
    (
      v_project.id,
      'project_lead_assigned',
      v_actor_id,
      v_party.id,
      v_party.id,
      'lead_controllers_managers',
      jsonb_build_object('authority_role', v_authority.authority_role)
    );

  return query
    select
      v_project.id,
      v_project.title,
      v_project.description,
      v_project.status,
      v_project.home_id,
      v_project.local_home_id,
      v_project.created_at,
      v_project.updated_at;
end;
$$;

create or replace function public.servsync_update_project(
  p_project_id uuid,
  p_title text,
  p_description text default null
)
returns table (
  project_id uuid,
  title text,
  description text,
  status text,
  home_id uuid,
  local_home_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_description text;
  v_project public.projects;
  v_actor_party_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_project_collaboration_allowed() then
    raise exception 'Project Collaboration is not enabled for this account.';
  end if;

  if p_project_id is null then
    raise exception 'Project is required.';
  end if;

  if not public.current_user_can_manage_hidden_project(p_project_id) then
    raise exception 'Only the current Project Lead owner/admin can update this project.';
  end if;

  select *
    into v_project
    from public.projects
   where id = p_project_id
   for update;

  if v_project.id is null then
    raise exception 'Project not found.';
  end if;

  if v_project.status = 'closed' then
    raise exception 'Closed projects cannot be updated by this foundation RPC.';
  end if;

  if length(v_title) = 0 then
    raise exception 'Project title is required.';
  end if;

  if char_length(v_title) > 140 then
    raise exception 'Project title is too long.';
  end if;

  v_description := case
    when p_description is null then v_project.description
    else trim(coalesce(p_description, ''))
  end;

  if char_length(v_description) > 2000 then
    raise exception 'Project description is too long.';
  end if;

  select aa.project_party_id
    into v_actor_party_id
    from public.project_authority_assignments aa
   where aa.project_id = p_project_id
     and aa.user_id = v_actor_id
     and aa.authority_role = 'project_lead'
     and aa.status = 'active'
   limit 1;

  update public.projects
     set title = v_title,
         description = v_description
   where id = p_project_id
  returning * into v_project;

  insert into public.project_events (
    project_id,
    event_type,
    actor_user_id,
    actor_project_party_id,
    visibility_scope,
    event_details
  ) values (
    v_project.id,
    'project_metadata_updated',
    v_actor_id,
    v_actor_party_id,
    'lead_controllers_managers',
    jsonb_build_object('title', v_project.title)
  );

  return query
    select
      v_project.id,
      v_project.title,
      v_project.description,
      v_project.status,
      v_project.home_id,
      v_project.local_home_id,
      v_project.created_at,
      v_project.updated_at;
end;
$$;

create or replace function public.servsync_attach_job_to_project(
  p_project_id uuid,
  p_inspection_id uuid
)
returns table (
  project_id uuid,
  inspection_id uuid,
  attached_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_project public.projects;
  v_job public.inspections;
  v_lead_party public.project_parties;
  v_attached_at timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_project_collaboration_allowed() then
    raise exception 'Project Collaboration is not enabled for this account.';
  end if;

  if p_project_id is null or p_inspection_id is null then
    raise exception 'Project and job are required.';
  end if;

  if not public.current_user_can_manage_hidden_project(p_project_id) then
    raise exception 'Only the current Project Lead owner/admin can attach jobs to this project.';
  end if;

  select *
    into v_project
    from public.projects
   where id = p_project_id
   for update;

  if v_project.id is null then
    raise exception 'Project not found.';
  end if;

  if v_project.status <> 'active' then
    raise exception 'Jobs can only be attached to active projects.';
  end if;

  select pp.*
    into v_lead_party
    from public.project_authority_assignments aa
    join public.project_parties pp on pp.id = aa.project_party_id
   where aa.project_id = p_project_id
     and aa.user_id = v_actor_id
     and aa.authority_role = 'project_lead'
     and aa.status = 'active'
     and pp.status = 'active'
     and pp.party_type = 'contractor_company'
   limit 1;

  if v_lead_party.id is null or v_lead_party.contractor_id is null then
    raise exception 'Active creator contractor party not found.';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if v_job.project_id is not null then
    raise exception 'This job is already attached to a project.';
  end if;

  if v_job.contractor_id <> v_lead_party.contractor_id then
    raise exception 'Only jobs owned by the Project Lead contractor company can be attached in Slice 1.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_job.contractor_id) then
    raise exception 'You do not have permission to attach this job.';
  end if;

  if v_project.home_id is not null and v_job.home_id is distinct from v_project.home_id then
    raise exception 'Job property does not match the project property.';
  end if;

  if v_project.local_home_id is not null and v_job.local_home_id is distinct from v_project.local_home_id then
    raise exception 'Job local property does not match the project local property.';
  end if;

  update public.inspections
     set project_id = v_project.id
   where id = v_job.id;

  insert into public.project_events (
    project_id,
    event_type,
    actor_user_id,
    actor_project_party_id,
    related_inspection_id,
    visibility_scope,
    event_details
  ) values (
    v_project.id,
    'job_attached',
    v_actor_id,
    v_lead_party.id,
    v_job.id,
    'lead_controllers_managers',
    jsonb_build_object('job_id', v_job.id)
  );

  return query select v_project.id, v_job.id, v_attached_at;
end;
$$;

revoke execute on function public.servsync_create_project(uuid, text, text, uuid, uuid) from public;
revoke execute on function public.servsync_create_project(uuid, text, text, uuid, uuid) from anon;
revoke execute on function public.servsync_update_project(uuid, text, text) from public;
revoke execute on function public.servsync_update_project(uuid, text, text) from anon;
revoke execute on function public.servsync_attach_job_to_project(uuid, uuid) from public;
revoke execute on function public.servsync_attach_job_to_project(uuid, uuid) from anon;

grant execute on function public.servsync_create_project(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.servsync_update_project(uuid, text, text) to authenticated;
grant execute on function public.servsync_attach_job_to_project(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
