-- ServSync FB-024 Guarded Price Book Import Batch Rollback v1.
-- Apply after servsync-price-book-repeat-import-reconciliation.sql.
--
-- This adds one all-or-nothing, conflict-aware inverse for completed Price Book
-- import batches. Imported additions are archived rather than deleted. Update
-- rows restore only the exact fields changed by the original import. Original
-- import evidence remains immutable and rollback evidence is append-only.

begin;

do $$
begin
  if to_regclass('public.contractor_price_book_import_batches') is null
     or to_regclass('public.contractor_price_book_import_batch_rows') is null
     or to_regclass('public.contractor_price_book_items') is null
     or to_regclass('public.external_object_mappings') is null then
    raise exception 'Missing required Price Book Repeat-Import Reconciliation foundation.';
  end if;
  if to_regprocedure('public.servsync_private_price_book_import_contractor_id()') is null
     or to_regprocedure('public.servsync_private_price_book_item_values(public.contractor_price_book_items)') is null
     or to_regprocedure('public.servsync_list_price_book_import_batches(integer)') is null then
    raise exception 'Missing required Price Book import helper or history RPC.';
  end if;
  if to_regclass('public.contractor_price_book_import_rollback_batches') is not null
     or to_regclass('public.contractor_price_book_import_rollback_rows') is not null
     or to_regprocedure('public.servsync_preview_price_book_import_rollback(uuid)') is not null
     or to_regprocedure('public.servsync_execute_price_book_import_rollback(uuid,uuid)') is not null then
    raise exception 'Price Book import batch rollback is already installed.';
  end if;
end;
$$;

create table public.contractor_price_book_import_rollback_batches (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  import_batch_id uuid not null references public.contractor_price_book_import_batches(id) on delete restrict,
  idempotency_key uuid not null,
  request_hash text not null,
  status text not null default 'building',
  restore_count integer not null default 0,
  archive_count integer not null default 0,
  unchanged_count integer not null default 0,
  result_summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contractor_price_book_import_rollback_batches_status_check
    check (status in ('building', 'completed')),
  constraint contractor_price_book_import_rollback_batches_completion_check
    check (
      (status = 'building' and completed_at is null)
      or (status = 'completed' and completed_at is not null)
    ),
  constraint contractor_price_book_import_rollback_batches_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint contractor_price_book_import_rollback_batches_counts_check
    check (restore_count >= 0 and archive_count >= 0 and unchanged_count >= 0),
  constraint contractor_price_book_import_rollback_batches_batch_unique
    unique (import_batch_id),
  constraint contractor_price_book_import_rollback_batches_idempotency_unique
    unique (contractor_id, idempotency_key)
);

comment on table public.contractor_price_book_import_rollback_batches is
  'Private immutable summaries for completed guarded Price Book import rollback transactions.';

create index contractor_price_book_import_rollback_batches_contractor_idx
  on public.contractor_price_book_import_rollback_batches(contractor_id, created_at desc);

