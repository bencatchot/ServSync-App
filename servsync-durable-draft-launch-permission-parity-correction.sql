-- ServSync durable Draft launch permission-parity correction.
-- Apply only to an environment that already installed foundation SQL SHA-256
-- cafa9260e379f561a12dbeff66d705685bb8200ebf39edc980935da5c25ae185.
-- Fresh environments should apply the corrected canonical foundation SQL instead.

begin;

do $$
begin
  if to_regclass('public.contractor_work_drafts') is null
    or to_regclass('public.contractor_work_draft_items') is null
    or to_regclass('public.contractor_work_draft_launches') is null
    or to_regprocedure('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.current_user_can_manage_contractor_billing(uuid)') is null
    or to_regprocedure('public.current_user_can_write_contractor_jobs(uuid)') is null then
    raise exception 'SLICE_2B_PERMISSION_PARITY_PREREQUISITE_MISSING';
  end if;
end;
$$;

create or replace function public.servsync_private_can_persist_work_draft(
  p_contractor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_contractor_id is not null
    and (
      public.current_user_can_manage_contractor_billing(p_contractor_id)
      or public.current_user_can_write_contractor_jobs(p_contractor_id)
    );
$$;

create or replace function public.servsync_save_work_draft(
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
  v_contractor_id uuid;
  v_existing public.contractor_work_drafts;
  v_request public.service_requests;
  v_home public.homes;
  v_homeowner public.profiles;
  v_local_contact public.contractor_local_contacts;
  v_local_home public.contractor_local_homes;
  v_legacy public.inspections;
  v_draft_id uuid := p_draft_id;
  v_homeowner_user_id uuid;
  v_home_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_service_request_id uuid;
  v_legacy_inspection_id uuid;
  v_subject_type text;
  v_subject_display_name_snapshot text;
  v_property_display_snapshot text := '';
  v_intended_output text;
  v_work_format text;
  v_labor_mode text;
  v_labor_rate_cents integer;
  v_job_labor_hours numeric;
  v_item jsonb;
  v_item_id uuid;
  v_item_ids uuid[] := array[]::uuid[];
  v_removed_ids uuid[] := array[]::uuid[];
  v_removed_value jsonb;
  v_removed_id uuid;
  v_title text;
  v_line_type text;
  v_quantity numeric;
  v_unit_price_cents integer;
  v_labor_hours numeric;
  v_sort_order integer;
  v_saved_line_total bigint := 0;
  v_saved_schema_labor_total bigint := 0;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if p_removed_item_ids is null or jsonb_typeof(p_removed_item_ids) <> 'array' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  -- Metadata is a complete Draft snapshot. Missing optional values clear to null/empty.
  v_homeowner_user_id := public.servsync_private_work_draft_uuid(p_metadata->>'homeowner_user_id');
  v_home_id := public.servsync_private_work_draft_uuid(p_metadata->>'home_id');
  v_local_contact_id := public.servsync_private_work_draft_uuid(p_metadata->>'local_contact_id');
  v_local_home_id := public.servsync_private_work_draft_uuid(p_metadata->>'local_home_id');
  v_service_request_id := public.servsync_private_work_draft_uuid(p_metadata->>'service_request_id');
  v_legacy_inspection_id := public.servsync_private_work_draft_uuid(p_metadata->>'legacy_inspection_id', 'LEGACY_DRAFT_INCOMPATIBLE');
  v_intended_output := nullif(trim(coalesce(p_metadata->>'intended_output', '')), '');
  v_work_format := coalesce(nullif(trim(coalesce(p_metadata->>'work_format', '')), ''), 'standard');
  v_labor_mode := nullif(trim(coalesce(p_metadata->>'labor_mode', '')), '');
  v_labor_rate_cents := public.servsync_private_work_draft_integer(p_metadata->>'labor_rate_cents');
  v_job_labor_hours := public.servsync_private_work_draft_numeric(p_metadata->>'job_labor_hours');

  select id
    into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if not public.servsync_private_can_persist_work_draft(v_contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  if v_intended_output is not null and v_intended_output not in ('estimate', 'job') then
    raise exception using message = 'UNSUPPORTED_OUTPUT';
  end if;

  if v_work_format <> 'standard' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_labor_mode is not null and v_labor_mode not in ('job_total', 'line_specific') then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_labor_rate_cents is not null and v_labor_rate_cents < 0 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_job_labor_hours is not null and (
    v_job_labor_hours < 0
    or v_job_labor_hours > 999999.99
    or v_job_labor_hours <> round(v_job_labor_hours, 2)
  ) then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_job_labor_hours is not null
    and v_labor_rate_cents is not null
    and round(v_job_labor_hours * v_labor_rate_cents) > 2147483647 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if p_draft_id is not null then
    select *
      into v_existing
      from public.contractor_work_drafts
     where id = p_draft_id
     for update;

    if v_existing.id is null then
      raise exception using message = 'DRAFT_NOT_FOUND';
    end if;

    if v_existing.contractor_id <> v_contractor_id then
      raise exception using message = 'DRAFT_PERMISSION_DENIED';
    end if;

    if v_existing.status <> 'active' then
      raise exception using message = 'DRAFT_NOT_ACTIVE';
    end if;

    if v_existing.legacy_inspection_id is not null then
      if v_legacy_inspection_id is null then
        v_legacy_inspection_id := v_existing.legacy_inspection_id;
      elsif v_legacy_inspection_id <> v_existing.legacy_inspection_id then
        raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
      end if;
    end if;
  end if;

  if v_homeowner_user_id is not null and (
    v_local_contact_id is not null
    or v_local_home_id is not null
  ) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_local_contact_id is not null and (
    v_homeowner_user_id is not null
    or v_home_id is not null
    or v_service_request_id is not null
  ) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_service_request_id is not null then
    select *
      into v_request
      from public.service_requests
     where id = v_service_request_id
       and contractor_id = v_contractor_id;

    if v_request.id is null then
      raise exception using message = 'SERVICE_REQUEST_INVALID';
    end if;

    if v_homeowner_user_id is null then
      v_homeowner_user_id := v_request.homeowner_user_id;
    elsif v_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception using message = 'SERVICE_REQUEST_INVALID';
    end if;

    if v_request.home_id is not null then
      if v_home_id is null then
        v_home_id := v_request.home_id;
      elsif v_home_id <> v_request.home_id then
        raise exception using message = 'SERVICE_REQUEST_INVALID';
      end if;
    end if;
  end if;

  if v_home_id is not null then
    select *
      into v_home
      from public.homes
     where id = v_home_id;

    if v_home.id is null then
      raise exception using message = 'PROPERTY_INVALID';
    end if;

    if v_homeowner_user_id is null then
      v_homeowner_user_id := v_home.homeowner_user_id;
    elsif v_homeowner_user_id <> v_home.homeowner_user_id then
      raise exception using message = 'PROPERTY_INVALID';
    end if;
  end if;

  if v_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = v_homeowner_user_id
       and status = 'active'
  ) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_homeowner_user_id is not null then
    select *
      into v_homeowner
      from public.profiles
     where id = v_homeowner_user_id;

    if v_homeowner.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    v_subject_type := 'connected_homeowner';
    v_subject_display_name_snapshot := coalesce(
      nullif(trim(v_homeowner.full_name), ''),
      nullif(trim(v_homeowner.email), ''),
      'Connected homeowner'
    );
    if v_home.id is not null then
      v_property_display_snapshot := coalesce(
        nullif(trim(concat_ws(', ', nullif(v_home.nickname, ''), nullif(v_home.address_line1, ''), nullif(v_home.city, ''), nullif(v_home.state, ''))), ''),
        'Selected property'
      );
    end if;
  end if;

  if v_local_home_id is not null then
    select *
      into v_local_home
      from public.contractor_local_homes
     where id = v_local_home_id
       and contractor_id = v_contractor_id;

    if v_local_home.id is null then
      raise exception using message = 'PROPERTY_INVALID';
    end if;

    if v_local_contact_id is null then
      v_local_contact_id := v_local_home.local_contact_id;
    elsif v_local_contact_id <> v_local_home.local_contact_id then
      raise exception using message = 'PROPERTY_INVALID';
    end if;
  end if;

  if v_local_contact_id is not null then
    select *
      into v_local_contact
      from public.contractor_local_contacts
     where id = v_local_contact_id
       and contractor_id = v_contractor_id;

    if v_local_contact.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    v_subject_type := 'local_contact';
    v_subject_display_name_snapshot := coalesce(
      nullif(trim(v_local_contact.display_name), ''),
      nullif(trim(v_local_contact.email), ''),
      nullif(trim(v_local_contact.phone), ''),
      'Local customer'
    );
    if v_local_home.id is not null then
      v_property_display_snapshot := coalesce(
        nullif(trim(concat_ws(', ', nullif(v_local_home.nickname, ''), nullif(v_local_home.address_line1, ''), nullif(v_local_home.city, ''), nullif(v_local_home.state, ''))), ''),
        'Selected property'
      );
    end if;
  end if;

  if (v_homeowner_user_id is null and v_local_contact_id is null)
    or (v_homeowner_user_id is not null and v_local_contact_id is not null) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_legacy_inspection_id is not null then
    select *
      into v_legacy
      from public.inspections
     where id = v_legacy_inspection_id
       and contractor_id = v_contractor_id
     for update;

    if v_legacy.id is null
      or v_legacy.job_origin <> 'draft_composer'
      or v_legacy.status <> 'draft'
      or v_legacy.job_status <> 'draft' then
      raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
    end if;

    if exists (
      select 1
        from public.contractor_work_drafts draft
       where draft.legacy_inspection_id = v_legacy_inspection_id
         and draft.id <> coalesce(v_draft_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
    end if;
  end if;

  if v_draft_id is null then
    insert into public.contractor_work_drafts (
      contractor_id,
      created_by_user_id,
      homeowner_user_id,
      home_id,
      local_contact_id,
      local_home_id,
      service_request_id,
      subject_type,
      subject_display_name_snapshot,
      property_display_snapshot,
      title,
      scope_description,
      private_notes,
      intended_output,
      work_format,
      labor_mode,
      labor_rate_cents,
      job_labor_hours,
      legacy_inspection_id
    ) values (
      v_contractor_id,
      auth.uid(),
      v_homeowner_user_id,
      case when v_homeowner_user_id is not null then v_home_id else null end,
      v_local_contact_id,
      case when v_local_contact_id is not null then v_local_home_id else null end,
      case when v_homeowner_user_id is not null then v_service_request_id else null end,
      v_subject_type,
      v_subject_display_name_snapshot,
      v_property_display_snapshot,
      trim(coalesce(p_metadata->>'title', '')),
      trim(coalesce(p_metadata->>'scope_description', '')),
      coalesce(p_metadata->>'private_notes', ''),
      v_intended_output,
      v_work_format,
      v_labor_mode,
      v_labor_rate_cents,
      v_job_labor_hours,
      v_legacy_inspection_id
    )
    returning id into v_draft_id;
  else
    update public.contractor_work_drafts
       set homeowner_user_id = v_homeowner_user_id,
           home_id = case when v_homeowner_user_id is not null then v_home_id else null end,
           local_contact_id = v_local_contact_id,
           local_home_id = case when v_local_contact_id is not null then v_local_home_id else null end,
           service_request_id = case when v_homeowner_user_id is not null then v_service_request_id else null end,
           subject_type = v_subject_type,
           subject_display_name_snapshot = v_subject_display_name_snapshot,
           property_display_snapshot = v_property_display_snapshot,
           title = trim(coalesce(p_metadata->>'title', '')),
           scope_description = trim(coalesce(p_metadata->>'scope_description', '')),
           private_notes = coalesce(p_metadata->>'private_notes', ''),
           intended_output = v_intended_output,
           work_format = v_work_format,
           labor_mode = v_labor_mode,
           labor_rate_cents = v_labor_rate_cents,
           job_labor_hours = v_job_labor_hours,
           legacy_inspection_id = v_legacy_inspection_id,
           updated_at = now()
     where id = v_draft_id;
  end if;

  -- Validate all IDs before any item mutation so malformed or mixed requests fail atomically.
  for v_removed_value in select value from jsonb_array_elements(p_removed_item_ids)
  loop
    if jsonb_typeof(v_removed_value) <> 'string' then
      raise exception using message = 'DRAFT_INVALID';
    end if;
    v_removed_id := public.servsync_private_work_draft_uuid(v_removed_value #>> '{}');
    if v_removed_id is null or v_removed_id = any(v_removed_ids) then
      raise exception using message = 'DRAFT_INVALID';
    end if;
    v_removed_ids := array_append(v_removed_ids, v_removed_id);
  end loop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using message = 'DRAFT_INVALID';
    end if;
    v_item_id := public.servsync_private_work_draft_uuid(v_item->>'id');
    if v_item_id is not null then
      if v_item_id = any(v_item_ids) or v_item_id = any(v_removed_ids) then
        raise exception using message = 'DRAFT_INVALID';
      end if;
      v_item_ids := array_append(v_item_ids, v_item_id);
    end if;
  end loop;

  if cardinality(v_removed_ids) > 0 and (
    select count(*)
      from public.contractor_work_draft_items item
     where item.draft_id = v_draft_id
       and item.contractor_id = v_contractor_id
       and item.id = any(v_removed_ids)
  ) <> cardinality(v_removed_ids) then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if cardinality(v_removed_ids) > 0 then
    delete from public.contractor_work_draft_items
     where draft_id = v_draft_id
       and contractor_id = v_contractor_id
       and id = any(v_removed_ids);
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := public.servsync_private_work_draft_uuid(v_item->>'id');

    if v_item_id is not null then
      if not exists (
        select 1
          from public.contractor_work_draft_items
       where id = v_item_id
         and draft_id = v_draft_id
         and contractor_id = v_contractor_id
      ) then
        raise exception using message = 'DRAFT_INVALID';
      end if;
    end if;

    v_title := nullif(trim(coalesce(v_item->>'title', '')), '');
    v_line_type := coalesce(nullif(trim(coalesce(v_item->>'line_type', '')), ''), 'labor');
    v_quantity := coalesce(public.servsync_private_work_draft_numeric(v_item->>'quantity'), 1);
    v_unit_price_cents := public.servsync_private_work_draft_integer(v_item->>'unit_price_cents');
    v_labor_hours := public.servsync_private_work_draft_numeric(v_item->>'labor_hours');
    v_sort_order := coalesce(public.servsync_private_work_draft_integer(v_item->>'sort_order'), 0);

    if v_title is null then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_line_type not in ('labor', 'material', 'fee', 'other')
      or v_quantity <= 0
      or v_quantity > 9999999999.99
      or v_quantity <> round(v_quantity, 2) then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_unit_price_cents is not null and v_unit_price_cents < 0 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_labor_hours is not null and (
      v_labor_hours < 0
      or v_labor_hours > 999999.99
      or v_labor_hours <> round(v_labor_hours, 2)
    ) then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_sort_order < 0 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_unit_price_cents is not null
      and round(v_quantity * v_unit_price_cents) > 2147483647 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_labor_hours is not null
      and v_labor_rate_cents is not null
      and round(v_labor_hours * v_labor_rate_cents) > 2147483647 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_labor_mode = 'line_specific'
      and v_labor_hours is not null
      and v_labor_hours > 0
      and v_line_type not in ('material', 'other') then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_item_id is null then
      insert into public.contractor_work_draft_items (
        draft_id,
        contractor_id,
        title,
        description,
        customer_description,
        internal_notes,
        line_type,
        quantity,
        unit,
        unit_price_cents,
        labor_hours,
        room_id,
        room_label,
        location_label,
        sort_order
      ) values (
        v_draft_id,
        v_contractor_id,
        v_title,
        coalesce(v_item->>'description', ''),
        coalesce(v_item->>'customer_description', ''),
        coalesce(v_item->>'internal_notes', ''),
        v_line_type,
        v_quantity,
        coalesce(nullif(trim(coalesce(v_item->>'unit', '')), ''), 'each'),
        v_unit_price_cents,
        v_labor_hours,
        nullif(trim(coalesce(v_item->>'room_id', '')), ''),
        nullif(trim(coalesce(v_item->>'room_label', '')), ''),
        nullif(trim(coalesce(v_item->>'location_label', '')), ''),
        v_sort_order
      );
    else
      update public.contractor_work_draft_items
         set title = v_title,
             description = coalesce(v_item->>'description', ''),
             customer_description = coalesce(v_item->>'customer_description', ''),
             internal_notes = coalesce(v_item->>'internal_notes', ''),
             line_type = v_line_type,
             quantity = v_quantity,
             unit = coalesce(nullif(trim(coalesce(v_item->>'unit', '')), ''), 'each'),
             unit_price_cents = v_unit_price_cents,
             labor_hours = v_labor_hours,
             room_id = nullif(trim(coalesce(v_item->>'room_id', '')), ''),
             room_label = nullif(trim(coalesce(v_item->>'room_label', '')), ''),
             location_label = nullif(trim(coalesce(v_item->>'location_label', '')), ''),
             sort_order = v_sort_order,
             updated_at = now()
       where id = v_item_id
         and draft_id = v_draft_id
         and contractor_id = v_contractor_id;
    end if;
  end loop;

  select coalesce(sum(round(item.quantity * coalesce(item.unit_price_cents, 0))), 0)::bigint
    into v_saved_line_total
    from public.contractor_work_draft_items item
   where item.draft_id = v_draft_id
     and item.contractor_id = v_contractor_id;

  if v_labor_rate_cents is not null then
    if v_labor_mode = 'job_total' then
      v_saved_schema_labor_total := round(coalesce(v_job_labor_hours, 0) * v_labor_rate_cents)::bigint;
    elsif v_labor_mode = 'line_specific' then
      select coalesce(sum(round(coalesce(item.labor_hours, 0) * v_labor_rate_cents)), 0)::bigint
        into v_saved_schema_labor_total
        from public.contractor_work_draft_items item
       where item.draft_id = v_draft_id
         and item.contractor_id = v_contractor_id
         and item.line_type in ('material', 'other');
    end if;
  end if;

  if v_saved_line_total > 2147483647
    or v_saved_schema_labor_total > 2147483647
    or v_saved_line_total + v_saved_schema_labor_total > 2147483647 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  return public.servsync_get_work_draft(v_draft_id);
end;
$$;


revoke all on function public.servsync_private_can_persist_work_draft(uuid) from public;
revoke all on function public.servsync_private_can_persist_work_draft(uuid) from anon;
revoke all on function public.servsync_private_can_persist_work_draft(uuid) from authenticated;

revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from anon;
grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on function public.servsync_private_can_persist_work_draft(uuid) is
  'Compatibility capability union for contractor Draft planning. Persistence is allowed through existing billing-management or Job-write authority; output launch remains separately authorized.';

notify pgrst, 'reload schema';

commit;
