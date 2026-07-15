-- ServSync Unified Start New Job Backend Slice 2.
-- Draft Job persistence and canonical job scope foundation.
--
-- Paste this into the Supabase SQL Editor only after explicit
-- environment-specific SQL approval.
--
-- Run after:
--   - servsync-job-lifecycle.sql
--   - servsync-connected-homeowner-job-home-id.sql
--   - servsync-partial-invoicing-data-foundation.sql
--   - servsync-partial-invoicing-simple-work-items.sql
--   - servsync-fb020-billing-permission-helper.sql
--   - servsync-unified-visit-events.sql
--
-- This patch intentionally does not add the unified Start New Job UI, Draft
-- Job autosave, estimate-from-job, invoice allocation tables, payment ledgers,
-- final invoice reconciliation, job reopening, or homeowner approval UI.

begin;

alter table public.inspections
  add column if not exists job_origin text not null default 'direct',
  add column if not exists draft_created_by uuid references public.profiles(id) on delete set null,
  add column if not exists draft_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists draft_saved_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references public.profiles(id) on delete set null;

update public.inspections
   set job_origin = case
     when estimate_id is not null then 'estimate'
     else 'direct'
   end
 where job_origin is null
    or trim(job_origin) = ''
    or job_origin not in ('direct', 'estimate', 'draft_composer', 'invoice_direct', 'imported', 'other');

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'inspections_job_origin_check'
       and conrelid = 'public.inspections'::regclass
  ) then
    alter table public.inspections
      add constraint inspections_job_origin_check
      check (job_origin in ('direct', 'estimate', 'draft_composer', 'invoice_direct', 'imported', 'other'));
  end if;
end $$;

create index if not exists inspections_contractor_draft_origin_idx
  on public.inspections(contractor_id, job_origin, job_status, updated_at desc)
  where status = 'draft';

alter table public.job_work_items
  add column if not exists work_state text not null default 'open',
  add column if not exists approval_required boolean not null default false,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approval_contact_name text,
  add column if not exists approval_method text,
  add column if not exists approval_note text,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists approval_recorded_at timestamptz,
  add column if not exists room_id text,
  add column if not exists room_label text,
  add column if not exists location_label text;

update public.job_work_items
   set work_state = case
     when completion_status = 'completed' then 'completed'
     when completion_status = 'removed' then 'removed'
     when completion_status = 'declined' or billing_status = 'not_billable' or billable = false then 'non_billable'
     else 'open'
   end
 where work_state is null
    or trim(work_state) = ''
    or work_state not in ('draft', 'open', 'in_progress', 'completed', 'removed', 'non_billable');

update public.job_work_items
   set approval_status = 'not_required',
       approval_required = false
 where approval_status is null
    or trim(approval_status) = ''
    or approval_status not in (
      'not_required',
      'required',
      'requested',
      'approved_servsync',
      'approved_offline',
      'declined',
      'proceeded_without_recorded_approval'
    );

alter table public.job_work_items
  drop constraint if exists job_work_items_source_type_check;

