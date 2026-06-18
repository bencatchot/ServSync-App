-- ServSync estimate Price Required foundation
-- Allows estimate and invoice line prices to remain blank/unpriced instead of
-- being silently converted to $0.00. RLS policies are intentionally unchanged.

begin;

alter table public.estimate_line_items
  alter column unit_price_cents drop not null,
  alter column unit_price_cents drop default;

comment on column public.estimate_line_items.unit_price_cents is
  'Nullable. NULL means Price Required / price to be confirmed; 0 means contractor intentionally entered $0.00.';

alter table public.invoice_line_items
  alter column unit_price_cents drop not null,
  alter column unit_price_cents drop default;

comment on column public.invoice_line_items.unit_price_cents is
  'Nullable for compatibility when an accepted estimate includes price-to-be-confirmed items. NULL means price to be confirmed; 0 means intentionally $0.00.';

notify pgrst, 'reload schema';

commit;
