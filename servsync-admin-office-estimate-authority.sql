-- ServSync FB-035 Admin/Office Normal Estimate Authority v1.
--
-- Expands normal pre-acceptance Estimate management from Owner-only to the
-- active Owner/Admin/Office role set, while keeping billing and Job authority
-- separate. Connected Estimate send becomes a lifecycle-aware RPC. Future
-- contractor actor attribution is retained in a private, policy-free table.

begin;

do $$
declare
  v_missing text;
begin
  select string_agg(prerequisite, ', ' order by prerequisite)
    into v_missing
    from (values
      ('public.estimates', to_regclass('public.estimates') is not null),
      ('public.estimate_line_items', to_regclass('public.estimate_line_items') is not null),
      ('public.estimate_payment_schedule_items', to_regclass('public.estimate_payment_schedule_items') is not null),
      ('public.contractor_team_members', to_regclass('public.contractor_team_members') is not null),
      ('public.contractor_work_draft_launches', to_regclass('public.contractor_work_draft_launches') is not null),
      ('public.local_estimate_delivery_links', to_regclass('public.local_estimate_delivery_links') is not null),
      ('public.workflow_activity_events', to_regclass('public.workflow_activity_events') is not null),
      ('public.current_user_is_platform_admin()', to_regprocedure('public.current_user_is_platform_admin()') is not null),
      ('public.servsync_current_contractor_profile()', to_regprocedure('public.servsync_current_contractor_profile()') is not null),
      ('public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)',
        to_regprocedure('public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)') is not null)
    ) as required(prerequisite, present)
   where not present;

  if v_missing is not null then
    raise exception 'Admin/Office Estimate authority prerequisites are missing: %', v_missing;
  end if;
end;
$$;

create or replace function public.current_user_can_manage_contractor_estimates(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.contractor_profiles contractor
        where contractor.id = p_contractor_id
          and contractor.account_status = 'active'
     )
     and (
       exists (
         select 1
           from public.contractor_profiles contractor
          where contractor.id = p_contractor_id
            and contractor.owner_user_id = auth.uid()
       )
       or exists (
         select 1
           from public.contractor_team_members member
          where member.contractor_id = p_contractor_id
            and member.user_id = auth.uid()
            and member.status = 'active'
            and member.role in ('admin', 'office')
       )
       or (
         public.current_user_is_platform_admin()
         and exists (
           select 1
             from public.servsync_current_contractor_profile() context
            where context.id = p_contractor_id
              and context.account_status = 'active'
         )
       )
     );
$$;

comment on function public.current_user_can_manage_contractor_estimates(uuid) is
  'Server-authoritative normal Estimate-management capability. Allows active Owner/Admin/Office and platform admins only with matching resolved contractor context. Excludes billing and Job authority.';

alter function public.current_user_can_manage_contractor_estimates(uuid) owner to postgres;
revoke all on function public.current_user_can_manage_contractor_estimates(uuid) from public, anon, authenticated, service_role;
grant execute on function public.current_user_can_manage_contractor_estimates(uuid) to authenticated;

