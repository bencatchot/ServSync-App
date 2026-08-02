-- ServSync FB-024 Price Book Repeat-Import Reconciliation v1.
-- Apply after:
--   1. servsync-contractor-saved-estimate-charges.sql
--   2. servsync-contractor-price-book-items.sql
--   3. servsync-integration-foundation.sql
--   4. servsync-price-book-organization-foundation.sql
--
-- This adds tenant-owned file-import sources, immutable row-level import audit,
-- deterministic preview/matching, and one idempotent transactional execute RPC.
-- It does not upload or retain raw files, perform rollback, call a provider,
-- enable scheduled sync, or expose private external-object mappings to browsers.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.contractor_price_book_items') is null then
    raise exception 'Missing required table public.contractor_price_book_items.';
  end if;
  if to_regclass('public.external_object_mappings') is null then
    raise exception 'Missing required table public.external_object_mappings.';
  end if;
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'contractor_price_book_items'
       and column_name = 'subcategory'
  ) then
    raise exception 'Missing required column public.contractor_price_book_items.subcategory.';
  end if;
  if to_regprocedure('public.current_user_can_manage_contractor_estimate_settings(uuid)') is null then
    raise exception 'Missing required helper public.current_user_can_manage_contractor_estimate_settings(uuid).';
  end if;
  if to_regprocedure('public.servsync_current_contractor_profile()') is null then
    raise exception 'Missing required helper public.servsync_current_contractor_profile().';
  end if;
  if to_regprocedure('public.touch_updated_at()') is null then
    raise exception 'Missing required trigger helper public.touch_updated_at().';
  end if;
end;
$$;

create table if not exists public.contractor_price_book_import_sources (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  source_kind text not null default 'file_upload',
  display_name text not null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_price_book_import_sources_kind_check
    check (source_kind = 'file_upload'),
  constraint contractor_price_book_import_sources_name_check
    check (length(trim(display_name)) between 1 and 120),
  constraint contractor_price_book_import_sources_status_check
    check (status in ('active', 'archived'))
);

comment on table public.contractor_price_book_import_sources is
  'Private tenant-owned stable identities for provider-neutral Price Book file imports. Display names and filenames are not reconciliation keys.';

create unique index if not exists contractor_price_book_import_sources_name_uidx
  on public.contractor_price_book_import_sources(contractor_id, lower(trim(display_name)));

create index if not exists contractor_price_book_import_sources_contractor_idx
  on public.contractor_price_book_import_sources(contractor_id, status, created_at desc);

drop trigger if exists contractor_price_book_import_sources_touch_updated_at
  on public.contractor_price_book_import_sources;
create trigger contractor_price_book_import_sources_touch_updated_at
  before update on public.contractor_price_book_import_sources
  for each row execute function public.touch_updated_at();

