do $$
declare
  v_existing_fingerprint text;
begin
  if (select count(*) from public.contractor_saved_charge_price_book_lineage) <> 4 then
    raise exception 'Expected four complete lineage rows.';
  end if;
  if (select count(*) from public.contractor_price_book_items) <> 5 then
    raise exception 'Expected four migrated items plus one pre-existing item.';
  end if;
  if not exists (
    select 1 from public.contractor_price_book_items
     where title = 'Hourly labor' and line_type = 'labor' and unit = 'hour'
       and default_unit_price_cents = 12500 and customer_description = ''
       and internal_notes = 'Private labor note' and source = 'legacy_saved_charge'
  ) then raise exception 'Hourly labor mapping failed.'; end if;
  if not exists (
    select 1 from public.contractor_price_book_items
     where title = 'Inactive fee' and line_type = 'fee' and not active
       and archived_at = updated_at and archived_at is not null
  ) then raise exception 'Inactive fee mapping failed.'; end if;
  if not exists (
    select 1 from public.contractor_price_book_items
     where title = 'Zero service' and line_type = 'other' and default_unit_price_cents = 0
  ) then raise exception 'Explicit zero Service mapping failed.'; end if;
  if exists (
    select 1 from public.contractor_price_book_items
     where source = 'legacy_saved_charge' and customer_description <> ''
  ) then raise exception 'Private legacy descriptions leaked customer-facing.'; end if;
  if not exists (select 1 from public.contractor_price_book_items where title = 'Existing item' and source = 'manual') then
    raise exception 'Pre-existing Price Book item changed.';
  end if;
  if (select count(*) from pg_policies where tablename in ('contractor_saved_estimate_charges', 'contractor_saved_charge_price_book_lineage')) <> 0 then
    raise exception 'Retired private tables must be policy-free.';
  end if;
  if has_table_privilege('authenticated', 'public.contractor_saved_estimate_charges', 'select')
     or has_table_privilege('authenticated', 'public.contractor_saved_charge_price_book_lineage', 'select') then
    raise exception 'Browser roles retained retired-table access.';
  end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.contractor_saved_estimate_charges'::regclass)
     or not (select relforcerowsecurity from pg_class where oid = 'public.contractor_saved_charge_price_book_lineage'::regclass) then
    raise exception 'Forced RLS missing.';
  end if;
  if (select md5(jsonb_agg(payload order by id)::text) from public.estimates) <> 'd751713988987e9331980363e24189ce'
     or (select md5(jsonb_agg(payload order by id)::text) from public.invoices) <> 'd751713988987e9331980363e24189ce' then
    raise exception 'Historical financial documents changed.';
  end if;
end
$$;

do $$ begin
  insert into public.contractor_saved_estimate_charges (
    contractor_id, name, description, line_type, charge_type, amount_cents,
    default_quantity, unit, active, sort_order, created_at, updated_at
  ) values (
    '10000000-0000-4000-8000-000000000001', 'Blocked', '', 'fee', 'flat', 1,
    1, 'each', true, 0, now(), now()
  );
  raise exception 'Retired Saved Charge insert unexpectedly succeeded.';
exception when sqlstate '55000' then null; end $$;
