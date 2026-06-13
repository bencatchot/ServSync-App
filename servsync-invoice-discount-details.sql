-- ServSync invoice discount detail fields.
-- Run after servsync-invoices-schema.sql.
--
-- Adds persisted discount type/value/reason metadata and tax-rate metadata
-- while preserving the existing discount_cents and tax_cents totals used by
-- invoice totals and PDFs.

begin;

alter table public.invoices
  add column if not exists tax_rate_percent numeric(8,4) not null default 0,
  add column if not exists discount_type text not null default 'amount',
  add column if not exists discount_value numeric(12,4) not null default 0,
  add column if not exists discount_reason text not null default '';

update public.invoices
set
  discount_type = 'amount',
  discount_value = round((discount_cents::numeric / 100), 2),
  discount_reason = coalesce(discount_reason, '')
where discount_cents > 0
  and (discount_value is null or discount_value = 0);

update public.invoices
set tax_rate_percent = round((tax_cents::numeric / nullif((subtotal_cents - discount_cents), 0)) * 100, 4)
where tax_cents > 0
  and subtotal_cents > discount_cents
  and (tax_rate_percent is null or tax_rate_percent = 0);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_tax_rate_percent_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_tax_rate_percent_check
      check (tax_rate_percent >= 0 and tax_rate_percent <= 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_discount_type_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_discount_type_check
      check (discount_type in ('amount', 'percentage'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_discount_value_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_discount_value_check
      check (discount_value >= 0);
  end if;
end $$;

commit;
