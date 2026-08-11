select public.test_assert(
  (select relowner = (select oid from pg_roles where rolname = 'postgres')
     from pg_class where oid = 'public.contractor_price_book_item_costs'::regclass),
  'Cost table must be postgres-owned.'
);
select public.test_assert(
  (select relrowsecurity and relforcerowsecurity
     from pg_class where oid = 'public.contractor_price_book_item_costs'::regclass),
  'Cost table must use forced RLS.'
);
select public.test_assert(
  not exists (select 1 from pg_policy where polrelid = 'public.contractor_price_book_item_costs'::regclass),
  'Cost table must remain policy-free.'
);
select public.test_assert(
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.contractor_price_book_item_costs'::regclass
       and confrelid = 'public.contractor_price_book_items'::regclass
       and contype = 'f'
  ) and exists (
    select 1 from pg_constraint
     where conrelid = 'public.contractor_price_book_item_costs'::regclass
       and confrelid = 'public.contractor_profiles'::regclass
       and contype = 'f'
  ),
  'Cost storage must retain item and contractor foreign keys.'
);
select public.test_assert(
  exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'contractor_price_book_item_costs'
       and indexname = 'contractor_price_book_item_costs_contractor_idx'
  ),
  'Cost storage must retain its contractor lookup index.'
);
select public.test_assert(
  not has_table_privilege('authenticated', 'public.contractor_price_book_item_costs', 'select')
  and not has_table_privilege('authenticated', 'public.contractor_price_book_item_costs', 'insert')
  and not has_table_privilege('authenticated', 'public.contractor_price_book_item_costs', 'update')
  and not has_table_privilege('authenticated', 'public.contractor_price_book_item_costs', 'delete'),
  'Authenticated browser access to cost storage must remain denied.'
);
select public.test_assert(
  has_function_privilege('authenticated', 'public.servsync_list_price_book_internal_costs()', 'execute')
  and has_function_privilege('authenticated', 'public.servsync_save_price_book_item_with_cost(uuid,text,text,text,text,text,text,text,text,integer,boolean,numeric,text,boolean,integer)', 'execute')
  and not has_function_privilege('anon', 'public.servsync_list_price_book_internal_costs()', 'execute'),
  'Only authenticated callers may reach the controlled cost RPC boundary.'
);
select public.test_assert(
  (select count(*) = 2
     from pg_proc procedure
     join pg_namespace namespace on namespace.oid = procedure.pronamespace
     join pg_roles owner_role on owner_role.oid = procedure.proowner
    where namespace.nspname = 'public'
      and procedure.proname in ('servsync_list_price_book_internal_costs', 'servsync_save_price_book_item_with_cost')
      and owner_role.rolname = 'postgres'
      and procedure.prosecdef
      and procedure.proconfig = array['search_path=public']),
  'Browser-callable cost RPCs must be postgres-owned SECURITY DEFINER functions with a fixed path.'
);
select public.test_assert(
  not has_function_privilege('authenticated', 'public.servsync_private_price_book_cost_contractor_id()', 'execute')
  and not has_function_privilege('authenticated', 'public.servsync_private_validate_price_book_item_cost()', 'execute'),
  'Private cost helpers must not be browser-callable.'
);
select public.test_assert(
  (select count(*) = 0 from public.contractor_price_book_item_costs),
  'Migration must not backfill cost.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select public.servsync_save_price_book_item_with_cost(
  null, 'Costed service', 'Customer-safe description', 'Private note', 'HVAC', 'Service', null,
  'labor', 'visit', 10000, true, 1.5, 'COST-1', true, 6000
) as owner_costed \gset
select public.servsync_save_price_book_item_with_cost(
  null, 'Missing cost', '', '', '', '', null, 'other', 'each', 5000, true, null, null, true, null
) as owner_missing \gset
select public.servsync_save_price_book_item_with_cost(
  null, 'Zero cost', '', '', '', '', null, 'material', 'each', 2000, true, null, null, true, 0
) as owner_zero \gset
select public.servsync_save_price_book_item_with_cost(
  null, 'Negative margin', '', '', '', '', null, 'material', 'each', 10000, true, null, null, true, 12000
) as owner_negative_margin \gset
select public.servsync_save_price_book_item_with_cost(
  null, 'Zero selling price', '', '', '', '', null, 'fee', 'each', 0, true, null, null, true, 2500
) as owner_zero_price \gset

