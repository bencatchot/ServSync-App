-- ServSync home-specific inspection templates provenance cleanup.
--
-- Extends inspection_templates for contractor and home-scoped templates used by
-- the current field-work UI. This patch tracks the sandbox-proven schema/RLS
-- shape so fresh environments are not missing fields the app already reads and
-- writes.

begin;

alter table public.inspection_templates
  add column if not exists scope text not null default 'contractor',
  add column if not exists homeowner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists home_id uuid references public.homes(id) on delete set null,
  add column if not exists local_contact_id uuid references public.contractor_local_contacts(id) on delete set null,
  add column if not exists local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  add column if not exists source_inspection_id uuid references public.inspections(id) on delete set null,
  add column if not exists is_default_for_home boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.inspection_templates
   set scope = 'contractor'
 where scope is null
    or trim(scope) = '';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'inspection_templates_scope_check'
       and conrelid = 'public.inspection_templates'::regclass
  ) then
    alter table public.inspection_templates
      add constraint inspection_templates_scope_check
      check (scope in ('contractor', 'home'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'inspection_templates_home_scope_target_check'
       and conrelid = 'public.inspection_templates'::regclass
  ) then
    alter table public.inspection_templates
      add constraint inspection_templates_home_scope_target_check
      check (
        scope = 'contractor'
        or (
          scope = 'home'
          and (
            homeowner_user_id is not null
            or home_id is not null
            or local_contact_id is not null
            or local_home_id is not null
          )
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'inspection_templates_default_home_scope_check'
       and conrelid = 'public.inspection_templates'::regclass
  ) then
    alter table public.inspection_templates
      add constraint inspection_templates_default_home_scope_check
      check (is_default_for_home = false or scope = 'home');
  end if;
end
$$;

create index if not exists inspection_templates_contractor_scope_idx
  on public.inspection_templates(contractor_id, scope, created_at desc)
  where archived_at is null;

create index if not exists inspection_templates_homeowner_home_idx
  on public.inspection_templates(contractor_id, homeowner_user_id, home_id, created_at desc)
  where archived_at is null
    and scope = 'home';

create index if not exists inspection_templates_local_home_idx
  on public.inspection_templates(contractor_id, local_contact_id, local_home_id, created_at desc)
  where archived_at is null
    and scope = 'home';

create index if not exists inspection_templates_archived_idx
  on public.inspection_templates(contractor_id, archived_at);

create index if not exists inspection_templates_source_inspection_idx
  on public.inspection_templates(source_inspection_id)
  where source_inspection_id is not null;

drop trigger if exists inspection_templates_touch_updated_at on public.inspection_templates;
create trigger inspection_templates_touch_updated_at
  before update on public.inspection_templates
  for each row execute function public.touch_updated_at();

alter table public.inspection_templates enable row level security;

drop policy if exists "tpl_select_own" on public.inspection_templates;
drop policy if exists "tpl_insert_own" on public.inspection_templates;
drop policy if exists "tpl_delete_own" on public.inspection_templates;
drop policy if exists "Inspection templates: contractor team reads" on public.inspection_templates;
drop policy if exists "Inspection templates: contractor team creates" on public.inspection_templates;
drop policy if exists "Inspection templates: contractor team updates" on public.inspection_templates;
drop policy if exists "Inspection templates: contractor team deletes" on public.inspection_templates;

create policy "Inspection templates: contractor team reads"
  on public.inspection_templates for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

create policy "Inspection templates: contractor team creates"
  on public.inspection_templates for insert to authenticated
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
    and scope in ('contractor', 'home')
  );

create policy "Inspection templates: contractor team updates"
  on public.inspection_templates for update to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
    and scope in ('contractor', 'home')
  )
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
    and scope in ('contractor', 'home')
  );

create policy "Inspection templates: contractor team deletes"
  on public.inspection_templates for delete to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
    and scope in ('contractor', 'home')
  );

grant select, insert, update, delete on public.inspection_templates to authenticated;

notify pgrst, 'reload schema';

commit;
