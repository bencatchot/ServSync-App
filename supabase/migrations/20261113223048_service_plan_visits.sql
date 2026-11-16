-- Service Plan visit tracking. Additive, local validation first; no hosted rollout.
-- Plan snapshots, Jobs, appointments, reports and delivery remain authoritative.
begin;

create table public.service_plan_visits (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.service_agreements(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  due_on date,
  job_id uuid unique references public.inspections(id) on delete restrict,
  shared_with_homeowner boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agreement_id, ordinal)
);
alter table public.service_plan_visits enable row level security;
revoke all on public.service_plan_visits from public, anon, authenticated;
create table public.service_plan_visit_changes (
  id bigint generated always as identity primary key,
  visit_id uuid not null references public.service_plan_visits(id) on delete restrict,
  actor_id uuid not null,
  before_state jsonb not null,
  after_state jsonb not null,
  corrected_completed_link boolean not null default false,
  changed_at timestamptz not null default now()
);
alter table public.service_plan_visit_changes enable row level security;
revoke all on public.service_plan_visit_changes from public, anon, authenticated;
-- Access is through projections below; field technicians cannot read plan metadata.

create function public.servsync_plan_visit_connection_shared(p_agreement_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_agreements a
    join public.homeowner_contractor_connections c on c.id = a.connection_id
    join public.connection_shared_properties s on s.connection_id = c.id and s.home_id = a.home_id
    join public.homes h on h.id = a.home_id and h.homeowner_user_id = a.homeowner_user_id
    where a.id = p_agreement_id and c.status = 'active'
      and c.contractor_id = a.contractor_id and c.homeowner_user_id = a.homeowner_user_id
  );
$$;
revoke all on function public.servsync_plan_visit_connection_shared(uuid) from public, anon, authenticated;

create function public.servsync_get_plan_visits(p_agreement_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.service_agreements; manager boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to view visits.' using errcode = '42501'; end if;
  select * into a from public.service_agreements where id = p_agreement_id;
  manager := public.current_user_can_manage_service_agreements(a.contractor_id);
  if a.id is null or not (coalesce(manager,false) or
    (a.homeowner_user_id = auth.uid() and public.servsync_plan_visit_connection_shared(a.id))) then
    raise exception 'Plan visits are not available to this account.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', v.id, 'agreement_id', v.agreement_id, 'ordinal', v.ordinal, 'due_on', v.due_on,
    'job_id', case when manager then v.job_id else null end,
    'job_name', case when manager then j.name else null end,
    'job_status', coalesce(j.job_status, case when j.status = 'finalized' then 'completed' end),
    'report_ready', case when manager then j.status = 'finalized' else null end,
    'shared_with_homeowner', v.shared_with_homeowner, 'version', v.version
  ) order by v.ordinal)
  from public.service_plan_visits v
  left join public.inspections j on j.id = v.job_id
  where v.agreement_id = a.id and (manager or v.shared_with_homeowner)), '[]'::jsonb);
end;
$$;
revoke all on function public.servsync_get_plan_visits(uuid) from public, anon;
grant execute on function public.servsync_get_plan_visits(uuid) to authenticated;