create table public.contractor_price_book_import_rollback_rows (
  id uuid primary key default gen_random_uuid(),
  rollback_batch_id uuid not null references public.contractor_price_book_import_rollback_batches(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  original_batch_row_id uuid not null references public.contractor_price_book_import_batch_rows(id) on delete restrict,
  target_price_book_item_id uuid,
  original_action text not null,
  rollback_action text not null,
  restored_fields text[] not null default '{}'::text[],
  before_patch jsonb not null default '{}'::jsonb,
  after_patch jsonb not null default '{}'::jsonb,
  outcome text not null,
  created_at timestamptz not null default now(),
  constraint contractor_price_book_import_rollback_rows_original_action_check
    check (original_action in ('add', 'update', 'skip')),
  constraint contractor_price_book_import_rollback_rows_action_check
    check (rollback_action in ('restore_fields', 'archive_item', 'no_change')),
  constraint contractor_price_book_import_rollback_rows_outcome_check
    check (outcome in ('restored', 'archived', 'unchanged')),
  constraint contractor_price_book_import_rollback_rows_original_unique
    unique (rollback_batch_id, original_batch_row_id)
);

comment on table public.contractor_price_book_import_rollback_rows is
  'Append-only sanitized row evidence for guarded Price Book import rollback execution.';

create index contractor_price_book_import_rollback_rows_target_idx
  on public.contractor_price_book_import_rollback_rows(contractor_id, target_price_book_item_id, created_at desc)
  where target_price_book_item_id is not null;

create or replace function public.servsync_private_protect_price_book_import_rollback_batch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Completed Price Book import rollback batches are immutable.';
  end if;
  if old.status <> 'building' or new.status <> 'completed' then
    raise exception 'Completed Price Book import rollback batches are immutable.';
  end if;
  if new.id is distinct from old.id
     or new.contractor_id is distinct from old.contractor_id
     or new.import_batch_id is distinct from old.import_batch_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_hash is distinct from old.request_hash
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Price Book import rollback identity and request evidence are immutable.';
  end if;
  return new;
end;
$$;

create trigger contractor_price_book_import_rollback_batches_protect
  before update or delete on public.contractor_price_book_import_rollback_batches
  for each row execute function public.servsync_private_protect_price_book_import_rollback_batch();

create or replace function public.servsync_private_protect_price_book_import_rollback_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_batch_contractor_id uuid;
  v_batch_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Price Book import rollback row audit is append-only.';
  end if;
  select batch.contractor_id, batch.status
    into v_batch_contractor_id, v_batch_status
    from public.contractor_price_book_import_rollback_batches batch
   where batch.id = new.rollback_batch_id;
  if v_batch_contractor_id is null
     or v_batch_contractor_id <> new.contractor_id
     or v_batch_status <> 'building' then
    raise exception 'Price Book import rollback row does not match a building rollback batch.';
  end if;
  return new;
end;
$$;

create trigger contractor_price_book_import_rollback_rows_protect
  before insert or update or delete on public.contractor_price_book_import_rollback_rows
  for each row execute function public.servsync_private_protect_price_book_import_rollback_row();

alter table public.contractor_price_book_import_rollback_batches enable row level security;
alter table public.contractor_price_book_import_rollback_batches force row level security;
alter table public.contractor_price_book_import_rollback_rows enable row level security;
alter table public.contractor_price_book_import_rollback_rows force row level security;

revoke all privileges on table public.contractor_price_book_import_rollback_batches from public, anon, authenticated;
revoke all privileges on table public.contractor_price_book_import_rollback_rows from public, anon, authenticated;

create or replace function public.servsync_private_preview_price_book_import_rollback(
  p_contractor_id uuid,
  p_import_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_batch public.contractor_price_book_import_batches%rowtype;
  v_completed_rollback public.contractor_price_book_import_rollback_batches%rowtype;
  v_row public.contractor_price_book_import_batch_rows%rowtype;
  v_item public.contractor_price_book_items%rowtype;
  v_current jsonb;
  v_conflict_fields text[];
  v_errors jsonb;
  v_restore_fields text[];
  v_allowed_fields constant text[] := array[
    'title', 'customer_description', 'internal_notes', 'trade', 'category',
    'subcategory', 'line_type', 'unit', 'default_unit_price_cents', 'taxable',
    'labor_hours', 'sku', 'active'
  ];
  v_field text;
  v_action text;
  v_outcome text;
  v_rows jsonb := '[]'::jsonb;
  v_restore_count integer := 0;
  v_archive_count integer := 0;
  v_unchanged_count integer := 0;
  v_conflict_count integer := 0;
begin
  if p_contractor_id is null or p_import_batch_id is null then
    raise exception 'Completed Price Book import batch is required.';
  end if;

  select * into v_batch
    from public.contractor_price_book_import_batches batch
   where batch.id = p_import_batch_id
     and batch.contractor_id = p_contractor_id
     and batch.status = 'completed';
  if not found then
    raise exception 'Completed Price Book import batch is unavailable.';
  end if;

  select * into v_completed_rollback
    from public.contractor_price_book_import_rollback_batches rollback_batch
   where rollback_batch.import_batch_id = p_import_batch_id
     and rollback_batch.contractor_id = p_contractor_id
     and rollback_batch.status = 'completed';

  for v_row in
    select row_audit.*
      from public.contractor_price_book_import_batch_rows row_audit
     where row_audit.batch_id = p_import_batch_id
       and row_audit.contractor_id = p_contractor_id
     order by row_audit.row_number, row_audit.id
  loop
    v_errors := '[]'::jsonb;
    v_conflict_fields := '{}'::text[];
    v_restore_fields := '{}'::text[];
    v_item := null;
    v_current := null;
    v_action := 'no_change';
    v_outcome := 'unchanged';

    if v_row.applied_action = 'skip' then
      v_unchanged_count := v_unchanged_count + 1;
    else
      select * into v_item
        from public.contractor_price_book_items item
       where item.id = v_row.target_price_book_item_id
         and item.contractor_id = p_contractor_id;
      if not found then
        v_errors := v_errors || jsonb_build_array('The affected Price Book item is unavailable.');
      else
        v_current := public.servsync_private_price_book_item_values(v_item);
      end if;

      if v_row.external_mapping_id is not null and not exists (
        select 1
          from public.external_object_mappings mapping
         where mapping.id = v_row.external_mapping_id
           and mapping.contractor_id = p_contractor_id
           and mapping.servsync_entity_type = 'contractor_price_book_item'
           and mapping.servsync_entity_id = v_row.target_price_book_item_id
           and mapping.mapping_status = 'active'
      ) then
        v_errors := v_errors || jsonb_build_array('The stable external item mapping no longer matches this Price Book item.');
      end if;
      if v_row.external_item_id is not null and v_row.external_mapping_id is null then
        v_errors := v_errors || jsonb_build_array('The original stable external item mapping is missing.');
      end if;

      if v_row.applied_action = 'update' and jsonb_typeof(v_row.before_patch) = 'object'
         and jsonb_typeof(v_row.after_patch) = 'object' then
        if exists (
          select 1 from jsonb_object_keys(v_row.before_patch || v_row.after_patch) patch_key
           where not patch_key = any(v_allowed_fields)
        ) then
          v_errors := v_errors || jsonb_build_array('The original import field audit contains an unsupported field.');
        end if;
        for v_field in select key from jsonb_object_keys(v_row.after_patch) key order by key loop
          if not (v_field = any(v_allowed_fields)) then
            v_conflict_fields := array_append(v_conflict_fields, v_field);
          elsif not (v_row.before_patch ? v_field) then
            v_conflict_fields := array_append(v_conflict_fields, v_field);
          elsif v_current is not null and v_current -> v_field is distinct from v_row.after_patch -> v_field then
            v_conflict_fields := array_append(v_conflict_fields, v_field);
          elsif exists (
            select 1
              from public.contractor_price_book_import_batch_rows later_row
              join public.contractor_price_book_import_batches later_batch
                on later_batch.id = later_row.batch_id
             where later_row.contractor_id = p_contractor_id
               and later_row.target_price_book_item_id = v_row.target_price_book_item_id
               and later_row.id <> v_row.id
               and later_batch.status = 'completed'
               and later_batch.created_at > v_batch.created_at
               and later_row.applied_action in ('add', 'update')
               and later_row.after_patch ? v_field
          ) then
            v_conflict_fields := array_append(v_conflict_fields, v_field);
          else
            v_restore_fields := array_append(v_restore_fields, v_field);
          end if;
        end loop;
        if jsonb_array_length(v_errors) = 0 and cardinality(v_conflict_fields) = 0 and cardinality(v_restore_fields) > 0 then
          v_action := 'restore_fields';
          v_outcome := 'restored';
          v_restore_count := v_restore_count + 1;
        elsif jsonb_array_length(v_errors) = 0 and cardinality(v_conflict_fields) = 0 then
          v_unchanged_count := v_unchanged_count + 1;
        end if;
      elsif v_row.applied_action = 'add' then
        if exists (
          select 1
            from public.contractor_price_book_import_batch_rows later_row
            join public.contractor_price_book_import_batches later_batch
              on later_batch.id = later_row.batch_id
           where later_row.contractor_id = p_contractor_id
             and later_row.target_price_book_item_id = v_row.target_price_book_item_id
             and later_row.id <> v_row.id
             and later_batch.status = 'completed'
             and later_batch.created_at > v_batch.created_at
             and later_row.applied_action in ('add', 'update')
        ) then
          v_errors := v_errors || jsonb_build_array('A later import changed this added Price Book item.');
        elsif jsonb_array_length(v_errors) = 0 and v_current is not null and v_item.active and v_item.archived_at is null then
          v_action := 'archive_item';
          v_outcome := 'archived';
          v_archive_count := v_archive_count + 1;
        elsif jsonb_array_length(v_errors) = 0 and v_current is not null and (not v_item.active or v_item.archived_at is not null) then
          v_unchanged_count := v_unchanged_count + 1;
        end if;
      else
        v_errors := v_errors || jsonb_build_array('The original import row audit is malformed.');
      end if;
    end if;

    if cardinality(v_conflict_fields) > 0 then
      v_errors := v_errors || jsonb_build_array('Fields changed after this import: ' || array_to_string(v_conflict_fields, ', ') || '.');
    end if;
    if jsonb_array_length(v_errors) > 0 then
      v_conflict_count := v_conflict_count + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'original_batch_row_id', v_row.id,
      'row_number', v_row.row_number,
      'target_price_book_item_id', v_row.target_price_book_item_id,
      'title', coalesce(v_current ->> 'title', v_row.after_patch ->> 'title', v_row.before_patch ->> 'title', 'Skipped row'),
      'original_action', v_row.applied_action,
      'rollback_action', v_action,
      'restore_fields', to_jsonb(v_restore_fields),
      'conflict_fields', to_jsonb(v_conflict_fields),
      'errors', v_errors,
      'outcome', v_outcome
    ));
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'source_id', v_batch.import_source_id,
    'original_filename', v_batch.original_filename,
    'completed_at', v_batch.completed_at,
    'already_rolled_back', v_completed_rollback.id is not null,
    'rollback_id', v_completed_rollback.id,
    'rolled_back_at', v_completed_rollback.completed_at,
    'can_rollback', v_completed_rollback.id is null and v_conflict_count = 0,
    'counts', jsonb_build_object(
      'restore', v_restore_count,
      'archive', v_archive_count,
      'unchanged', v_unchanged_count,
      'conflict', v_conflict_count
    ),
    'rows', v_rows
  );
