-- ServSync durable Draft-to-Invoice launch foundation.
-- Paste into the Supabase SQL Editor only after explicit SQL application approval.
--
-- Apply after:
--   1. servsync-durable-draft-launch-foundation.sql
--   2. servsync-durable-draft-launch-permission-parity-correction.sql
--   3. servsync-durable-draft-inspection-checklist-path.sql
--
-- This additive source extends the durable Draft save/launch backend contract
-- to support one draft Invoice output with lineage and idempotency. It does
-- not expose Draft-to-Invoice UI, route New Invoice into the Draft composer,
-- send invoices, create payments, generate PDFs, notify customers, file Home
-- History, change gates, or enroll contractors.

begin;

create extension if not exists pgcrypto;

do $$
declare
  v_mismatch text;
begin
  with expected(type_name) as (
    values
      ('public.contractor_work_drafts'),
      ('public.contractor_work_draft_launches'),
      ('public.contractor_work_draft_items'),
      ('public.invoices'),
      ('public.invoice_line_items'),
      ('public.estimates'),
      ('public.inspections'),
      ('public.service_requests'),
      ('public.homes'),
      ('public.contractor_local_contacts'),
      ('public.contractor_local_homes'),
      ('public.homeowner_contractor_connections')
  )
  select string_agg(type_name, ', ' order by type_name)
    into v_mismatch
    from expected
   where to_regclass(type_name) is null;

  if v_mismatch is not null then
    raise exception 'DRAFT_TO_INVOICE_FOUNDATION_TABLE_MISMATCH: %', v_mismatch;
  end if;

  with expected(schema_name, function_name, argument_types) as (
    values
      ('auth', 'uid', ''),
      ('public', 'current_user_can_access_contractor', 'uuid'),
      ('public', 'current_user_can_manage_contractor_billing', 'uuid'),
      ('public', 'current_user_can_write_contractor_jobs', 'uuid'),
      ('public', 'current_user_is_platform_admin', ''),
      ('public', 'servsync_current_contractor_profile', ''),
      ('public', 'servsync_get_work_draft', 'uuid'),
      ('public', 'servsync_private_can_persist_work_draft', 'uuid'),
      ('public', 'servsync_private_work_draft_integer', 'text, text'),
      ('public', 'servsync_private_work_draft_numeric', 'text, text'),
      ('public', 'servsync_private_work_draft_uuid', 'text, text')
  ), actual as (
    select
      namespace.nspname as schema_name,
      proc.proname as function_name,
      oidvectortypes(proc.proargtypes) as argument_types,
      count(*) over (partition by namespace.nspname, proc.proname) as overload_count
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where (namespace.nspname, proc.proname) in (
      select expected.schema_name, expected.function_name from expected
    )
  )
  select string_agg(
    format('%I.%I(%s)', expected.schema_name, expected.function_name, expected.argument_types),
    ', '
    order by expected.schema_name, expected.function_name
  )
    into v_mismatch
    from expected
    left join actual
      on actual.schema_name = expected.schema_name
     and actual.function_name = expected.function_name
     and actual.argument_types = expected.argument_types
   where actual.function_name is null
      or actual.overload_count <> 1;

  if v_mismatch is not null then
    raise exception 'DRAFT_TO_INVOICE_FOUNDATION_FUNCTION_MISMATCH: %', v_mismatch;
  end if;

  with expected(table_name, column_name) as (
    values
      ('invoices', 'id'),
      ('invoices', 'contractor_id'),
      ('invoices', 'homeowner_user_id'),
      ('invoices', 'home_id'),
      ('invoices', 'local_contact_id'),
      ('invoices', 'local_home_id'),
      ('invoices', 'service_request_id'),
      ('invoices', 'job_id'),
      ('invoices', 'estimate_id'),
      ('invoices', 'title'),
      ('invoices', 'scope'),
      ('invoices', 'notes'),
      ('invoices', 'terms'),
      ('invoices', 'status'),
      ('invoices', 'invoice_type'),
      ('invoices', 'labor_mode'),
      ('invoices', 'labor_rate_cents'),
      ('invoices', 'job_labor_hours'),
      ('invoices', 'subtotal_cents'),
      ('invoices', 'material_total_cents'),
      ('invoices', 'labor_total_cents'),
      ('invoices', 'fee_total_cents'),
      ('invoices', 'other_total_cents'),
      ('invoices', 'tax_rate_percent'),
      ('invoices', 'tax_cents'),
      ('invoices', 'discount_type'),
      ('invoices', 'discount_value'),
      ('invoices', 'discount_cents'),
      ('invoices', 'discount_reason'),
      ('invoices', 'total_cents'),
      ('invoices', 'amount_paid_cents'),
      ('invoice_line_items', 'invoice_id'),
      ('invoice_line_items', 'line_type'),
      ('invoice_line_items', 'description'),
      ('invoice_line_items', 'line_title'),
      ('invoice_line_items', 'customer_description'),
      ('invoice_line_items', 'quantity'),
      ('invoice_line_items', 'unit'),
      ('invoice_line_items', 'unit_price_cents'),
      ('invoice_line_items', 'labor_hours'),
      ('invoice_line_items', 'sort_order')
  )
  select string_agg(
    format('public.%I.%I', expected.table_name, expected.column_name),
    ', '
    order by expected.table_name, expected.column_name
  )
    into v_mismatch
    from expected
    left join information_schema.columns column_info
      on column_info.table_schema = 'public'
     and column_info.table_name = expected.table_name
     and column_info.column_name = expected.column_name
   where column_info.column_name is null;

  if v_mismatch is not null then
    raise exception 'DRAFT_TO_INVOICE_FOUNDATION_COLUMN_MISMATCH: %', v_mismatch;
  end if;

  if (
    select count(*)
      from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
     where namespace.nspname = 'public'
       and proc.proname in (
         'servsync_save_work_draft',
         'servsync_launch_work_draft',
         'servsync_private_validate_work_draft_relationships'
       )
  ) <> 3 then
    raise exception 'DRAFT_TO_INVOICE_FOUNDATION_OVERLOAD_MISMATCH';
  end if;
