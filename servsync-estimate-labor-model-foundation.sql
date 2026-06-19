-- ServSync estimate labor model foundation.
-- Paste this into Supabase SQL Editor only after separate SQL application approval.
--
-- This patch adds nullable schema support for the future schema-backed Estimate
-- Labor Model / Line-Specific Labor Inputs feature. It does not change RLS,
-- grants, policies, storage, auth, app behavior, existing estimate totals, or
-- existing Price Required behavior.
--
-- Run after:
--   - servsync-structured-line-item-conversion-rpcs.sql
--
-- Important compatibility notes:
--   - Existing estimates and invoices remain valid with NULL labor fields.
--   - Existing standalone/manual labor rows remain valid legacy/manual rows.
--   - NULL unit_price_cents still means Price Required / price to be confirmed.
--   - 0 unit_price_cents still means intentionally $0.00.
--   - Labor values must not be stored in customer_description, model_spec, or
--     editor_source_note.
--   - RPC conversion updates are intentionally deferred to a follow-up SQL PR
--     so active estimate -> job -> invoice behavior can be reviewed separately.

begin;

alter table public.contractor_profiles
  add column if not exists default_labor_rate_cents integer;

alter table public.estimates
  add column if not exists labor_mode text,
  add column if not exists labor_rate_cents integer,
  add column if not exists job_labor_hours numeric(10,2),
  add column if not exists material_total_cents integer,
  add column if not exists labor_total_cents integer,
  add column if not exists fee_total_cents integer,
  add column if not exists other_total_cents integer,
  add column if not exists tax_rate_percent numeric(8,4),
  add column if not exists tax_cents integer;

alter table public.estimate_line_items
  add column if not exists labor_hours numeric(10,2);

alter table public.invoices
  add column if not exists labor_mode text,
  add column if not exists labor_rate_cents integer,
  add column if not exists job_labor_hours numeric(10,2),
  add column if not exists material_total_cents integer,
  add column if not exists labor_total_cents integer,
  add column if not exists fee_total_cents integer,
  add column if not exists other_total_cents integer;

