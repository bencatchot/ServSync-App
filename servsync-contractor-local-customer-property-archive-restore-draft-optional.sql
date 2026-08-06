-- ServSync Contractor-Local Customer and Property Archive/Restore Draft-Optional v2.
-- Supersedes the immutable v1 migration for new environment alignment. Durable
-- Draft and Project Collaboration remain optional integrations; a present but
-- incomplete foundation fails before archive lifecycle DDL is installed.
--
-- Apply after:
--   - servsync-customer-management-edit-boundary.sql
--   - servsync-contractor-local-customer-read-list-parity-draft-optional.sql
--   - servsync-admin-office-customer-creation-parity.sql
--   - servsync-contractor-local-customer-direct-table-privilege-cleanup.sql

begin;

do $$
declare
  v_projects regclass := to_regclass('public.projects');
  v_draft_relation_count integer;
begin
  if to_regclass('public.contractor_local_contacts') is null
     or to_regclass('public.contractor_local_homes') is null
     or to_regclass('public.contractor_local_customer_claim_invites') is null
     or to_regclass('public.contractor_local_customer_claim_invite_homes') is null
     or to_regclass('public.inspection_templates') is null
     or to_regclass('public.inspections') is null
     or to_regclass('public.estimates') is null
     or to_regclass('public.invoices') is null
     or to_regclass('public.contractor_visit_events') is null
     or to_regclass('public.contractor_calendar_events') is null
     or to_regclass('public.contractor_calendar_event_job_links') is null then
    raise exception 'Missing required customer, claim, work, or calendar tables.';
  end if;

  -- Project Collaboration is optional, but a present table must be the complete
  -- compatible foundation before any archive DDL is allowed to run.
  if v_projects is not null and (
    not exists (
      select 1
        from pg_class relation
       where relation.oid = v_projects
         and relation.relkind in ('r', 'p')
    )
    or (
      select count(*)
        from pg_attribute attribute
       where attribute.attrelid = v_projects
         and attribute.attnum > 0
         and not attribute.attisdropped
         and (
           (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
           or (attribute.attname = 'local_home_id' and attribute.atttypid = 'uuid'::regtype and not attribute.attnotnull)
           or (
             attribute.attname = 'original_creator_contractor_id'
             and attribute.atttypid = 'uuid'::regtype
             and not attribute.attnotnull
           )
           or (attribute.attname = 'status' and attribute.atttypid = 'text'::regtype and attribute.attnotnull)
         )
    ) <> 4
    or (
      select count(*)
        from pg_constraint constraint_row
       where constraint_row.conrelid = v_projects
         and (
           (constraint_row.conname = 'projects_pkey' and constraint_row.contype = 'p')
           or (constraint_row.conname = 'projects_status_check' and constraint_row.contype = 'c')
           or (constraint_row.conname = 'projects_exactly_one_property_check' and constraint_row.contype = 'c')
           or (constraint_row.conname = 'projects_original_creator_shape_check' and constraint_row.contype = 'c')
           or (
             constraint_row.conname = 'projects_local_home_id_fkey'
             and constraint_row.contype = 'f'
             and constraint_row.confrelid = 'public.contractor_local_homes'::regclass
           )
           or (
             constraint_row.conname = 'projects_original_creator_contractor_id_fkey'
             and constraint_row.contype = 'f'
             and constraint_row.confrelid = 'public.contractor_profiles'::regclass
           )
         )
    ) <> 6
  ) then
    raise exception 'Project Collaboration foundation is incomplete or incompatible.';
  end if;

  if to_regprocedure('public.servsync_current_contractor_profile()') is null
     or to_regprocedure('public.current_user_can_manage_contractor_customers(uuid)') is null
     or to_regprocedure('public.servsync_private_local_customer_read_context()') is null
     or to_regprocedure('public.servsync_private_assert_canonical_customer_draft_foundation()') is null
     or to_regprocedure('public.servsync_private_customer_draft_foundation_available()') is null
     or to_regprocedure('public.servsync_private_local_customer_has_readable_work(uuid,uuid,uuid)') is null then
    raise exception 'Missing required contractor customer-management boundaries.';
  end if;

  if exists (
    select 1
      from (values
        (
          'servsync_private_assert_canonical_customer_draft_foundation',
          'public.servsync_private_assert_canonical_customer_draft_foundation()',
          'void',
          '7000e555b221b648f37702f1cc5d6c25'
        ),
        (
          'servsync_private_customer_draft_foundation_available',
          'public.servsync_private_customer_draft_foundation_available()',
          'boolean',
          'da99bd92dfb3f4e93245f7a637ae9438'
        ),
        (
          'servsync_private_local_customer_has_readable_work',
          'public.servsync_private_local_customer_has_readable_work(uuid,uuid,uuid)',
          'boolean',
          'b5cac7e2a656e06653cc26635e64da5b'
        )
      ) expected_function(function_name, signature, return_type, body_fingerprint)
      left join pg_proc procedure_row on procedure_row.oid = to_regprocedure(expected_function.signature)
      left join pg_roles owner_role on owner_role.oid = procedure_row.proowner
     where procedure_row.oid is null
        or (
          select count(*)
            from pg_proc overload
            join pg_namespace namespace on namespace.oid = overload.pronamespace
           where namespace.nspname = 'public'
             and overload.proname = expected_function.function_name
        ) <> 1
        or owner_role.rolname <> 'postgres'
        or not procedure_row.prosecdef
        or coalesce(procedure_row.proconfig, '{}'::text[]) <> array['search_path=public']::text[]
        or procedure_row.prorettype <> expected_function.return_type::regtype
        or md5(procedure_row.prosrc) <> expected_function.body_fingerprint
        or has_function_privilege('public', procedure_row.oid, 'EXECUTE')
        or has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
        or has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
        or (
          select count(*)
            from aclexplode(coalesce(
              procedure_row.proacl,
              acldefault('f', procedure_row.proowner)
            )) function_acl
        ) <> 1
        or exists (
          select 1
            from aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) function_acl
           where function_acl.privilege_type = 'EXECUTE'
             and (
               function_acl.grantee <> procedure_row.proowner
               or function_acl.is_grantable
             )
        )
  ) then
    raise exception 'Missing required contractor customer-management boundaries.';
  end if;

  select count(*)
    into v_draft_relation_count
    from (values
      (to_regclass('public.contractor_work_drafts')),
      (to_regclass('public.contractor_work_draft_items')),
      (to_regclass('public.contractor_work_draft_launches'))
    ) draft_relation(oid)
   where oid is not null;

  if v_draft_relation_count not in (0, 3) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  elsif v_draft_relation_count = 3 then
    perform public.servsync_private_assert_canonical_customer_draft_foundation();
    if not public.servsync_private_customer_draft_foundation_available() then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;
  elsif public.servsync_private_customer_draft_foundation_available() then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;