create table public.estimate_actor_audit (
  estimate_id uuid primary key references public.estimates(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz,
  last_edited_by_user_id uuid references public.profiles(id) on delete set null,
  last_edited_at timestamptz,
  sent_by_user_id uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.estimate_actor_audit is
  'Private future-only Estimate actor attribution. Historical Estimates are not backfilled; absent rows and null actors remain honest unknowns.';

alter table public.estimate_actor_audit owner to postgres;
alter table public.estimate_actor_audit enable row level security;
alter table public.estimate_actor_audit force row level security;
revoke all on table public.estimate_actor_audit from public, anon, authenticated, service_role;

create function public.servsync_private_capture_estimate_actor_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_manager boolean;
  v_content_changed boolean := false;
begin
  v_is_manager := v_actor is not null
    and public.current_user_can_manage_contractor_estimates(new.contractor_id);

  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and current_user not in ('postgres', 'service_role') then
    raise exception using message = 'ESTIMATE_STATUS_RPC_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if v_is_manager then
      insert into public.estimate_actor_audit (
        estimate_id,
        contractor_id,
        created_by_user_id,
        created_at,
        last_edited_by_user_id,
        last_edited_at,
        updated_at
      ) values (
        new.id,
        new.contractor_id,
        v_actor,
        now(),
        v_actor,
        now(),
        now()
      );
    end if;
    return new;
  end if;

  v_content_changed := (to_jsonb(new) - 'status' - 'updated_at')
    is distinct from (to_jsonb(old) - 'status' - 'updated_at');

  if v_is_manager and (v_content_changed or (new.status = 'sent' and old.status is distinct from new.status)) then
    insert into public.estimate_actor_audit as audit (
      estimate_id,
      contractor_id,
      last_edited_by_user_id,
      last_edited_at,
      sent_by_user_id,
      sent_at,
      updated_at
    ) values (
      new.id,
      new.contractor_id,
      case when v_content_changed then v_actor end,
      case when v_content_changed then now() end,
      case when new.status = 'sent' and old.status is distinct from new.status then v_actor end,
      case when new.status = 'sent' and old.status is distinct from new.status then now() end,
      now()
    )
    on conflict (estimate_id) do update set
      contractor_id = excluded.contractor_id,
      last_edited_by_user_id = case
        when v_content_changed then excluded.last_edited_by_user_id
        else audit.last_edited_by_user_id
      end,
      last_edited_at = case
        when v_content_changed then excluded.last_edited_at
        else audit.last_edited_at
      end,
      sent_by_user_id = case
        when new.status = 'sent' and old.status is distinct from new.status then excluded.sent_by_user_id
        else audit.sent_by_user_id
      end,
      sent_at = case
        when new.status = 'sent' and old.status is distinct from new.status then excluded.sent_at
        else audit.sent_at
      end,
      updated_at = now();
  end if;

  return new;
end;
$$;

alter function public.servsync_private_capture_estimate_actor_audit() owner to postgres;
revoke all on function public.servsync_private_capture_estimate_actor_audit() from public, anon, authenticated, service_role;

drop trigger if exists servsync_estimates_actor_audit_insert on public.estimates;
create trigger servsync_estimates_actor_audit_insert
  after insert on public.estimates
  for each row execute function public.servsync_private_capture_estimate_actor_audit();

drop trigger if exists servsync_estimates_actor_audit_update on public.estimates;
create trigger servsync_estimates_actor_audit_update
  before update on public.estimates
  for each row execute function public.servsync_private_capture_estimate_actor_audit();

create function public.servsync_private_capture_estimate_child_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate_id uuid := case when tg_op = 'DELETE' then old.estimate_id else new.estimate_id end;
  v_estimate public.estimates;
begin
  select *
    into v_estimate
    from public.estimates estimate
   where estimate.id = v_estimate_id;

  if auth.uid() is not null
     and v_estimate.id is not null
     and v_estimate.status = 'draft'
     and public.current_user_can_manage_contractor_estimates(v_estimate.contractor_id) then
    insert into public.estimate_actor_audit as audit (
      estimate_id,
      contractor_id,
      last_edited_by_user_id,
      last_edited_at,
      updated_at
    ) values (
      v_estimate.id,
      v_estimate.contractor_id,
      auth.uid(),
      now(),
      now()
    )
    on conflict (estimate_id) do update set
      contractor_id = excluded.contractor_id,
      last_edited_by_user_id = excluded.last_edited_by_user_id,
      last_edited_at = excluded.last_edited_at,
      updated_at = now();
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

alter function public.servsync_private_capture_estimate_child_edit() owner to postgres;
revoke all on function public.servsync_private_capture_estimate_child_edit() from public, anon, authenticated, service_role;

drop trigger if exists servsync_estimate_lines_actor_audit on public.estimate_line_items;
create trigger servsync_estimate_lines_actor_audit
  after insert or update or delete on public.estimate_line_items
  for each row execute function public.servsync_private_capture_estimate_child_edit();

drop trigger if exists servsync_estimate_schedule_actor_audit on public.estimate_payment_schedule_items;
create trigger servsync_estimate_schedule_actor_audit
  after insert or update or delete on public.estimate_payment_schedule_items
  for each row execute function public.servsync_private_capture_estimate_child_edit();

create function public.servsync_private_append_estimate_sent_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'sent' and old.status is distinct from new.status then
    perform public.servsync_append_workflow_activity_event(
      p_context_type => 'estimate',
      p_event_type => 'estimate_sent',
      p_service_request_id => new.service_request_id,
      p_inspection_id => new.inspection_id,
      p_estimate_id => new.id,
      -- Contractor actor identity is retained in the private audit table, not
      -- exposed through the homeowner-readable activity stream.
      p_actor_user_id => null,
      p_metadata => jsonb_build_object('source', 'estimate_lifecycle')
    );
  end if;
  return new;
end;
$$;

alter function public.servsync_private_append_estimate_sent_activity() owner to postgres;
revoke all on function public.servsync_private_append_estimate_sent_activity() from public, anon, authenticated, service_role;

drop trigger if exists servsync_estimate_sent_activity on public.estimates;
create trigger servsync_estimate_sent_activity
  after update of status on public.estimates
  for each row execute function public.servsync_private_append_estimate_sent_activity();

create or replace function public.servsync_private_can_create_work_draft_estimate(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_can_manage_contractor_estimates(p_contractor_id);
$$;

alter function public.servsync_private_can_create_work_draft_estimate(uuid) owner to postgres;
revoke all on function public.servsync_private_can_create_work_draft_estimate(uuid) from public, anon, authenticated, service_role;

create or replace function public.servsync_private_can_manage_local_estimate_delivery(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_can_manage_contractor_estimates(p_contractor_id);
$$;

alter function public.servsync_private_can_manage_local_estimate_delivery(uuid) owner to postgres;
revoke all on function public.servsync_private_can_manage_local_estimate_delivery(uuid) from public, anon, authenticated, service_role;

create function public.servsync_send_estimate(p_estimate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate public.estimates;
begin
  if auth.uid() is null then
    raise exception using message = 'ESTIMATE_UNAVAILABLE';
  end if;

  select *
    into v_estimate
    from public.estimates estimate
   where estimate.id = p_estimate_id
   for update;

  if v_estimate.id is null
     or not public.current_user_can_manage_contractor_estimates(v_estimate.contractor_id) then
    raise exception using message = 'ESTIMATE_UNAVAILABLE';
  end if;

  if v_estimate.homeowner_user_id is null
     or v_estimate.local_contact_id is not null
     or v_estimate.local_home_id is not null then
    raise exception using message = 'ESTIMATE_CONNECTED_DELIVERY_REQUIRED';
  end if;

  if not exists (
    select 1
      from public.homeowner_contractor_connections connection
     where connection.contractor_id = v_estimate.contractor_id
       and connection.homeowner_user_id = v_estimate.homeowner_user_id
       and connection.status = 'active'
  ) then
    raise exception using message = 'ESTIMATE_CONNECTED_DELIVERY_REQUIRED';
  end if;

  if not exists (
    select 1
      from public.estimate_line_items line
     where line.estimate_id = v_estimate.id
  ) then
    raise exception using message = 'ESTIMATE_LINES_REQUIRED';
  end if;

  if v_estimate.status = 'sent' then
    return jsonb_build_object(
      'estimate_id', v_estimate.id,
      'status', v_estimate.status,
      'sent', false,
      'idempotent', true
    );
  end if;

  if v_estimate.status not in ('draft', 'revised') then
    raise exception using message = 'ESTIMATE_SEND_INVALID_STATE';
  end if;

  update public.estimates
     set status = 'sent'
   where id = v_estimate.id
  returning * into v_estimate;

  return jsonb_build_object(
    'estimate_id', v_estimate.id,
    'status', v_estimate.status,
    'sent', true,
    'idempotent', false
  );
end;
$$;

comment on function public.servsync_send_estimate(uuid) is
  'Server-authoritative connected-customer Estimate send. Validates tenant-scoped Estimate authority, connected delivery, line presence, lifecycle, and idempotent retries.';

alter function public.servsync_send_estimate(uuid) owner to postgres;
revoke all on function public.servsync_send_estimate(uuid) from public, anon, authenticated, service_role;
grant execute on function public.servsync_send_estimate(uuid) to authenticated;

create function public.servsync_get_estimate_actor_audit(p_estimate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_estimate public.estimates;
  v_audit public.estimate_actor_audit;
  v_launch_actor uuid;
  v_launch_at timestamptz;
  v_local_sender uuid;
  v_local_sent_at timestamptz;
  v_effective_sender uuid;
  v_effective_sent_at timestamptz;
begin
  select *
    into v_estimate
    from public.estimates estimate
   where estimate.id = p_estimate_id;

  if v_estimate.id is null
     or not public.current_user_can_manage_contractor_estimates(v_estimate.contractor_id) then
    raise exception using message = 'ESTIMATE_AUDIT_UNAVAILABLE';
  end if;

  select *
    into v_audit
    from public.estimate_actor_audit audit
   where audit.estimate_id = v_estimate.id;

  select launch.requested_by_user_id, launch.created_at
    into v_launch_actor, v_launch_at
    from public.contractor_work_draft_launches launch
   where launch.launched_estimate_id = v_estimate.id
      or launch.launched_estimate_id_snapshot = v_estimate.id
   order by launch.created_at desc, launch.id
   limit 1;

  select link.created_by, link.created_at
    into v_local_sender, v_local_sent_at
    from public.local_estimate_delivery_links link
   where link.estimate_id = v_estimate.id
   order by link.created_at desc, link.id
   limit 1;

  if v_local_sent_at is not null and (v_audit.sent_at is null or v_local_sent_at > v_audit.sent_at) then
    v_effective_sender := v_local_sender;
    v_effective_sent_at := v_local_sent_at;
  else
    v_effective_sender := v_audit.sent_by_user_id;
    v_effective_sent_at := v_audit.sent_at;
  end if;

  return jsonb_build_object(
    'estimate_id', v_estimate.id,
    'created_by_user_id', v_audit.created_by_user_id,
    'created_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = v_audit.created_by_user_id), ''),
    'created_at', v_audit.created_at,
    'launched_by_user_id', v_launch_actor,
    'launched_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = v_launch_actor), ''),
    'launched_at', v_launch_at,
    'last_edited_by_user_id', v_audit.last_edited_by_user_id,
    'last_edited_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = v_audit.last_edited_by_user_id), ''),
    'last_edited_at', v_audit.last_edited_at,
    'sent_by_user_id', v_effective_sender,
    'sent_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = v_effective_sender), ''),
    'sent_at', v_effective_sent_at
  );
end;
$$;

comment on function public.servsync_get_estimate_actor_audit(uuid) is
  'Returns contractor-private future Estimate actor attribution. Historical unknowns remain null; local resend attribution uses the existing secure delivery-link audit.';

alter function public.servsync_get_estimate_actor_audit(uuid) owner to postgres;
revoke all on function public.servsync_get_estimate_actor_audit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.servsync_get_estimate_actor_audit(uuid) to authenticated;

drop policy if exists "Estimates: contractor manages own" on public.estimates;
drop policy if exists "Estimates: estimate managers create drafts" on public.estimates;
create policy "Estimates: estimate managers create drafts"
  on public.estimates for insert to authenticated
  with check (
    status = 'draft'
    and public.current_user_can_manage_contractor_estimates(contractor_id)
  );

drop policy if exists "Estimates: estimate managers update drafts" on public.estimates;
create policy "Estimates: estimate managers update drafts"
  on public.estimates for update to authenticated
  using (
    status = 'draft'
    and public.current_user_can_manage_contractor_estimates(contractor_id)
  )
  with check (
    status = 'draft'
    and public.current_user_can_manage_contractor_estimates(contractor_id)
  );

drop policy if exists "Estimates: estimate managers delete drafts" on public.estimates;
create policy "Estimates: estimate managers delete drafts"
  on public.estimates for delete to authenticated
  using (
    status = 'draft'
    and public.current_user_can_manage_contractor_estimates(contractor_id)
  );

drop policy if exists "Estimate lines: contractor manages own" on public.estimate_line_items;
drop policy if exists "Estimate lines: estimate managers create draft lines" on public.estimate_line_items;
create policy "Estimate lines: estimate managers create draft lines"
  on public.estimate_line_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_line_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  );

drop policy if exists "Estimate lines: estimate managers update draft lines" on public.estimate_line_items;
create policy "Estimate lines: estimate managers update draft lines"
  on public.estimate_line_items for update to authenticated
  using (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_line_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_line_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  );

drop policy if exists "Estimate lines: estimate managers delete draft lines" on public.estimate_line_items;
create policy "Estimate lines: estimate managers delete draft lines"
  on public.estimate_line_items for delete to authenticated
  using (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_line_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  );

drop policy if exists "Estimate payment schedule: billing team creates draft schedule" on public.estimate_payment_schedule_items;
drop policy if exists "Estimate schedule: managers create draft" on public.estimate_payment_schedule_items;
create policy "Estimate schedule: managers create draft"
  on public.estimate_payment_schedule_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_payment_schedule_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  );

drop policy if exists "Estimate payment schedule: billing team updates draft schedule" on public.estimate_payment_schedule_items;
drop policy if exists "Estimate schedule: managers update draft" on public.estimate_payment_schedule_items;
create policy "Estimate schedule: managers update draft"
  on public.estimate_payment_schedule_items for update to authenticated
  using (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_payment_schedule_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_payment_schedule_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  );

drop policy if exists "Estimate payment schedule: billing team deletes draft schedule" on public.estimate_payment_schedule_items;
drop policy if exists "Estimate schedule: managers delete draft" on public.estimate_payment_schedule_items;
create policy "Estimate schedule: managers delete draft"
  on public.estimate_payment_schedule_items for delete to authenticated
  using (
    exists (
      select 1
        from public.estimates estimate
       where estimate.id = estimate_payment_schedule_items.estimate_id
         and estimate.status = 'draft'
         and public.current_user_can_manage_contractor_estimates(estimate.contractor_id)
    )
  );

notify pgrst, 'reload schema';

commit;
