-- ServSync durable Draft inspection-checklist path.
-- Paste into the Supabase SQL Editor only after explicit sandbox SQL approval.
--
-- Apply after:
--   1. servsync-durable-draft-launch-foundation.sql
--   2. servsync-home-specific-inspection-templates.sql
--
-- This additive source permits the gated durable Draft backend to store one
-- bounded Inspection Checklist snapshot and launch exactly one operational Job
-- with checklist/report structure. It does not apply itself to any environment,
-- enable Draft/Work gates, create findings before Job launch, create PDFs,
-- notify homeowners, create invoices, schedule appointments, or change rollout.

begin;

alter table public.contractor_work_drafts
  add column if not exists checklist_source jsonb;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
      from pg_constraint
     where conrelid = 'public.contractor_work_drafts'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%work_format%'
  loop
    execute format('alter table public.contractor_work_drafts drop constraint %I', v_constraint.conname);
  end loop;
end
$$;

alter table public.contractor_work_drafts
  add constraint contractor_work_drafts_work_format_check
  check (work_format in ('standard', 'inspection_checklist'));

alter table public.contractor_work_drafts
  drop constraint if exists contractor_work_drafts_checklist_source_check;

alter table public.contractor_work_drafts
  add constraint contractor_work_drafts_checklist_source_check
  check (
    (
      work_format = 'standard'
      and checklist_source is null
    )
    or (
      work_format = 'inspection_checklist'
      and intended_output = 'job'
      and checklist_source is not null
      and jsonb_typeof(checklist_source) = 'object'
    )
  );

