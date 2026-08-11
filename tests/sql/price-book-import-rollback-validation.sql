set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select public.servsync_create_price_book_import_source('Primary CSV') as source_result \gset

reset role;

insert into public.contractor_price_book_items (
  id, contractor_id, title, customer_description, internal_notes, trade, category,
  line_type, default_unit_price_cents, sku
) values (
  '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'Original diagnostic', 'Original customer copy', 'Keep this private note', 'HVAC', 'Service',
  'fee', 9500, 'DIAG-1'
);

insert into public.external_object_mappings (
  provider, provider_account_id, provider_object_type, provider_object_id,
  servsync_entity_type, servsync_entity_id, contractor_id, mapping_status,
  sync_direction, metadata
) values (
  'servsync_file_import', :'source_result'::jsonb ->> 'id', 'contractor_price_book_item', 'EXIST-1',
  'contractor_price_book_item', '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 'active', 'imported',
  jsonb_build_object(
    'last_import_values', jsonb_build_object('title', 'Original diagnostic', 'customer_description', 'Original customer copy', 'default_unit_price_cents', 9500),
    'last_import_mapped_fields', jsonb_build_array('title', 'customer_description', 'default_unit_price_cents')
  )
);

insert into public.estimate_line_snapshots (source_price_book_item_id, title, unit_price_cents)
values ('30000000-0000-0000-0000-000000000001', 'Original diagnostic', 9500);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select public.servsync_execute_price_book_import(
  (:'source_result'::jsonb ->> 'id')::uuid,
  jsonb_build_array(
    jsonb_build_object('row_number', 2, 'external_item_id', 'EXIST-1', 'mapped_fields', jsonb_build_array('title', 'customer_description', 'default_unit_price_cents'), 'values', jsonb_build_object('title', 'Updated diagnostic', 'customer_description', 'Updated customer copy', 'default_unit_price_cents', 10500)),
    jsonb_build_object('row_number', 3, 'external_item_id', 'ADD-1', 'mapped_fields', jsonb_build_array('title', 'default_unit_price_cents'), 'values', jsonb_build_object('title', 'Imported maintenance', 'default_unit_price_cents', 15000)),
    jsonb_build_object('row_number', 4, 'external_item_id', null, 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Deliberately skipped'))
  ),
  '{"2":"update","3":"add","4":"skip"}'::jsonb,
  '40000000-0000-0000-0000-000000000001', 'mixed.csv', repeat('a', 64), 256,
  '{"title":"title"}'::jsonb
) as import_result \gset

reset role;

update public.contractor_price_book_items
   set internal_notes = 'Unrelated edit after import'
 where id = '30000000-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select public.servsync_preview_price_book_import_rollback((:'import_result'::jsonb ->> 'batch_id')::uuid) as admin_preview \gset
reset role;

select public.test_assert(
  (:'admin_preview'::jsonb ->> 'can_rollback')::boolean
  and :'admin_preview'::jsonb #>> '{counts,restore}' = '1'
  and :'admin_preview'::jsonb #>> '{counts,archive}' = '1'
  and :'admin_preview'::jsonb #>> '{counts,unchanged}' = '1'
  and :'admin_preview'::jsonb #>> '{counts,conflict}' = '0',
  'Mixed rollback preview was not exact.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select public.servsync_execute_price_book_import_rollback(
  (:'import_result'::jsonb ->> 'batch_id')::uuid,
  '50000000-0000-0000-0000-000000000001'
) as rollback_result \gset

select public.servsync_execute_price_book_import_rollback(
  (:'import_result'::jsonb ->> 'batch_id')::uuid,
  '50000000-0000-0000-0000-000000000001'
) as rollback_replay \gset
reset role;

select public.test_assert(
  (select title = 'Original diagnostic'
          and customer_description = 'Original customer copy'
          and default_unit_price_cents = 9500
          and internal_notes = 'Unrelated edit after import'
     from public.contractor_price_book_items where id = '30000000-0000-0000-0000-000000000001'),
  'Rollback did not restore only original changed fields.'
);
select public.test_assert(
  (select not item.active and item.archived_at is not null and mapping.mapping_status = 'active'
     from public.external_object_mappings mapping
     join public.contractor_price_book_items item on item.id = mapping.servsync_entity_id
    where mapping.provider_account_id = :'source_result'::jsonb ->> 'id' and mapping.provider_object_id = 'ADD-1'),
  'Imported addition was not canonically archived with mapping retained.'
);
select public.test_assert(
  (select count(*) = 1 from public.contractor_price_book_import_rollback_batches)
  and (select count(*) = 3 from public.contractor_price_book_import_rollback_rows)
  and (:'rollback_replay'::jsonb ->> 'idempotent')::boolean,
  'Rollback replay duplicated audit or did not report idempotency.'
);
select public.test_assert(
  (select title = 'Original diagnostic' and unit_price_cents = 9500 from public.estimate_line_snapshots limit 1),
  'Estimate snapshot changed during Price Book rollback.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import(
  (:'source_result'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'row_number', 2,
    'external_item_id', 'ADD-1',
    'mapped_fields', jsonb_build_array('title', 'default_unit_price_cents'),
    'values', jsonb_build_object('title', 'Imported maintenance', 'default_unit_price_cents', 15000)
  ))
) as repeat_preview \gset
reset role;
select public.test_assert(
  :'repeat_preview'::jsonb #>> '{rows,0,match_type}' = 'external_id'
  and :'repeat_preview'::jsonb #>> '{rows,0,target_item_id}' is not null
  and (select count(*) = 2 from public.contractor_price_book_items where contractor_id = '20000000-0000-0000-0000-000000000001'),
  'Repeat import did not retain deterministic mapping to the archived addition.'
);