create function public.servsync_setup_plan_visits(p_agreement_id uuid, p_action_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.service_agreements; n integer;
begin
  if auth.uid() is null then raise exception 'Sign in to set up visits.' using errcode = '42501'; end if;
  select * into a from public.service_agreements where id = p_agreement_id for update;
  if a.id is null or not public.current_user_can_manage_service_agreements(a.contractor_id) then
    raise exception 'You cannot manage this plan.' using errcode = '42501';
  end if;
  if a.status <> 'active' or not public.servsync_plan_visit_connection_shared(a.id) then
    raise exception 'An active plan and currently shared property are required.';
  end if;
  if not public.current_user_has_contractor_entitlement(a.contractor_id, 'can_create_jobs') then
    raise exception 'This contractor account is read-only for visit setup.' using errcode = '42501';
  end if;
  if a.included_visit_count is not null then
    if a.included_visit_count > 1000 then raise exception 'This plan needs a visit setup review.'; end if;
    insert into public.service_plan_visits(agreement_id, ordinal)
      select a.id, s from generate_series(1, a.included_visit_count) s
      on conflict (agreement_id, ordinal) do nothing;
  else
    -- No allowance is invented. Each explicit action adds one tracked visit.
    if p_action_id is null then raise exception 'A visit action identity is required.'; end if;
    if exists(select 1 from public.service_plan_visits where id = p_action_id and agreement_id = a.id) then return; end if;
    select coalesce(max(ordinal),0) + 1 into n from public.service_plan_visits where agreement_id = a.id;
    insert into public.service_plan_visits(id, agreement_id, ordinal) values (p_action_id, a.id, n);
  end if;
end;
$$;
revoke all on function public.servsync_setup_plan_visits(uuid, uuid) from public, anon;
grant execute on function public.servsync_setup_plan_visits(uuid, uuid) to authenticated;

create function public.servsync_update_plan_visit(
  p_visit_id uuid, p_expected_version integer, p_due_on date, p_job_id uuid, p_shared boolean,
  p_confirm_correction boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.service_agreements; v public.service_plan_visits; updated public.service_plan_visits;
  j public.inspections; old_status text; unshare_only boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to update visits.' using errcode = '42501'; end if;
  select * into v from public.service_plan_visits where id = p_visit_id for update;
  select * into a from public.service_agreements where id = v.agreement_id;
  if a.id is null or not public.current_user_can_manage_service_agreements(a.contractor_id) then
    raise exception 'You cannot manage this visit.' using errcode = '42501';
  end if;
  if p_shared is null then raise exception 'Choose whether to share this visit.'; end if;
  -- Exact retry after a lost response succeeds; stale conflicting edits do not overwrite.
  if v.due_on is not distinct from p_due_on and v.job_id is not distinct from p_job_id
    and v.shared_with_homeowner = p_shared then return; end if;
  unshare_only := not p_shared and v.shared_with_homeowner and v.due_on is not distinct from p_due_on and v.job_id is not distinct from p_job_id;
  if not unshare_only then
    if a.status <> 'active' or not public.servsync_plan_visit_connection_shared(a.id) then
      raise exception 'An active plan and currently shared property are required.';
    end if;
    if not public.current_user_has_contractor_entitlement(a.contractor_id, 'can_create_jobs') then
      raise exception 'This contractor account is read-only for visit changes.' using errcode = '42501';
    end if;
  end if;
  if v.version is distinct from p_expected_version then
    raise exception 'This visit changed. Reload before editing.' using errcode = '40001';
  end if;
  if p_job_id is distinct from v.job_id and v.job_id is not null then
    select coalesce(job_status, case when status = 'finalized' then 'completed' end)
      into old_status from public.inspections where id = v.job_id for update;
    if old_status in ('completed','closed') and p_confirm_correction is distinct from true then
      raise exception 'Confirm the completed visit link correction. The original Job and report will be preserved.';
    end if;
  end if;
  if p_job_id is not null then
    select * into j from public.inspections where id = p_job_id for update;
    if j.id is null or j.contractor_id <> a.contractor_id
      or j.homeowner_user_id is distinct from a.homeowner_user_id or j.home_id is distinct from a.home_id
      or (j.job_origin = 'draft_composer' and j.status = 'draft' and j.job_status = 'draft') then
      raise exception 'Choose an existing Job for this contractor, homeowner and property.';
    end if;
  end if;
  update public.service_plan_visits set due_on = p_due_on, job_id = p_job_id,
    shared_with_homeowner = p_shared, version = version + 1, updated_at = now() where id = v.id returning * into updated;
  insert into public.service_plan_visit_changes(visit_id,actor_id,before_state,after_state,corrected_completed_link)
    values(v.id,auth.uid(),to_jsonb(v),to_jsonb(updated),coalesce(old_status in ('completed','closed'),false));
end;
$$;
revoke all on function public.servsync_update_plan_visit(uuid, integer, date, uuid, boolean, boolean) from public, anon;
grant execute on function public.servsync_update_plan_visit(uuid, integer, date, uuid, boolean, boolean) to authenticated;

-- Linked work cannot silently move to another customer/property or become a private Draft.
create function public.servsync_guard_plan_visit_job_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.service_plan_visits where job_id = old.id) and (
    new.contractor_id is distinct from old.contractor_id or new.homeowner_user_id is distinct from old.homeowner_user_id
    or new.home_id is distinct from old.home_id
    or (new.job_origin = 'draft_composer' and new.status = 'draft' and new.job_status = 'draft')
  ) then raise exception 'Correct the Service Plan visit link before moving this Job.'; end if;
  return new;
end;
$$;
revoke all on function public.servsync_guard_plan_visit_job_identity() from public, anon, authenticated;
create trigger service_plan_visit_job_identity before update of contractor_id, homeowner_user_id, home_id, job_origin, status, job_status
  on public.inspections for each row execute function public.servsync_guard_plan_visit_job_identity();

comment on table public.service_plan_visits is 'Explicit plan visit slots; completion derives from linked Jobs. No scheduling, billing or delivery automation.';
commit;