create or replace function public.servsync_private_work_draft_checklist_source(
  p_source jsonb,
  p_draft public.contractor_work_drafts
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source_kind text;
  v_source_id text;
  v_source_uuid uuid;
  v_template public.inspection_templates;
  v_room jsonb;
  v_item jsonb;
  v_room_count integer := 0;
  v_item_count integer := 0;
  v_source_updated_at text;
begin
  if p_source is null or jsonb_typeof(p_source) <> 'object' then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end if;

  if (select array_agg(key order by key) from jsonb_object_keys(p_source) key) <> array[
    'job_type',
    'rooms',
    'schema_version',
    'snapshot_fingerprint',
    'source_id',
    'source_kind',
    'source_label',
    'source_updated_at',
    'workflow_kind'
  ] then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end if;

  v_source_kind := p_source->>'source_kind';
  v_source_id := nullif(trim(coalesce(p_source->>'source_id', '')), '');
  v_source_updated_at := p_source->>'source_updated_at';

  if (p_source->>'schema_version') <> '1'
    or v_source_kind not in ('starter_inspection_checklist', 'contractor_inspection_checklist', 'home_inspection_checklist')
    or v_source_id is null
    or nullif(trim(coalesce(p_source->>'source_label', '')), '') is null
    or (p_source->>'workflow_kind') not in ('inspection', 'maintenance', 'assessment')
    or (p_source->>'job_type') not in ('inspection', 'maintenance_visit')
    or nullif(trim(coalesce(p_source->>'snapshot_fingerprint', '')), '') is null
    or jsonb_typeof(p_source->'rooms') <> 'array' then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end if;

  for v_room in select value from jsonb_array_elements(p_source->'rooms')
  loop
    v_room_count := v_room_count + 1;
    if jsonb_typeof(v_room) <> 'object'
      or nullif(trim(coalesce(v_room->>'room', '')), '') is null
      or nullif(trim(coalesce(v_room->>'room_id', '')), '') is null
      or nullif(trim(coalesce(v_room->>'display_name', '')), '') is null
      or jsonb_typeof(v_room->'items') <> 'array'
      or jsonb_array_length(v_room->'items') = 0 then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    for v_item in select value from jsonb_array_elements(v_room->'items')
    loop
      v_item_count := v_item_count + 1;
      if jsonb_typeof(v_item) <> 'string'
        or nullif(trim(v_item #>> '{}'), '') is null then
        raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
      end if;
    end loop;
  end loop;

  if v_room_count = 0 or v_item_count = 0 or v_room_count > 80 or v_item_count > 800 then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end if;

  if v_source_kind = 'starter_inspection_checklist' then
    if v_source_id !~ '^starter-[a-z0-9-]+-field-work$' then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    return p_source;
  end if;

  v_source_uuid := public.servsync_private_work_draft_uuid(v_source_id, 'DRAFT_CHECKLIST_SOURCE_INVALID');

  select *
    into v_template
    from public.inspection_templates
   where id = v_source_uuid
     and contractor_id = p_draft.contractor_id
     and archived_at is null;

  if v_template.id is null then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end if;

  if v_source_kind = 'contractor_inspection_checklist' and coalesce(v_template.scope, 'contractor') <> 'contractor' then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end if;

  if v_source_kind = 'home_inspection_checklist' then
    if coalesce(v_template.scope, 'contractor') <> 'home' then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    if p_draft.subject_type = 'connected_homeowner' and not (
      (v_template.homeowner_user_id is not null and v_template.homeowner_user_id = p_draft.homeowner_user_id)
      or (v_template.home_id is not null and v_template.home_id = p_draft.home_id)
    ) then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    if p_draft.subject_type = 'local_contact' and not (
      (v_template.local_contact_id is not null and v_template.local_contact_id = p_draft.local_contact_id)
      or (v_template.local_home_id is not null and v_template.local_home_id = p_draft.local_home_id)
    ) then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
  end if;

  begin
    if v_source_updated_at is not null
      and v_template.updated_at is not null
      and v_source_updated_at::timestamptz <> v_template.updated_at then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_CHANGED';
    end if;
  exception
    when invalid_datetime_format then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end;

  if p_source->'rooms' <> v_template.rooms then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_CHANGED';
  end if;

  return p_source;
end;
$$;

create or replace function public.servsync_private_checklist_source_to_rooms_with_findings(
  p_source jsonb
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'room', room_value->>'room',
      'room_id', room_value->>'room_id',
      'display_name', room_value->>'display_name',
      'room_type', coalesce(room_value->>'room_type', ''),
      'location_note', coalesce(room_value->>'location_note', ''),
      'reference_photo_storage_path', '',
      'sort_order', coalesce((room_value->>'sort_order')::integer, room_index - 1),
      'last_edited_by', '',
      'last_edited_at', '',
      'findings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'title', item_value #>> '{}',
          'status', 'Pass',
          'notes', '',
          'action', '',
          'due', '',
          'photos', '[]'::jsonb
        ) order by item_index), '[]'::jsonb)
        from jsonb_array_elements(room_value->'items') with ordinality item(item_value, item_index)
      )
    )
    order by coalesce((room_value->>'sort_order')::integer, room_index - 1), room_index
  ), '[]'::jsonb)
  from jsonb_array_elements(p_source->'rooms') with ordinality room(room_value, room_index);
$$;

create or replace function public.servsync_save_inspection_checklist_work_draft(
  p_draft_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_removed_item_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved jsonb;
  v_draft_id uuid;
  v_draft public.contractor_work_drafts;
  v_source jsonb;
begin
  if p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or coalesce(nullif(trim(coalesce(p_metadata->>'work_format', '')), ''), 'standard') <> 'inspection_checklist'
    or coalesce(nullif(trim(coalesce(p_metadata->>'intended_output', '')), ''), '') <> 'job'
    or p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) <> 0 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  v_saved := public.servsync_save_work_draft(
    p_draft_id,
    (p_metadata - 'checklist_source') || jsonb_build_object('work_format', 'standard', 'intended_output', 'job'),
    '[]'::jsonb,
    p_removed_item_ids
  );
  v_draft_id := (v_saved->'draft'->>'id')::uuid;

  select *
    into v_draft
    from public.contractor_work_drafts
   where id = v_draft_id
   for update;

  if v_draft.id is null or v_draft.status <> 'active' then
    raise exception using message = 'DRAFT_NOT_ACTIVE';
  end if;

  v_source := public.servsync_private_work_draft_checklist_source(p_metadata->'checklist_source', v_draft);

  delete from public.contractor_work_draft_items
   where draft_id = v_draft.id
     and contractor_id = v_draft.contractor_id;

  update public.contractor_work_drafts
     set work_format = 'inspection_checklist',
         checklist_source = v_source,
         labor_mode = null,
         labor_rate_cents = null,
         job_labor_hours = null,
         updated_at = now()
   where id = v_draft.id;

  return public.servsync_get_work_draft(v_draft.id);