end;
$$;

alter table public.contractor_local_contacts
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.contractor_local_homes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'contractor_local_contacts_archive_pair_check'
       and conrelid = 'public.contractor_local_contacts'::regclass
  ) then
    alter table public.contractor_local_contacts
      add constraint contractor_local_contacts_archive_pair_check
      check (archived_at is not null or archived_by is null);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'contractor_local_homes_archive_pair_check'
       and conrelid = 'public.contractor_local_homes'::regclass
  ) then
    alter table public.contractor_local_homes
      add constraint contractor_local_homes_archive_pair_check
      check (archived_at is not null or archived_by is null);
  end if;
end;
$$;

create index if not exists contractor_local_contacts_active_contractor_idx
  on public.contractor_local_contacts(contractor_id, lower(display_name), id)
  where archived_at is null;

create index if not exists contractor_local_contacts_archived_contractor_idx
  on public.contractor_local_contacts(contractor_id, archived_at desc, id)
  where archived_at is not null;

create index if not exists contractor_local_homes_active_contact_idx
  on public.contractor_local_homes(contractor_id, local_contact_id, created_at, id)
  where archived_at is null;

create index if not exists contractor_local_homes_archived_contact_idx
  on public.contractor_local_homes(contractor_id, local_contact_id, archived_at desc, id)
  where archived_at is not null;

create table if not exists public.contractor_local_customer_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid references public.contractor_local_homes(id) on delete cascade,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint contractor_local_customer_lifecycle_action_check check (
    action in ('customer_archived', 'customer_restored', 'property_archived', 'property_restored')
  ),
  constraint contractor_local_customer_lifecycle_target_check check (
    (action in ('customer_archived', 'customer_restored') and local_home_id is null)
    or (action in ('property_archived', 'property_restored') and local_home_id is not null)
  ),
  constraint contractor_local_customer_lifecycle_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and not (metadata ?| array['token', 'claim_token', 'invite_token', 'phone', 'email', 'notes'])
  )
);

alter table public.contractor_local_customer_lifecycle_events owner to postgres;

create index if not exists contractor_local_customer_lifecycle_contact_idx
  on public.contractor_local_customer_lifecycle_events(contractor_id, local_contact_id, occurred_at desc, id);

create index if not exists contractor_local_customer_lifecycle_home_idx
  on public.contractor_local_customer_lifecycle_events(contractor_id, local_home_id, occurred_at desc, id)
  where local_home_id is not null;

alter table public.contractor_local_customer_lifecycle_events enable row level security;
alter table public.contractor_local_customer_lifecycle_events force row level security;

revoke all on table public.contractor_local_customer_lifecycle_events from public;
revoke all on table public.contractor_local_customer_lifecycle_events from anon;
revoke all on table public.contractor_local_customer_lifecycle_events from authenticated;
revoke all on table public.contractor_local_customer_lifecycle_events from service_role;
grant select on table public.contractor_local_customer_lifecycle_events to service_role;