-- Same-field manual edit conflicts and execution remains all-or-nothing.
reset role;
insert into public.contractor_price_book_items (id, contractor_id, title, line_type)
values ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Before conflict', 'other');
insert into public.external_object_mappings (
  provider, provider_account_id, provider_object_type, provider_object_id, servsync_entity_type,
  servsync_entity_id, contractor_id, mapping_status, sync_direction, metadata
) values (
  'servsync_file_import', :'source_result'::jsonb ->> 'id', 'contractor_price_book_item', 'CONFLICT-1',
  'contractor_price_book_item', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
  'active', 'imported', jsonb_build_object('last_import_values', jsonb_build_object('title', 'Before conflict'), 'last_import_mapped_fields', jsonb_build_array('title'))
);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_execute_price_book_import(
  (:'source_result'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object('row_number', 2, 'external_item_id', 'CONFLICT-1', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Imported conflict'))),
  '{"2":"update"}', '40000000-0000-0000-0000-000000000002', 'conflict.csv', repeat('b', 64), 80, '{"title":"title"}'
) as conflict_import \gset
reset role;
update public.contractor_price_book_items set title = 'Manual same-field edit' where id = '30000000-0000-0000-0000-000000000002';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_preview_price_book_import_rollback((:'conflict_import'::jsonb ->> 'batch_id')::uuid) as conflict_preview \gset
select public.test_assert(
  not (:'conflict_preview'::jsonb ->> 'can_rollback')::boolean
  and :'conflict_preview'::jsonb #>> '{counts,conflict}' = '1',
  'Same-field manual edit did not conflict.'
);
select public.test_expect_rollback_conflict((:'conflict_import'::jsonb ->> 'batch_id')::uuid);
reset role;

-- Exact role, tenant, anonymous, and direct-table boundaries.
select public.test_expect_rollback_denied((:'conflict_import'::jsonb ->> 'batch_id')::uuid, denied_user)
  from unnest(array[
    '10000000-0000-0000-0000-000000000004'::uuid,
    '10000000-0000-0000-0000-000000000005'::uuid,
    '10000000-0000-0000-0000-000000000006'::uuid,
    '10000000-0000-0000-0000-000000000007'::uuid,
    '10000000-0000-0000-0000-000000000008'::uuid
  ]) denied_user;

reset role;

-- A later import touching the same field blocks rollback of the earlier batch.
insert into public.contractor_price_book_items (id, contractor_id, title, line_type)
values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Before later import', 'other');
insert into public.external_object_mappings (
  provider, provider_account_id, provider_object_type, provider_object_id, servsync_entity_type,
  servsync_entity_id, contractor_id, mapping_status, sync_direction, metadata
) values (
  'servsync_file_import', :'source_result'::jsonb ->> 'id', 'contractor_price_book_item', 'LATER-1',
  'contractor_price_book_item', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
  'active', 'imported', jsonb_build_object('last_import_values', jsonb_build_object('title', 'Before later import'), 'last_import_mapped_fields', jsonb_build_array('title'))
);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_execute_price_book_import(
  (:'source_result'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object('row_number', 2, 'external_item_id', 'LATER-1', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'First import value'))),
  '{"2":"update"}', '40000000-0000-0000-0000-000000000003', 'later-one.csv', repeat('c', 64), 80, '{"title":"title"}'
) as earlier_import \gset
reset role;
select pg_sleep(0.01);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_execute_price_book_import(
  (:'source_result'::jsonb ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object('row_number', 2, 'external_item_id', 'LATER-1', 'mapped_fields', jsonb_build_array('title'), 'values', jsonb_build_object('title', 'Second import value'))),
  '{"2":"update"}', '40000000-0000-0000-0000-000000000004', 'later-two.csv', repeat('d', 64), 80, '{"title":"title"}'
) as later_import \gset
select public.servsync_preview_price_book_import_rollback((:'earlier_import'::jsonb ->> 'batch_id')::uuid) as later_conflict_preview \gset
reset role;
select public.test_assert(
  not (:'later_conflict_preview'::jsonb ->> 'can_rollback')::boolean
  and :'later_conflict_preview'::jsonb #>> '{counts,conflict}' = '1',
  'Later same-field import did not block rollback of the earlier batch.'
);

do $$
begin
  if has_table_privilege('authenticated', 'public.contractor_price_book_import_rollback_batches', 'select')
     or has_table_privilege('authenticated', 'public.contractor_price_book_import_rollback_rows', 'insert')
     or has_function_privilege('anon', 'public.servsync_preview_price_book_import_rollback(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.servsync_preview_price_book_import_rollback(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.servsync_execute_price_book_import_rollback(uuid,uuid)', 'execute') then
    raise exception 'Rollback ACL boundary is incorrect.';
  end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.contractor_price_book_import_rollback_batches'::regclass)
     or not (select relforcerowsecurity from pg_class where oid = 'public.contractor_price_book_import_rollback_rows'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('contractor_price_book_import_rollback_batches', 'contractor_price_book_import_rollback_rows')) then
    raise exception 'Rollback private-table RLS posture is incorrect.';
  end if;
end;
$$;

do $$
declare
  v_batch_id uuid;
  v_row_id uuid;
begin
  select id into v_batch_id from public.contractor_price_book_import_rollback_batches order by created_at limit 1;
  select id into v_row_id from public.contractor_price_book_import_rollback_rows where rollback_batch_id = v_batch_id limit 1;
  begin
    update public.contractor_price_book_import_rollback_batches set result_summary = '{}' where id = v_batch_id;
    raise exception 'Expected completed rollback batch immutability.';
  exception when others then
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
  begin
    delete from public.contractor_price_book_import_rollback_rows where id = v_row_id;
    raise exception 'Expected rollback row append-only protection.';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end;
$$;
