-- ServSync Saved Charges -> Price Book Consolidation v1.
-- Apply after the Price Book organization, reconciliation, rollback, and cost foundations.
-- This migration preserves legacy rows as private read-only evidence while making
-- Price Book the sole contractor-facing reusable individual line-item library.

begin;

lock table public.contractor_saved_estimate_charges in access exclusive mode;
lock table public.contractor_price_book_items in share row exclusive mode;

do $$
begin
  if to_regclass('public.contractor_saved_estimate_charges') is null
     or to_regclass('public.contractor_price_book_items') is null then
    raise exception 'Saved Charge and Price Book prerequisites are required.';
  end if;

  if exists (
    select 1 from public.contractor_saved_estimate_charges
     where default_quantity <> 1
        or length(btrim(name)) = 0
        or line_type not in ('labor', 'material', 'fee', 'other')
        or charge_type not in ('flat', 'hourly')
        or (charge_type = 'hourly' and line_type <> 'labor')
        or (charge_type = 'hourly' and coalesce(nullif(lower(btrim(unit)), ''), 'hour') not in ('hour', 'hours', 'hr', 'hrs'))
  ) then
    raise exception 'Legacy Saved Charge data contains unsupported quantity, type, unit, or required-field semantics.';
  end if;

  if exists (
    select 1
      from public.contractor_saved_estimate_charges
     group by contractor_id, lower(btrim(name)), line_type
    having count(*) > 1
  ) then
    raise exception 'Duplicate legacy Saved Charge identities require owner review.';
  end if;

  if exists (
    select 1
      from public.contractor_saved_estimate_charges legacy
      join public.contractor_price_book_items item
        on item.contractor_id = legacy.contractor_id
       and lower(btrim(item.title)) = lower(btrim(legacy.name))
       and item.line_type = legacy.line_type
  ) then
    raise exception 'A legacy Saved Charge conflicts with an existing Price Book item.';
  end if;
end
$$;