end;
$$;

create or replace function public.servsync_launch_inspection_checklist_work_draft(
  p_draft_id uuid,
  p_intended_output text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.contractor_work_drafts;
  v_existing_launch public.contractor_work_draft_launches;
  v_conflicting_launch public.contractor_work_draft_launches;
  v_output_type text := nullif(trim(coalesce(p_intended_output, '')), '');
  v_job_id uuid;
  v_launch_id uuid;
  v_source jsonb;
  v_template_id uuid;
  v_constraint_name text;
begin
  if auth.uid() is null then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  if p_draft_id is null then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  if p_idempotency_key is null then
    raise exception using message = 'IDEMPOTENCY_CONFLICT';
  end if;

  if v_output_type <> 'job' then
    raise exception using message = 'UNSUPPORTED_OUTPUT';
  end if;

  select *
    into v_draft
    from public.contractor_work_drafts
   where id = p_draft_id
   for update;

  if v_draft.id is null or not (
    public.current_user_can_access_contractor(v_draft.contractor_id)
    or public.current_user_is_platform_admin()
  ) then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_draft.contractor_id::text || ':' || p_idempotency_key::text, 0)
  );

  select *
    into v_conflicting_launch
    from public.contractor_work_draft_launches
   where contractor_id = v_draft.contractor_id
     and idempotency_key = p_idempotency_key
     and draft_id <> v_draft.id
   limit 1;

  if v_conflicting_launch.id is not null then
    raise exception using message = 'IDEMPOTENCY_CONFLICT';
  end if;

  select *
    into v_existing_launch
    from public.contractor_work_draft_launches
   where draft_id = v_draft.id
     and contractor_id = v_draft.contractor_id
     and status = 'succeeded'
   order by created_at asc
   limit 1;

  if v_existing_launch.id is not null then
    return jsonb_build_object(
      'draft_id', v_draft.id,
      'status', case when v_existing_launch.idempotency_key = p_idempotency_key then 'succeeded' else 'already_consumed' end,
      'output_type', v_existing_launch.requested_output,
      'estimate_id', null,
      'job_id', v_existing_launch.launched_job_id,
      'output_id_snapshot', v_existing_launch.launched_job_id_snapshot,
      'output_available', v_existing_launch.launched_job_id is not null,
      'launch_id', v_existing_launch.id,
      'idempotent', v_existing_launch.idempotency_key = p_idempotency_key
    );
  end if;

  if v_draft.status <> 'active' then
    raise exception using message = 'DRAFT_NOT_ACTIVE';
  end if;

  if v_draft.intended_output <> 'job'
    or v_draft.work_format <> 'inspection_checklist'
    or trim(coalesce(v_draft.title, '')) = ''
    or (v_draft.homeowner_user_id is null and v_draft.local_contact_id is null)
    or exists (
      select 1
        from public.contractor_work_draft_items item
       where item.draft_id = v_draft.id
         and item.contractor_id = v_draft.contractor_id
    ) then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  v_source := public.servsync_private_work_draft_checklist_source(v_draft.checklist_source, v_draft);

  perform public.servsync_private_validate_work_draft_relationships(v_draft, 'job');

  if v_draft.service_request_id is not null
    and exists (
      select 1
        from public.inspections job
       where job.contractor_id = v_draft.contractor_id
         and job.service_request_id = v_draft.service_request_id
         and job.job_status <> 'cancelled'
         and not (
           job.id = v_draft.legacy_inspection_id
           and job.job_origin = 'draft_composer'
           and job.status = 'draft'
           and job.job_status = 'draft'
         )
    ) then
    raise exception using message = 'LAUNCH_CONFLICT';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_draft.contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  if v_source->>'source_kind' in ('contractor_inspection_checklist', 'home_inspection_checklist') then
    v_template_id := (v_source->>'source_id')::uuid;
  end if;

  begin
    insert into public.inspections (
      contractor_id,
      homeowner_user_id,
      home_id,
      local_contact_id,
      local_home_id,
      service_request_id,
      template_id,
      name,
      summary,
      status,
      job_type,
      job_status,
      job_origin,
      rooms_with_findings
    ) values (
      v_draft.contractor_id,
      v_draft.homeowner_user_id,
      v_draft.home_id,
      v_draft.local_contact_id,
      v_draft.local_home_id,
      v_draft.service_request_id,
      v_template_id,
      coalesce(nullif(trim(v_draft.title), ''), 'Inspection Checklist Job from Draft'),
      trim(coalesce(v_draft.scope_description, '')),
      'draft',
      v_source->>'job_type',
      'draft',
      'direct',
      public.servsync_private_checklist_source_to_rooms_with_findings(v_source)
    )
    returning id into v_job_id;
  exception
    when raise_exception then
      if sqlerrm = 'JOB_SERVICE_REQUEST_CONFLICT' then
        raise exception using message = 'LAUNCH_CONFLICT';
      end if;
      raise;
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'inspections_unique_operational_service_request_idx' then
        raise exception using message = 'LAUNCH_CONFLICT';
      end if;
      raise;
  end;

  insert into public.contractor_work_draft_launches (
    draft_id,
    contractor_id,
    idempotency_key,
    requested_output,
    status,
    launched_estimate_id,
    launched_job_id,
    launched_estimate_id_snapshot,
    launched_job_id_snapshot,
    requested_by_user_id,
    completed_at
  ) values (
    v_draft.id,
    v_draft.contractor_id,
    p_idempotency_key,
    'job',
    'succeeded',
    null,
    v_job_id,
    null,
    v_job_id,
    auth.uid(),
    now()
  )
  returning id into v_launch_id;

  update public.contractor_work_drafts
     set status = 'consumed',
         launched_output_type = 'job',
         launched_estimate_id = null,
         launched_job_id = v_job_id,
         launched_estimate_id_snapshot = null,
         launched_job_id_snapshot = v_job_id,
         launched_at = now(),
         launched_by_user_id = auth.uid(),
         updated_at = now()
   where id = v_draft.id;

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'status', 'succeeded',
    'output_type', 'job',
    'estimate_id', null,
    'job_id', v_job_id,
    'output_id_snapshot', v_job_id,
    'output_available', true,
    'launch_id', v_launch_id,
    'idempotent', true
  );