end;
$$;

alter table public.contractor_work_drafts
  add column if not exists launched_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists launched_invoice_id_snapshot uuid;

alter table public.contractor_work_draft_launches
  add column if not exists launched_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists launched_invoice_id_snapshot uuid;

alter table public.contractor_work_drafts
  drop constraint if exists contractor_work_drafts_intended_output_check,
  drop constraint if exists contractor_work_drafts_launched_output_type_check,
  drop constraint if exists contractor_work_drafts_launch_state_check;

alter table public.contractor_work_drafts
  add constraint contractor_work_drafts_intended_output_check
  check (intended_output is null or intended_output in ('estimate', 'job', 'invoice')),
  add constraint contractor_work_drafts_launched_output_type_check
  check (launched_output_type is null or launched_output_type in ('estimate', 'job', 'invoice')),
  add constraint contractor_work_drafts_launch_state_check check (
    (
      status in ('active', 'discarded')
      and launched_output_type is null
      and launched_estimate_id is null
      and launched_job_id is null
      and launched_invoice_id is null
      and launched_estimate_id_snapshot is null
      and launched_job_id_snapshot is null
      and launched_invoice_id_snapshot is null
      and launched_at is null
      and launched_by_user_id is null
    )
    or (
      status = 'consumed'
      and launched_output_type is not null
      and launched_at is not null
      and (
        (
          launched_output_type = 'estimate'
          and launched_estimate_id_snapshot is not null
          and launched_job_id_snapshot is null
          and launched_invoice_id_snapshot is null
          and launched_job_id is null
          and launched_invoice_id is null
          and (launched_estimate_id is null or launched_estimate_id = launched_estimate_id_snapshot)
        )
        or (
          launched_output_type = 'job'
          and launched_job_id_snapshot is not null
          and launched_estimate_id_snapshot is null
          and launched_invoice_id_snapshot is null
          and launched_estimate_id is null
          and launched_invoice_id is null
          and (launched_job_id is null or launched_job_id = launched_job_id_snapshot)
        )
        or (
          launched_output_type = 'invoice'
          and launched_invoice_id_snapshot is not null
          and launched_estimate_id_snapshot is null
          and launched_job_id_snapshot is null
          and launched_estimate_id is null
          and launched_job_id is null
          and (launched_invoice_id is null or launched_invoice_id = launched_invoice_id_snapshot)
        )
      )
    )
  );