create table public.contractor_saved_charge_price_book_lineage (
  legacy_saved_charge_id uuid primary key
    references public.contractor_saved_estimate_charges(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  price_book_item_id uuid not null unique
    references public.contractor_price_book_items(id) on delete restrict,
  legacy_fingerprint text not null,
  migrated_item_fingerprint text not null,
  migrated_at timestamptz not null default now(),
  constraint contractor_saved_charge_price_book_lineage_fingerprints
    check (legacy_fingerprint ~ '^[0-9a-f]{32}$' and migrated_item_fingerprint ~ '^[0-9a-f]{32}$')
);

comment on table public.contractor_saved_charge_price_book_lineage is
  'Private immutable evidence linking retired Saved Charges to canonical Price Book items.';

create or replace function public.servsync_private_saved_charge_fingerprint(
  p_charge public.contractor_saved_estimate_charges
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select md5(jsonb_build_object(
    'id', p_charge.id,
    'contractor_id', p_charge.contractor_id,
    'name', p_charge.name,
    'description', p_charge.description,
    'line_type', p_charge.line_type,
    'charge_type', p_charge.charge_type,
    'amount_cents', p_charge.amount_cents,
    'default_quantity', p_charge.default_quantity,
    'unit', p_charge.unit,
    'active', p_charge.active,
    'sort_order', p_charge.sort_order,
    'created_at_epoch', extract(epoch from p_charge.created_at),
    'updated_at_epoch', extract(epoch from p_charge.updated_at)
  )::text)
$$;

create or replace function public.servsync_private_migrated_price_book_fingerprint(
  p_item public.contractor_price_book_items
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select md5(jsonb_build_object(
    'id', p_item.id,
    'contractor_id', p_item.contractor_id,
    'title', p_item.title,
    'customer_description', p_item.customer_description,
    'internal_notes', p_item.internal_notes,
    'trade', p_item.trade,
    'category', p_item.category,
    'subcategory', p_item.subcategory,
    'line_type', p_item.line_type,
    'unit', p_item.unit,
    'default_unit_price_cents', p_item.default_unit_price_cents,
    'taxable', p_item.taxable,
    'labor_hours', p_item.labor_hours,
    'sku', p_item.sku,
    'source', p_item.source,
    'active', p_item.active,
    'archived_at_epoch', extract(epoch from p_item.archived_at),
    'created_at_epoch', extract(epoch from p_item.created_at),
    'updated_at_epoch', extract(epoch from p_item.updated_at)
  )::text)
$$;

insert into public.contractor_price_book_items (
    id, contractor_id, title, customer_description, internal_notes, trade, category,
    subcategory, line_type, unit, default_unit_price_cents, taxable, labor_hours,
    sku, source, active, archived_at, created_at, updated_at
  )
select
    md5('servsync-saved-charge-price-book-v1:' || legacy.id::text)::uuid,
    legacy.contractor_id,
    legacy.name,
    '',
    legacy.description,
    '',
    '',
    null,
    legacy.line_type,
    coalesce(nullif(btrim(legacy.unit), ''), case when legacy.charge_type = 'hourly' then 'hour' else 'each' end),
    legacy.amount_cents,
    true,
    null,
    null,
    'legacy_saved_charge',
    legacy.active,
    case when legacy.active then null else legacy.updated_at end,
    legacy.created_at,
    legacy.updated_at
from public.contractor_saved_estimate_charges legacy;

insert into public.contractor_saved_charge_price_book_lineage (
  legacy_saved_charge_id, contractor_id, price_book_item_id,
  legacy_fingerprint, migrated_item_fingerprint, migrated_at
)
select
  legacy.id,
  legacy.contractor_id,
  item.id,
  public.servsync_private_saved_charge_fingerprint(legacy),
  public.servsync_private_migrated_price_book_fingerprint(item),
  now()
from public.contractor_saved_estimate_charges legacy
join public.contractor_price_book_items item
  on item.id = md5('servsync-saved-charge-price-book-v1:' || legacy.id::text)::uuid;

do $$
begin
  if (select count(*) from public.contractor_saved_estimate_charges)
     <> (select count(*) from public.contractor_saved_charge_price_book_lineage) then
    raise exception 'Saved Charge migration lineage is incomplete.';
  end if;
end
$$;

create or replace function public.servsync_private_reject_retired_saved_charge_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Saved Charges are retired. Use Price Book.' using errcode = '55000';
end
$$;

drop trigger if exists contractor_saved_estimate_charges_touch_updated_at
  on public.contractor_saved_estimate_charges;
create trigger contractor_saved_estimate_charges_retired_read_only
  before insert or update or delete on public.contractor_saved_estimate_charges
  for each row execute function public.servsync_private_reject_retired_saved_charge_write();

create or replace function public.servsync_private_reject_saved_charge_lineage_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Saved Charge migration lineage is immutable.' using errcode = '55000';
end
$$;

create trigger contractor_saved_charge_price_book_lineage_immutable
  before insert or update or delete on public.contractor_saved_charge_price_book_lineage
  for each row execute function public.servsync_private_reject_saved_charge_lineage_write();

alter table public.contractor_saved_estimate_charges enable row level security;
alter table public.contractor_saved_estimate_charges force row level security;
alter table public.contractor_saved_charge_price_book_lineage enable row level security;
alter table public.contractor_saved_charge_price_book_lineage force row level security;

drop policy if exists "Saved estimate charges: contractor account reads" on public.contractor_saved_estimate_charges;
drop policy if exists "Saved estimate charges: estimate settings managers create" on public.contractor_saved_estimate_charges;
drop policy if exists "Saved estimate charges: estimate settings managers update" on public.contractor_saved_estimate_charges;
drop policy if exists "Saved estimate charges: estimate settings managers delete" on public.contractor_saved_estimate_charges;

revoke all on table public.contractor_saved_estimate_charges from public, anon, authenticated;
revoke all on table public.contractor_saved_charge_price_book_lineage from public, anon, authenticated;
revoke all on function public.servsync_private_saved_charge_fingerprint(public.contractor_saved_estimate_charges) from public, anon, authenticated;
revoke all on function public.servsync_private_migrated_price_book_fingerprint(public.contractor_price_book_items) from public, anon, authenticated;
revoke all on function public.servsync_private_reject_retired_saved_charge_write() from public, anon, authenticated;
revoke all on function public.servsync_private_reject_saved_charge_lineage_write() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