alter table public.job_work_items
  add constraint job_work_items_source_type_check
  check (
    source_type is null
    or source_type in ('estimate_line_item', 'simple_task', 'manual', 'inspection_finding', 'draft_job_scope')
  );

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'job_work_items_work_state_check'
       and conrelid = 'public.job_work_items'::regclass
  ) then
    alter table public.job_work_items
      add constraint job_work_items_work_state_check
      check (work_state in ('draft', 'open', 'in_progress', 'completed', 'removed', 'non_billable'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'job_work_items_approval_status_check'
       and conrelid = 'public.job_work_items'::regclass
  ) then
    alter table public.job_work_items
      add constraint job_work_items_approval_status_check
      check (
        approval_status in (
          'not_required',
          'required',
          'requested',
          'approved_servsync',
          'approved_offline',
          'declined',
          'proceeded_without_recorded_approval'
        )
      );
  end if;
end $$;

create index if not exists job_work_items_inspection_work_state_idx
  on public.job_work_items(inspection_id, work_state, sort_order);

create index if not exists job_work_items_inspection_approval_idx
  on public.job_work_items(inspection_id, approval_status)
  where approval_status <> 'not_required';

comment on column public.inspections.job_origin is
  'Internal lifecycle origin for inspections-backed jobs. draft_composer marks contractor-only Draft Jobs created by the unified-workflow backend foundation.';

comment on column public.inspections.activated_at is
  'Timestamp when a contractor-only Draft Job was activated into an operational job. Does not imply report finalization.';

comment on column public.job_work_items.work_state is
  'Canonical operational work state for future unified job scope. Existing completion_status and billing_status remain compatibility fields.';

comment on column public.job_work_items.approval_status is
  'First-version scope approval state. Approval UI and estimate-from-job behavior remain future slices.';

create or replace function public.servsync_create_draft_job(
  p_homeowner_user_id uuid default null,
  p_home_id uuid default null,
  p_local_contact_id uuid default null,
  p_local_home_id uuid default null,
  p_service_request_id uuid default null,
  p_name text default '',
  p_summary text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request public.service_requests;
  v_home public.homes;
  v_local_home public.contractor_local_homes;
  v_name text := trim(coalesce(p_name, ''));
  v_new_id uuid;
begin
  select id into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if v_contractor_id is null or not public.current_user_can_manage_contractor_billing(v_contractor_id) then
    raise exception 'You do not have permission to create Draft Jobs.';
  end if;

  if v_name = '' then
    raise exception 'Draft Job name is required.';
  end if;

  if p_service_request_id is not null then
    select *
      into v_request
      from public.service_requests
     where id = p_service_request_id
       and contractor_id = v_contractor_id
     for update;

    if v_request.id is null then
      raise exception 'Service request not found for this contractor.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_request.homeowner_user_id;
    elsif p_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception 'Draft Job homeowner does not match the service request.';
    end if;
  end if;

  if p_home_id is not null then
    select *
      into v_home
      from public.homes
     where id = p_home_id
     limit 1;

    if v_home.id is null then
      raise exception 'Selected property was not found.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_home.homeowner_user_id;
    elsif p_homeowner_user_id <> v_home.homeowner_user_id then
      raise exception 'Selected property does not belong to this homeowner.';
    end if;
  end if;

  if p_local_home_id is not null then
    select *
      into v_local_home
      from public.contractor_local_homes
     where id = p_local_home_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_local_home.id is null then
      raise exception 'Local home not found for this contractor.';
    end if;

    if p_local_contact_id is null then
      p_local_contact_id := v_local_home.local_contact_id;
    elsif p_local_contact_id <> v_local_home.local_contact_id then
      raise exception 'Local customer does not match the selected local home.';
    end if;
  end if;

  if p_homeowner_user_id is null and p_local_contact_id is null then
    raise exception 'Choose a homeowner or local customer before saving a Draft Job.';
  end if;

  if p_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = p_homeowner_user_id
       and status = 'active'
  ) then
    raise exception 'Homeowner is not connected to this contractor.';
  end if;

  if p_local_contact_id is not null and not exists (
    select 1
      from public.contractor_local_contacts
     where id = p_local_contact_id
       and contractor_id = v_contractor_id
  ) then
    raise exception 'Local customer not found for this contractor.';
  end if;

  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    name,
    summary,
    status,
    job_status,
    job_origin,
    rooms_with_findings,
    draft_created_by,
    draft_updated_by,
    draft_saved_at
  ) values (
    v_contractor_id,
    p_homeowner_user_id,
    case when p_homeowner_user_id is not null then p_home_id else null end,
    p_local_contact_id,
    p_local_home_id,
    p_service_request_id,
    v_name,
    trim(coalesce(p_summary, '')),
    'draft',
    'draft',
    'draft_composer',
    '[]'::jsonb,
    auth.uid(),
    auth.uid(),
    now()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

create or replace function public.servsync_update_draft_job(
  p_inspection_id uuid,
  p_homeowner_user_id uuid default null,
  p_home_id uuid default null,
  p_local_contact_id uuid default null,
  p_local_home_id uuid default null,
  p_service_request_id uuid default null,
  p_name text default null,
  p_summary text default null
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_request public.service_requests;
  v_home public.homes;
  v_local_home public.contractor_local_homes;
  v_homeowner_user_id uuid;
  v_home_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_service_request_id uuid;
  v_name text;
  v_updated public.inspections;
begin
  if p_inspection_id is null then
    raise exception 'Draft Job is required.';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Draft Job not found.';
  end if;

  if not public.current_user_can_manage_contractor_billing(v_job.contractor_id) then
    raise exception 'You do not have permission to update this Draft Job.';
  end if;

  if v_job.status <> 'draft' or v_job.job_status <> 'draft' or v_job.job_origin <> 'draft_composer' then
    raise exception 'Only contractor-only Draft Jobs can be updated here.';
  end if;

  v_homeowner_user_id := coalesce(p_homeowner_user_id, v_job.homeowner_user_id);
  v_home_id := coalesce(p_home_id, v_job.home_id);
  v_local_contact_id := coalesce(p_local_contact_id, v_job.local_contact_id);
  v_local_home_id := coalesce(p_local_home_id, v_job.local_home_id);
  v_service_request_id := coalesce(p_service_request_id, v_job.service_request_id);
  v_name := coalesce(nullif(trim(coalesce(p_name, '')), ''), v_job.name);

  if trim(coalesce(v_name, '')) = '' then
    raise exception 'Draft Job name is required.';
  end if;

  if v_service_request_id is not null then
    select *
      into v_request
      from public.service_requests
     where id = v_service_request_id
       and contractor_id = v_job.contractor_id
     for update;

    if v_request.id is null then
      raise exception 'Service request not found for this contractor.';
    end if;

    if v_homeowner_user_id is null then
      v_homeowner_user_id := v_request.homeowner_user_id;
    elsif v_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception 'Draft Job homeowner does not match the service request.';
    end if;
  end if;

  if v_home_id is not null then
    select *
      into v_home
      from public.homes
     where id = v_home_id
     limit 1;

    if v_home.id is null then
      raise exception 'Selected property was not found.';
    end if;

    if v_homeowner_user_id is null then
      v_homeowner_user_id := v_home.homeowner_user_id;
    elsif v_homeowner_user_id <> v_home.homeowner_user_id then
      raise exception 'Selected property does not belong to this homeowner.';
    end if;
  end if;

  if v_local_home_id is not null then
    select *
      into v_local_home
      from public.contractor_local_homes
     where id = v_local_home_id
       and contractor_id = v_job.contractor_id
     limit 1;

    if v_local_home.id is null then
      raise exception 'Local home not found for this contractor.';
    end if;

    if v_local_contact_id is null then
      v_local_contact_id := v_local_home.local_contact_id;
    elsif v_local_contact_id <> v_local_home.local_contact_id then
      raise exception 'Local customer does not match the selected local home.';
    end if;
  end if;

  if v_homeowner_user_id is null and v_local_contact_id is null then
    raise exception 'Choose a homeowner or local customer before saving a Draft Job.';
  end if;

  if v_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_job.contractor_id
       and homeowner_user_id = v_homeowner_user_id
       and status = 'active'
  ) then
    raise exception 'Homeowner is not connected to this contractor.';
  end if;

  if v_local_contact_id is not null and not exists (
    select 1
      from public.contractor_local_contacts
     where id = v_local_contact_id
       and contractor_id = v_job.contractor_id
  ) then
    raise exception 'Local customer not found for this contractor.';
  end if;

  update public.inspections
     set homeowner_user_id = v_homeowner_user_id,
         home_id = case when v_homeowner_user_id is not null then v_home_id else null end,
         local_contact_id = v_local_contact_id,
         local_home_id = v_local_home_id,
         service_request_id = v_service_request_id,
         name = v_name,
         summary = coalesce(p_summary, summary, ''),
         draft_updated_by = auth.uid(),
         draft_saved_at = now(),
         updated_at = now()
   where id = v_job.id
   returning * into v_updated;

  return v_updated;
end;
$$;

create or replace function public.servsync_upsert_draft_job_scope(
  p_inspection_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_can_financial boolean := false;
  v_can_operational boolean := false;
  v_item jsonb;
  v_item_id uuid;
  v_existing public.job_work_items;
  v_remove boolean;
  v_source_type text;
  v_source_key text;
  v_title text;
  v_description text;
  v_customer_description text;
  v_internal_notes text;
  v_line_type text;
  v_quantity numeric;
  v_unit text;
  v_unit_price_cents integer;
  v_labor_hours numeric;
  v_billable boolean;
  v_completion_status text;
  v_billing_status text;
  v_work_state text;
  v_approval_required boolean;
  v_approval_status text;
  v_approval_contact_name text;
  v_approval_method text;
  v_approval_note text;
  v_approval_decided_at timestamptz;
  v_room_id text;
  v_room_label text;
  v_location_label text;
  v_sort_order integer;
  v_changed_ids uuid[] := array[]::uuid[];
  v_removed_ids uuid[] := array[]::uuid[];
begin
  if p_inspection_id is null then
    raise exception 'Draft Job is required.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Scope items must be provided as an array.';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Draft Job not found.';
  end if;

  if v_job.status <> 'draft' or v_job.job_status <> 'draft' or v_job.job_origin <> 'draft_composer' then
    raise exception 'Only contractor-only Draft Jobs can be updated here.';
  end if;

  v_can_operational := public.current_user_can_write_contractor_jobs(v_job.contractor_id);
  v_can_financial := public.current_user_can_manage_contractor_billing(v_job.contractor_id);

  if not v_can_operational then
    raise exception 'You do not have permission to update this Draft Job scope.';
  end if;

  if exists (
    with payload as (
      select
        nullif(trim(value->>'source_type'), '') as source_type,
        nullif(trim(value->>'source_key'), '') as source_key
      from jsonb_array_elements(p_items)
      where coalesce((value->>'remove')::boolean, false) = false
    )
    select 1
      from payload
     where source_type is not null
       and source_key is not null
     group by source_type, source_key
    having count(*) > 1
  ) then
    raise exception 'Scope items contain duplicate source identities.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each scope item must be an object.';
    end if;

    v_item_id := nullif(trim(coalesce(v_item->>'id', '')), '')::uuid;
    v_remove := coalesce((v_item->>'remove')::boolean, false);
    v_existing := null;

    if v_item_id is not null then
      select *
        into v_existing
        from public.job_work_items
       where id = v_item_id
       for update;

      if v_existing.id is null then
        raise exception 'Scope item % was not found.', v_item_id;
      end if;

      if v_existing.inspection_id <> v_job.id or v_existing.contractor_id <> v_job.contractor_id then
        raise exception 'Scope item does not belong to this Draft Job.';
      end if;

      if v_existing.billing_status in ('drafted', 'invoiced')
        or v_existing.reserved_invoice_id is not null
        or v_existing.invoiced_invoice_id is not null then
        raise exception 'Reserved or invoiced scope items cannot be changed by Draft Job scope updates.';
      end if;
    elsif not v_can_financial then
      raise exception 'Field technicians cannot add Draft Job scope items.';
    end if;

    if v_remove then
      if v_item_id is null then
        raise exception 'Scope item id is required before removal.';
      end if;
      if not v_can_financial then
        raise exception 'Field technicians cannot remove Draft Job scope items.';
      end if;

      update public.job_work_items
         set completion_status = 'removed',
             work_state = 'removed',
             billable = false,
             billing_status = 'not_billable',
             reserved_invoice_id = null,
             invoiced_invoice_id = null,
             updated_at = now()
       where id = v_item_id
       returning id into v_item_id;

      v_removed_ids := array_append(v_removed_ids, v_item_id);
      continue;
    end if;

    v_source_type := coalesce(nullif(trim(coalesce(v_item->>'source_type', '')), ''), v_existing.source_type, 'draft_job_scope');
    v_source_key := coalesce(nullif(trim(coalesce(v_item->>'source_key', '')), ''), v_existing.source_key, 'draft:' || gen_random_uuid()::text);
    v_title := coalesce(nullif(trim(coalesce(v_item->>'title', '')), ''), v_existing.title);
    v_description := coalesce(v_item->>'description', v_existing.description, '');
    v_customer_description := coalesce(v_item->>'customer_description', v_existing.customer_description, '');
    v_internal_notes := coalesce(v_item->>'internal_notes', v_existing.internal_notes, '');
    v_line_type := coalesce(nullif(trim(coalesce(v_item->>'line_type', '')), ''), v_existing.line_type, 'other');
    v_quantity := coalesce(nullif(trim(coalesce(v_item->>'quantity', '')), '')::numeric, v_existing.quantity, 1);
    v_unit := coalesce(nullif(trim(coalesce(v_item->>'unit', '')), ''), v_existing.unit, 'each');
    v_unit_price_cents := coalesce(nullif(trim(coalesce(v_item->>'unit_price_cents', '')), '')::integer, v_existing.unit_price_cents);
    v_labor_hours := coalesce(nullif(trim(coalesce(v_item->>'labor_hours', '')), '')::numeric, v_existing.labor_hours);
    v_billable := coalesce((v_item->>'billable')::boolean, v_existing.billable, true);
    v_completion_status := coalesce(nullif(trim(coalesce(v_item->>'completion_status', '')), ''), v_existing.completion_status, 'open');
    v_billing_status := coalesce(v_existing.billing_status, 'unbilled');
    v_work_state := coalesce(nullif(trim(coalesce(v_item->>'work_state', '')), ''), v_existing.work_state, case
      when v_completion_status = 'completed' then 'completed'
      when v_completion_status = 'removed' then 'removed'
      when not v_billable then 'non_billable'
      else 'open'
    end);
    v_approval_required := coalesce((v_item->>'approval_required')::boolean, v_existing.approval_required, false);
    v_approval_status := coalesce(nullif(trim(coalesce(v_item->>'approval_status', '')), ''), v_existing.approval_status, case when v_approval_required then 'required' else 'not_required' end);
    v_approval_contact_name := nullif(trim(coalesce(v_item->>'approval_contact_name', v_existing.approval_contact_name, '')), '');
    v_approval_method := nullif(trim(coalesce(v_item->>'approval_method', v_existing.approval_method, '')), '');
    v_approval_note := nullif(trim(coalesce(v_item->>'approval_note', v_existing.approval_note, '')), '');
    v_approval_decided_at := coalesce(nullif(trim(coalesce(v_item->>'approval_decided_at', '')), '')::timestamptz, v_existing.approval_decided_at);
    v_room_id := nullif(trim(coalesce(v_item->>'room_id', v_existing.room_id, '')), '');
    v_room_label := nullif(trim(coalesce(v_item->>'room_label', v_existing.room_label, '')), '');
    v_location_label := nullif(trim(coalesce(v_item->>'location_label', v_existing.location_label, '')), '');
    v_sort_order := coalesce(nullif(trim(coalesce(v_item->>'sort_order', '')), '')::integer, v_existing.sort_order, 0);

    if v_title is null or trim(v_title) = '' then
      raise exception 'Scope item title is required.';
    end if;
    if v_source_type not in ('estimate_line_item', 'simple_task', 'manual', 'inspection_finding', 'draft_job_scope') then
      raise exception 'Choose a valid scope source type.';
    end if;
    if v_line_type not in ('labor', 'material', 'fee', 'other') then
      raise exception 'Choose a valid line type.';
    end if;
    if v_completion_status not in ('open', 'completed', 'declined', 'removed') then
      raise exception 'Choose a valid completion status.';
    end if;
    if v_work_state not in ('draft', 'open', 'in_progress', 'completed', 'removed', 'non_billable') then
      raise exception 'Choose a valid work state.';
    end if;
    if v_approval_status not in (
      'not_required',
      'required',
      'requested',
      'approved_servsync',
      'approved_offline',
      'declined',
      'proceeded_without_recorded_approval'
    ) then
      raise exception 'Choose a valid approval status.';
    end if;
    if v_approval_status <> 'not_required' then
      v_approval_required := true;
    end if;
    if v_quantity < 0 then
      raise exception 'Quantity must be zero or more.';
    end if;
    if v_unit_price_cents is not null and v_unit_price_cents < 0 then
      raise exception 'Unit price must be zero or more, or blank.';
    end if;
    if v_labor_hours is not null and v_labor_hours < 0 then
      raise exception 'Labor hours must be zero or more, or blank.';
    end if;
    if v_completion_status = 'removed' or not v_billable or v_work_state = 'non_billable' then
      v_billable := false;
      v_billing_status := 'not_billable';
    end if;

    if exists (
      select 1
        from public.job_work_items existing
       where existing.inspection_id = v_job.id
         and existing.source_type = v_source_type
         and existing.source_key = v_source_key
         and (v_item_id is null or existing.id <> v_item_id)
    ) then
      raise exception 'Scope item source identity already exists on this Draft Job.';
    end if;

    if not v_can_financial and v_existing.id is not null then
      if v_line_type is distinct from v_existing.line_type
        or v_quantity is distinct from v_existing.quantity
        or v_unit is distinct from v_existing.unit
        or v_unit_price_cents is distinct from v_existing.unit_price_cents
        or v_labor_hours is distinct from v_existing.labor_hours
        or v_billable is distinct from v_existing.billable
        or v_approval_required is distinct from v_existing.approval_required
        or v_approval_status is distinct from v_existing.approval_status
        or v_approval_contact_name is distinct from v_existing.approval_contact_name
        or v_approval_method is distinct from v_existing.approval_method
        or v_approval_note is distinct from v_existing.approval_note
        or v_approval_decided_at is distinct from v_existing.approval_decided_at then
        raise exception 'Field technicians cannot change financial or approval fields on Draft Job scope.';
      end if;
    end if;

    if v_item_id is null then
      insert into public.job_work_items (
        inspection_id,
        contractor_id,
        source_type,
        source_key,
        title,
        description,
        customer_description,
        internal_notes,
        line_type,
        quantity,
        unit,
        unit_price_cents,
        labor_hours,
        billable,
        completion_status,
        billing_status,
        work_state,
        approval_required,
        approval_status,
        approval_contact_name,
        approval_method,
        approval_note,
        approval_decided_at,
        approval_recorded_by,
        approval_recorded_at,
        room_id,
        room_label,
        location_label,
        sort_order
      ) values (
        v_job.id,
        v_job.contractor_id,
        v_source_type,
        v_source_key,
        v_title,
        v_description,
        v_customer_description,
        v_internal_notes,
        v_line_type,
        v_quantity,
        v_unit,
        v_unit_price_cents,
        v_labor_hours,
        v_billable,
        v_completion_status,
        v_billing_status,
        v_work_state,
        v_approval_required,
        v_approval_status,
        v_approval_contact_name,
        v_approval_method,
        v_approval_note,
        v_approval_decided_at,
        case when v_approval_status <> 'not_required' then auth.uid() else null end,
        case when v_approval_status <> 'not_required' then now() else null end,
        v_room_id,
        v_room_label,
        v_location_label,
        v_sort_order
      )
      returning id into v_item_id;
    else
      update public.job_work_items
         set source_type = v_source_type,
             source_key = v_source_key,
             title = v_title,
             description = v_description,
             customer_description = v_customer_description,
             internal_notes = v_internal_notes,
             line_type = v_line_type,
             quantity = v_quantity,
             unit = v_unit,
             unit_price_cents = v_unit_price_cents,
             labor_hours = v_labor_hours,
             billable = v_billable,
             completion_status = v_completion_status,
             billing_status = v_billing_status,
             completed_at = case
               when v_completion_status = 'completed' then coalesce(completed_at, now())
               else null
             end,
             completed_by = case
               when v_completion_status = 'completed' then coalesce(completed_by, auth.uid())
               else null
             end,
             work_state = v_work_state,
             approval_required = v_approval_required,
             approval_status = v_approval_status,
             approval_contact_name = v_approval_contact_name,
             approval_method = v_approval_method,
             approval_note = v_approval_note,
             approval_decided_at = v_approval_decided_at,
             approval_recorded_by = case
               when v_approval_status <> coalesce(v_existing.approval_status, 'not_required') then auth.uid()
               else approval_recorded_by
             end,
             approval_recorded_at = case
               when v_approval_status <> coalesce(v_existing.approval_status, 'not_required') then now()
               else approval_recorded_at
             end,
             room_id = v_room_id,
             room_label = v_room_label,
             location_label = v_location_label,
             sort_order = v_sort_order,
             updated_at = now()
       where id = v_item_id;
    end if;

    v_changed_ids := array_append(v_changed_ids, v_item_id);
  end loop;

  update public.inspections
     set draft_updated_by = auth.uid(),
         draft_saved_at = now(),
         updated_at = now()
   where id = v_job.id;

  return jsonb_build_object(
    'inspection_id', v_job.id,
    'updated_item_ids', to_jsonb(v_changed_ids),
    'removed_item_ids', to_jsonb(v_removed_ids)
  );
end;
$$;

create or replace function public.servsync_activate_draft_job(
  p_inspection_id uuid,
  p_job_status text default null
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_has_future_schedule boolean := false;
  v_next_status text;
  v_updated public.inspections;
begin
  if p_inspection_id is null then
    raise exception 'Draft Job is required.';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Draft Job not found.';
  end if;

  if not public.current_user_can_manage_contractor_billing(v_job.contractor_id) then
    raise exception 'You do not have permission to activate this Draft Job.';
  end if;

  if v_job.status <> 'draft' or v_job.job_origin <> 'draft_composer' then
    raise exception 'Only contractor-only Draft Jobs can be activated here.';
  end if;

  if v_job.job_status <> 'draft' then
    raise exception 'Draft Job is already activated.';
  end if;

  if trim(coalesce(v_job.name, '')) = '' then
    raise exception 'Draft Job name is required before activation.';
  end if;

  if v_job.homeowner_user_id is null and v_job.local_contact_id is null then
    raise exception 'Choose a homeowner or local customer before activating this Draft Job.';
  end if;

  if not exists (
    select 1
      from public.job_work_items item
     where item.inspection_id = v_job.id
       and item.contractor_id = v_job.contractor_id
       and item.completion_status <> 'removed'
       and item.work_state <> 'removed'
       and item.billing_status <> 'not_billable'
  ) then
    raise exception 'Add at least one active scope item before activating this Draft Job.';
  end if;

  select exists (
    select 1
      from public.contractor_visit_events event
     where event.inspection_id = v_job.id
       and event.contractor_id = v_job.contractor_id
       and event.status = 'scheduled'
       and event.scheduled_at > now()
  )
    into v_has_future_schedule;

  v_next_status := coalesce(nullif(trim(p_job_status), ''), case when v_has_future_schedule then 'scheduled' else 'in_progress' end);

  if v_next_status not in ('scheduled', 'in_progress') then
    raise exception 'Draft Jobs can only activate to scheduled or in progress.';
  end if;

  update public.inspections
     set job_status = v_next_status,
         activated_at = now(),
         activated_by = auth.uid(),
         draft_updated_by = auth.uid(),
         draft_saved_at = now(),
         updated_at = now()
   where id = v_job.id
   returning * into v_updated;

  return v_updated;
end;
$$;

revoke execute on function public.servsync_create_draft_job(uuid, uuid, uuid, uuid, uuid, text, text) from public;
revoke execute on function public.servsync_create_draft_job(uuid, uuid, uuid, uuid, uuid, text, text) from anon;
grant execute on function public.servsync_create_draft_job(uuid, uuid, uuid, uuid, uuid, text, text) to authenticated;

revoke execute on function public.servsync_update_draft_job(uuid, uuid, uuid, uuid, uuid, uuid, text, text) from public;
revoke execute on function public.servsync_update_draft_job(uuid, uuid, uuid, uuid, uuid, uuid, text, text) from anon;
grant execute on function public.servsync_update_draft_job(uuid, uuid, uuid, uuid, uuid, uuid, text, text) to authenticated;

revoke execute on function public.servsync_upsert_draft_job_scope(uuid, jsonb) from public;
revoke execute on function public.servsync_upsert_draft_job_scope(uuid, jsonb) from anon;
grant execute on function public.servsync_upsert_draft_job_scope(uuid, jsonb) to authenticated;

revoke execute on function public.servsync_activate_draft_job(uuid, text) from public;
revoke execute on function public.servsync_activate_draft_job(uuid, text) from anon;
grant execute on function public.servsync_activate_draft_job(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