create table if not exists public.contractor_price_book_import_batches (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  import_source_id uuid not null references public.contractor_price_book_import_sources(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null,
  status text not null default 'building',
  original_filename text not null,
  file_sha256 text not null,
  file_size_bytes integer not null,
  mapping_snapshot jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  add_count integer not null default 0,
  update_count integer not null default 0,
  skip_count integer not null default 0,
  error_count integer not null default 0,
  result_summary jsonb not null default '{}'::jsonb,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contractor_price_book_import_batches_status_check
    check (status in ('building', 'completed')),
  constraint contractor_price_book_import_batches_completion_check
    check (
      (status = 'building' and completed_at is null)
      or (status = 'completed' and completed_at is not null)
    ),
  constraint contractor_price_book_import_batches_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint contractor_price_book_import_batches_file_hash_check
    check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint contractor_price_book_import_batches_file_size_check
    check (file_size_bytes between 1 and 1048576),
  constraint contractor_price_book_import_batches_filename_check
    check (length(original_filename) between 1 and 180),
  constraint contractor_price_book_import_batches_counts_check
    check (
      row_count >= 0 and add_count >= 0 and update_count >= 0
      and skip_count >= 0 and error_count >= 0
      and add_count + update_count + skip_count = row_count
    )
);

comment on table public.contractor_price_book_import_batches is
  'Private immutable execution summaries for Price Book reconciliation. Raw files and raw unsupported cells are never retained.';

create unique index if not exists contractor_price_book_import_batches_idempotency_uidx
  on public.contractor_price_book_import_batches(contractor_id, idempotency_key);

create index if not exists contractor_price_book_import_batches_history_idx
  on public.contractor_price_book_import_batches(contractor_id, created_at desc);

create index if not exists contractor_price_book_import_batches_source_idx
  on public.contractor_price_book_import_batches(import_source_id, created_at desc);

create or replace function public.servsync_private_protect_price_book_import_batch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'building' or new.status <> 'completed' then
    raise exception 'Completed Price Book import batches are immutable.';
  end if;
  if new.id is distinct from old.id
     or new.contractor_id is distinct from old.contractor_id
     or new.import_source_id is distinct from old.import_source_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_hash is distinct from old.request_hash
     or new.original_filename is distinct from old.original_filename
     or new.file_sha256 is distinct from old.file_sha256
     or new.file_size_bytes is distinct from old.file_size_bytes
     or new.mapping_snapshot is distinct from old.mapping_snapshot
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Price Book import batch identity and request evidence are immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists contractor_price_book_import_batches_protect
  on public.contractor_price_book_import_batches;
create trigger contractor_price_book_import_batches_protect
  before update on public.contractor_price_book_import_batches
  for each row execute function public.servsync_private_protect_price_book_import_batch();

create table if not exists public.contractor_price_book_import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.contractor_price_book_import_batches(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  external_item_id text,
  sku text,
  row_fingerprint text not null,
  requested_action text not null,
  applied_action text not null,
  match_type text not null,
  match_confidence text not null,
  target_price_book_item_id uuid,
  external_mapping_id uuid,
  mapped_fields text[] not null default '{}'::text[],
  before_patch jsonb not null default '{}'::jsonb,
  after_patch jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  outcome text not null,
  created_at timestamptz not null default now(),
  constraint contractor_price_book_import_batch_rows_external_id_check
    check (external_item_id is null or length(trim(external_item_id)) between 1 and 200),
  constraint contractor_price_book_import_batch_rows_fingerprint_check
    check (row_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint contractor_price_book_import_batch_rows_action_check
    check (requested_action in ('add', 'update', 'skip') and applied_action in ('add', 'update', 'skip')),
  constraint contractor_price_book_import_batch_rows_match_check
    check (match_type in ('none', 'external_id', 'sku_suggestion', 'exact_duplicate', 'ambiguous')),
  constraint contractor_price_book_import_batch_rows_confidence_check
    check (match_confidence in ('none', 'low', 'medium', 'high')),
  constraint contractor_price_book_import_batch_rows_outcome_check
    check (outcome in ('created', 'updated', 'skipped')),
  constraint contractor_price_book_import_batch_rows_batch_row_unique
    unique (batch_id, row_number)
);

comment on table public.contractor_price_book_import_batch_rows is
  'Append-only sanitized row outcomes and minimal touched-field before/after patches for later reviewed rollback support.';

create index if not exists contractor_price_book_import_batch_rows_target_idx
  on public.contractor_price_book_import_batch_rows(contractor_id, target_price_book_item_id, created_at desc)
  where target_price_book_item_id is not null;

create index if not exists contractor_price_book_import_batch_rows_batch_idx
  on public.contractor_price_book_import_batch_rows(batch_id, row_number);

create or replace function public.servsync_private_protect_price_book_import_batch_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_batch_contractor_id uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Price Book import row audit is append-only.';
  end if;
  select batch.contractor_id into v_batch_contractor_id
    from public.contractor_price_book_import_batches batch
   where batch.id = new.batch_id;
  if v_batch_contractor_id is null or v_batch_contractor_id <> new.contractor_id then
    raise exception 'Price Book import row contractor does not match its batch.';
  end if;
  return new;
end;
$$;

drop trigger if exists contractor_price_book_import_batch_rows_protect
  on public.contractor_price_book_import_batch_rows;
create trigger contractor_price_book_import_batch_rows_protect
  before insert or update on public.contractor_price_book_import_batch_rows
  for each row execute function public.servsync_private_protect_price_book_import_batch_row();

alter table public.contractor_price_book_import_sources enable row level security;
alter table public.contractor_price_book_import_batches enable row level security;
alter table public.contractor_price_book_import_batch_rows enable row level security;

revoke all privileges on table public.contractor_price_book_import_sources from public, anon, authenticated;
revoke all privileges on table public.contractor_price_book_import_batches from public, anon, authenticated;
revoke all privileges on table public.contractor_price_book_import_batch_rows from public, anon, authenticated;

create or replace function public.servsync_private_price_book_import_contractor_id()
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select cp.id
    into v_contractor_id
    from public.servsync_current_contractor_profile() cp
   limit 1;

  if v_contractor_id is null
     or not public.current_user_can_manage_contractor_estimate_settings(v_contractor_id) then
    return null;
  end if;

  return v_contractor_id;
end;
$$;

create or replace function public.servsync_private_price_book_item_values(
  p_item public.contractor_price_book_items
)
returns jsonb
language sql
set search_path = public
immutable
as $$
  select jsonb_build_object(
    'title', p_item.title,
    'customer_description', p_item.customer_description,
    'internal_notes', p_item.internal_notes,
    'trade', p_item.trade,
    'category', p_item.category,
    'subcategory', p_item.subcategory,
    'line_type', p_item.line_type,
    'unit', p_item.unit,
    'default_unit_price_cents', p_item.default_unit_price_cents,
    'taxable', p_item.taxable,
    'labor_hours', p_item.labor_hours,
    'sku', p_item.sku,
    'active', p_item.active
  );
$$;

create or replace function public.servsync_private_price_book_import_merge(
  p_current jsonb,
  p_baseline jsonb,
  p_incoming jsonb,
  p_mapped_fields text[]
)
returns jsonb
language plpgsql
set search_path = public
immutable
as $$
declare
  v_result jsonb := coalesce(p_current, '{}'::jsonb);
  v_changes jsonb := '{}'::jsonb;
  v_conflicts text[] := '{}'::text[];
  v_changed_fields text[] := '{}'::text[];
  v_field text;
  v_current jsonb;
  v_baseline jsonb;
  v_incoming jsonb;
begin
  foreach v_field in array coalesce(p_mapped_fields, '{}'::text[]) loop
    v_current := p_current -> v_field;
    v_baseline := p_baseline -> v_field;
    v_incoming := p_incoming -> v_field;

    if p_baseline ? v_field then
      if v_incoming is not distinct from v_baseline then
        continue;
      elsif v_current is not distinct from v_baseline then
        v_result := jsonb_set(v_result, array[v_field], coalesce(v_incoming, 'null'::jsonb), true);
        v_changes := jsonb_set(v_changes, array[v_field], coalesce(v_incoming, 'null'::jsonb), true);
        v_changed_fields := array_append(v_changed_fields, v_field);
      elsif v_current is not distinct from v_incoming then
        v_changes := jsonb_set(v_changes, array[v_field], coalesce(v_incoming, 'null'::jsonb), true);
        v_changed_fields := array_append(v_changed_fields, v_field);
      else
        v_conflicts := array_append(v_conflicts, v_field);
      end if;
    elsif v_current is not distinct from v_incoming then
      v_changes := jsonb_set(v_changes, array[v_field], coalesce(v_incoming, 'null'::jsonb), true);
      v_changed_fields := array_append(v_changed_fields, v_field);
    else
      v_conflicts := array_append(v_conflicts, v_field);
    end if;
  end loop;

  return jsonb_build_object(
    'result_values', v_result,
    'change_patch', v_changes,
    'changed_fields', to_jsonb(v_changed_fields),
    'conflict_fields', to_jsonb(v_conflicts)
  );
end;
$$;

create or replace function public.servsync_private_preview_price_book_import(
  p_contractor_id uuid,
  p_import_source_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_source public.contractor_price_book_import_sources%rowtype;
  v_row jsonb;
  v_values jsonb;
  v_mapped_fields text[];
  v_allowed_fields constant text[] := array[
    'title', 'customer_description', 'internal_notes', 'trade', 'category',
    'subcategory', 'line_type', 'unit', 'default_unit_price_cents', 'taxable',
    'labor_hours', 'sku', 'active'
  ];
  v_errors jsonb;
  v_warnings jsonb;
  v_row_number integer;
  v_external_item_id text;
  v_duplicate_external_count integer;
  v_duplicate_row_number_count integer;
  v_mapping public.external_object_mappings%rowtype;
  v_item public.contractor_price_book_items%rowtype;
  v_candidate_count integer;
  v_existing_target_mapping_count integer;
  v_current_values jsonb;
  v_baseline_values jsonb;
  v_result_values jsonb;
  v_merge jsonb;
  v_match_type text;
  v_match_confidence text;
  v_recommended_action text;
  v_allowed_actions jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_title text;
  v_sku text;
  v_fingerprint text;
begin
  if p_contractor_id is null or p_import_source_id is null then
    raise exception 'Price Book import source is required.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Price Book import rows must be a JSON array.';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'Price Book imports require between 1 and 500 rows.';
  end if;
  if length(p_rows::text) > 4194304 then
    raise exception 'Normalized Price Book import rows are too large.';
  end if;

  select * into v_source
    from public.contractor_price_book_import_sources
   where id = p_import_source_id
     and contractor_id = p_contractor_id
     and status = 'active';
  if not found then
    raise exception 'Price Book import source is unavailable.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_errors := '[]'::jsonb;
    v_warnings := '[]'::jsonb;
    v_row_number := nullif(v_row ->> 'row_number', '')::integer;
    v_external_item_id := nullif(trim(v_row ->> 'external_item_id'), '');
    v_values := coalesce(v_row -> 'values', '{}'::jsonb);
    select coalesce(array_agg(value order by value), '{}'::text[])
      into v_mapped_fields
      from jsonb_array_elements_text(coalesce(v_row -> 'mapped_fields', '[]'::jsonb));

    if v_row_number is null or v_row_number < 1 then
      v_errors := v_errors || jsonb_build_array('Row number is invalid.');
    else
      select count(*) into v_duplicate_row_number_count
        from jsonb_array_elements(p_rows) duplicate_row
       where duplicate_row ->> 'row_number' = v_row_number::text;
      if v_duplicate_row_number_count > 1 then
        v_errors := v_errors || jsonb_build_array('Row number is repeated in this import.');
      end if;
    end if;
    if jsonb_typeof(v_values) <> 'object' then
      v_errors := v_errors || jsonb_build_array('Normalized values are invalid.');
      v_values := '{}'::jsonb;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_values) value_key
       where not value_key = any(v_allowed_fields)
          or not value_key = any(v_mapped_fields)
    ) then
      v_errors := v_errors || jsonb_build_array('Normalized values must contain only declared mapped fields.');
    end if;
    if exists (
      select 1 from unnest(v_mapped_fields) field_name
       where not (v_values ? field_name)
    ) then
      v_errors := v_errors || jsonb_build_array('Every mapped field must include a normalized value.');
    end if;
    if exists (
      select 1 from unnest(v_mapped_fields) field_name
       where not field_name = any(v_allowed_fields)
    ) then
      v_errors := v_errors || jsonb_build_array('The import includes an unsupported mapped field.');
    end if;
    if array_length(v_mapped_fields, 1) is distinct from (
      select count(distinct field_name)::integer from unnest(v_mapped_fields) field_name
    ) then
      v_errors := v_errors || jsonb_build_array('Mapped fields must be unique.');
    end if;
    if not ('title' = any(v_mapped_fields)) then
      v_errors := v_errors || jsonb_build_array('Title must be mapped.');
    end if;

    v_title := trim(coalesce(v_values ->> 'title', ''));
    v_sku := nullif(trim(coalesce(v_values ->> 'sku', '')), '');
    if length(v_title) < 1 or length(v_title) > 200 then
      v_errors := v_errors || jsonb_build_array('Title must be between 1 and 200 characters.');
    end if;
    if v_external_item_id is not null and length(v_external_item_id) > 200 then
      v_errors := v_errors || jsonb_build_array('External item ID must be 200 characters or fewer.');
    end if;
    if v_sku is not null and length(v_sku) > 160 then
      v_errors := v_errors || jsonb_build_array('SKU must be 160 characters or fewer.');
    end if;
    if length(coalesce(v_values ->> 'customer_description', '')) > 4000
       or length(coalesce(v_values ->> 'internal_notes', '')) > 4000 then
      v_errors := v_errors || jsonb_build_array('Descriptions and notes must be 4,000 characters or fewer.');
    end if;
    if length(coalesce(v_values ->> 'trade', '')) > 160
       or length(coalesce(v_values ->> 'category', '')) > 160
       or length(coalesce(v_values ->> 'subcategory', '')) > 160 then
      v_errors := v_errors || jsonb_build_array('Trade, category, and subcategory must be 160 characters or fewer.');
    end if;
    if length(coalesce(v_values ->> 'unit', '')) > 80 then
      v_errors := v_errors || jsonb_build_array('Unit must be 80 characters or fewer.');
    end if;
    if coalesce(v_values ->> 'line_type', 'other') not in ('labor', 'material', 'fee', 'other') then
      v_errors := v_errors || jsonb_build_array('Line type is invalid.');
    end if;
    if (v_values ? 'taxable') and jsonb_typeof(v_values -> 'taxable') <> 'boolean' then
      v_errors := v_errors || jsonb_build_array('Taxable must be true or false.');
    end if;
    if (v_values ? 'active') and jsonb_typeof(v_values -> 'active') <> 'boolean' then
      v_errors := v_errors || jsonb_build_array('Active must be true or false.');
    end if;
    if (v_values ? 'default_unit_price_cents')
       and (v_values ->> 'default_unit_price_cents') is not null
       and ((v_values ->> 'default_unit_price_cents') !~ '^\d+$'
            or (v_values ->> 'default_unit_price_cents')::numeric > 2147483647) then
      v_errors := v_errors || jsonb_build_array('Default price cents must be a non-negative whole number.');
    end if;
    if (v_values ? 'labor_hours')
       and (v_values ->> 'labor_hours') is not null
       and ((v_values ->> 'labor_hours') !~ '^\d+(\.\d{1,2})?$'
            or (v_values ->> 'labor_hours')::numeric > 999999.99) then
      v_errors := v_errors || jsonb_build_array('Labor hours must be a non-negative number with at most two decimals.');
    end if;

    if v_external_item_id is not null then
      select count(*) into v_duplicate_external_count
        from jsonb_array_elements(p_rows) duplicate_row
       where nullif(trim(duplicate_row ->> 'external_item_id'), '') = v_external_item_id;
      if v_duplicate_external_count > 1 then
        v_errors := v_errors || jsonb_build_array('External item ID is repeated in this file.');
      end if;
    end if;

    v_values := jsonb_strip_nulls(v_values) || case
      when v_values ? 'default_unit_price_cents'
        and (v_row -> 'values' -> 'default_unit_price_cents') = 'null'::jsonb
      then jsonb_build_object('default_unit_price_cents', null)
      else '{}'::jsonb
    end;
    v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
      'mapped_fields', to_jsonb(v_mapped_fields),
      'values', v_values
    )::text, 'UTF8'), 'sha256'), 'hex');

    v_mapping := null;
    v_item := null;
    v_merge := null;
    v_candidate_count := 0;
    v_match_type := 'none';
    v_match_confidence := 'none';
    v_recommended_action := 'add';
    v_allowed_actions := jsonb_build_array('add', 'skip');
    v_current_values := null;
    v_baseline_values := '{}'::jsonb;
    v_result_values := jsonb_build_object(
      'title', v_title,
      'customer_description', '',
      'internal_notes', '',
      'trade', '',
      'category', '',
      'subcategory', null,
      'line_type', 'other',
      'unit', null,
      'default_unit_price_cents', null,
      'taxable', true,
      'labor_hours', null,
      'sku', null,
      'active', true
    ) || v_values;

    if v_external_item_id is not null then
      select * into v_mapping
        from public.external_object_mappings
       where provider = 'servsync_file_import'
         and provider_account_id = p_import_source_id::text
         and provider_object_type = 'contractor_price_book_item'
         and provider_object_id = v_external_item_id
       limit 1;
    end if;

    if v_mapping.id is not null then
      select * into v_item
        from public.contractor_price_book_items
       where id = v_mapping.servsync_entity_id
         and contractor_id = p_contractor_id;
      if v_item.id is null
         or v_mapping.contractor_id is distinct from p_contractor_id
         or v_mapping.servsync_entity_type <> 'contractor_price_book_item'
         or v_mapping.mapping_status <> 'active' then
        v_match_type := 'ambiguous';
        v_match_confidence := 'none';
        v_errors := v_errors || jsonb_build_array('The external item mapping is unavailable or outside this contractor account.');
        v_recommended_action := 'skip';
        v_allowed_actions := jsonb_build_array('skip');
      else
        v_match_type := 'external_id';
        v_match_confidence := 'high';
        v_current_values := public.servsync_private_price_book_item_values(v_item);
        v_baseline_values := coalesce(v_mapping.metadata -> 'last_import_values', '{}'::jsonb);
        v_merge := public.servsync_private_price_book_import_merge(
          v_current_values, v_baseline_values, v_values, v_mapped_fields
        );
        v_result_values := v_merge -> 'result_values';
        if jsonb_array_length(v_merge -> 'conflict_fields') > 0 then
          v_warnings := v_warnings || jsonb_build_array('Manual and imported values both changed; conflicting fields are preserved and this row cannot update automatically.');
          v_recommended_action := 'skip';
          v_allowed_actions := jsonb_build_array('skip');
        elsif jsonb_array_length(v_merge -> 'changed_fields') > 0 then
          v_recommended_action := 'update';
          v_allowed_actions := jsonb_build_array('update', 'skip');
        else
          v_recommended_action := 'skip';
          v_allowed_actions := jsonb_build_array('skip');
          v_warnings := v_warnings || jsonb_build_array('No imported values changed.');
        end if;
      end if;
    elsif v_sku is not null then
      select count(*) into v_candidate_count
        from public.contractor_price_book_items candidate
       where candidate.contractor_id = p_contractor_id
         and lower(trim(coalesce(candidate.sku, ''))) = lower(v_sku);
      if v_candidate_count = 1 then
        select * into v_item
          from public.contractor_price_book_items candidate
         where candidate.contractor_id = p_contractor_id
           and lower(trim(coalesce(candidate.sku, ''))) = lower(v_sku)
         limit 1;
        v_match_type := 'sku_suggestion';
        v_match_confidence := 'medium';
        v_current_values := public.servsync_private_price_book_item_values(v_item);
        v_result_values := v_current_values || v_values;
        v_recommended_action := 'skip';
        v_allowed_actions := case when v_external_item_id is null
          then jsonb_build_array('add', 'skip')
          else jsonb_build_array('update', 'skip') end;
        v_warnings := v_warnings || jsonb_build_array('SKU matches one existing item. Review every mapped value before choosing Update.');
        if v_external_item_id is not null then
          select count(*) into v_existing_target_mapping_count
            from public.external_object_mappings existing_mapping
           where existing_mapping.provider = 'servsync_file_import'
             and existing_mapping.provider_account_id = p_import_source_id::text
             and existing_mapping.provider_object_type = 'contractor_price_book_item'
             and existing_mapping.servsync_entity_type = 'contractor_price_book_item'
             and existing_mapping.servsync_entity_id = v_item.id
             and existing_mapping.provider_object_id <> v_external_item_id
             and existing_mapping.mapping_status = 'active';
          if v_existing_target_mapping_count > 0 then
            v_match_type := 'ambiguous';
            v_match_confidence := 'low';
            v_allowed_actions := jsonb_build_array('skip');
            v_errors := v_errors || jsonb_build_array('This Price Book item is already mapped to another external item in the selected source.');
          end if;
        end if;
      elsif v_candidate_count > 1 then
        v_match_type := 'ambiguous';
        v_match_confidence := 'low';
        v_recommended_action := 'skip';
        v_allowed_actions := jsonb_build_array('skip');
        v_errors := v_errors || jsonb_build_array('SKU matches more than one existing item. Resolve the duplicate SKU before importing.');
      end if;
    end if;

    if v_item.id is null and v_match_type = 'none' then
      select count(*) into v_candidate_count
        from public.contractor_price_book_items candidate
       where candidate.contractor_id = p_contractor_id
         and lower(trim(candidate.title)) = lower(v_title)
         and lower(trim(coalesce(candidate.sku, ''))) = lower(coalesce(v_sku, ''));
      if v_candidate_count = 1 then
        select * into v_item
          from public.contractor_price_book_items candidate
         where candidate.contractor_id = p_contractor_id
           and lower(trim(candidate.title)) = lower(v_title)
           and lower(trim(coalesce(candidate.sku, ''))) = lower(coalesce(v_sku, ''))
         limit 1;
        v_match_type := 'exact_duplicate';
        v_match_confidence := 'medium';
        v_current_values := public.servsync_private_price_book_item_values(v_item);
        v_result_values := v_current_values || v_values;
        v_recommended_action := 'skip';
        v_allowed_actions := case when v_external_item_id is null
          then jsonb_build_array('add', 'skip')
          else jsonb_build_array('update', 'skip') end;
        v_warnings := v_warnings || jsonb_build_array('Title and SKU match an existing item. Review before adding or linking it.');
        if v_external_item_id is not null then
          select count(*) into v_existing_target_mapping_count
            from public.external_object_mappings existing_mapping
           where existing_mapping.provider = 'servsync_file_import'
             and existing_mapping.provider_account_id = p_import_source_id::text
             and existing_mapping.provider_object_type = 'contractor_price_book_item'
             and existing_mapping.servsync_entity_type = 'contractor_price_book_item'
             and existing_mapping.servsync_entity_id = v_item.id
             and existing_mapping.provider_object_id <> v_external_item_id
             and existing_mapping.mapping_status = 'active';
          if v_existing_target_mapping_count > 0 then
            v_match_type := 'ambiguous';
            v_match_confidence := 'low';
            v_allowed_actions := jsonb_build_array('skip');
            v_errors := v_errors || jsonb_build_array('This Price Book item is already mapped to another external item in the selected source.');
          end if;
        end if;
      elsif v_candidate_count > 1 then
        v_match_type := 'ambiguous';
        v_match_confidence := 'low';
        v_recommended_action := 'skip';
        v_allowed_actions := jsonb_build_array('skip');
        v_errors := v_errors || jsonb_build_array('More than one existing item matches this title and SKU.');
      end if;
    end if;

    if jsonb_array_length(v_errors) > 0 then
      v_recommended_action := 'skip';
      v_allowed_actions := jsonb_build_array('skip');
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'row_number', v_row_number,
      'external_item_id', v_external_item_id,
      'sku', v_sku,
      'row_fingerprint', v_fingerprint,
      'mapped_fields', to_jsonb(v_mapped_fields),
      'match_type', v_match_type,
      'match_confidence', v_match_confidence,
      'target_item_id', v_item.id,
      'target_updated_at', v_item.updated_at,
      'current_values', v_current_values,
      'incoming_values', v_values,
      'result_values', v_result_values,
      'changed_fields', coalesce(v_merge -> 'changed_fields', '[]'::jsonb),
      'conflict_fields', coalesce(v_merge -> 'conflict_fields', '[]'::jsonb),
      'recommended_action', v_recommended_action,
      'allowed_actions', v_allowed_actions,
      'warnings', v_warnings,
      'errors', v_errors
    ));
  end loop;

  select coalesce(jsonb_agg(
    case
      when duplicate_unidentified_count > 1 then
        row_value || jsonb_build_object(
          'match_type', 'ambiguous',
          'match_confidence', 'low',
          'reconciliation_status', 'invalid',
          'recommended_action', 'skip',
          'allowed_actions', jsonb_build_array('skip'),
          'errors', coalesce(row_value -> 'errors', '[]'::jsonb)
            || jsonb_build_array('This exact row is repeated without an external item ID.')
        )
      when duplicate_target_count > 1 then
        row_value || jsonb_build_object(
          'match_type', 'ambiguous',
          'match_confidence', 'low',
          'reconciliation_status', 'ambiguous',
          'recommended_action', 'skip',
          'allowed_actions', jsonb_build_array('skip'),
          'errors', coalesce(row_value -> 'errors', '[]'::jsonb)
            || jsonb_build_array('More than one import row resolves to the same Price Book item.')
        )
      else row_value || jsonb_build_object(
        'reconciliation_status', case
          when jsonb_array_length(coalesce(row_value -> 'errors', '[]'::jsonb)) > 0 then 'invalid'
          when row_value ->> 'match_type' = 'ambiguous'
            or jsonb_array_length(coalesce(row_value -> 'conflict_fields', '[]'::jsonb)) > 0 then 'ambiguous'
          when nullif(row_value ->> 'target_item_id', '') is null then 'new'
          when row_value -> 'current_values' is not distinct from row_value -> 'result_values' then 'unchanged'
          else 'changed'
        end
      )
    end
    order by row_ordinality
  ), '[]'::jsonb)
    into v_rows
    from (
      select row_value,
             row_ordinality,
             count(*) filter (where nullif(row_value ->> 'external_item_id', '') is null)
               over (partition by row_value ->> 'row_fingerprint') as duplicate_unidentified_count,
             count(*) filter (where nullif(row_value ->> 'target_item_id', '') is not null)
               over (partition by row_value ->> 'target_item_id') as duplicate_target_count
        from jsonb_array_elements(v_rows) with ordinality rows(row_value, row_ordinality)
    ) classified_rows;

  return jsonb_build_object(
    'source', jsonb_build_object('id', v_source.id, 'display_name', v_source.display_name),
    'rows', v_rows,
    'counts', jsonb_build_object(
      'add', (select count(*) from jsonb_array_elements(v_rows) row_value where row_value ->> 'recommended_action' = 'add'),
      'update', (select count(*) from jsonb_array_elements(v_rows) row_value where row_value ->> 'recommended_action' = 'update'),
      'skip', (select count(*) from jsonb_array_elements(v_rows) row_value where row_value ->> 'recommended_action' = 'skip'),
      'error', (select count(*) from jsonb_array_elements(v_rows) row_value where jsonb_array_length(row_value -> 'errors') > 0)
    )
  );