end;
$$;

revoke execute on function public.servsync_save_inspection_checklist_work_draft(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.servsync_save_inspection_checklist_work_draft(uuid, jsonb, jsonb, jsonb) from anon;
grant execute on function public.servsync_save_inspection_checklist_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated;

revoke execute on function public.servsync_launch_inspection_checklist_work_draft(uuid, text, uuid) from public;
revoke execute on function public.servsync_launch_inspection_checklist_work_draft(uuid, text, uuid) from anon;
grant execute on function public.servsync_launch_inspection_checklist_work_draft(uuid, text, uuid) to authenticated;

revoke execute on function public.servsync_private_work_draft_checklist_source(jsonb, public.contractor_work_drafts) from public;
revoke execute on function public.servsync_private_work_draft_checklist_source(jsonb, public.contractor_work_drafts) from anon;
revoke execute on function public.servsync_private_work_draft_checklist_source(jsonb, public.contractor_work_drafts) from authenticated;

revoke execute on function public.servsync_private_checklist_source_to_rooms_with_findings(jsonb) from public;
revoke execute on function public.servsync_private_checklist_source_to_rooms_with_findings(jsonb) from anon;
revoke execute on function public.servsync_private_checklist_source_to_rooms_with_findings(jsonb) from authenticated;

comment on column public.contractor_work_drafts.checklist_source is
  'Bounded contractor-private Inspection Checklist Draft source snapshot. Unapplied until explicit SQL approval.';

comment on function public.servsync_save_inspection_checklist_work_draft(uuid, jsonb, jsonb, jsonb) is
  'Saves checklist-oriented durable Drafts without line items. Requires explicit SQL application before use.';

comment on function public.servsync_launch_inspection_checklist_work_draft(uuid, text, uuid) is
  'Launches one active inspection-checklist durable Draft as one operational checklist/report Job with idempotency.';

notify pgrst, 'reload schema';

commit;
