-- ServSync Price Book Organization Foundation v1.
-- Apply only after servsync-contractor-price-book-items.sql.
-- This additive migration adds provider-neutral trade/category/subcategory organization.

begin;

alter table public.contractor_price_book_items
  add column if not exists subcategory text;

comment on column public.contractor_price_book_items.subcategory is
  'Optional contractor-created Price Book grouping beneath trade and category.';

create index if not exists contractor_price_book_items_organization_idx
  on public.contractor_price_book_items(contractor_id, trade, category, subcategory);

revoke insert (subcategory), update (subcategory)
  on table public.contractor_price_book_items from public;
revoke insert (subcategory), update (subcategory)
  on table public.contractor_price_book_items from anon;

grant insert (subcategory), update (subcategory)
  on table public.contractor_price_book_items to authenticated;

notify pgrst, 'reload schema';

commit;
