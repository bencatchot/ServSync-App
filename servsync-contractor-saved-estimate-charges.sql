-- ServSync contractor saved estimate charges and estimate template access hardening.
-- Paste this into Supabase SQL Editor after servsync-estimate-templates.sql.
-- This prepares contractor-owned reusable estimate charges for a future UI without
-- changing estimate creation behavior or historical estimates.

begin;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_can_manage_contractor_estimate_settings(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.contractor_profiles cp
     where cp.id = p_contractor_id
       and cp.owner_user_id = auth.uid()
  )
  or exists (
    select 1
      from public.contractor_team_members tm
     where tm.contractor_id = p_contractor_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
       and tm.role in ('admin', 'office')
  )
  or public.current_user_is_platform_admin();
$$;

revoke all on function public.current_user_can_manage_contractor_estimate_settings(uuid)
  from public, anon, authenticated;
grant execute on function public.current_user_can_manage_contractor_estimate_settings(uuid)
  to authenticated;

create table if not exists public.contractor_saved_estimate_charges (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  line_type text not null default 'labor'
    check (line_type in ('labor', 'material', 'equipment', 'fee', 'other')),
  charge_type text not null default 'flat'
    check (charge_type in ('flat', 'hourly')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  default_quantity numeric(12,2) not null default 1 check (default_quantity > 0),
  unit text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_saved_estimate_charges_name_not_blank
    check (length(trim(name)) > 0)
);

create index if not exists contractor_saved_estimate_charges_contractor_idx
  on public.contractor_saved_estimate_charges(contractor_id);

create index if not exists contractor_saved_estimate_charges_active_idx
  on public.contractor_saved_estimate_charges(contractor_id, active);

create index if not exists contractor_saved_estimate_charges_sort_idx
  on public.contractor_saved_estimate_charges(contractor_id, sort_order);

drop trigger if exists contractor_saved_estimate_charges_touch_updated_at
  on public.contractor_saved_estimate_charges;
create trigger contractor_saved_estimate_charges_touch_updated_at
  before update on public.contractor_saved_estimate_charges
  for each row execute function public.touch_updated_at();

alter table public.contractor_saved_estimate_charges enable row level security;

drop policy if exists "Saved estimate charges: contractor account reads"
  on public.contractor_saved_estimate_charges;
drop policy if exists "Saved estimate charges: estimate settings managers create"
  on public.contractor_saved_estimate_charges;
drop policy if exists "Saved estimate charges: estimate settings managers update"
  on public.contractor_saved_estimate_charges;
drop policy if exists "Saved estimate charges: estimate settings managers delete"
  on public.contractor_saved_estimate_charges;

create policy "Saved estimate charges: contractor account reads"
  on public.contractor_saved_estimate_charges for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

create policy "Saved estimate charges: estimate settings managers create"
  on public.contractor_saved_estimate_charges for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

create policy "Saved estimate charges: estimate settings managers update"
  on public.contractor_saved_estimate_charges for update to authenticated
  using (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  )
  with check (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

create policy "Saved estimate charges: estimate settings managers delete"
  on public.contractor_saved_estimate_charges for delete to authenticated
  using (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

revoke all privileges on table public.contractor_saved_estimate_charges from public;
revoke all privileges on table public.contractor_saved_estimate_charges from anon;
revoke all privileges on table public.contractor_saved_estimate_charges from authenticated;

grant select on table public.contractor_saved_estimate_charges to authenticated;
grant insert (
  contractor_id,
  name,
  description,
  line_type,
  charge_type,
  amount_cents,
  default_quantity,
  unit,
  active,
  sort_order
) on table public.contractor_saved_estimate_charges to authenticated;
grant update (
  name,
  description,
  line_type,
  charge_type,
  amount_cents,
  default_quantity,
  unit,
  active,
  sort_order
) on table public.contractor_saved_estimate_charges to authenticated;
grant delete on table public.contractor_saved_estimate_charges to authenticated;

-- Harden existing estimate templates so contractor teams can read templates while
-- only owner/admin/office estimate-settings managers can change them.
alter table public.estimate_templates enable row level security;

drop policy if exists "Estimate templates: contractor manages own" on public.estimate_templates;
drop policy if exists "Estimate templates: contractor account reads" on public.estimate_templates;
drop policy if exists "Estimate templates: estimate settings managers create" on public.estimate_templates;
drop policy if exists "Estimate templates: estimate settings managers update" on public.estimate_templates;
drop policy if exists "Estimate templates: estimate settings managers delete" on public.estimate_templates;

create policy "Estimate templates: contractor account reads"
  on public.estimate_templates for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

create policy "Estimate templates: estimate settings managers create"
  on public.estimate_templates for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

create policy "Estimate templates: estimate settings managers update"
  on public.estimate_templates for update to authenticated
  using (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  )
  with check (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

create policy "Estimate templates: estimate settings managers delete"
  on public.estimate_templates for delete to authenticated
  using (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

revoke all privileges on table public.estimate_templates from public;
revoke all privileges on table public.estimate_templates from anon;
revoke all privileges on table public.estimate_templates from authenticated;

grant select on table public.estimate_templates to authenticated;
grant insert (
  contractor_id,
  name,
  trade,
  scope,
  notes,
  terms,
  line_items
) on table public.estimate_templates to authenticated;
grant update (
  name,
  trade,
  scope,
  notes,
  terms,
  line_items
) on table public.estimate_templates to authenticated;
grant delete on table public.estimate_templates to authenticated;

notify pgrst, 'reload schema';

commit;
