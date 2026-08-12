set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_create_price_book_import_source('Portable export round trip') as owner_source \gset
select public.servsync_create_price_book_import_source('Portable identity conflict') as conflict_source \gset
select public.servsync_create_price_book_import_source('Portable manual preservation') as preservation_source \gset
reset role;

insert into public.contractor_price_book_items (
  id, contractor_id, title, customer_description, internal_notes, trade, category,
  subcategory, line_type, unit, default_unit_price_cents, taxable, labor_hours, sku, active
)
select format('30000000-0000-4000-8000-%s', lpad(value::text, 12, '0'))::uuid,
       '20000000-0000-0000-0000-000000000001',
       format('HVAC item %s', lpad(value::text, 3, '0')),
       format('Customer description %s', value),
       format('Private note %s', value),
       'HVAC', 'Service', 'Cooling', 'other', 'each',
       7500 + value, value % 2 = 0, 1.25,
       format('HVAC-%s', lpad(value::text, 3, '0')), true
  from generate_series(1, 150) value;

select jsonb_agg(jsonb_build_object(
  'row_number', value + 1,
  'external_item_id', format('servsync-item:30000000-0000-4000-8000-%s', lpad(value::text, 12, '0')),
  'mapped_fields', jsonb_build_array(
    'title', 'customer_description', 'trade', 'category', 'subcategory',
    'line_type', 'unit', 'default_unit_price_cents', 'taxable',
    'labor_hours', 'sku', 'active'
  ),
  'values', jsonb_build_object(
    'title', format('HVAC item %s', lpad(value::text, 3, '0')),
    'customer_description', format('Customer description %s', value),
    'trade', 'HVAC', 'category', 'Service', 'subcategory', 'Cooling',
    'line_type', 'other', 'unit', 'each',
    'default_unit_price_cents', 7500 + value,
    'taxable', value % 2 = 0, 'labor_hours', 1.25,
    'sku', format('HVAC-%s', lpad(value::text, 3, '0')), 'active', true
  )
) order by value) as export_rows
from generate_series(1, 150) value \gset

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'owner_source'::jsonb ->> 'id')::uuid, :'export_rows'::jsonb
) as unchanged_preview \gset
reset role;

select public.test_assert(
  jsonb_array_length(:'unchanged_preview'::jsonb -> 'rows') = 150
  and (
    select count(*) = 150
      from jsonb_array_elements(:'unchanged_preview'::jsonb -> 'rows') row_value
     where row_value ->> 'reconciliation_status' = 'unchanged'
       and row_value ->> 'match_type' = 'external_id'
       and row_value ->> 'recommended_action' = 'skip'
       and row_value -> 'allowed_actions' = '["skip"]'::jsonb
       and jsonb_array_length(row_value -> 'errors') = 0
  )
  and (
    select count(*) = 0
      from jsonb_array_elements(:'unchanged_preview'::jsonb -> 'rows') row_value
     where row_value ->> 'reconciliation_status' <> 'unchanged'
  ),
  'The 150-item portable export did not reconcile entirely as Already up to date.'
);

select jsonb_set(
  :'export_rows'::jsonb,
  '{0,values,default_unit_price_cents}',
  '9999'::jsonb
) as changed_rows \gset

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'owner_source'::jsonb ->> 'id')::uuid, :'changed_rows'::jsonb
) as changed_preview \gset
reset role;