create or replace function public.servsync_private_assert_active_local_subject(
  p_contractor_id uuid,
  p_local_contact_id uuid,
  p_local_home_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  if p_contractor_id is null or (p_local_contact_id is null and p_local_home_id is null) then
    raise insufficient_privilege using message = 'Customer or property is unavailable.';
  end if;

  if p_local_contact_id is null then
    select home.local_contact_id
      into p_local_contact_id
      from public.contractor_local_homes home
     where home.id = p_local_home_id
       and home.contractor_id = p_contractor_id;
  end if;

  select contact.*
    into v_contact
    from public.contractor_local_contacts contact
   where contact.id = p_local_contact_id
     and contact.contractor_id = p_contractor_id
   for key share;

  if v_contact.id is null
     or v_contact.archived_at is not null
     or v_contact.homeowner_user_id is not null
     or v_contact.claimed_at is not null then
    raise insufficient_privilege using message = 'Customer or property is unavailable.';
  end if;

  if p_local_home_id is not null then
    select home.*
      into v_home
      from public.contractor_local_homes home
     where home.id = p_local_home_id
       and home.contractor_id = p_contractor_id
       and home.local_contact_id = v_contact.id
     for key share;

    if v_home.id is null
       or v_home.archived_at is not null
       or v_home.home_id is not null
       or v_home.claimed_at is not null then
      raise insufficient_privilege using message = 'Customer or property is unavailable.';
    end if;
  end if;
end;
$$;

comment on function public.servsync_private_assert_active_local_subject(uuid, uuid, uuid) is
  'Canonical customer-then-property lock and eligibility guard for assigning new work to contractor-local subjects.';

alter function public.servsync_private_assert_active_local_subject(uuid, uuid, uuid) owner to postgres;
revoke all on function public.servsync_private_assert_active_local_subject(uuid, uuid, uuid) from public;
revoke all on function public.servsync_private_assert_active_local_subject(uuid, uuid, uuid) from anon;
revoke all on function public.servsync_private_assert_active_local_subject(uuid, uuid, uuid) from authenticated;

create or replace function public.servsync_private_guard_local_contact_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contractor_id is distinct from old.contractor_id
     or new.id is distinct from old.id then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  if old.archived_at is not null and (
    new.homeowner_user_id is distinct from old.homeowner_user_id
    or new.claimed_at is distinct from old.claimed_at
    or new.display_name is distinct from old.display_name
    or new.phone is distinct from old.phone
    or new.email is distinct from old.email
    or new.notes is distinct from old.notes
  ) then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  if new.archived_at is not null and (
    new.homeowner_user_id is distinct from old.homeowner_user_id
    or new.claimed_at is distinct from old.claimed_at
  ) then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  return new;
end;
$$;

create or replace function public.servsync_private_guard_local_home_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_changed boolean;
begin
  if tg_op = 'INSERT' then
    perform public.servsync_private_assert_active_local_subject(new.contractor_id, new.local_contact_id, null);
    return new;
  end if;

  if new.contractor_id is distinct from old.contractor_id
     or new.local_contact_id is distinct from old.local_contact_id
     or new.id is distinct from old.id then
    raise insufficient_privilege using message = 'Local property is unavailable.';
  end if;

  v_subject_changed :=
    new.home_id is distinct from old.home_id
    or new.claimed_at is distinct from old.claimed_at
    or new.nickname is distinct from old.nickname
    or new.address_line1 is distinct from old.address_line1
    or new.address_line2 is distinct from old.address_line2
    or new.city is distinct from old.city
    or new.state is distinct from old.state
    or new.zip_code is distinct from old.zip_code
    or new.home_type is distinct from old.home_type
    or new.year_built is distinct from old.year_built
    or new.square_feet is distinct from old.square_feet
    or new.notes is distinct from old.notes;

  if v_subject_changed then
    -- Validate the pre-transition local property while the row update itself
    -- supplies the home lock. This preserves claim/mapping transitions from an
    -- active local property without allowing edits to an already unavailable one.
    perform public.servsync_private_assert_active_local_subject(new.contractor_id, new.local_contact_id, null);
    if old.archived_at is not null
       or old.home_id is not null
       or old.claimed_at is not null then
      raise insufficient_privilege using message = 'Local property is unavailable.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.servsync_private_guard_local_work_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_contractor_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
begin
  v_contractor_id := nullif(v_new->>'contractor_id', '')::uuid;
  v_local_contact_id := nullif(v_new->>'local_contact_id', '')::uuid;
  v_local_home_id := nullif(v_new->>'local_home_id', '')::uuid;

  if v_local_contact_id is null and v_local_home_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and v_new->>'contractor_id' is not distinct from v_old->>'contractor_id'
     and v_new->>'local_contact_id' is not distinct from v_old->>'local_contact_id'
     and v_new->>'local_home_id' is not distinct from v_old->>'local_home_id' then
    return new;
  end if;

  perform public.servsync_private_assert_active_local_subject(v_contractor_id, v_local_contact_id, v_local_home_id);
  return new;
end;
$$;

create or replace function public.servsync_private_guard_local_claim_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'contractor_local_customer_claim_invites' then
    if new.status = 'pending' then
      perform public.servsync_private_assert_active_local_subject(
        new.contractor_id,
        new.local_contact_id,
        new.local_home_id
      );
    end if;
  else
    perform public.servsync_private_assert_active_local_subject(
      new.contractor_id,
      new.local_contact_id,
      new.local_home_id
    );
  end if;
  return new;
end;
$$;

alter function public.servsync_private_guard_local_contact_lifecycle() owner to postgres;
alter function public.servsync_private_guard_local_home_lifecycle() owner to postgres;
alter function public.servsync_private_guard_local_work_assignment() owner to postgres;
alter function public.servsync_private_guard_local_claim_assignment() owner to postgres;

revoke all on function public.servsync_private_guard_local_contact_lifecycle() from public, anon, authenticated;
revoke all on function public.servsync_private_guard_local_home_lifecycle() from public, anon, authenticated;
revoke all on function public.servsync_private_guard_local_work_assignment() from public, anon, authenticated;
revoke all on function public.servsync_private_guard_local_claim_assignment() from public, anon, authenticated;

drop trigger if exists servsync_guard_local_contact_lifecycle on public.contractor_local_contacts;
create trigger servsync_guard_local_contact_lifecycle
  before update on public.contractor_local_contacts
  for each row execute function public.servsync_private_guard_local_contact_lifecycle();

drop trigger if exists servsync_guard_local_home_lifecycle on public.contractor_local_homes;
create trigger servsync_guard_local_home_lifecycle
  before insert or update on public.contractor_local_homes
  for each row execute function public.servsync_private_guard_local_home_lifecycle();

do $draft_assignment$
begin
  if public.servsync_private_customer_draft_foundation_available() then
    execute 'drop trigger if exists servsync_guard_local_draft_assignment on public.contractor_work_drafts';
    execute $draft_trigger$
      create trigger servsync_guard_local_draft_assignment
        before insert or update of contractor_id, local_contact_id, local_home_id
        on public.contractor_work_drafts
        for each row execute function public.servsync_private_guard_local_work_assignment()
    $draft_trigger$;
  end if;
end;
$draft_assignment$;

drop trigger if exists servsync_guard_local_inspection_template_assignment on public.inspection_templates;
create trigger servsync_guard_local_inspection_template_assignment
  before insert or update of contractor_id, local_contact_id, local_home_id on public.inspection_templates
  for each row execute function public.servsync_private_guard_local_work_assignment();

drop trigger if exists servsync_guard_local_calendar_assignment on public.contractor_calendar_events;
create trigger servsync_guard_local_calendar_assignment
  before insert or update of contractor_id, local_contact_id on public.contractor_calendar_events
  for each row execute function public.servsync_private_guard_local_work_assignment();

drop trigger if exists servsync_guard_local_claim_invite_assignment on public.contractor_local_customer_claim_invites;
create trigger servsync_guard_local_claim_invite_assignment
  before insert or update of contractor_id, local_contact_id, local_home_id, status
  on public.contractor_local_customer_claim_invites
  for each row execute function public.servsync_private_guard_local_claim_assignment();

drop trigger if exists servsync_guard_local_claim_home_assignment on public.contractor_local_customer_claim_invite_homes;
create trigger servsync_guard_local_claim_home_assignment
  before insert or update of contractor_id, local_contact_id, local_home_id
  on public.contractor_local_customer_claim_invite_homes
  for each row execute function public.servsync_private_guard_local_claim_assignment();

-- Visit events are derived from an existing Job. Keep scheduling available for
-- pre-archive work, but prevent direct browser writes from attaching a forged
-- local-customer label that does not match the referenced Job.
create or replace function public.servsync_private_guard_local_visit_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
begin
  if tg_op = 'UPDATE'
     and new.contractor_id is not distinct from old.contractor_id
     and new.inspection_id is not distinct from old.inspection_id
     and new.local_contact_id is not distinct from old.local_contact_id then
    return new;
  end if;

  select job.*
    into v_job
    from public.inspections job
   where job.id = new.inspection_id
     and job.contractor_id = new.contractor_id
   for share;

  if v_job.id is null
     or v_job.local_contact_id is distinct from new.local_contact_id then
    raise insufficient_privilege using message = 'Visit customer is unavailable.';
  end if;

  return new;
end;
$$;

alter function public.servsync_private_guard_local_visit_assignment() owner to postgres;
revoke all on function public.servsync_private_guard_local_visit_assignment() from public, anon, authenticated;

drop trigger if exists servsync_guard_local_visit_assignment on public.contractor_visit_events;
create trigger servsync_guard_local_visit_assignment
  before insert or update of contractor_id, inspection_id, local_contact_id on public.contractor_visit_events
  for each row execute function public.servsync_private_guard_local_visit_assignment();

-- Projects name the tenant column differently. Install this optional integration
-- only when the compatible foundation passed the transaction preflight.
do $project_integration$
begin
  if to_regclass('public.projects') is not null then
    execute $project_function$
      create or replace function public.servsync_private_guard_local_project_assignment()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if new.local_home_id is null then
          return new;
        end if;

        if tg_op = 'UPDATE'
           and new.original_creator_contractor_id is not distinct from old.original_creator_contractor_id
           and new.local_home_id is not distinct from old.local_home_id then
          return new;
        end if;

        perform public.servsync_private_assert_active_local_subject(
          new.original_creator_contractor_id,
          null,
          new.local_home_id
        );
        return new;
      end;
      $body$
    $project_function$;

    alter function public.servsync_private_guard_local_project_assignment() owner to postgres;
    revoke all on function public.servsync_private_guard_local_project_assignment() from public, anon, authenticated;

    execute 'drop trigger if exists servsync_guard_local_project_assignment on public.projects';
    execute $project_trigger$
      create trigger servsync_guard_local_project_assignment
        before insert or update of original_creator_contractor_id, local_home_id on public.projects
        for each row execute function public.servsync_private_guard_local_project_assignment()
    $project_trigger$;
  end if;
end;
$project_integration$;

-- Outputs derived from work that already existed at archive time remain
-- operable. A deferred check can see the durable launch/link row written later
-- in the same transaction, while forged standalone inserts have no approved
-- lineage and fail at commit.
create or replace function public.servsync_private_guard_local_output_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_contractor_id uuid := nullif(v_new->>'contractor_id', '')::uuid;
  v_local_contact_id uuid := nullif(v_new->>'local_contact_id', '')::uuid;
  v_local_home_id uuid := nullif(v_new->>'local_home_id', '')::uuid;
  v_row_id uuid := nullif(v_new->>'id', '')::uuid;
  v_job_id uuid := nullif(v_new->>'job_id', '')::uuid;
  v_estimate_id uuid := nullif(v_new->>'estimate_id', '')::uuid;
  v_archived_at timestamptz;
  v_has_draft boolean := public.servsync_private_customer_draft_foundation_available();
  v_has_lineage boolean := false;
begin
  if v_local_contact_id is null and v_local_home_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and v_new->>'contractor_id' is not distinct from v_old->>'contractor_id'
     and v_new->>'local_contact_id' is not distinct from v_old->>'local_contact_id'
     and v_new->>'local_home_id' is not distinct from v_old->>'local_home_id' then
    return new;
  end if;

  begin
    perform public.servsync_private_assert_active_local_subject(
      v_contractor_id,
      v_local_contact_id,
      v_local_home_id
    );
    return new;
  exception when insufficient_privilege then
    null;
  end;

  select case
           when contact.archived_at is null then home.archived_at
           when home.archived_at is null then contact.archived_at
           else least(contact.archived_at, home.archived_at)
         end
    into v_archived_at
    from public.contractor_local_contacts contact
    left join public.contractor_local_homes home
      on home.id = v_local_home_id
     and home.contractor_id = contact.contractor_id
     and home.local_contact_id = contact.id
   where contact.id = v_local_contact_id
     and contact.contractor_id = v_contractor_id;

  if v_archived_at is null then
    raise insufficient_privilege using message = 'Customer or property is unavailable.';
  end if;

  if tg_table_name = 'estimates' then
    if v_has_draft then
      execute $draft_estimate_lineage$
        select exists (
          select 1
            from public.contractor_work_draft_launches launch
            join public.contractor_work_drafts draft
              on draft.id = launch.draft_id
             and draft.contractor_id = launch.contractor_id
           where launch.contractor_id = $1
             and launch.launched_estimate_id = $2
             and launch.requested_output = 'estimate'
             and launch.status = 'succeeded'
             and draft.local_contact_id = $3
             and draft.local_home_id is not distinct from $4
             and draft.created_at <= $5
        )
      $draft_estimate_lineage$
        into v_has_lineage
        using v_contractor_id, v_row_id, v_local_contact_id, v_local_home_id, v_archived_at;
    end if;
  elsif tg_table_name = 'invoices' then
    select exists (
      select 1 from public.inspections job
       where job.id = v_job_id
         and job.contractor_id = v_contractor_id
         and job.local_contact_id = v_local_contact_id
         and job.local_home_id is not distinct from v_local_home_id
         and job.created_at <= v_archived_at
      union all
      select 1 from public.estimates estimate
       where estimate.id = v_estimate_id
         and estimate.contractor_id = v_contractor_id
         and estimate.local_contact_id = v_local_contact_id
         and estimate.local_home_id is not distinct from v_local_home_id
         and estimate.created_at <= v_archived_at
    ) into v_has_lineage;

    if not v_has_lineage and v_has_draft then
      execute $draft_invoice_lineage$
        select exists (
          select 1
            from public.contractor_work_draft_launches launch
            join public.contractor_work_drafts draft
              on draft.id = launch.draft_id
             and draft.contractor_id = launch.contractor_id
           where launch.contractor_id = $1
             and launch.launched_invoice_id = $2
             and launch.requested_output = 'invoice'
             and launch.status = 'succeeded'
             and draft.local_contact_id = $3
             and draft.local_home_id is not distinct from $4
             and draft.created_at <= $5
        )
      $draft_invoice_lineage$
        into v_has_lineage
        using v_contractor_id, v_row_id, v_local_contact_id, v_local_home_id, v_archived_at;
    end if;
  elsif tg_table_name = 'inspections' then
    select exists (
      select 1 from public.estimates estimate
       where estimate.id = v_estimate_id
         and estimate.contractor_id = v_contractor_id
         and estimate.local_contact_id = v_local_contact_id
         and estimate.local_home_id is not distinct from v_local_home_id
         and estimate.created_at <= v_archived_at
      union all
      select 1
        from public.contractor_calendar_event_job_links link
        join public.contractor_calendar_events event
          on event.id = link.calendar_event_id
         and event.contractor_id = link.contractor_id
       where link.contractor_id = v_contractor_id
         and link.inspection_id = v_row_id
         and event.local_contact_id = v_local_contact_id
         and v_local_home_id is null
         and event.created_at <= v_archived_at
    ) into v_has_lineage;

    if not v_has_lineage and v_has_draft then
      execute $draft_job_lineage$
        select exists (
          select 1
            from public.contractor_work_draft_launches launch
            join public.contractor_work_drafts draft
              on draft.id = launch.draft_id
             and draft.contractor_id = launch.contractor_id
           where launch.contractor_id = $1
             and launch.launched_job_id = $2
             and launch.requested_output = 'job'
             and launch.status = 'succeeded'
             and draft.local_contact_id = $3
             and draft.local_home_id is not distinct from $4
             and draft.created_at <= $5
        )
      $draft_job_lineage$
        into v_has_lineage
        using v_contractor_id, v_row_id, v_local_contact_id, v_local_home_id, v_archived_at;
    end if;
  end if;

  if not coalesce(v_has_lineage, false) then
    raise insufficient_privilege using message = 'Customer or property is unavailable.';
  end if;
  return new;
end;
$$;

alter function public.servsync_private_guard_local_output_assignment() owner to postgres;
revoke all on function public.servsync_private_guard_local_output_assignment() from public, anon, authenticated;

drop trigger if exists servsync_guard_local_job_assignment on public.inspections;
create constraint trigger servsync_guard_local_job_assignment
  after insert or update on public.inspections
  deferrable initially deferred
  for each row execute function public.servsync_private_guard_local_output_assignment();

drop trigger if exists servsync_guard_local_estimate_assignment on public.estimates;
create constraint trigger servsync_guard_local_estimate_assignment
  after insert or update on public.estimates
  deferrable initially deferred
  for each row execute function public.servsync_private_guard_local_output_assignment();

drop trigger if exists servsync_guard_local_invoice_assignment on public.invoices;
create constraint trigger servsync_guard_local_invoice_assignment
  after insert or update on public.invoices
  deferrable initially deferred
  for each row execute function public.servsync_private_guard_local_output_assignment();

create or replace function public.servsync_get_local_customer_archive_impact(
  p_local_contact_id uuid,
  p_local_home_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_contact_exists boolean := false;
  v_home_exists boolean := false;
  v_draft_count bigint := 0;
  v_project_count bigint := 0;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;

  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  select exists (
    select 1 from public.contractor_local_contacts contact
     where contact.id = p_local_contact_id
       and contact.contractor_id = v_contractor_id
       and contact.homeowner_user_id is null
       and contact.claimed_at is null
  ) into v_contact_exists;

  if not v_contact_exists then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  if p_local_home_id is not null then
    select exists (
      select 1 from public.contractor_local_homes home
       where home.id = p_local_home_id
         and home.contractor_id = v_contractor_id
         and home.local_contact_id = p_local_contact_id
         and home.home_id is null
         and home.claimed_at is null
    ) into v_home_exists;
    if not v_home_exists then
      raise insufficient_privilege using message = 'Local customer is unavailable.';
    end if;
  end if;

  if to_regclass('public.projects') is not null then
    execute $project_count$
      select count(*)
        from public.projects project
        join public.contractor_local_homes home on home.id = project.local_home_id
       where project.original_creator_contractor_id = $1
         and home.local_contact_id = $2
         and ($3 is null or home.id = $3)
         and project.status in ('active', 'paused')
    $project_count$
      into v_project_count
      using v_contractor_id, p_local_contact_id, p_local_home_id;
  end if;

  if public.servsync_private_customer_draft_foundation_available() then
    execute $draft_count$
      select count(*)
        from public.contractor_work_drafts draft
       where draft.contractor_id = $1
         and draft.local_contact_id = $2
         and ($3 is null or draft.local_home_id = $3)
         and draft.status = 'active'
    $draft_count$
      into v_draft_count
      using v_contractor_id, p_local_contact_id, p_local_home_id;
  end if;

  return jsonb_build_object(
    'draft_count', v_draft_count,
    'job_count', (
      select count(*) from public.inspections job
       where job.contractor_id = v_contractor_id
         and job.local_contact_id = p_local_contact_id
         and (p_local_home_id is null or job.local_home_id = p_local_home_id)
         and coalesce(job.job_type, '') <> 'inspection'
         and coalesce(job.job_status, 'draft') not in ('closed', 'cancelled')
    ),
    'inspection_count', (
      select count(*) from public.inspections inspection
       where inspection.contractor_id = v_contractor_id
         and inspection.local_contact_id = p_local_contact_id
         and (p_local_home_id is null or inspection.local_home_id = p_local_home_id)
         and coalesce(inspection.job_type, '') = 'inspection'
         and coalesce(inspection.job_status, 'draft') not in ('closed', 'cancelled')
    ),
    'estimate_count', (
      select count(*) from public.estimates estimate
       where estimate.contractor_id = v_contractor_id
         and estimate.local_contact_id = p_local_contact_id
         and (p_local_home_id is null or estimate.local_home_id = p_local_home_id)
    ),
    'unpaid_invoice_count', (
      select count(*) from public.invoices invoice
       where invoice.contractor_id = v_contractor_id
         and invoice.local_contact_id = p_local_contact_id
         and (p_local_home_id is null or invoice.local_home_id = p_local_home_id)
         and coalesce(invoice.status, 'draft') not in ('paid', 'void')
    ),
    'future_calendar_count', (
      select count(*) from public.contractor_calendar_events event
       where event.contractor_id = v_contractor_id
         and event.local_contact_id = p_local_contact_id
         and event.starts_at >= now()
         and p_local_home_id is null
    ),
    'project_count', v_project_count,
    'pending_invitation_count', (
      select count(distinct invite.id)
        from public.contractor_local_customer_claim_invites invite
        left join public.contractor_local_customer_claim_invite_homes member
          on member.claim_invite_id = invite.id
       where invite.contractor_id = v_contractor_id
         and invite.local_contact_id = p_local_contact_id
         and invite.status = 'pending'
         and (p_local_home_id is null or member.local_home_id = p_local_home_id)
    )
  );
end;
$$;

create or replace function public.servsync_archive_local_customer(p_local_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_contact public.contractor_local_contacts;
  v_has_mapped_home boolean := false;
  v_revoked_count integer := 0;
  v_archived_at timestamptz := now();
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;

  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  select contact.* into v_contact
    from public.contractor_local_contacts contact
   where contact.id = p_local_contact_id
     and contact.contractor_id = v_contractor_id
   for update;

  if v_contact.id is null then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  perform 1 from public.contractor_local_homes home
   where home.contractor_id = v_contractor_id
     and home.local_contact_id = v_contact.id
   order by home.id
   for update;

  select exists (
    select 1 from public.contractor_local_homes home
     where home.contractor_id = v_contractor_id
       and home.local_contact_id = v_contact.id
       and (home.home_id is not null or home.claimed_at is not null)
  ) into v_has_mapped_home;

  if v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_has_mapped_home then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  if v_contact.archived_at is null then
    update public.contractor_local_contacts
       set archived_at = v_archived_at,
           archived_by = auth.uid(),
           updated_at = now()
     where id = v_contact.id and contractor_id = v_contractor_id;

    update public.contractor_local_customer_claim_invites
       set status = 'revoked',
           revoked_at = coalesce(revoked_at, v_archived_at),
           updated_at = now()
     where contractor_id = v_contractor_id
       and local_contact_id = v_contact.id
       and status = 'pending';
    get diagnostics v_revoked_count = row_count;

    insert into public.contractor_local_customer_lifecycle_events (
      contractor_id, local_contact_id, action, actor_user_id,
      metadata
    ) values (
      v_contractor_id, v_contact.id, 'customer_archived', auth.uid(),
      jsonb_build_object('revoked_pending_invitation_count', v_revoked_count)
    );
  end if;

  return jsonb_build_object(
    'local_contact_id', v_contact.id,
    'archived_at', coalesce(v_contact.archived_at, v_archived_at),
    'revoked_pending_invitation_count', v_revoked_count
  );
end;
$$;

create or replace function public.servsync_restore_local_customer(p_local_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_contact public.contractor_local_contacts;
  v_has_mapped_home boolean := false;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;

  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  select contact.* into v_contact
    from public.contractor_local_contacts contact
   where contact.id = p_local_contact_id
     and contact.contractor_id = v_contractor_id
   for update;

  if v_contact.id is null then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  perform 1 from public.contractor_local_homes home
   where home.contractor_id = v_contractor_id
     and home.local_contact_id = v_contact.id
   order by home.id
   for update;

  select exists (
    select 1 from public.contractor_local_homes home
     where home.contractor_id = v_contractor_id
       and home.local_contact_id = v_contact.id
       and (home.home_id is not null or home.claimed_at is not null)
  ) into v_has_mapped_home;

  if v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_has_mapped_home then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  if v_contact.archived_at is not null then
    update public.contractor_local_contacts
       set archived_at = null,
           archived_by = null,
           updated_at = now()
     where id = v_contact.id and contractor_id = v_contractor_id;

    insert into public.contractor_local_customer_lifecycle_events (
      contractor_id, local_contact_id, action, actor_user_id
    ) values (
      v_contractor_id, v_contact.id, 'customer_restored', auth.uid()
    );
  end if;

  return jsonb_build_object('local_contact_id', v_contact.id, 'archived_at', null);
end;
$$;

create or replace function public.servsync_archive_local_property(p_local_home_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_archived_at timestamptz := now();
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;
  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Local property is unavailable.';
  end if;

  select contact.* into v_contact
    from public.contractor_local_contacts contact
    join public.contractor_local_homes home
      on home.local_contact_id = contact.id and home.contractor_id = contact.contractor_id
   where home.id = p_local_home_id and contact.contractor_id = v_contractor_id
   for update of contact;

  if v_contact.id is null then
    raise insufficient_privilege using message = 'Local property is unavailable.';
  end if;

  select home.* into v_home
    from public.contractor_local_homes home
   where home.id = p_local_home_id
     and home.contractor_id = v_contractor_id
     and home.local_contact_id = v_contact.id
   for update;

  if v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null
     or v_home.id is null or v_home.home_id is not null or v_home.claimed_at is not null then
    raise insufficient_privilege using message = 'Local property is unavailable.';
  end if;

  if v_home.archived_at is null then
    update public.contractor_local_homes
       set archived_at = v_archived_at, archived_by = auth.uid(), updated_at = now()
     where id = v_home.id and contractor_id = v_contractor_id;
    insert into public.contractor_local_customer_lifecycle_events (
      contractor_id, local_contact_id, local_home_id, action, actor_user_id
    ) values (
      v_contractor_id, v_contact.id, v_home.id, 'property_archived', auth.uid()
    );
  end if;

  return jsonb_build_object(
    'local_contact_id', v_contact.id,
    'local_home_id', v_home.id,
    'archived_at', coalesce(v_home.archived_at, v_archived_at)
  );
end;
$$;

create or replace function public.servsync_restore_local_property(p_local_home_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;
  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Local property is unavailable.';
  end if;

  select contact.* into v_contact
    from public.contractor_local_contacts contact
    join public.contractor_local_homes home
      on home.local_contact_id = contact.id and home.contractor_id = contact.contractor_id
   where home.id = p_local_home_id and contact.contractor_id = v_contractor_id
   for update of contact;

  if v_contact.id is null or v_contact.archived_at is not null then
    raise insufficient_privilege using message = 'Local property is unavailable.';
  end if;

  select home.* into v_home
    from public.contractor_local_homes home
   where home.id = p_local_home_id
     and home.contractor_id = v_contractor_id
     and home.local_contact_id = v_contact.id
   for update;

  if v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null
     or v_home.id is null or v_home.home_id is not null or v_home.claimed_at is not null then
    raise insufficient_privilege using message = 'Local property is unavailable.';
  end if;

  if v_home.archived_at is not null then
    update public.contractor_local_homes
       set archived_at = null, archived_by = null, updated_at = now()
     where id = v_home.id and contractor_id = v_contractor_id;
    insert into public.contractor_local_customer_lifecycle_events (
      contractor_id, local_contact_id, local_home_id, action, actor_user_id
    ) values (
      v_contractor_id, v_contact.id, v_home.id, 'property_restored', auth.uid()
    );
  end if;

  return jsonb_build_object(
    'local_contact_id', v_contact.id,
    'local_home_id', v_home.id,
    'archived_at', null
  );
end;
$$;

create or replace function public.servsync_list_archived_local_customers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_result jsonb;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;
  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Archived customers are unavailable.';
  end if;

  select coalesce(jsonb_agg(row_payload order by sort_archived desc, sort_name, contact_id), '[]'::jsonb)
    into v_result
    from (
      select
        contact.id contact_id,
        lower(contact.display_name) sort_name,
        coalesce(contact.archived_at, max(home.archived_at)) sort_archived,
        jsonb_build_object(
          'id', contact.id,
          'display_name', contact.display_name,
          'archived_at', contact.archived_at,
          'homes', coalesce(jsonb_agg(
            jsonb_build_object(
              'id', home.id,
              'nickname', home.nickname,
              'address_line1', home.address_line1,
              'address_line2', home.address_line2,
              'city', home.city,
              'state', home.state,
              'zip_code', home.zip_code,
              'archived_at', home.archived_at
            ) order by home.created_at, home.id
          ) filter (where home.id is not null and (contact.archived_at is not null or home.archived_at is not null)), '[]'::jsonb)
        ) row_payload
      from public.contractor_local_contacts contact
      left join public.contractor_local_homes home
        on home.contractor_id = contact.contractor_id
       and home.local_contact_id = contact.id
       and home.home_id is null
       and home.claimed_at is null
     where contact.contractor_id = v_contractor_id
       and contact.homeowner_user_id is null
       and contact.claimed_at is null
       and (contact.archived_at is not null or home.archived_at is not null)
       and not exists (
         select 1 from public.contractor_local_homes mapped
          where mapped.contractor_id = contact.contractor_id
            and mapped.local_contact_id = contact.id
            and (mapped.home_id is not null or mapped.claimed_at is not null)
       )
     group by contact.id, contact.display_name, contact.archived_at
    ) rows;
  return v_result;
end;
$$;

create or replace function public.servsync_list_local_customer_historical_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_result jsonb;
  v_draft_work jsonb := '[]'::jsonb;
  v_project_work jsonb := '[]'::jsonb;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;
  if v_contractor_id is null or v_access_role not in ('owner', 'admin', 'office', 'field_tech', 'viewer') then
    raise insufficient_privilege using message = 'Customer history is unavailable.';
  end if;

  if to_regclass('public.projects') is not null then
    execute $project_history$
      select coalesce(jsonb_agg(jsonb_build_object(
        'local_contact_id', home.local_contact_id,
        'local_home_id', project.local_home_id
      )), '[]'::jsonb)
        from public.projects project
        join public.contractor_local_homes home
          on home.id = project.local_home_id
         and home.contractor_id = project.original_creator_contractor_id
       where project.original_creator_contractor_id = $1
         and project.local_home_id is not null
    $project_history$
      into v_project_work
      using v_contractor_id;
  end if;

  if public.servsync_private_customer_draft_foundation_available() then
    execute $draft_history$
      select coalesce(jsonb_agg(jsonb_build_object(
        'local_contact_id', draft.local_contact_id,
        'local_home_id', draft.local_home_id
      )), '[]'::jsonb)
        from public.contractor_work_drafts draft
       where draft.contractor_id = $1
         and draft.local_contact_id is not null
    $draft_history$
      into v_draft_work
      using v_contractor_id;
  end if;

  with work_contacts as (
    select draft_work.local_contact_id, draft_work.local_home_id
      from jsonb_to_recordset(v_draft_work) as draft_work(local_contact_id uuid, local_home_id uuid)
    union
    select job.local_contact_id, job.local_home_id from public.inspections job
     where job.contractor_id = v_contractor_id and job.local_contact_id is not null
    union
    select estimate.local_contact_id, estimate.local_home_id from public.estimates estimate
     where estimate.contractor_id = v_contractor_id and estimate.local_contact_id is not null
    union
    select invoice.local_contact_id, invoice.local_home_id from public.invoices invoice
     where invoice.contractor_id = v_contractor_id and invoice.local_contact_id is not null
    union
    select event.local_contact_id, null::uuid from public.contractor_calendar_events event
     where event.contractor_id = v_contractor_id and event.local_contact_id is not null
    union
    select project_work.local_contact_id, project_work.local_home_id
      from jsonb_to_recordset(v_project_work) as project_work(local_contact_id uuid, local_home_id uuid)
  ), visible_contacts as (
    select distinct contact.*
      from public.contractor_local_contacts contact
      join work_contacts work on work.local_contact_id = contact.id
     where contact.contractor_id = v_contractor_id
       and (contact.archived_at is not null or exists (
         select 1 from public.contractor_local_homes archived_home
          where archived_home.contractor_id = contact.contractor_id
            and archived_home.local_contact_id = contact.id
            and archived_home.archived_at is not null
       ))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', contact.id,
    'display_name', contact.display_name,
    'archived_at', contact.archived_at,
    'homes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', home.id,
        'nickname', home.nickname,
        'address_line1', home.address_line1,
        'address_line2', home.address_line2,
        'city', home.city,
        'state', home.state,
        'zip_code', home.zip_code,
        'archived_at', home.archived_at
      ) order by home.created_at, home.id)
        from public.contractor_local_homes home
       where home.contractor_id = contact.contractor_id
         and home.local_contact_id = contact.id
         and exists (
           select 1 from work_contacts work
            where work.local_contact_id = contact.id
              and work.local_home_id = home.id
         )
    ), '[]'::jsonb)
  ) order by lower(contact.display_name), contact.id), '[]'::jsonb)
    into v_result
    from visible_contacts contact;
  return v_result;
