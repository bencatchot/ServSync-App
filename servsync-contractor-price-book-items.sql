-- ServSync contractor Custom Pricing / Pricing Library foundation.
-- Paste this into Supabase SQL Editor after servsync-contractor-saved-estimate-charges.sql.
-- This creates private contractor-owned pricing library records for manual contractor
-- management only. It does not integrate pricing records into estimates, invoices,
-- imports, AI suggestions, homeowner views, or billing tiers.

begin;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.contractor_price_book_items (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  title text not null,
  customer_description text not null default '',
  internal_notes text not null default '',
  trade text not null default '',
  category text not null default '',
  line_type text not null default 'material'
    check (line_type in ('labor', 'material', 'fee', 'other')),
  unit text,
  default_unit_price_cents integer check (
    default_unit_price_cents is null or default_unit_price_cents >= 0
  ),
  taxable boolean not null default true,
  labor_hours numeric(8,2) check (
    labor_hours is null or labor_hours >= 0
  ),
  sku text,
  source text,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_price_book_items_title_not_blank
    check (length(trim(title)) > 0)
);

comment on table public.contractor_price_book_items is
  'Private contractor-owned Custom Pricing / Pricing Library items. Phase 1 manual management only; not homeowner-visible and not automatically used in estimates or invoices.';

comment on column public.contractor_price_book_items.default_unit_price_cents is
  'Optional default price. Null means Price Required / contractor must enter pricing manually before use.';

comment on column public.contractor_price_book_items.source is
  'Optional source marker. Phase 1 uses manual records only.';

create index if not exists contractor_price_book_items_contractor_idx
  on public.contractor_price_book_items(contractor_id);

create index if not exists contractor_price_book_items_active_idx
  on public.contractor_price_book_items(contractor_id, active);

create index if not exists contractor_price_book_items_archived_idx
  on public.contractor_price_book_items(contractor_id, archived_at);

create index if not exists contractor_price_book_items_lookup_idx
  on public.contractor_price_book_items(contractor_id, trade, category, line_type);

create index if not exists contractor_price_book_items_title_idx
  on public.contractor_price_book_items(contractor_id, lower(title));

drop trigger if exists contractor_price_book_items_touch_updated_at
  on public.contractor_price_book_items;
create trigger contractor_price_book_items_touch_updated_at
  before update on public.contractor_price_book_items
  for each row execute function public.touch_updated_at();

alter table public.contractor_price_book_items enable row level security;

drop policy if exists "Price book items: contractor account reads"
  on public.contractor_price_book_items;
drop policy if exists "Price book items: estimate settings managers create"
  on public.contractor_price_book_items;
drop policy if exists "Price book items: estimate settings managers update"
  on public.contractor_price_book_items;

create policy "Price book items: contractor account reads"
  on public.contractor_price_book_items for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

create policy "Price book items: estimate settings managers create"
  on public.contractor_price_book_items for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

create policy "Price book items: estimate settings managers update"
  on public.contractor_price_book_items for update to authenticated
  using (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  )
  with check (
    public.current_user_can_manage_contractor_estimate_settings(contractor_id)
  );

revoke all privileges on table public.contractor_price_book_items from public;
revoke all privileges on table public.contractor_price_book_items from anon;
revoke all privileges on table public.contractor_price_book_items from authenticated;

grant select on table public.contractor_price_book_items to authenticated;
grant insert (
  contractor_id,
  title,
  customer_description,
  internal_notes,
  trade,
  category,
  line_type,
  unit,
  default_unit_price_cents,
  taxable,
  labor_hours,
  sku,
  source,
  active,
  archived_at
) on table public.contractor_price_book_items to authenticated;
grant update (
  title,
  customer_description,
  internal_notes,
  trade,
  category,
  line_type,
  unit,
  default_unit_price_cents,
  taxable,
  labor_hours,
  sku,
  source,
  active,
  archived_at
) on table public.contractor_price_book_items to authenticated;

notify pgrst, 'reload schema';

commit;