reset role;
select public.test_assert(
  (select internal_cost_cents = 6000 from public.contractor_price_book_item_costs
    where price_book_item_id = (:'owner_costed'::jsonb ->> 'item_id')::uuid),
  'Owner create must persist cost atomically.'
);
select public.test_assert(
  not exists (select 1 from public.contractor_price_book_item_costs
    where price_book_item_id = (:'owner_missing'::jsonb ->> 'item_id')::uuid),
  'Missing cost must remain absent.'
);
select public.test_assert(
  (select internal_cost_cents = 0 from public.contractor_price_book_item_costs
    where price_book_item_id = (:'owner_zero'::jsonb ->> 'item_id')::uuid),
  'Explicit zero cost must remain distinct from missing cost.'
);
select public.test_assert(
  (select default_unit_price_cents = 10000 from public.contractor_price_book_items
    where id = (:'owner_negative_margin'::jsonb ->> 'item_id')::uuid)
  and (select internal_cost_cents = 12000 from public.contractor_price_book_item_costs
    where price_book_item_id = (:'owner_negative_margin'::jsonb ->> 'item_id')::uuid),
  'Cost above price must be allowed without changing selling price.'
);
select public.test_assert(
  (select default_unit_price_cents = 0 from public.contractor_price_book_items
    where id = (:'owner_zero_price'::jsonb ->> 'item_id')::uuid),
  'Zero selling price must remain valid with cost.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_save_price_book_item_with_cost(
  (:'owner_costed'::jsonb ->> 'item_id')::uuid, 'Costed service', 'Customer-safe description',
  'Private note', 'HVAC', 'Service', null, 'labor', 'visit', 10000, true, 1.5, 'COST-1', true, 7000
);
reset role;
select public.test_assert(
  (select internal_cost_cents = 7000 from public.contractor_price_book_item_costs
    where price_book_item_id = (:'owner_costed'::jsonb ->> 'item_id')::uuid),
  'Cost update must persist.'
);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_save_price_book_item_with_cost(
  (:'owner_costed'::jsonb ->> 'item_id')::uuid, 'Costed service', 'Customer-safe description',
  'Private note', 'HVAC', 'Service', null, 'labor', 'visit', 10000, true, 1.5, 'COST-1', true, null
);
reset role;
select public.test_assert(
  not exists (select 1 from public.contractor_price_book_item_costs
    where price_book_item_id = (:'owner_costed'::jsonb ->> 'item_id')::uuid),
  'Clearing cost must restore the exact unset state.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select public.test_assert(jsonb_array_length(public.servsync_list_price_book_internal_costs()) = 3, 'Admin must list manager-only cost.');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select public.test_assert(jsonb_array_length(public.servsync_list_price_book_internal_costs()) = 3, 'Office must list manager-only cost.');

reset role;

create or replace function public.test_expect_cost_denied(p_user_id uuid)
returns void language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  begin
    perform public.servsync_list_price_book_internal_costs();
    raise exception 'Expected cost list denial.';
  exception when others then
    if sqlerrm not like '%cost is unavailable%' then raise; end if;
  end;
end;
$$;

set role authenticated;
select public.test_expect_cost_denied('10000000-0000-0000-0000-000000000004');
select public.test_expect_cost_denied('10000000-0000-0000-0000-000000000005');
select public.test_expect_cost_denied('10000000-0000-0000-0000-000000000006');
select public.test_expect_cost_denied('10000000-0000-0000-0000-000000000007');

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000008';
select public.test_assert(jsonb_array_length(public.servsync_list_price_book_internal_costs()) = 0, 'Cross-tenant manager must see only own costs.');

reset role;
select public.test_assert(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name in ('estimate_line_snapshots')
       and column_name like '%cost%'
  ),
  'Customer-work snapshot schemas must not gain cost columns.'
);

