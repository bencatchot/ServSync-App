-- ServSync estimate/invoice/saved-charge equipment line-type cleanup.
-- Paste this into Supabase SQL Editor after PR #50 is deployed.
--
-- This patch removes the legacy persisted line_type = 'equipment' allowance by
-- mapping existing rows to material and tightening DB constraints. It does not
-- change descriptions containing the word "equipment", pricing/null behavior,
-- RLS policies, grants, indexes, triggers, or unrelated schema.

begin;

update public.estimate_line_items
   set line_type = 'material'
 where line_type = 'equipment';

update public.invoice_line_items
   set line_type = 'material'
 where line_type = 'equipment';

update public.contractor_saved_estimate_charges
   set line_type = 'material'
 where line_type = 'equipment';

update public.estimate_templates t
   set line_items = normalized.line_items
  from (
    select
      et.id,
      jsonb_agg(
        case
          when item.value->>'line_type' = 'equipment'
            then jsonb_set(item.value, '{line_type}', to_jsonb('material'::text), true)
          else item.value
        end
        order by item.ordinality
      ) as line_items
    from public.estimate_templates et
    cross join lateral jsonb_array_elements(et.line_items) with ordinality as item(value, ordinality)
    where jsonb_typeof(et.line_items) = 'array'
      and jsonb_path_exists(et.line_items, '$[*] ? (@.line_type == "equipment")')
    group by et.id
  ) normalized
 where t.id = normalized.id;

alter table public.estimate_line_items
  drop constraint if exists estimate_line_items_line_type_check;

alter table public.estimate_line_items
  add constraint estimate_line_items_line_type_check
  check (line_type in ('labor', 'material', 'fee', 'other'));

alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_line_type_check;

alter table public.invoice_line_items
  add constraint invoice_line_items_line_type_check
  check (line_type in ('labor', 'material', 'fee', 'other'));

alter table public.contractor_saved_estimate_charges
  drop constraint if exists contractor_saved_estimate_charges_line_type_check;

alter table public.contractor_saved_estimate_charges
  add constraint contractor_saved_estimate_charges_line_type_check
  check (line_type in ('labor', 'material', 'fee', 'other'));

notify pgrst, 'reload schema';

commit;

-- Post-migration verification queries:
--
-- select count(*) as equipment_estimate_line_items
-- from public.estimate_line_items
-- where line_type = 'equipment';
--
-- select count(*) as equipment_invoice_line_items
-- from public.invoice_line_items
-- where line_type = 'equipment';
--
-- select count(*) as equipment_saved_estimate_charges
-- from public.contractor_saved_estimate_charges
-- where line_type = 'equipment';
--
-- select count(*) as equipment_estimate_templates
-- from public.estimate_templates
-- where jsonb_path_exists(line_items, '$[*] ? (@.line_type == "equipment")');
--
-- Sandbox-only/manual negative tests:
--
-- begin;
-- insert into public.estimate_line_items (
--   estimate_id, line_type, description, quantity, unit, unit_price_cents
-- ) values (
--   '<sandbox-estimate-id>'::uuid, 'equipment', 'Sandbox constraint test', 1, 'each', null
-- );
-- rollback;
--
-- begin;
-- insert into public.invoice_line_items (
--   invoice_id, line_type, description, quantity, unit, unit_price_cents
-- ) values (
--   '<sandbox-invoice-id>'::uuid, 'equipment', 'Sandbox constraint test', 1, 'each', null
-- );
-- rollback;
--
-- begin;
-- insert into public.contractor_saved_estimate_charges (
--   contractor_id, name, line_type, charge_type, amount_cents, default_quantity, unit
-- ) values (
--   '<sandbox-contractor-id>'::uuid, 'Sandbox constraint test', 'equipment', 'flat', 100, 1, 'each'
-- );
-- rollback;
