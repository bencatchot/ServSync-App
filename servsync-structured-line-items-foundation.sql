-- ServSync structured estimate/invoice line item foundation.
-- Paste this into Supabase SQL Editor only after separate SQL application approval.
--
-- This foundation patch adds nullable customer-facing structured line item
-- fields for estimates and invoices. App/UI support will follow in a later PR.
-- The existing description column is preserved for backward compatibility and
-- remains the legacy/fallback display text until the app migrates to line_title
-- as the primary display label.
--
-- This patch does not change Price Required behavior, unit_price_cents
-- nullability/defaults, line_type constraints, RLS policies, grants, indexes,
-- triggers, saved charges, estimate template JSON, or unrelated schema.

begin;

alter table public.estimate_line_items
  add column if not exists line_title text,
  add column if not exists customer_description text,
  add column if not exists model_spec text,
  add column if not exists supply_status text;

alter table public.invoice_line_items
  add column if not exists line_title text,
  add column if not exists customer_description text,
  add column if not exists model_spec text,
  add column if not exists supply_status text;

alter table public.estimate_line_items
  drop constraint if exists estimate_line_items_supply_status_check;

alter table public.estimate_line_items
  add constraint estimate_line_items_supply_status_check
  check (
    supply_status is null
    or supply_status in ('contractor_supplied', 'customer_supplied', 'to_be_confirmed')
  );

alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_supply_status_check;

alter table public.invoice_line_items
  add constraint invoice_line_items_supply_status_check
  check (
    supply_status is null
    or supply_status in ('contractor_supplied', 'customer_supplied', 'to_be_confirmed')
  );

update public.estimate_line_items
   set line_title = nullif(trim(description), '')
 where line_title is null
   and nullif(trim(description), '') is not null;

update public.invoice_line_items
   set line_title = nullif(trim(description), '')
 where line_title is null
   and nullif(trim(description), '') is not null;

comment on column public.estimate_line_items.line_title is
  'Future primary customer-facing line item display label. Backfilled from description for legacy estimate lines.';
comment on column public.estimate_line_items.customer_description is
  'Optional customer-facing line item detail. Hidden by the app when blank or null.';
comment on column public.estimate_line_items.model_spec is
  'Optional model/specification detail. Hidden by the app when blank or null.';
comment on column public.estimate_line_items.supply_status is
  'Optional supply status: contractor_supplied, customer_supplied, or to_be_confirmed. Hidden by the app when blank or null.';

comment on column public.invoice_line_items.line_title is
  'Future primary customer-facing line item display label. Backfilled from description for legacy invoice lines.';
comment on column public.invoice_line_items.customer_description is
  'Optional customer-facing line item detail. Hidden by the app when blank or null.';
comment on column public.invoice_line_items.model_spec is
  'Optional model/specification detail. Hidden by the app when blank or null.';
comment on column public.invoice_line_items.supply_status is
  'Optional supply status: contractor_supplied, customer_supplied, or to_be_confirmed. Hidden by the app when blank or null.';

notify pgrst, 'reload schema';

commit;

-- Post-migration verification queries:
--
-- Confirm new estimate line item columns exist:
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'estimate_line_items'
--   and column_name in ('line_title', 'customer_description', 'model_spec', 'supply_status')
-- order by column_name;
--
-- Confirm new invoice line item columns exist:
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'invoice_line_items'
--   and column_name in ('line_title', 'customer_description', 'model_spec', 'supply_status')
-- order by column_name;
--
-- Confirm line_title is populated where description was present:
-- select count(*) as estimate_lines_missing_line_title
-- from public.estimate_line_items
-- where nullif(trim(description), '') is not null
--   and line_title is null;
--
-- select count(*) as invoice_lines_missing_line_title
-- from public.invoice_line_items
-- where nullif(trim(description), '') is not null
--   and line_title is null;
--
-- Confirm supply_status constraints exist:
-- select conname, pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conrelid in (
--   'public.estimate_line_items'::regclass,
--   'public.invoice_line_items'::regclass
-- )
--   and conname in (
--     'estimate_line_items_supply_status_check',
--     'invoice_line_items_supply_status_check'
--   )
-- order by conname;
--
-- Confirm unit_price_cents remains nullable with no default:
-- select table_name, column_name, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('estimate_line_items', 'invoice_line_items')
--   and column_name = 'unit_price_cents'
-- order by table_name;
--
-- Confirm line_type constraints still allow only labor/material/fee/other:
-- select conname, pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conrelid in (
--   'public.estimate_line_items'::regclass,
--   'public.invoice_line_items'::regclass
-- )
--   and conname in (
--     'estimate_line_items_line_type_check',
--     'invoice_line_items_line_type_check'
--   )
-- order by conname;
--
-- Confirm RLS remains enabled on affected tables:
-- select relname, relrowsecurity
-- from pg_class
-- where oid in (
--   'public.estimate_line_items'::regclass,
--   'public.invoice_line_items'::regclass
-- )
-- order by relname;
