-- ServSync FB-024 Price Book Portable Reference Reconciliation v1.
-- Apply after servsync-price-book-repeat-import-reconciliation.sql.
--
-- Recognizes exact servsync-item:<uuid> references only within the authenticated
-- contractor's Price Book. The reference is untrusted correlation input, never
-- authorization. Existing source identity, merge, execution, audit, idempotency,
-- and rollback contracts remain authoritative.

begin;

do $$
begin
  if to_regclass('public.contractor_price_book_items') is null
     or to_regclass('public.external_object_mappings') is null
     or to_regprocedure('public.servsync_private_preview_price_book_import(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.servsync_preview_price_book_import(uuid,jsonb)') is null
     or to_regprocedure('public.servsync_execute_price_book_import(uuid,jsonb,jsonb,uuid,text,text,integer,jsonb)') is null then
    raise exception 'Missing required Price Book Repeat-Import Reconciliation foundation.';
  end if;
  if coalesce(obj_description(
    'public.servsync_private_preview_price_book_import(uuid,uuid,jsonb)'::regprocedure,
    'pg_proc'
  ), '') like '%portable ServSync item references v1%' then
    raise exception 'Price Book portable reference reconciliation is already installed.';
  end if;
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
  v_is_portable_reference boolean;
  v_portable_item_id uuid;
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
    v_is_portable_reference := coalesce(lower(v_external_item_id) like 'servsync-item:%', false);
    v_portable_item_id := null;
    if v_is_portable_reference then
      if v_external_item_id ~ '^servsync-item:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$' then
        v_portable_item_id := substring(v_external_item_id from 15)::uuid;
      else
        v_errors := v_errors || jsonb_build_array('ServSync item reference is invalid.');
      end if;
    end if;
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

    if v_external_item_id is not null and (not v_is_portable_reference or v_portable_item_id is not null) then
      select * into v_mapping
        from public.external_object_mappings
       where provider = 'servsync_file_import'
         and provider_account_id = p_import_source_id::text
         and provider_object_type = 'contractor_price_book_item'
         and provider_object_id = v_external_item_id
       limit 1;
    end if;

    if v_portable_item_id is not null then
      select * into v_item
        from public.contractor_price_book_items
       where id = v_portable_item_id
         and contractor_id = p_contractor_id;
    end if;

    if v_item.id is not null then
      if v_mapping.id is not null
         and (
           v_mapping.contractor_id is distinct from p_contractor_id
           or v_mapping.servsync_entity_type <> 'contractor_price_book_item'
           or v_mapping.mapping_status <> 'active'
           or v_mapping.servsync_entity_id is distinct from v_item.id
         ) then
        v_match_type := 'ambiguous';
        v_match_confidence := 'none';
        v_errors := v_errors || jsonb_build_array('The supplied item identities do not identify one available Price Book item.');
        v_recommended_action := 'skip';
        v_allowed_actions := jsonb_build_array('skip');
      else
        v_match_type := 'external_id';
        v_match_confidence := 'high';
        v_current_values := public.servsync_private_price_book_item_values(v_item);
        v_baseline_values := v_current_values;
        v_merge := public.servsync_private_price_book_import_merge(
          v_current_values, v_baseline_values, v_values, v_mapped_fields
        );
        v_result_values := v_merge -> 'result_values';
        if jsonb_array_length(v_merge -> 'changed_fields') > 0 then
          v_recommended_action := 'update';
          v_allowed_actions := jsonb_build_array('update', 'skip');
        else
          v_recommended_action := 'skip';
          v_allowed_actions := jsonb_build_array('skip');
          v_warnings := v_warnings || jsonb_build_array('No imported values changed.');
        end if;
        v_warnings := v_warnings || jsonb_build_array('Matched using the portable ServSync item reference.');
      end if;
    elsif v_mapping.id is not null then
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
    elsif v_portable_item_id is not null then
      v_warnings := v_warnings || jsonb_build_array('The portable ServSync item reference is not authoritative in this Price Book; normal source-scoped reconciliation applies.');
    end if;

    if v_item.id is null and v_match_type = 'none' and v_sku is not null then
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

comment on function public.servsync_private_preview_price_book_import(uuid, uuid, jsonb) is
  'Private server-authoritative Price Book reconciliation with tenant-scoped portable ServSync item references v1.';

revoke all on function public.servsync_private_preview_price_book_import(uuid, uuid, jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