-- Generic imports remain cost-unaware in v1, so their update and rollback paths
-- cannot erase or rewrite a private companion cost.
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_create_price_book_import_source('Cost preservation CSV') as cost_source \gset
select public.servsync_execute_price_book_import(
  (:'cost_source'::jsonb ->> 'id')::uuid,
  '[{"row_number":2,"external_item_id":"cost-import-1","sku":"IMPORT-COST","values":{"title":"Imported cost item","line_type":"material","default_unit_price_cents":10000},"mapped_fields":["title","line_type","default_unit_price_cents"],"row_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,
  '{"2":"add"}'::jsonb,
  '60000000-0000-0000-0000-000000000001',
  'cost-preservation.csv', repeat('b',64), 100, '{}'::jsonb
) as first_import \gset

reset role;
select target_price_book_item_id as imported_item_id
  from public.contractor_price_book_import_batch_rows
 where batch_id = (:'first_import'::jsonb ->> 'batch_id')::uuid
   and row_number = 2 \gset
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_save_price_book_item_with_cost(
  :'imported_item_id'::uuid,
  'Imported cost item', '', '', '', '', null, 'material', null, 10000, true, null, 'IMPORT-COST', true, 4500
);

select public.servsync_execute_price_book_import(
  (:'cost_source'::jsonb ->> 'id')::uuid,
  '[{"row_number":2,"external_item_id":"cost-import-1","sku":"IMPORT-COST","values":{"title":"Imported cost item updated","line_type":"material","default_unit_price_cents":11000},"mapped_fields":["title","line_type","default_unit_price_cents"],"row_fingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}]'::jsonb,
  '{"2":"update"}'::jsonb,
  '60000000-0000-0000-0000-000000000002',
  'cost-preservation-2.csv', repeat('d',64), 110, '{}'::jsonb
) as second_import \gset

reset role;
select public.test_assert(
  (select internal_cost_cents = 4500
     from public.contractor_price_book_item_costs cost
     join public.contractor_price_book_import_batch_rows row_audit
       on row_audit.target_price_book_item_id = cost.price_book_item_id
    where row_audit.batch_id = (:'second_import'::jsonb ->> 'batch_id')::uuid),
  'Unmapped repeat import must preserve internal cost.'
);

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select public.servsync_execute_price_book_import_rollback(
  (:'second_import'::jsonb ->> 'batch_id')::uuid,
  '60000000-0000-0000-0000-000000000003'
);
reset role;
select public.test_assert(
  (select internal_cost_cents = 4500
     from public.contractor_price_book_item_costs cost
     join public.contractor_price_book_import_batch_rows row_audit
       on row_audit.target_price_book_item_id = cost.price_book_item_id
    where row_audit.batch_id = (:'second_import'::jsonb ->> 'batch_id')::uuid),
  'Guarded rollback must leave private cost unchanged.'
);

insert into public.contractor_price_book_items (
  id, contractor_id, title, line_type
) values (
  '30000000-0000-0000-0000-000000000099',
  '20000000-0000-0000-0000-000000000001', 'Negative cost constraint', 'other'
);

do $$
begin
  begin
    insert into public.contractor_price_book_item_costs (
      price_book_item_id, contractor_id, internal_cost_cents
    ) values (
      '30000000-0000-0000-0000-000000000099',
      '20000000-0000-0000-0000-000000000001', -1
    );
    raise exception 'Expected negative cost rejection.';
  exception when check_violation then null;
  end;
end;
$$;