end;
$$;

-- Keep ordinary directory results active-only. Historical labels and manager
-- archive browsing use their separate controlled boundaries above.
create or replace function public.servsync_list_local_customer_summaries()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_result jsonb;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;
  if v_contractor_id is null or v_access_role not in ('owner', 'admin', 'office', 'field_tech', 'viewer') then
    raise insufficient_privilege using message = 'Customer directory is unavailable.';
  end if;

  with visible_contacts as (
    select contact.* from public.contractor_local_contacts contact
     where contact.contractor_id = v_contractor_id
       and contact.archived_at is null
       and contact.homeowner_user_id is null
       and contact.claimed_at is null
       and not exists (
         select 1 from public.contractor_local_homes claimed_home
          where claimed_home.contractor_id = contact.contractor_id
            and claimed_home.local_contact_id = contact.id
            and (claimed_home.home_id is not null or claimed_home.claimed_at is not null)
       )
       and (
         v_access_role <> 'viewer'
         or public.servsync_private_local_customer_has_readable_work(v_contractor_id, contact.id, null)
       )
  )
  select coalesce(jsonb_agg(rows.customer_payload order by rows.sort_name, rows.contact_id), '[]'::jsonb)
    into v_result
    from (
      select lower(contact.display_name) sort_name, contact.id contact_id,
        jsonb_build_object(
          'id', contact.id,
          'display_name', contact.display_name,
          'archived_at', null,
          'homes', coalesce(home_rows.homes, '[]'::jsonb)
        ) customer_payload
      from visible_contacts contact
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'id', home.id, 'nickname', home.nickname,
          'address_line1', home.address_line1, 'address_line2', home.address_line2,
          'city', home.city, 'state', home.state, 'zip_code', home.zip_code,
          'archived_at', null
        ) order by home.created_at, home.id) homes
        from public.contractor_local_homes home
        where home.contractor_id = contact.contractor_id
          and home.local_contact_id = contact.id
          and home.archived_at is null
          and home.home_id is null
          and home.claimed_at is null
          and (
            v_access_role <> 'viewer'
            or public.servsync_private_local_customer_has_readable_work(v_contractor_id, contact.id, home.id)
          )
      ) home_rows on true
    ) rows;
  return v_result;