select public.test_assert(
  (
    select count(*) = 149
      from jsonb_array_elements(:'changed_preview'::jsonb -> 'rows') row_value
     where row_value ->> 'reconciliation_status' = 'unchanged'
  )
  and (
    select count(*) = 1
      from jsonb_array_elements(:'changed_preview'::jsonb -> 'rows') row_value
     where row_value ->> 'reconciliation_status' = 'changed'
       and row_value ->> 'recommended_action' = 'update'
       and row_value ->> 'target_item_id' = '30000000-0000-4000-8000-000000000001'
  ),
  'The modified portable export did not produce exactly one authoritative update.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_execute_price_book_import(
  (:'owner_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(:'changed_rows'::jsonb -> 0),
  '{"2":"update"}'::jsonb,
  '40000000-0000-4000-8000-000000000001',
  'ServSync_Price_Book_2026-08-12.csv', repeat('a', 64), 512,
  '{"ServSync Item Reference":"external_item_id"}'::jsonb
) as changed_import \gset
reset role;

select public.test_assert(
  (select default_unit_price_cents = 9999
     from public.contractor_price_book_items
    where id = '30000000-0000-4000-8000-000000000001'),
  'Portable-reference execution updated the wrong item or failed to update.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_execute_price_book_import_rollback(
  (:'changed_import'::jsonb ->> 'batch_id')::uuid,
  '50000000-0000-4000-8000-000000000001'
) as rollback_result \gset
reset role;

select public.test_assert(
  (select default_unit_price_cents = 7501
     from public.contractor_price_book_items
    where id = '30000000-0000-4000-8000-000000000001'),
  'Generic guarded rollback did not restore a portable-reference update.'
);

insert into public.external_object_mappings (
  provider, provider_account_id, provider_object_type, provider_object_id,
  servsync_entity_type, servsync_entity_id, contractor_id, mapping_status,
  sync_direction, metadata
)
select 'servsync_file_import', :'preservation_source'::jsonb ->> 'id',
       'contractor_price_book_item',
       'servsync-item:30000000-0000-4000-8000-000000000003',
       'contractor_price_book_item', item.id, item.contractor_id, 'active',
       'imported', jsonb_build_object(
         'last_import_values', public.servsync_private_price_book_item_values(item),
         'last_import_mapped_fields', jsonb_build_array(
           'title', 'customer_description', 'default_unit_price_cents'
         )
       )
  from public.contractor_price_book_items item
 where item.id = '30000000-0000-4000-8000-000000000003';

update public.contractor_price_book_items
   set customer_description = 'Manual customer description'
 where id = '30000000-0000-4000-8000-000000000003';

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'preservation_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'row_number', 601,
    'external_item_id', 'servsync-item:30000000-0000-4000-8000-000000000003',
    'mapped_fields', jsonb_build_array(
      'title', 'customer_description', 'default_unit_price_cents'
    ),
    'values', jsonb_build_object(
      'title', 'HVAC item 003',
      'customer_description', 'Customer description 3',
      'default_unit_price_cents', 8888
    )
  ))
) as preservation_preview \gset
reset role;

select public.test_assert(
  :'preservation_preview'::jsonb #>> '{rows,0,reconciliation_status}' = 'changed'
  and :'preservation_preview'::jsonb #>> '{rows,0,recommended_action}' = 'update'
  and :'preservation_preview'::jsonb #>> '{rows,0,result_values,customer_description}' = 'Manual customer description'
  and (:'preservation_preview'::jsonb #>> '{rows,0,result_values,default_unit_price_cents}')::integer = 8888
  and jsonb_array_length(:'preservation_preview'::jsonb #> '{rows,0,conflict_fields}') = 0,
  'Portable reconciliation did not preserve an unrelated manual edit from an agreeing source baseline.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_execute_price_book_import(
  (:'preservation_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'row_number', 601,
    'external_item_id', 'servsync-item:30000000-0000-4000-8000-000000000003',
    'mapped_fields', jsonb_build_array(
      'title', 'customer_description', 'default_unit_price_cents'
    ),
    'values', jsonb_build_object(
      'title', 'HVAC item 003',
      'customer_description', 'Customer description 3',
      'default_unit_price_cents', 8888
    )
  )),
  '{"601":"update"}'::jsonb,
  '40000000-0000-4000-8000-000000000003',
  'portable-manual-preservation.csv', repeat('c', 64), 256,
  '{"ServSync Item Reference":"external_item_id"}'::jsonb
) as preservation_import \gset
reset role;

select public.test_assert(
  (select customer_description = 'Manual customer description'
          and default_unit_price_cents = 8888
     from public.contractor_price_book_items
    where id = '30000000-0000-4000-8000-000000000003'),
  'Portable-reference execution did not preserve the unrelated manual edit.'
);

update public.contractor_price_book_items
   set customer_description = 'Second manual customer description'
 where id = '30000000-0000-4000-8000-000000000003';

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'preservation_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'row_number', 602,
    'external_item_id', 'servsync-item:30000000-0000-4000-8000-000000000003',
    'mapped_fields', jsonb_build_array('title', 'customer_description'),
    'values', jsonb_build_object(
      'title', 'HVAC item 003',
      'customer_description', 'Imported conflicting description'
    )
  ))
) as preservation_conflict \gset
reset role;