end;
$$;

create or replace function public.servsync_preview_price_book_import_rollback(
  p_import_batch_id uuid
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
  return public.servsync_private_preview_price_book_import_rollback(v_contractor_id, p_import_batch_id);
end;
$$;

create or replace function public.servsync_execute_price_book_import_rollback(
  p_import_batch_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_import_batch public.contractor_price_book_import_batches%rowtype;
  v_existing public.contractor_price_book_import_rollback_batches%rowtype;
  v_idempotent_match public.contractor_price_book_import_rollback_batches%rowtype;
  v_rollback_id uuid := gen_random_uuid();
  v_request_hash text;
  v_preview jsonb;
  v_preview_row jsonb;
  v_original_row public.contractor_price_book_import_batch_rows%rowtype;
  v_item public.contractor_price_book_items%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_restore_fields text[];
  v_restore_count integer := 0;
  v_archive_count integer := 0;
  v_unchanged_count integer := 0;
  v_result jsonb;
begin
  v_contractor_id := public.servsync_private_price_book_import_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book import management is unavailable.';
  end if;
  if p_import_batch_id is null or p_idempotency_key is null then
    raise exception 'Price Book import batch and rollback idempotency key are required.';
  end if;

  select * into v_import_batch
    from public.contractor_price_book_import_batches batch
   where batch.id = p_import_batch_id
     and batch.contractor_id = v_contractor_id
     and batch.status = 'completed';
  if not found then
    raise exception 'Completed Price Book import batch is unavailable.';
  end if;

  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'contractor_id', v_contractor_id,
    'import_batch_id', p_import_batch_id
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_contractor_id::text || ':price-book-rollback:' || p_import_batch_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_contractor_id::text || ':price-book-source:' || v_import_batch.import_source_id::text, 0));

  select * into v_idempotent_match
    from public.contractor_price_book_import_rollback_batches rollback_batch
   where rollback_batch.contractor_id = v_contractor_id
     and rollback_batch.idempotency_key = p_idempotency_key;
  if found and (v_idempotent_match.import_batch_id <> p_import_batch_id
                or v_idempotent_match.request_hash <> v_request_hash) then
    raise exception 'This rollback idempotency key was already used for a different import batch.';
  elsif found and v_idempotent_match.status = 'completed' then
    return v_idempotent_match.result_summary || jsonb_build_object('idempotent', true);
  end if;

  select * into v_existing
    from public.contractor_price_book_import_rollback_batches rollback_batch
   where rollback_batch.import_batch_id = p_import_batch_id;
  if found and v_existing.status = 'completed' then
    return v_existing.result_summary || jsonb_build_object('idempotent', true);
  elsif found then
    raise exception 'This Price Book import rollback is already in progress.';
  end if;

  perform 1
    from public.contractor_price_book_items item
   where item.contractor_id = v_contractor_id
     and item.id in (
       select row_audit.target_price_book_item_id
         from public.contractor_price_book_import_batch_rows row_audit
        where row_audit.batch_id = p_import_batch_id
          and row_audit.target_price_book_item_id is not null
     )
   order by item.id
   for update;

  v_preview := public.servsync_private_preview_price_book_import_rollback(v_contractor_id, p_import_batch_id);
  if (v_preview ->> 'already_rolled_back')::boolean then
    select * into v_existing
      from public.contractor_price_book_import_rollback_batches rollback_batch
     where rollback_batch.import_batch_id = p_import_batch_id
       and rollback_batch.status = 'completed';
    return v_existing.result_summary || jsonb_build_object('idempotent', true);
  end if;
  if not (v_preview ->> 'can_rollback')::boolean then
    raise exception 'Price Book import rollback has conflicts. Preview the batch again.';
  end if;

  insert into public.contractor_price_book_import_rollback_batches (
    id, contractor_id, import_batch_id, idempotency_key, request_hash, status, created_by
  ) values (
    v_rollback_id, v_contractor_id, p_import_batch_id, p_idempotency_key, v_request_hash, 'building', auth.uid()
  );

  for v_preview_row in select value from jsonb_array_elements(v_preview -> 'rows') loop
    select * into v_original_row
      from public.contractor_price_book_import_batch_rows row_audit
     where row_audit.id = (v_preview_row ->> 'original_batch_row_id')::uuid
       and row_audit.batch_id = p_import_batch_id
       and row_audit.contractor_id = v_contractor_id;
    if not found then
      raise exception 'Price Book import rollback row audit changed during execution.';
    end if;

    select coalesce(array_agg(value order by value), '{}'::text[])
      into v_restore_fields
      from jsonb_array_elements_text(coalesce(v_preview_row -> 'restore_fields', '[]'::jsonb));
    v_before := '{}'::jsonb;
    v_after := '{}'::jsonb;

    if v_preview_row ->> 'rollback_action' = 'restore_fields' then
      select * into v_item
        from public.contractor_price_book_items item
       where item.id = v_original_row.target_price_book_item_id
         and item.contractor_id = v_contractor_id
       for update;
      if not found then
        raise exception 'Affected Price Book item became unavailable during rollback.';
      end if;
      v_before := public.servsync_private_price_book_item_values(v_item);
      update public.contractor_price_book_items item
         set title = case when v_original_row.before_patch ? 'title' then v_original_row.before_patch ->> 'title' else item.title end,
             customer_description = case when v_original_row.before_patch ? 'customer_description' then coalesce(v_original_row.before_patch ->> 'customer_description', '') else item.customer_description end,
             internal_notes = case when v_original_row.before_patch ? 'internal_notes' then coalesce(v_original_row.before_patch ->> 'internal_notes', '') else item.internal_notes end,
             trade = case when v_original_row.before_patch ? 'trade' then coalesce(v_original_row.before_patch ->> 'trade', '') else item.trade end,
             category = case when v_original_row.before_patch ? 'category' then coalesce(v_original_row.before_patch ->> 'category', '') else item.category end,
             subcategory = case when v_original_row.before_patch ? 'subcategory' then nullif(v_original_row.before_patch ->> 'subcategory', '') else item.subcategory end,
             line_type = case when v_original_row.before_patch ? 'line_type' then v_original_row.before_patch ->> 'line_type' else item.line_type end,
             unit = case when v_original_row.before_patch ? 'unit' then nullif(v_original_row.before_patch ->> 'unit', '') else item.unit end,
             default_unit_price_cents = case when v_original_row.before_patch ? 'default_unit_price_cents' then nullif(v_original_row.before_patch ->> 'default_unit_price_cents', '')::integer else item.default_unit_price_cents end,
             taxable = case when v_original_row.before_patch ? 'taxable' then (v_original_row.before_patch ->> 'taxable')::boolean else item.taxable end,
             labor_hours = case when v_original_row.before_patch ? 'labor_hours' then nullif(v_original_row.before_patch ->> 'labor_hours', '')::numeric(8,2) else item.labor_hours end,
             sku = case when v_original_row.before_patch ? 'sku' then nullif(v_original_row.before_patch ->> 'sku', '') else item.sku end,
             active = case when v_original_row.before_patch ? 'active' then (v_original_row.before_patch ->> 'active')::boolean else item.active end,
             archived_at = case
               when not (v_original_row.before_patch ? 'active') then item.archived_at
               when (v_original_row.before_patch ->> 'active')::boolean then null
               else coalesce(item.archived_at, now())
             end
       where item.id = v_original_row.target_price_book_item_id
         and item.contractor_id = v_contractor_id
      returning * into v_item;
      v_after := public.servsync_private_price_book_item_values(v_item);
      v_restore_count := v_restore_count + 1;
    elsif v_preview_row ->> 'rollback_action' = 'archive_item' then
      select * into v_item
        from public.contractor_price_book_items item
       where item.id = v_original_row.target_price_book_item_id
         and item.contractor_id = v_contractor_id
       for update;
      if not found then
        raise exception 'Affected Price Book item became unavailable during rollback.';
      end if;
      v_before := public.servsync_private_price_book_item_values(v_item);
      update public.contractor_price_book_items item
         set active = false,
             archived_at = coalesce(item.archived_at, now())
       where item.id = v_original_row.target_price_book_item_id
         and item.contractor_id = v_contractor_id
      returning * into v_item;
      v_after := public.servsync_private_price_book_item_values(v_item);
      v_archive_count := v_archive_count + 1;
    else
      if v_original_row.target_price_book_item_id is not null then
        select public.servsync_private_price_book_item_values(item)
          into v_before
          from public.contractor_price_book_items item
         where item.id = v_original_row.target_price_book_item_id
           and item.contractor_id = v_contractor_id;
        v_after := coalesce(v_before, '{}'::jsonb);
      end if;
      v_unchanged_count := v_unchanged_count + 1;
    end if;

    insert into public.contractor_price_book_import_rollback_rows (
      rollback_batch_id, contractor_id, original_batch_row_id, target_price_book_item_id,
      original_action, rollback_action, restored_fields, before_patch, after_patch, outcome
    ) values (
      v_rollback_id, v_contractor_id, v_original_row.id, v_original_row.target_price_book_item_id,
      v_original_row.applied_action, v_preview_row ->> 'rollback_action', v_restore_fields,
      coalesce(v_before, '{}'::jsonb), coalesce(v_after, '{}'::jsonb), v_preview_row ->> 'outcome'
    );
  end loop;

  v_result := jsonb_build_object(
    'rollback_id', v_rollback_id,
    'batch_id', p_import_batch_id,
    'status', 'completed',
    'restore_count', v_restore_count,
    'archive_count', v_archive_count,
    'unchanged_count', v_unchanged_count,
    'idempotent', false
  );

  update public.contractor_price_book_import_rollback_batches
     set status = 'completed',
         restore_count = v_restore_count,
         archive_count = v_archive_count,
         unchanged_count = v_unchanged_count,
         result_summary = v_result,
         completed_at = now()
   where id = v_rollback_id;

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
          'completed_at', batch.completed_at,
          'rollback', case when rollback_batch.id is null then null else jsonb_build_object(
            'id', rollback_batch.id,
            'completed_at', rollback_batch.completed_at,
            'restore_count', rollback_batch.restore_count,
            'archive_count', rollback_batch.archive_count,
            'unchanged_count', rollback_batch.unchanged_count
          ) end
        ) as row_data
          from public.contractor_price_book_import_batches batch
          join public.contractor_price_book_import_sources source
            on source.id = batch.import_source_id
          left join public.contractor_price_book_import_rollback_batches rollback_batch
            on rollback_batch.import_batch_id = batch.id
           and rollback_batch.status = 'completed'
         where batch.contractor_id = v_contractor_id
           and batch.status = 'completed'
         order by batch.created_at desc
         limit p_limit
      ) history
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servsync_private_protect_price_book_import_rollback_batch()
  from public, anon, authenticated;
revoke all on function public.servsync_private_protect_price_book_import_rollback_row()
  from public, anon, authenticated;
revoke all on function public.servsync_private_preview_price_book_import_rollback(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.servsync_preview_price_book_import_rollback(uuid)
  from public, anon, authenticated;
grant execute on function public.servsync_preview_price_book_import_rollback(uuid)
  to authenticated;

revoke all on function public.servsync_execute_price_book_import_rollback(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.servsync_execute_price_book_import_rollback(uuid, uuid)
  to authenticated;

revoke all on function public.servsync_list_price_book_import_batches(integer)
  from public, anon, authenticated;
grant execute on function public.servsync_list_price_book_import_batches(integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