end;
$$;

create or replace function public.servsync_get_local_customer_management_detail(p_local_contact_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_result jsonb;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;
  if v_contractor_id is null or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  select jsonb_build_object(
    'id', contact.id, 'contractor_id', contact.contractor_id,
    'homeowner_user_id', contact.homeowner_user_id,
    'display_name', contact.display_name, 'phone', contact.phone,
    'email', contact.email, 'notes', contact.notes,
    'claimed_at', contact.claimed_at, 'archived_at', contact.archived_at,
    'created_at', contact.created_at, 'updated_at', contact.updated_at,
    'homes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', home.id, 'contractor_id', home.contractor_id,
        'local_contact_id', home.local_contact_id, 'home_id', home.home_id,
        'claimed_at', home.claimed_at, 'archived_at', home.archived_at,
        'nickname', home.nickname, 'address_line1', home.address_line1,
        'address_line2', home.address_line2, 'city', home.city,
        'state', home.state, 'zip_code', home.zip_code,
        'home_type', home.home_type, 'year_built', home.year_built,
        'square_feet', home.square_feet, 'notes', home.notes,
        'created_at', home.created_at, 'updated_at', home.updated_at
      ) order by home.created_at, home.id)
      from public.contractor_local_homes home
      where home.contractor_id = contact.contractor_id
        and home.local_contact_id = contact.id
        and home.home_id is null and home.claimed_at is null
    ), '[]'::jsonb)
  ) into v_result
  from public.contractor_local_contacts contact
  where contact.id = p_local_contact_id
    and contact.contractor_id = v_contractor_id
    and contact.homeowner_user_id is null
    and contact.claimed_at is null
    and not exists (
      select 1 from public.contractor_local_homes claimed_home
       where claimed_home.contractor_id = contact.contractor_id
         and claimed_home.local_contact_id = contact.id
         and (claimed_home.home_id is not null or claimed_home.claimed_at is not null)
    );

  if v_result is null then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;
  return v_result;