alter table public.invoice_line_items
  add column if not exists labor_hours numeric(10,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contractor_profiles_default_labor_rate_cents_check'
      and conrelid = 'public.contractor_profiles'::regclass
  ) then
    alter table public.contractor_profiles
      add constraint contractor_profiles_default_labor_rate_cents_check
      check (default_labor_rate_cents is null or default_labor_rate_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_labor_mode_check'
      and conrelid = 'public.estimates'::regclass
  ) then
    alter table public.estimates
      add constraint estimates_labor_mode_check
      check (labor_mode is null or labor_mode in ('job_total', 'line_specific'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_labor_rate_cents_check'
      and conrelid = 'public.estimates'::regclass
  ) then
    alter table public.estimates
      add constraint estimates_labor_rate_cents_check
      check (labor_rate_cents is null or labor_rate_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_job_labor_hours_check'
      and conrelid = 'public.estimates'::regclass
  ) then
    alter table public.estimates
      add constraint estimates_job_labor_hours_check
      check (job_labor_hours is null or job_labor_hours >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_labor_breakdown_totals_check'
      and conrelid = 'public.estimates'::regclass
  ) then
    alter table public.estimates
      add constraint estimates_labor_breakdown_totals_check
      check (
        (material_total_cents is null or material_total_cents >= 0)
        and (labor_total_cents is null or labor_total_cents >= 0)
        and (fee_total_cents is null or fee_total_cents >= 0)
        and (other_total_cents is null or other_total_cents >= 0)
        and (tax_cents is null or tax_cents >= 0)
        and (tax_rate_percent is null or (tax_rate_percent >= 0 and tax_rate_percent <= 100))
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimate_line_items_labor_hours_check'
      and conrelid = 'public.estimate_line_items'::regclass
  ) then
    alter table public.estimate_line_items
      add constraint estimate_line_items_labor_hours_check
      check (labor_hours is null or labor_hours >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_labor_mode_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_labor_mode_check
      check (labor_mode is null or labor_mode in ('job_total', 'line_specific'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_labor_rate_cents_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_labor_rate_cents_check
      check (labor_rate_cents is null or labor_rate_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_job_labor_hours_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_job_labor_hours_check
      check (job_labor_hours is null or job_labor_hours >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_labor_breakdown_totals_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_labor_breakdown_totals_check
      check (
        (material_total_cents is null or material_total_cents >= 0)
        and (labor_total_cents is null or labor_total_cents >= 0)
        and (fee_total_cents is null or fee_total_cents >= 0)
        and (other_total_cents is null or other_total_cents >= 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoice_line_items_labor_hours_check'
      and conrelid = 'public.invoice_line_items'::regclass
  ) then
    alter table public.invoice_line_items
      add constraint invoice_line_items_labor_hours_check
      check (labor_hours is null or labor_hours >= 0);
  end if;
end $$;

comment on column public.contractor_profiles.default_labor_rate_cents is
  'Nullable default hourly labor rate for estimate labor calculations. NULL means no contractor default has been saved.';

comment on column public.estimates.labor_mode is
  'Nullable labor mode for schema-backed estimate labor: job_total or line_specific. NULL means legacy/no labor model.';
comment on column public.estimates.labor_rate_cents is
  'Nullable estimate-level hourly labor rate. Used for job-total and line-specific labor calculations.';
comment on column public.estimates.job_labor_hours is
  'Nullable total labor hours for job_total labor mode. Blank/NULL means no job-total labor hours were entered.';
comment on column public.estimates.material_total_cents is
  'Nullable material/scope subtotal for schema-backed estimate labor totals. NULL preserves legacy estimate compatibility.';
comment on column public.estimates.labor_total_cents is
  'Nullable labor subtotal for schema-backed estimate labor totals. NULL preserves legacy estimate compatibility.';
comment on column public.estimates.fee_total_cents is
  'Nullable fee subtotal for schema-backed estimate labor totals. NULL preserves legacy estimate compatibility.';
comment on column public.estimates.other_total_cents is
  'Nullable other-line subtotal for schema-backed estimate labor totals. NULL preserves legacy estimate compatibility.';
comment on column public.estimates.tax_rate_percent is
  'Nullable estimate tax rate for future estimate tax display/calculation. Invoices already have their own tax rate field.';
comment on column public.estimates.tax_cents is
  'Nullable estimate tax total for future estimate tax display/calculation. Existing estimate totals are not backfilled.';

comment on column public.estimate_line_items.labor_hours is
  'Nullable line-specific labor hours. NULL means no labor hours were entered for this line and should not display to homeowners.';

comment on column public.invoices.labor_mode is
  'Nullable labor mode copied from the source estimate when invoice labor preservation is implemented.';
comment on column public.invoices.labor_rate_cents is
  'Nullable invoice-level hourly labor rate copied from the source estimate when invoice labor preservation is implemented.';
comment on column public.invoices.job_labor_hours is
  'Nullable total labor hours for job_total invoices copied from the source estimate when implemented.';
comment on column public.invoices.material_total_cents is
  'Nullable material/scope subtotal copied from the source estimate when invoice labor preservation is implemented.';
comment on column public.invoices.labor_total_cents is
  'Nullable labor subtotal copied from the source estimate when invoice labor preservation is implemented.';
comment on column public.invoices.fee_total_cents is
  'Nullable fee subtotal copied from the source estimate when invoice labor preservation is implemented.';
comment on column public.invoices.other_total_cents is
  'Nullable other-line subtotal copied from the source estimate when invoice labor preservation is implemented.';

comment on column public.invoice_line_items.labor_hours is
  'Nullable line-specific labor hours copied from estimate line items when invoice labor preservation is implemented.';

notify pgrst, 'reload schema';

commit;

-- Post-migration verification queries:
--
-- Confirm labor model columns exist:
-- select table_name, column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and (
--     (table_name = 'contractor_profiles' and column_name = 'default_labor_rate_cents')
--     or (table_name = 'estimates' and column_name in (
--       'labor_mode',
--       'labor_rate_cents',
--       'job_labor_hours',
--       'material_total_cents',
--       'labor_total_cents',
--       'fee_total_cents',
--       'other_total_cents',
--       'tax_rate_percent',
--       'tax_cents'
--     ))
--     or (table_name = 'estimate_line_items' and column_name = 'labor_hours')
--     or (table_name = 'invoices' and column_name in (
--       'labor_mode',
--       'labor_rate_cents',
--       'job_labor_hours',
--       'material_total_cents',
--       'labor_total_cents',
--       'fee_total_cents',
--       'other_total_cents'
--     ))
--     or (table_name = 'invoice_line_items' and column_name = 'labor_hours')
--   )
-- order by table_name, column_name;
--
-- Confirm labor model check constraints exist:
-- select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conname in (
--   'contractor_profiles_default_labor_rate_cents_check',
--   'estimates_labor_mode_check',
--   'estimates_labor_rate_cents_check',
--   'estimates_job_labor_hours_check',
--   'estimates_labor_breakdown_totals_check',
--   'estimate_line_items_labor_hours_check',
--   'invoices_labor_mode_check',
--   'invoices_labor_rate_cents_check',
--   'invoices_job_labor_hours_check',
--   'invoices_labor_breakdown_totals_check',
--   'invoice_line_items_labor_hours_check'
-- )
-- order by table_name::text, conname;
--
-- Confirm Price Required / $0.00 nullability remains unchanged:
-- select table_name, column_name, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('estimate_line_items', 'invoice_line_items')
--   and column_name = 'unit_price_cents'
-- order by table_name;
--
-- Confirm RLS remains enabled on affected tables:
-- select relname, relrowsecurity
-- from pg_class
-- where oid in (
--   'public.contractor_profiles'::regclass,
--   'public.estimates'::regclass,
--   'public.estimate_line_items'::regclass,
--   'public.invoices'::regclass,
--   'public.invoice_line_items'::regclass
-- )
-- order by relname;