select public.test_assert(
  :'preservation_conflict'::jsonb #>> '{rows,0,reconciliation_status}' = 'ambiguous'
  and :'preservation_conflict'::jsonb #>> '{rows,0,recommended_action}' = 'skip'
  and :'preservation_conflict'::jsonb #> '{rows,0,allowed_actions}' = '["skip"]'::jsonb
  and :'preservation_conflict'::jsonb #> '{rows,0,conflict_fields}' ? 'customer_description',
  'Portable reconciliation did not fail closed for a same-field manual/import conflict.'
);

insert into public.external_object_mappings (
  provider, provider_account_id, provider_object_type, provider_object_id,
  servsync_entity_type, servsync_entity_id, contractor_id, mapping_status, sync_direction
) values (
  'servsync_file_import', :'conflict_source'::jsonb ->> 'id',
  'contractor_price_book_item',
  'servsync-item:30000000-0000-4000-8000-000000000001',
  'contractor_price_book_item',
  '30000000-0000-4000-8000-000000000002',
  '20000000-0000-0000-0000-000000000001', 'active', 'imported'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'conflict_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(:'export_rows'::jsonb -> 0)
) as conflict_preview \gset
reset role;

select public.test_assert(
  :'conflict_preview'::jsonb #>> '{rows,0,reconciliation_status}' = 'invalid'
  and :'conflict_preview'::jsonb #>> '{rows,0,match_type}' = 'ambiguous'
  and :'conflict_preview'::jsonb #> '{rows,0,allowed_actions}' = '["skip"]'::jsonb
  and :'conflict_preview'::jsonb #>> '{rows,0,target_item_id}' = '30000000-0000-4000-8000-000000000001',
  'Contradictory portable and source identities did not fail closed.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'owner_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(
    jsonb_build_object('row_number', 501, 'external_item_id', 'servsync-item:', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Malformed empty')),
    jsonb_build_object('row_number', 502, 'external_item_id', 'servsync-item:not-a-uuid', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Malformed UUID')),
    jsonb_build_object('row_number', 503, 'external_item_id', 'servsync-item:30000000-0000-4000-8000-000000000001:extra', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Malformed extra')),
    jsonb_build_object('row_number', 504, 'external_item_id', ' servsync-item:bad ', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Malformed whitespace')),
    jsonb_build_object('row_number', 505, 'external_item_id', 'SERVSYNC-ITEM:30000000-0000-4000-8000-000000000001', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Malformed prefix case'))
  )
) as malformed_preview \gset
reset role;

select public.test_assert(
  (
    select count(*) = 5
      from jsonb_array_elements(:'malformed_preview'::jsonb -> 'rows') row_value
     where row_value ->> 'reconciliation_status' = 'invalid'
       and row_value ->> 'recommended_action' = 'skip'
       and row_value -> 'allowed_actions' = '["skip"]'::jsonb
       and row_value ->> 'target_item_id' is null
       and row_value -> 'errors' ? 'ServSync item reference is invalid.'
  ),
  'Malformed reserved portable references did not fail closed.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'owner_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'row_number', 506,
    'external_item_id', 'servsync-asset:30000000-0000-4000-8000-000000000001',
    'mapped_fields', jsonb_build_array('title'),
    'values', jsonb_build_object('title', 'Unsupported reference type')
  ))
) as unsupported_preview \gset
reset role;

select public.test_assert(
  :'unsupported_preview'::jsonb #>> '{rows,0,reconciliation_status}' = 'new'
  and :'unsupported_preview'::jsonb #>> '{rows,0,match_type}' = 'none'
  and :'unsupported_preview'::jsonb #>> '{rows,0,target_item_id}' is null,
  'An unsupported ServSync identifier type became authoritative.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'owner_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'row_number', 507,
    'external_item_id', 'servsync-item:39999999-9999-4999-8999-999999999999',
    'mapped_fields', jsonb_build_array('title'),
    'values', jsonb_build_object('title', 'Nonexistent portable item')
  ))
) as nonexistent_preview \gset
reset role;

select public.test_assert(
  :'nonexistent_preview'::jsonb #>> '{rows,0,reconciliation_status}' = 'new'
  and :'nonexistent_preview'::jsonb #>> '{rows,0,match_type}' = 'none'
  and :'nonexistent_preview'::jsonb #>> '{rows,0,target_item_id}' is null
  and jsonb_array_length(:'nonexistent_preview'::jsonb #> '{rows,0,errors}') = 0
  and :'nonexistent_preview'::jsonb #> '{rows,0,allowed_actions}' = '["add", "skip"]'::jsonb,
  'A nonexistent portable reference gained authority or leaked global existence.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000008';
select public.servsync_create_price_book_import_source('Clean destination') as other_source \gset
select public.servsync_preview_price_book_import(
  (:'other_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(:'export_rows'::jsonb -> 0)
) as other_preview \gset
reset role;

select public.test_assert(
  :'other_preview'::jsonb #>> '{rows,0,reconciliation_status}' = 'new'
  and :'other_preview'::jsonb #>> '{rows,0,match_type}' = 'none'
  and :'other_preview'::jsonb #>> '{rows,0,target_item_id}' is null
  and jsonb_array_length(:'other_preview'::jsonb #> '{rows,0,errors}') = 0
  and :'other_preview'::jsonb #> '{rows,0,allowed_actions}' = '["add", "skip"]'::jsonb,
  'A foreign or nonexistent portable reference gained authority or could not remain portable as new data.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000008';
select public.servsync_execute_price_book_import(
  (:'other_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(:'export_rows'::jsonb -> 0),
  '{"2":"add"}'::jsonb,
  '40000000-0000-4000-8000-000000000002',
  'foreign-portable.csv', repeat('b', 64), 512,
  '{"ServSync Item Reference":"external_item_id"}'::jsonb
) as other_import \gset
select public.servsync_preview_price_book_import(
  (:'other_source'::jsonb ->> 'id')::uuid,
  jsonb_build_array(:'export_rows'::jsonb -> 0)
) as other_repeat \gset
reset role;

select public.test_assert(
  (select count(*) = 150 from public.contractor_price_book_items
    where contractor_id = '20000000-0000-0000-0000-000000000001')
  and (select count(*) = 1 from public.contractor_price_book_items
    where contractor_id = '20000000-0000-0000-0000-000000000002')
  and :'other_repeat'::jsonb #>> '{rows,0,reconciliation_status}' = 'unchanged'
  and :'other_repeat'::jsonb #>> '{rows,0,match_type}' = 'external_id',
  'Clean-destination import changed the source tenant or failed source-scoped replay.'
);

create or replace function public.test_expect_portable_preview_denied(p_user_id uuid, p_source_id uuid)
returns void language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  begin
    perform public.servsync_preview_price_book_import(
      p_source_id,
      jsonb_build_array(jsonb_build_object(
        'row_number', 2,
        'external_item_id', 'servsync-item:30000000-0000-4000-8000-000000000001',
        'mapped_fields', jsonb_build_array('title'),
        'values', jsonb_build_object('title', 'HVAC item 001')
      ))
    );
    raise exception 'Expected portable preview denial.';
  exception when others then
    if sqlerrm not like '%management is unavailable%'
       and sqlerrm not like '%source is unavailable%' then
      raise;
    end if;
  end;
end;
$$;

set role authenticated;
select public.test_expect_portable_preview_denied(denied_user, (:'owner_source'::jsonb ->> 'id')::uuid)
  from unnest(array[
    '10000000-0000-0000-0000-000000000004'::uuid,
    '10000000-0000-0000-0000-000000000005'::uuid,
    '10000000-0000-0000-0000-000000000006'::uuid,
    '10000000-0000-0000-0000-000000000007'::uuid,
    '10000000-0000-0000-0000-000000000008'::uuid
  ]) denied_user;
reset role;

select public.test_assert(
  has_function_privilege('authenticated', 'public.servsync_preview_price_book_import(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.servsync_private_preview_price_book_import(uuid,uuid,jsonb)', 'execute')
  and not has_table_privilege('authenticated', 'public.contractor_price_book_import_batches', 'select')
  and not has_table_privilege('authenticated', 'public.contractor_price_book_import_batch_rows', 'select'),
  'Portable reconciliation changed the existing RPC or direct-table privilege boundary.'
);