end;
$$;

alter function public.servsync_get_local_customer_archive_impact(uuid, uuid) owner to postgres;
alter function public.servsync_archive_local_customer(uuid) owner to postgres;
alter function public.servsync_restore_local_customer(uuid) owner to postgres;
alter function public.servsync_archive_local_property(uuid) owner to postgres;
alter function public.servsync_restore_local_property(uuid) owner to postgres;
alter function public.servsync_list_archived_local_customers() owner to postgres;
alter function public.servsync_list_local_customer_historical_context() owner to postgres;
alter function public.servsync_list_local_customer_summaries() owner to postgres;
alter function public.servsync_get_local_customer_management_detail(uuid) owner to postgres;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.servsync_get_local_customer_archive_impact(uuid,uuid)',
    'public.servsync_archive_local_customer(uuid)',
    'public.servsync_restore_local_customer(uuid)',
    'public.servsync_archive_local_property(uuid)',
    'public.servsync_restore_local_property(uuid)',
    'public.servsync_list_archived_local_customers()',
    'public.servsync_list_local_customer_historical_context()',
    'public.servsync_list_local_customer_summaries()',
    'public.servsync_get_local_customer_management_detail(uuid)'
  ] loop
    execute format('revoke all on function %s from public', signature);
    execute format('revoke all on function %s from anon', signature);
    execute format('revoke all on function %s from authenticated', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;

comment on function public.servsync_get_local_customer_archive_impact(uuid, uuid) is
  'Returns non-mutating manager-only operational counts before archiving a contractor-local customer or property.';
comment on function public.servsync_archive_local_customer(uuid) is
  'Archives one unclaimed contractor-local customer and transactionally revokes its pending claim invitations.';
comment on function public.servsync_restore_local_customer(uuid) is
  'Restores one unclaimed contractor-local customer without restoring independently archived properties or invitations.';
comment on function public.servsync_archive_local_property(uuid) is
  'Archives one unclaimed contractor-local property independently of its parent customer.';
comment on function public.servsync_restore_local_property(uuid) is
  'Restores one unclaimed contractor-local property only while its parent customer is active.';
comment on function public.servsync_list_archived_local_customers() is
  'Lists archived local customers and independently archived properties for owner/admin/office management.';
comment on function public.servsync_list_local_customer_historical_context() is
  'Returns redacted work-linked archived local-customer labels without contact, note, claim, invitation, token, or lifecycle-actor data.';

notify pgrst, 'reload schema';

commit;