end;
$$;

create or replace function public.servsync_create_price_book_import_source(
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_source public.contractor_price_book_import_sources%rowtype;
begin
  v_contractor_id := public.servsync_private_price_book_import_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book import management is unavailable.';
  end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 120 then
    raise exception 'Import source name must be between 1 and 120 characters.';
  end if;

  insert into public.contractor_price_book_import_sources (
    contractor_id, display_name, created_by
  ) values (
    v_contractor_id, trim(p_display_name), auth.uid()
  )
  returning * into v_source;

  return jsonb_build_object(
    'id', v_source.id,
    'display_name', v_source.display_name,
    'source_kind', v_source.source_kind,
    'status', v_source.status,
    'created_at', v_source.created_at
  );
exception
  when unique_violation then
    raise exception 'An import source with this name already exists.';
end;
$$;

create or replace function public.servsync_list_price_book_import_sources()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  v_contractor_id := public.servsync_private_price_book_import_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book import management is unavailable.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', source.id,
      'display_name', source.display_name,
      'source_kind', source.source_kind,
      'status', source.status,
      'created_at', source.created_at
    ) order by source.display_name, source.created_at)
      from public.contractor_price_book_import_sources source
     where source.contractor_id = v_contractor_id
       and source.status = 'active'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.servsync_preview_price_book_import(
  p_import_source_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  v_contractor_id := public.servsync_private_price_book_import_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book import management is unavailable.';
  end if;
  return public.servsync_private_preview_price_book_import(
    v_contractor_id, p_import_source_id, p_rows
  );
end;
$$;

create or replace function public.servsync_execute_price_book_import(
  p_import_source_id uuid,
  p_rows jsonb,
  p_actions jsonb,
  p_idempotency_key uuid,
  p_original_filename text default null,
  p_file_sha256 text default null,
  p_file_size_bytes integer default null,
  p_mapping_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_source public.contractor_price_book_import_sources%rowtype;
  v_request_hash text;
  v_existing_batch public.contractor_price_book_import_batches%rowtype;
  v_batch_id uuid := gen_random_uuid();
  v_preview jsonb;
  v_preview_row jsonb;
  v_action text;
  v_allowed_actions jsonb;
  v_item public.contractor_price_book_items%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_before_patch jsonb;
  v_after_patch jsonb;
  v_values jsonb;
  v_target_id uuid;
  v_mapping_id uuid;
  v_external_item_id text;
  v_mapped_fields text[];
  v_add_count integer := 0;
  v_update_count integer := 0;
  v_skip_count integer := 0;
  v_error_count integer := 0;
  v_row_count integer;
  v_result jsonb;
begin
  v_contractor_id := public.servsync_private_price_book_import_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book import management is unavailable.';
  end if;
  if p_idempotency_key is null then
    raise exception 'Price Book import idempotency key is required.';
  end if;
  if jsonb_typeof(p_actions) <> 'object' then
    raise exception 'Price Book import actions must be a JSON object keyed by row number.';
  end if;
  if length(trim(coalesce(p_original_filename, ''))) not between 1 and 180 then
    raise exception 'Import filename must be between 1 and 180 characters.';
  end if;
  if lower(coalesce(p_file_sha256, '')) !~ '^[0-9a-f]{64}$' then
    raise exception 'Import file hash is invalid.';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes not between 1 and 1048576 then
    raise exception 'Import file size must be between 1 byte and 1 MB.';
  end if;
  if jsonb_typeof(coalesce(p_mapping_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'Import mapping snapshot is invalid.';
  end if;
  if length(coalesce(p_mapping_snapshot, '{}'::jsonb)::text) > 32768 then
    raise exception 'Import mapping snapshot is too large.';
  end if;

  select * into v_source
    from public.contractor_price_book_import_sources
   where id = p_import_source_id
     and contractor_id = v_contractor_id
     and status = 'active';
  if not found then
    raise exception 'Price Book import source is unavailable.';
  end if;

  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'source_id', p_import_source_id,
    'rows', p_rows,
    'actions', p_actions,
    'file_sha256', lower(p_file_sha256),
    'file_size_bytes', p_file_size_bytes,
    'mapping', coalesce(p_mapping_snapshot, '{}'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(
    hashtextextended(v_contractor_id::text || ':' || p_idempotency_key::text, 0)
  );

  select * into v_existing_batch
    from public.contractor_price_book_import_batches
   where contractor_id = v_contractor_id
     and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_batch.request_hash <> v_request_hash then
      raise exception 'This import idempotency key was already used for different content.';
    end if;
    return v_existing_batch.result_summary || jsonb_build_object('idempotent', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_contractor_id::text || ':price-book-source:' || p_import_source_id::text, 0)
  );

  v_preview := public.servsync_private_preview_price_book_import(
    v_contractor_id, p_import_source_id, p_rows
  );

  perform 1
    from public.contractor_price_book_items item
   where item.contractor_id = v_contractor_id
     and item.id in (
       select nullif(row_value ->> 'target_item_id', '')::uuid
         from jsonb_array_elements(v_preview -> 'rows') row_value
        where nullif(row_value ->> 'target_item_id', '') is not null
     )
   order by item.id
   for update;

  v_preview := public.servsync_private_preview_price_book_import(
    v_contractor_id, p_import_source_id, p_rows
  );
  v_row_count := jsonb_array_length(v_preview -> 'rows');

  if (select count(*) from jsonb_object_keys(p_actions)) <> v_row_count
     or exists (
       select 1
         from jsonb_object_keys(p_actions) action_row_number
        where not exists (
          select 1
            from jsonb_array_elements(v_preview -> 'rows') preview_row
           where preview_row ->> 'row_number' = action_row_number
        )
     ) then
    raise exception 'Choose exactly one explicit action for every import row.';
  end if;

  for v_preview_row in select value from jsonb_array_elements(v_preview -> 'rows') loop
    if not (p_actions ? (v_preview_row ->> 'row_number')) then
      raise exception 'Choose exactly one explicit action for every import row.';
    end if;
    v_action := p_actions ->> (v_preview_row ->> 'row_number');
    v_allowed_actions := v_preview_row -> 'allowed_actions';
    if v_action not in ('add', 'update', 'skip')
       or not (v_allowed_actions ? v_action) then
      raise exception 'Row % has an unavailable import action.', v_preview_row ->> 'row_number';
    end if;
    if jsonb_array_length(v_preview_row -> 'errors') > 0 and v_action <> 'skip' then
      raise exception 'Row % must be skipped until its errors are resolved.', v_preview_row ->> 'row_number';
    end if;
  end loop;

  insert into public.contractor_price_book_import_batches (
    id, contractor_id, import_source_id, idempotency_key, request_hash, status,
    original_filename, file_sha256, file_size_bytes, mapping_snapshot, row_count,
    created_by, completed_at
  ) values (
    v_batch_id, v_contractor_id, p_import_source_id, p_idempotency_key, v_request_hash, 'building',
    nullif(trim(p_original_filename), ''), lower(p_file_sha256), p_file_size_bytes, coalesce(p_mapping_snapshot, '{}'::jsonb),
    0, auth.uid(), null
  );

  for v_preview_row in select value from jsonb_array_elements(v_preview -> 'rows') loop
    v_action := p_actions ->> (v_preview_row ->> 'row_number');
    v_target_id := nullif(v_preview_row ->> 'target_item_id', '')::uuid;
    v_external_item_id := nullif(trim(v_preview_row ->> 'external_item_id'), '');
    v_values := v_preview_row -> 'result_values';
    v_mapping_id := null;
    select coalesce(array_agg(value), '{}'::text[]) into v_mapped_fields
      from jsonb_array_elements_text(v_preview_row -> 'mapped_fields');

    if v_action = 'add' then
      insert into public.contractor_price_book_items (
        contractor_id, title, customer_description, internal_notes, trade, category,
        subcategory, line_type, unit, default_unit_price_cents, taxable, labor_hours,
        sku, source, active, archived_at
      ) values (
        v_contractor_id,
        trim(v_values ->> 'title'),
        coalesce(v_values ->> 'customer_description', ''),
        coalesce(v_values ->> 'internal_notes', ''),
        coalesce(v_values ->> 'trade', ''),
        coalesce(v_values ->> 'category', ''),
        nullif(trim(v_values ->> 'subcategory'), ''),
        coalesce(v_values ->> 'line_type', 'other'),
        nullif(trim(v_values ->> 'unit'), ''),
        nullif(v_values ->> 'default_unit_price_cents', '')::integer,
        coalesce((v_values ->> 'taxable')::boolean, true),
        nullif(v_values ->> 'labor_hours', '')::numeric(8,2),
        nullif(trim(v_values ->> 'sku'), ''),
        'csv_import',
        coalesce((v_values ->> 'active')::boolean, true),
        case when coalesce((v_values ->> 'active')::boolean, true) then null else now() end
      ) returning * into v_item;
      v_target_id := v_item.id;
      v_before := '{}'::jsonb;
      v_after := public.servsync_private_price_book_item_values(v_item);
      v_add_count := v_add_count + 1;
    elsif v_action = 'update' then
      select * into v_item
        from public.contractor_price_book_items
       where id = v_target_id
         and contractor_id = v_contractor_id
       for update;
      if not found or v_item.updated_at is distinct from (v_preview_row ->> 'target_updated_at')::timestamptz then
        raise exception 'Row % changed after preview. Preview the file again.', v_preview_row ->> 'row_number';
      end if;
      v_before := public.servsync_private_price_book_item_values(v_item);
      if v_before is not distinct from v_values then
        v_after := v_before;
      else
        update public.contractor_price_book_items item
           set title = case when 'title' = any(v_mapped_fields) then trim(v_values ->> 'title') else item.title end,
               customer_description = case when 'customer_description' = any(v_mapped_fields) then coalesce(v_values ->> 'customer_description', '') else item.customer_description end,
               internal_notes = case when 'internal_notes' = any(v_mapped_fields) then coalesce(v_values ->> 'internal_notes', '') else item.internal_notes end,
               trade = case when 'trade' = any(v_mapped_fields) then coalesce(v_values ->> 'trade', '') else item.trade end,
               category = case when 'category' = any(v_mapped_fields) then coalesce(v_values ->> 'category', '') else item.category end,
               subcategory = case when 'subcategory' = any(v_mapped_fields) then nullif(trim(v_values ->> 'subcategory'), '') else item.subcategory end,
               line_type = case when 'line_type' = any(v_mapped_fields) then coalesce(v_values ->> 'line_type', 'other') else item.line_type end,
               unit = case when 'unit' = any(v_mapped_fields) then nullif(trim(v_values ->> 'unit'), '') else item.unit end,
               default_unit_price_cents = case when 'default_unit_price_cents' = any(v_mapped_fields) then nullif(v_values ->> 'default_unit_price_cents', '')::integer else item.default_unit_price_cents end,
               taxable = case when 'taxable' = any(v_mapped_fields) then coalesce((v_values ->> 'taxable')::boolean, item.taxable) else item.taxable end,
               labor_hours = case when 'labor_hours' = any(v_mapped_fields) then nullif(v_values ->> 'labor_hours', '')::numeric(8,2) else item.labor_hours end,
               sku = case when 'sku' = any(v_mapped_fields) then nullif(trim(v_values ->> 'sku'), '') else item.sku end,
               active = case when 'active' = any(v_mapped_fields) then coalesce((v_values ->> 'active')::boolean, item.active) else item.active end,
               archived_at = case
                 when not ('active' = any(v_mapped_fields)) then item.archived_at
                 when coalesce((v_values ->> 'active')::boolean, item.active) then null
                 else coalesce(item.archived_at, now())
               end
         where item.id = v_target_id
           and item.contractor_id = v_contractor_id
        returning * into v_item;
        v_after := public.servsync_private_price_book_item_values(v_item);
      end if;
      v_update_count := v_update_count + 1;
    else
      v_before := coalesce(v_preview_row -> 'current_values', '{}'::jsonb);
      v_after := v_before;
      v_skip_count := v_skip_count + 1;
    end if;

    if v_action in ('add', 'update') and v_external_item_id is not null then
      insert into public.external_object_mappings (
        provider, provider_account_id, provider_object_type, provider_object_id,
        servsync_entity_type, servsync_entity_id, contractor_id, mapping_status,
        sync_direction, last_synced_at, last_seen_at, metadata, created_by
      ) values (
        'servsync_file_import', p_import_source_id::text,
        'contractor_price_book_item', v_external_item_id,
        'contractor_price_book_item', v_target_id, v_contractor_id, 'active',
        'imported', now(), now(), jsonb_build_object(
          'source_id', p_import_source_id,
          'last_batch_id', v_batch_id,
          'last_import_values', v_after - coalesce((
            select array_agg(key) from jsonb_each(v_after) where not key = any(v_mapped_fields)
          ), '{}'::text[]),
          'last_import_mapped_fields', to_jsonb(v_mapped_fields),
          'row_fingerprint', v_preview_row ->> 'row_fingerprint'
        ), auth.uid()
      )
      on conflict (provider, provider_account_id, provider_object_type, provider_object_id)
      do update set
        servsync_entity_type = excluded.servsync_entity_type,
        servsync_entity_id = excluded.servsync_entity_id,
        contractor_id = excluded.contractor_id,
        mapping_status = 'active',
        sync_direction = 'imported',
        last_synced_at = now(),
        last_seen_at = now(),
        metadata = excluded.metadata,
        updated_at = now()
      returning id into v_mapping_id;
    end if;

    if jsonb_array_length(v_preview_row -> 'errors') > 0 then
      v_error_count := v_error_count + 1;
    end if;

    v_before_patch := case when v_action = 'update' then coalesce((
      select jsonb_object_agg(before_value.key, before_value.value)
        from jsonb_each(v_before) before_value
       where before_value.key = any(v_mapped_fields)
         and v_before -> before_value.key is distinct from v_after -> before_value.key
    ), '{}'::jsonb) else '{}'::jsonb end;
    v_after_patch := case when v_action in ('add', 'update') then coalesce((
      select jsonb_object_agg(after_value.key, after_value.value)
        from jsonb_each(v_after) after_value
       where after_value.key = any(v_mapped_fields)
         and (v_action = 'add' or v_before -> after_value.key is distinct from v_after -> after_value.key)
    ), '{}'::jsonb) else '{}'::jsonb end;

    insert into public.contractor_price_book_import_batch_rows (
      batch_id, contractor_id, row_number, external_item_id, sku, row_fingerprint,
      requested_action, applied_action, match_type, match_confidence,
      target_price_book_item_id, external_mapping_id, mapped_fields,
      before_patch, after_patch, warnings, errors, outcome
    ) values (
      v_batch_id, v_contractor_id, (v_preview_row ->> 'row_number')::integer,
      v_external_item_id, nullif(v_preview_row ->> 'sku', ''),
      v_preview_row ->> 'row_fingerprint', v_action, v_action,
      v_preview_row ->> 'match_type', v_preview_row ->> 'match_confidence',
      v_target_id, v_mapping_id, v_mapped_fields,
      v_before_patch, v_after_patch,
      v_preview_row -> 'warnings', v_preview_row -> 'errors',
      case v_action when 'add' then 'created' when 'update' then 'updated' else 'skipped' end
    );
  end loop;

  v_result := jsonb_build_object(
    'batch_id', v_batch_id,
    'status', 'completed',
    'source_id', p_import_source_id,
    'row_count', v_row_count,
    'add_count', v_add_count,
    'update_count', v_update_count,
    'skip_count', v_skip_count,
    'error_count', v_error_count,
    'idempotent', false
  );

  update public.contractor_price_book_import_batches
     set status = 'completed',
         completed_at = now(),
         row_count = v_row_count,
         add_count = v_add_count,
         update_count = v_update_count,
         skip_count = v_skip_count,
         error_count = v_error_count,
         result_summary = v_result
   where id = v_batch_id;

  return v_result;
end;
$$;

create or replace function public.servsync_list_price_book_import_batches(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  v_contractor_id := public.servsync_private_price_book_import_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book import management is unavailable.';
  end if;
  if p_limit < 1 or p_limit > 50 then
    raise exception 'Import history limit must be between 1 and 50.';
  end if;

  return coalesce((
    select jsonb_agg(row_data order by created_at desc)
      from (
        select batch.created_at, jsonb_build_object(
          'id', batch.id,
          'source_id', batch.import_source_id,
          'source_name', source.display_name,
          'status', batch.status,
          'original_filename', batch.original_filename,
          'file_size_bytes', batch.file_size_bytes,
          'row_count', batch.row_count,
          'add_count', batch.add_count,
          'update_count', batch.update_count,
          'skip_count', batch.skip_count,
          'error_count', batch.error_count,
          'created_at', batch.created_at,
          'completed_at', batch.completed_at
        ) as row_data
          from public.contractor_price_book_import_batches batch
          join public.contractor_price_book_import_sources source
            on source.id = batch.import_source_id
         where batch.contractor_id = v_contractor_id
           and batch.status = 'completed'
         order by batch.created_at desc
         limit p_limit
      ) history
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servsync_private_price_book_import_contractor_id()
  from public, anon, authenticated;
revoke all on function public.servsync_private_protect_price_book_import_batch()
  from public, anon, authenticated;
revoke all on function public.servsync_private_price_book_item_values(public.contractor_price_book_items)
  from public, anon, authenticated;
revoke all on function public.servsync_private_price_book_import_merge(jsonb, jsonb, jsonb, text[])
  from public, anon, authenticated;
revoke all on function public.servsync_private_preview_price_book_import(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.servsync_private_protect_price_book_import_batch_row()
  from public, anon, authenticated;

revoke all on function public.servsync_create_price_book_import_source(text)
  from public, anon, authenticated;
revoke all on function public.servsync_list_price_book_import_sources()
  from public, anon, authenticated;
revoke all on function public.servsync_preview_price_book_import(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.servsync_execute_price_book_import(uuid, jsonb, jsonb, uuid, text, text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.servsync_list_price_book_import_batches(integer)
  from public, anon, authenticated;

grant execute on function public.servsync_create_price_book_import_source(text)
  to authenticated;
grant execute on function public.servsync_list_price_book_import_sources()
  to authenticated;
grant execute on function public.servsync_preview_price_book_import(uuid, jsonb)
  to authenticated;
grant execute on function public.servsync_execute_price_book_import(uuid, jsonb, jsonb, uuid, text, text, integer, jsonb)
  to authenticated;
grant execute on function public.servsync_list_price_book_import_batches(integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
