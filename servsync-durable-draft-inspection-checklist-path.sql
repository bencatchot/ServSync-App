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

create or replace function public.servsync_private_canonical_starter_checklist_source(
  p_source_id text
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $function$
begin
  case p_source_id
    when 'starter-general-maintenance-field-work' then return $starter${"schema_version":1,"source_kind":"starter_inspection_checklist","source_id":"starter-general-maintenance-field-work","source_label":"General Home Inspection / Home Maintenance Walkthrough","workflow_kind":"inspection","job_type":"inspection","source_updated_at":null,"rooms":[{"room":"Exterior","room_id":"Exterior","display_name":"Exterior","room_type":"","location_note":"","sort_order":0,"items":["Check exterior siding and trim for damage","Check foundation for visible cracks or movement","Check grading and drainage near the home","Check exterior caulking, gaps, and penetrations","Check decks, porches, steps, and trip hazards"]},{"room":"Roof / Attic","room_id":"Roof / Attic","display_name":"Roof / Attic","room_type":"","location_note":"","sort_order":1,"items":["Check visible roof covering condition","Check flashing, vents, and roof penetrations","Check gutters and downspouts for blockage or damage","Check attic for moisture, staining, or ventilation concerns","Check visible pest evidence where accessible"]},{"room":"Mechanical / Safety","room_id":"Mechanical / Safety","display_name":"Mechanical / Safety","room_type":"","location_note":"","sort_order":2,"items":["Check HVAC filter and visible airflow","Check electrical panel for visible concerns","Check GFCI protection where accessible","Check smoke/CO detectors if accessible","Check water heater area for leaks or corrosion"]},{"room":"Kitchen","room_id":"Kitchen","display_name":"Kitchen","room_type":"","location_note":"","sort_order":3,"items":["Check for active leaks under sinks","Check sink, faucet, and drain operation","Check cabinets, counters, and visible surfaces for damage","Check major appliances for visible concerns","Check kitchen GFCI protection where accessible"]},{"room":"Living Room / Common Areas","room_id":"Living Room / Common Areas","display_name":"Living Room / Common Areas","room_type":"","location_note":"","sort_order":4,"items":["Check walls, ceilings, and floors for visible damage","Check doors and windows for operation","Check outlets and switches for visible damage","Check light fixtures and ceiling fans","Check trip hazards or safety concerns"]},{"room":"Dining Room","room_id":"Dining Room","display_name":"Dining Room","room_type":"","location_note":"","sort_order":5,"items":["Check walls, ceilings, and floors for visible damage","Check doors and windows for operation","Check outlets and switches for visible damage","Check light fixtures and ceiling fans","Check trip hazards or safety concerns"]},{"room":"Primary Bedroom","room_id":"Primary Bedroom","display_name":"Primary Bedroom","room_type":"","location_note":"","sort_order":6,"items":["Check walls, ceilings, and floors for visible damage","Check doors and windows for operation","Check outlets and switches for visible damage","Check light fixtures and ceiling fans","Check smoke/CO detectors if accessible"]},{"room":"Bedroom 2","room_id":"Bedroom 2","display_name":"Bedroom 2","room_type":"","location_note":"","sort_order":7,"items":["Check walls, ceilings, and floors for visible damage","Check doors and windows for operation","Check outlets and switches for visible damage","Check light fixtures and ceiling fans","Check smoke/CO detectors if accessible"]},{"room":"Bedroom 3","room_id":"Bedroom 3","display_name":"Bedroom 3","room_type":"","location_note":"","sort_order":8,"items":["Check walls, ceilings, and floors for visible damage","Check doors and windows for operation","Check outlets and switches for visible damage","Check light fixtures and ceiling fans","Check smoke/CO detectors if accessible"]},{"room":"Primary Bathroom","room_id":"Primary Bathroom","display_name":"Primary Bathroom","room_type":"","location_note":"","sort_order":9,"items":["Check sink, toilet, tub/shower, and drains","Check for active leaks or moisture concerns","Check caulk, grout, walls, ceilings, and flooring","Check exhaust fan or ventilation","Check bathroom GFCI protection where accessible"]},{"room":"Bathroom 2","room_id":"Bathroom 2","display_name":"Bathroom 2","room_type":"","location_note":"","sort_order":10,"items":["Check sink, toilet, tub/shower, and drains","Check for active leaks or moisture concerns","Check caulk, grout, walls, ceilings, and flooring","Check exhaust fan or ventilation","Check bathroom GFCI protection where accessible"]},{"room":"Laundry","room_id":"Laundry","display_name":"Laundry","room_type":"","location_note":"","sort_order":11,"items":["Check washer supply and drain connections","Check dryer vent material, routing, and termination","Check for leaks, moisture, or floor damage","Check laundry GFCI protection where accessible","Check ventilation and appliance clearance"]},{"room":"Garage","room_id":"Garage","display_name":"Garage","room_type":"","location_note":"","sort_order":12,"items":["Check garage door operation and safety concerns","Check garage walls, ceilings, and floors for damage","Check outlets, switches, and fixtures for visible concerns","Check storage, clearance, or access limitations"]},{"room":"Basement / Crawlspace","room_id":"Basement / Crawlspace","display_name":"Basement / Crawlspace","room_type":"","location_note":"","sort_order":13,"items":["Check moisture, staining, ventilation, and insulation","Check visible structural, foundation, or framing concerns","Check drainage, sump, vapor barrier, or crawlspace condition","Check visible pest evidence where accessible","Check storage, clearance, or access limitations"]}],"snapshot_fingerprint":"draft-checklist-v1-1a66de9e"}$starter$::jsonb;
    when 'starter-hvac-field-work' then return $starter${"schema_version":1,"source_kind":"starter_inspection_checklist","source_id":"starter-hvac-field-work","source_label":"HVAC Maintenance Inspection","workflow_kind":"inspection","job_type":"inspection","source_updated_at":null,"rooms":[{"room":"Indoor Equipment","room_id":"Indoor Equipment","display_name":"Indoor Equipment","room_type":"","location_note":"","sort_order":0,"items":["Model, serial number, age, and visible condition documented","Air filter size and condition checked","Thermostat operation verified","Blower operation, vibration, and noise checked","Condensate drain and overflow protection checked"]},{"room":"Outdoor Equipment","room_id":"Outdoor Equipment","display_name":"Outdoor Equipment","room_type":"","location_note":"","sort_order":1,"items":["Condenser coil and fins checked","Refrigerant line insulation checked","Clearance around unit verified","Disconnect and visible wiring checked","Unit pad and drainage checked"]},{"room":"Recommendations","room_id":"Recommendations","display_name":"Recommendations","room_type":"","location_note":"","sort_order":2,"items":["Temperature split or performance note recorded","Safety concerns documented","Repair or maintenance recommendation added","Next service interval discussed"]}],"snapshot_fingerprint":"draft-checklist-v1-bd2036de"}$starter$::jsonb;
    when 'starter-electrical-field-work' then return $starter${"schema_version":1,"source_kind":"starter_inspection_checklist","source_id":"starter-electrical-field-work","source_label":"Electrical Safety Check","workflow_kind":"inspection","job_type":"inspection","source_updated_at":null,"rooms":[{"room":"Panel and Power","room_id":"Panel and Power","display_name":"Panel and Power","room_type":"","location_note":"","sort_order":0,"items":["Panel labeling checked","Breaker condition checked for heat, corrosion, or damage","Open knockouts or exposed wiring noted","Grounding and bonding visible where accessible"]},{"room":"Devices and Fixtures","room_id":"Devices and Fixtures","display_name":"Devices and Fixtures","room_type":"","location_note":"","sort_order":1,"items":["GFCI protection tested where required","Switches, outlets, and fixtures checked","Smoke and carbon monoxide detectors noted","Exterior outlets and covers checked"]},{"room":"Repair Notes","room_id":"Repair Notes","display_name":"Repair Notes","room_type":"","location_note":"","sort_order":2,"items":["Homeowner concern documented","Repair or diagnostic work completed","Permit or follow-up recommendation noted","Photos added for homeowner record"]}],"snapshot_fingerprint":"draft-checklist-v1-daeb3a6f"}$starter$::jsonb;
    when 'starter-plumbing-field-work' then return $starter${"schema_version":1,"source_kind":"starter_inspection_checklist","source_id":"starter-plumbing-field-work","source_label":"Plumbing Inspection","workflow_kind":"inspection","job_type":"inspection","source_updated_at":null,"rooms":[{"room":"Water Heater","room_id":"Water Heater","display_name":"Water Heater","room_type":"","location_note":"","sort_order":0,"items":["Tank or equipment condition checked","Visible leaks, corrosion, or staining noted","Pressure relief valve and discharge pipe checked","Venting, clearance, or electrical/gas safety concerns documented"]},{"room":"Fixtures and Supply","room_id":"Fixtures and Supply","display_name":"Fixtures and Supply","room_type":"","location_note":"","sort_order":1,"items":["Faucets, toilets, and visible fixtures checked","Supply valves and connectors checked","Water pressure or flow concerns documented","Visible leaks or moisture at fixtures documented"]},{"room":"Drains and Waste","room_id":"Drains and Waste","display_name":"Drains and Waste","room_type":"","location_note":"","sort_order":2,"items":["Sink, tub, shower, and floor drains checked where accessible","Slow drain, odor, backup, or trap concern documented","Visible drain piping condition checked","Cleanout or access limitations noted"]},{"room":"Recommendations","room_id":"Recommendations","display_name":"Recommendations","room_type":"","location_note":"","sort_order":3,"items":["Repair recommendation added if needed","Urgent leak or safety concern documented","Preventive maintenance recommendation added","Photos added for homeowner record"]}],"snapshot_fingerprint":"draft-checklist-v1-2297354b"}$starter$::jsonb;
    when 'starter-pest-control-field-work' then return $starter${"schema_version":1,"source_kind":"starter_inspection_checklist","source_id":"starter-pest-control-field-work","source_label":"Pest Inspection","workflow_kind":"inspection","job_type":"inspection","source_updated_at":null,"rooms":[{"room":"Exterior Conditions","room_id":"Exterior Conditions","display_name":"Exterior Conditions","room_type":"","location_note":"","sort_order":0,"items":["Entry points, gaps, or penetrations checked","Vegetation, moisture, wood contact, or conducive conditions noted","Nests, trails, droppings, or visible activity documented","Foundation, doors, windows, and utility penetrations checked"]},{"room":"Interior Evidence","room_id":"Interior Evidence","display_name":"Interior Evidence","room_type":"","location_note":"","sort_order":1,"items":["Droppings, damage, staining, or odor evidence documented","Kitchen, pantry, attic, crawlspace, or garage areas checked where accessible","Moisture or food-source conditions noted","Photos added for homeowner record"]},{"room":"Recommendations","room_id":"Recommendations","display_name":"Recommendations","room_type":"","location_note":"","sort_order":2,"items":["Treatment or exclusion recommendation added","Sanitation or moisture-control recommendation added","Follow-up timing documented","Urgent structural or health concern documented"]}],"snapshot_fingerprint":"draft-checklist-v1-b57a1041"}$starter$::jsonb;
    when 'starter-roofing-field-work' then return $starter${"schema_version":1,"source_kind":"starter_inspection_checklist","source_id":"starter-roofing-field-work","source_label":"Roof / Exterior Inspection","workflow_kind":"inspection","job_type":"inspection","source_updated_at":null,"rooms":[{"room":"Roof Covering","room_id":"Roof Covering","display_name":"Roof Covering","room_type":"","location_note":"","sort_order":0,"items":["Roof material and approximate condition documented","Missing, lifted, cracked, damaged, or deteriorated areas noted","Debris, moss, ponding, or surface wear documented","Photos added for notable roof conditions"]},{"room":"Flashing and Penetrations","room_id":"Flashing and Penetrations","display_name":"Flashing and Penetrations","room_type":"","location_note":"","sort_order":1,"items":["Flashing at walls, chimney, valleys, and skylights checked","Pipe boots, vents, and roof penetrations checked","Interior leak concern connected to roof area if known","Urgent water-entry concern documented"]},{"room":"Exterior and Drainage","room_id":"Exterior and Drainage","display_name":"Exterior and Drainage","room_type":"","location_note":"","sort_order":2,"items":["Gutters and downspouts checked for flow, attachment, and extensions","Siding, trim, fascia, soffit, and caulking concerns documented","Grading or drainage concern near structure noted","Repair or maintenance recommendation added"]}],"snapshot_fingerprint":"draft-checklist-v1-97281aa3"}$starter$::jsonb;
    else return null;
  end case;
end;
$function$;

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
  v_canonical_source jsonb;
  v_room_ids text[] := '{}';
  v_room_orders integer[] := '{}';
  v_room_id_key text;
  v_room_order integer;
  v_item_labels text[];
  v_item_label_key text;
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
    if jsonb_typeof(v_room) <> 'object' then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    if (select array_agg(key order by key) from jsonb_object_keys(v_room) key) <> array[
      'display_name',
      'items',
      'location_note',
      'room',
      'room_id',
      'room_type',
      'sort_order'
    ] then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    if nullif(trim(coalesce(v_room->>'room', '')), '') is null
      or nullif(trim(coalesce(v_room->>'room_id', '')), '') is null
      or nullif(trim(coalesce(v_room->>'display_name', '')), '') is null
      or jsonb_typeof(v_room->'sort_order') <> 'number'
      or jsonb_typeof(v_room->'items') <> 'array'
      or jsonb_array_length(v_room->'items') = 0 then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;

    begin
      v_room_order := (v_room->>'sort_order')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end;

    v_room_id_key := lower(regexp_replace(trim(v_room->>'room_id'), '\s+', ' ', 'g'));
    if v_room_id_key = any(v_room_ids) or v_room_order = any(v_room_orders) then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    v_room_ids := array_append(v_room_ids, v_room_id_key);
    v_room_orders := array_append(v_room_orders, v_room_order);
    v_item_labels := '{}';

    for v_item in select value from jsonb_array_elements(v_room->'items')
    loop
      v_item_count := v_item_count + 1;
      if jsonb_typeof(v_item) <> 'string'
        or nullif(trim(v_item #>> '{}'), '') is null then
        raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
      end if;
      v_item_label_key := lower(regexp_replace(trim(v_item #>> '{}'), '\s+', ' ', 'g'));
      if v_item_label_key = any(v_item_labels) then
        raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
      end if;
      v_item_labels := array_append(v_item_labels, v_item_label_key);
    end loop;
  end loop;

  if v_room_count = 0 or v_item_count = 0 or v_room_count > 80 or v_item_count > 800 then
    raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
  end if;

  if v_source_kind = 'starter_inspection_checklist' then
    v_canonical_source := public.servsync_private_canonical_starter_checklist_source(v_source_id);
    if v_canonical_source is null or p_source <> v_canonical_source then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    return v_canonical_source;
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
      v_template.home_id is not null
      and p_draft.home_id is not null
      and v_template.home_id = p_draft.home_id
      and (
        v_template.homeowner_user_id is null
        or v_template.homeowner_user_id = p_draft.homeowner_user_id
      )
    ) then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    if p_draft.subject_type = 'local_contact' and not (
      v_template.local_home_id is not null
      and p_draft.local_home_id is not null
      and v_template.local_home_id = p_draft.local_home_id
      and (
        v_template.local_contact_id is null
        or v_template.local_contact_id = p_draft.local_contact_id
      )
    ) then
      raise exception using message = 'DRAFT_CHECKLIST_SOURCE_INVALID';
    end if;
    if p_draft.subject_type not in ('connected_homeowner', 'local_contact') then
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
          'status', 'Monitor',
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

revoke execute on function public.servsync_private_canonical_starter_checklist_source(text) from public;
revoke execute on function public.servsync_private_canonical_starter_checklist_source(text) from anon;
revoke execute on function public.servsync_private_canonical_starter_checklist_source(text) from authenticated;
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