alter table public.contractor_work_draft_launches
  drop constraint if exists contractor_work_draft_launches_requested_output_check,
  drop constraint if exists contractor_work_draft_launches_status_linkage_check;

alter table public.contractor_work_draft_launches
  add constraint contractor_work_draft_launches_requested_output_check
  check (requested_output in ('estimate', 'job', 'invoice')),
  add constraint contractor_work_draft_launches_status_linkage_check check (
    completed_at is not null
    and (
      (
        requested_output = 'estimate'
        and launched_estimate_id_snapshot is not null
        and launched_job_id_snapshot is null
        and launched_invoice_id_snapshot is null
        and launched_job_id is null
        and launched_invoice_id is null
        and (launched_estimate_id is null or launched_estimate_id = launched_estimate_id_snapshot)
      )
      or (
        requested_output = 'job'
        and launched_job_id_snapshot is not null
        and launched_estimate_id_snapshot is null
        and launched_invoice_id_snapshot is null
        and launched_estimate_id is null
        and launched_invoice_id is null
        and (launched_job_id is null or launched_job_id = launched_job_id_snapshot)
      )
      or (
        requested_output = 'invoice'
        and launched_invoice_id_snapshot is not null
        and launched_estimate_id_snapshot is null
        and launched_job_id_snapshot is null
        and launched_estimate_id is null
        and launched_job_id is null
        and (launched_invoice_id is null or launched_invoice_id = launched_invoice_id_snapshot)
      )
    )
  );

create unique index if not exists contractor_work_draft_launches_invoice_output_unique_idx
  on public.contractor_work_draft_launches(launched_invoice_id)
  where status = 'succeeded' and launched_invoice_id is not null;

create unique index if not exists contractor_work_draft_launches_invoice_snapshot_unique_idx
  on public.contractor_work_draft_launches(launched_invoice_id_snapshot)
  where status = 'succeeded' and launched_invoice_id_snapshot is not null;

create or replace function public.servsync_private_can_create_work_draft_invoice(
  p_contractor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_contractor_id is not null
    and public.servsync_private_can_persist_work_draft(p_contractor_id)
    and public.current_user_can_manage_contractor_billing(p_contractor_id);
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

  if v_intended_output is not null and v_intended_output not in ('estimate', 'job', 'invoice') then
    raise exception using message = 'UNSUPPORTED_OUTPUT';
  end if;

  if v_work_format <> 'standard' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_intended_output = 'invoice'
    and not public.servsync_private_can_create_work_draft_invoice(v_contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
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

create or replace function public.servsync_private_validate_work_draft_relationships(
  p_draft public.contractor_work_drafts,
  p_requested_output text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_connection public.homeowner_contractor_connections;
  v_shared_property public.connection_shared_properties;
  v_home public.homes;
  v_local_contact public.contractor_local_contacts;
  v_local_home public.contractor_local_homes;
  v_request_authorizes_home boolean := false;
begin
  if p_requested_output not in ('estimate', 'job', 'invoice') then
    raise exception using message = 'UNSUPPORTED_OUTPUT';
  end if;

  if p_draft.homeowner_user_id is not null then
    if p_draft.local_contact_id is not null or p_draft.local_home_id is not null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    if p_draft.service_request_id is not null then
      select *
        into v_request
        from public.service_requests request
       where request.id = p_draft.service_request_id
         and request.contractor_id = p_draft.contractor_id
       for share;

      if v_request.id is null
        or v_request.homeowner_user_id <> p_draft.homeowner_user_id
        or (v_request.home_id is not null and v_request.home_id is distinct from p_draft.home_id) then
        raise exception using message = 'SERVICE_REQUEST_INVALID';
      end if;

      v_request_authorizes_home := v_request.home_id is not null
        and v_request.home_id = p_draft.home_id;
    end if;

    select *
      into v_connection
      from public.homeowner_contractor_connections connection
     where connection.contractor_id = p_draft.contractor_id
       and connection.homeowner_user_id = p_draft.homeowner_user_id
       and connection.status = 'active'
     for share;

    if v_connection.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    if p_requested_output in ('job', 'invoice')
      and p_draft.home_id is not null
      and not v_request_authorizes_home then
      select *
        into v_shared_property
        from public.connection_shared_properties shared_property
       where shared_property.connection_id = v_connection.id
         and shared_property.home_id = p_draft.home_id
       for share;

      if v_shared_property.id is null then
        raise exception using message = 'PROPERTY_NOT_SHARED';
      end if;
    end if;

    if p_draft.home_id is not null then
      select *
        into v_home
        from public.homes home
       where home.id = p_draft.home_id
         and home.homeowner_user_id = p_draft.homeowner_user_id
       for share;

      if v_home.id is null then
        raise exception using message = 'PROPERTY_INVALID';
      end if;
    end if;

    if not exists (
      select 1 from public.profiles profile where profile.id = p_draft.homeowner_user_id
    ) then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;
  elsif p_draft.local_contact_id is not null then
    if p_draft.home_id is not null or p_draft.service_request_id is not null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    select *
      into v_local_contact
      from public.contractor_local_contacts contact
     where contact.id = p_draft.local_contact_id
       and contact.contractor_id = p_draft.contractor_id
     for share;

    if v_local_contact.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    if p_draft.local_home_id is not null then
      select *
        into v_local_home
        from public.contractor_local_homes home
       where home.id = p_draft.local_home_id
         and home.contractor_id = p_draft.contractor_id
         and home.local_contact_id = p_draft.local_contact_id
       for share;

      if v_local_home.id is null then
        raise exception using message = 'PROPERTY_INVALID';
      end if;
    end if;
  else
    raise exception using message = 'CUSTOMER_INVALID';
  end if;
end;
$$;

create or replace function public.servsync_private_launch_work_draft_as_invoice(
  p_draft public.contractor_work_drafts
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_material_total bigint := 0;
  v_labor_line_total bigint := 0;
  v_schema_labor_total bigint := 0;
  v_fee_total bigint := 0;
  v_other_total bigint := 0;
  v_subtotal bigint := 0;
begin
  if not public.servsync_private_can_create_work_draft_invoice(p_draft.contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  select
    coalesce(sum(case when line_type = 'material' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::bigint,
    coalesce(sum(case when line_type = 'labor' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::bigint,
    coalesce(sum(case when line_type = 'fee' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::bigint,
    coalesce(sum(case when line_type = 'other' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::bigint
    into v_material_total, v_labor_line_total, v_fee_total, v_other_total
    from public.contractor_work_draft_items
   where draft_id = p_draft.id
     and contractor_id = p_draft.contractor_id;

  if p_draft.labor_rate_cents is not null then
    if p_draft.labor_mode = 'job_total' and p_draft.job_labor_hours is not null then
      v_schema_labor_total := round(p_draft.job_labor_hours * p_draft.labor_rate_cents)::bigint;
    elsif p_draft.labor_mode = 'line_specific' then
      select coalesce(sum(round(coalesce(labor_hours, 0) * p_draft.labor_rate_cents)), 0)::bigint
        into v_schema_labor_total
        from public.contractor_work_draft_items
       where draft_id = p_draft.id
         and contractor_id = p_draft.contractor_id
         and line_type in ('material', 'other');
    end if;
  end if;

  v_subtotal := v_material_total + v_labor_line_total + v_schema_labor_total + v_fee_total + v_other_total;

  if greatest(v_material_total, v_labor_line_total + v_schema_labor_total, v_fee_total, v_other_total, v_subtotal) > 2147483647 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  insert into public.invoices (
    contractor_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    job_id,
    estimate_id,
    invoice_type,
    title,
    scope,
    notes,
    terms,
    labor_mode,
    labor_rate_cents,
    job_labor_hours,
    material_total_cents,
    labor_total_cents,
    fee_total_cents,
    other_total_cents,
    status,
    subtotal_cents,
    tax_rate_percent,
    tax_cents,
    discount_cents,
    discount_type,
    discount_value,
    discount_reason,
    total_cents,
    amount_paid_cents
  ) values (
    p_draft.contractor_id,
    p_draft.homeowner_user_id,
    p_draft.home_id,
    p_draft.local_contact_id,
    p_draft.local_home_id,
    p_draft.service_request_id,
    null,
    null,
    'total',
    coalesce(nullif(trim(p_draft.title), ''), 'Draft invoice'),
    trim(coalesce(p_draft.scope_description, '')),
    '',
    'Payment is due upon receipt unless otherwise agreed in writing.',
    p_draft.labor_mode,
    p_draft.labor_rate_cents,
    p_draft.job_labor_hours,
    v_material_total,
    v_labor_line_total + v_schema_labor_total,
    v_fee_total,
    v_other_total,
    'draft',
    v_subtotal,
    0,
    0,
    0,
    'none',
    0,
    '',
    v_subtotal,
    0
  )
  returning id into v_invoice_id;

  insert into public.invoice_line_items (
    invoice_id,
    line_type,
    description,
    line_title,
    customer_description,
    labor_hours,
    quantity,
    unit,
    unit_price_cents,
    sort_order
  )
  select
    v_invoice_id,
    item.line_type,
    coalesce(nullif(trim(item.description), ''), item.title),
    item.title,
    nullif(trim(item.customer_description), ''),
    case when item.line_type in ('material', 'other') then item.labor_hours else null end,
    item.quantity,
    item.unit,
    coalesce(item.unit_price_cents, 0),
    row_number() over (order by item.sort_order asc, item.created_at asc, item.id asc) - 1
  from public.contractor_work_draft_items item
  where item.draft_id = p_draft.id
    and item.contractor_id = p_draft.contractor_id
  order by item.sort_order asc, item.created_at asc, item.id asc;

  return v_invoice_id;
end;
$$;

create or replace function public.servsync_launch_work_draft(
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
  v_estimate_id uuid;
  v_job_id uuid;
  v_invoice_id uuid;
  v_launch_id uuid;
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

  if v_output_type is null then
    raise exception using message = 'INTENDED_OUTPUT_REQUIRED';
  end if;

  if v_output_type not in ('estimate', 'job', 'invoice') then
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
      'estimate_id', v_existing_launch.launched_estimate_id,
      'job_id', v_existing_launch.launched_job_id,
      'invoice_id', v_existing_launch.launched_invoice_id,
      'output_id_snapshot', case
        when v_existing_launch.requested_output = 'estimate' then v_existing_launch.launched_estimate_id_snapshot
        when v_existing_launch.requested_output = 'job' then v_existing_launch.launched_job_id_snapshot
        else v_existing_launch.launched_invoice_id_snapshot
      end,
      'output_available', case
        when v_existing_launch.requested_output = 'estimate' then v_existing_launch.launched_estimate_id is not null
        when v_existing_launch.requested_output = 'job' then v_existing_launch.launched_job_id is not null
        else v_existing_launch.launched_invoice_id is not null
      end,
      'launch_id', v_existing_launch.id,
      'idempotent', v_existing_launch.idempotency_key = p_idempotency_key
    );
  end if;

  if v_draft.status = 'discarded' then
    raise exception using message = 'DRAFT_NOT_ACTIVE';
  end if;

  if v_draft.status = 'consumed' then
    if v_draft.launched_output_type is not null
      and (
        (
          v_draft.launched_output_type = 'estimate'
          and v_draft.launched_estimate_id_snapshot is not null
          and v_draft.launched_job_id_snapshot is null
          and v_draft.launched_invoice_id_snapshot is null
        )
        or (
          v_draft.launched_output_type = 'job'
          and v_draft.launched_job_id_snapshot is not null
          and v_draft.launched_estimate_id_snapshot is null
          and v_draft.launched_invoice_id_snapshot is null
        )
        or (
          v_draft.launched_output_type = 'invoice'
          and v_draft.launched_invoice_id_snapshot is not null
          and v_draft.launched_estimate_id_snapshot is null
          and v_draft.launched_job_id_snapshot is null
        )
      ) then
      return jsonb_build_object(
        'draft_id', v_draft.id,
        'status', 'already_consumed',
        'output_type', v_draft.launched_output_type,
        'estimate_id', v_draft.launched_estimate_id,
        'job_id', v_draft.launched_job_id,
        'invoice_id', v_draft.launched_invoice_id,
        'output_id_snapshot', case
          when v_draft.launched_output_type = 'estimate' then v_draft.launched_estimate_id_snapshot
          when v_draft.launched_output_type = 'job' then v_draft.launched_job_id_snapshot
          else v_draft.launched_invoice_id_snapshot
        end,
        'output_available', case
          when v_draft.launched_output_type = 'estimate' then v_draft.launched_estimate_id is not null
          when v_draft.launched_output_type = 'job' then v_draft.launched_job_id is not null
          else v_draft.launched_invoice_id is not null
        end,
        'launch_id', null,
        'idempotent', false
      );
    end if;
    raise exception using message = 'DRAFT_ALREADY_CONSUMED';
  end if;

  if v_draft.intended_output is null then
    raise exception using message = 'INTENDED_OUTPUT_REQUIRED';
  end if;

  if v_draft.intended_output <> v_output_type then
    raise exception using message = 'INTENDED_OUTPUT_MISMATCH';
  end if;

  if v_draft.work_format <> 'standard' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if trim(coalesce(v_draft.title, '')) = '' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_draft.homeowner_user_id is null and v_draft.local_contact_id is null then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if not exists (
    select 1
      from public.contractor_work_draft_items item
     where item.draft_id = v_draft.id
       and item.contractor_id = v_draft.contractor_id
  ) then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  perform public.servsync_private_validate_work_draft_relationships(v_draft, v_output_type);

  if v_output_type = 'job'
    and v_draft.service_request_id is not null
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

  if v_output_type = 'estimate' then
    if not public.servsync_private_can_create_work_draft_estimate(v_draft.contractor_id) then
      raise exception using message = 'DRAFT_PERMISSION_DENIED';
    end if;
    v_estimate_id := public.servsync_private_launch_work_draft_as_estimate(v_draft);
  elsif v_output_type = 'job' then
    if not public.current_user_can_write_contractor_jobs(v_draft.contractor_id) then
      raise exception using message = 'DRAFT_PERMISSION_DENIED';
    end if;
    begin
      v_job_id := public.servsync_private_launch_work_draft_as_job(v_draft);
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
  else
    if not public.servsync_private_can_create_work_draft_invoice(v_draft.contractor_id) then
      raise exception using message = 'DRAFT_PERMISSION_DENIED';
    end if;
    v_invoice_id := public.servsync_private_launch_work_draft_as_invoice(v_draft);
  end if;

  insert into public.contractor_work_draft_launches (
    draft_id,
    contractor_id,
    idempotency_key,
    requested_output,
    status,
    launched_estimate_id,
    launched_job_id,
    launched_invoice_id,
    launched_estimate_id_snapshot,
    launched_job_id_snapshot,
    launched_invoice_id_snapshot,
    requested_by_user_id,
    completed_at
  ) values (
    v_draft.id,
    v_draft.contractor_id,
    p_idempotency_key,
    v_output_type,
    'succeeded',
    v_estimate_id,
    v_job_id,
    v_invoice_id,
    v_estimate_id,
    v_job_id,
    v_invoice_id,
    auth.uid(),
    now()
  )
  returning id into v_launch_id;

  update public.contractor_work_drafts
     set status = 'consumed',
         launched_output_type = v_output_type,
         launched_estimate_id = v_estimate_id,
         launched_job_id = v_job_id,
         launched_invoice_id = v_invoice_id,
         launched_estimate_id_snapshot = v_estimate_id,
         launched_job_id_snapshot = v_job_id,
         launched_invoice_id_snapshot = v_invoice_id,
         launched_at = now(),
         launched_by_user_id = auth.uid(),
         updated_at = now()
   where id = v_draft.id;

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'status', 'succeeded',
    'output_type', v_output_type,
    'estimate_id', v_estimate_id,
    'job_id', v_job_id,
    'invoice_id', v_invoice_id,
    'output_id_snapshot', coalesce(v_estimate_id, v_job_id, v_invoice_id),
    'output_available', true,
    'launch_id', v_launch_id,
    'idempotent', false
  );
end;
$$;

revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from anon;
grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated;

revoke execute on function public.servsync_launch_work_draft(uuid, text, uuid) from public;
revoke execute on function public.servsync_launch_work_draft(uuid, text, uuid) from anon;
grant execute on function public.servsync_launch_work_draft(uuid, text, uuid) to authenticated;

revoke all on function public.servsync_private_can_create_work_draft_invoice(uuid) from public;
revoke all on function public.servsync_private_can_create_work_draft_invoice(uuid) from anon;
revoke all on function public.servsync_private_can_create_work_draft_invoice(uuid) from authenticated;

revoke all on function public.servsync_private_launch_work_draft_as_invoice(public.contractor_work_drafts) from public;
revoke all on function public.servsync_private_launch_work_draft_as_invoice(public.contractor_work_drafts) from anon;
revoke all on function public.servsync_private_launch_work_draft_as_invoice(public.contractor_work_drafts) from authenticated;

revoke all on function public.servsync_private_validate_work_draft_relationships(public.contractor_work_drafts, text) from public;
revoke all on function public.servsync_private_validate_work_draft_relationships(public.contractor_work_drafts, text) from anon;
revoke all on function public.servsync_private_validate_work_draft_relationships(public.contractor_work_drafts, text) from authenticated;

comment on column public.contractor_work_drafts.launched_invoice_id is
  'Live draft Invoice output pointer for consumed durable Work Drafts. ON DELETE SET NULL preserves consumed recovery.';
comment on column public.contractor_work_drafts.launched_invoice_id_snapshot is
  'Immutable Invoice output snapshot for consumed durable Work Draft recovery when the live invoice is deleted.';
comment on column public.contractor_work_draft_launches.launched_invoice_id is
  'Live draft Invoice output pointer recorded by the durable Work Draft launch ledger.';
comment on column public.contractor_work_draft_launches.launched_invoice_id_snapshot is
  'Immutable Invoice output snapshot recorded by the durable Work Draft launch ledger.';
comment on function public.servsync_private_launch_work_draft_as_invoice(public.contractor_work_drafts) is
  'Private helper that launches a standard durable Work Draft into exactly one draft Invoice without send/payment/PDF/notification/customer-facing side effects.';

notify pgrst, 'reload schema';

commit;
