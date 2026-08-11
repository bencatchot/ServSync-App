-- ServSync FB-024 Price Book Cost and Margin Foundation v1.
-- Apply after servsync-price-book-import-batch-rollback.sql.
--
-- Internal cost is deliberately stored outside contractor_price_book_items so
-- contractor roles that can read operational selling-price records cannot read
-- financial cost data. Cost is never projected into Draft, Estimate, or Invoice
-- records. Gross profit and margin remain client-derived manager-only values.

begin;

do $$
begin
  if to_regclass('public.contractor_price_book_items') is null
     or to_regprocedure('public.servsync_current_contractor_profile()') is null
     or to_regprocedure('public.current_user_can_manage_contractor_estimate_settings(uuid)') is null
     or to_regprocedure('public.servsync_execute_price_book_import_rollback(uuid,uuid)') is null then
    raise exception 'Missing required Price Book management and rollback foundation.';
  end if;
  if to_regclass('public.contractor_price_book_item_costs') is not null
     or to_regprocedure('public.servsync_list_price_book_internal_costs()') is not null
     or to_regprocedure('public.servsync_save_price_book_item_with_cost(uuid,text,text,text,text,text,text,text,text,integer,boolean,numeric,text,boolean,integer)') is not null then
    raise exception 'Price Book Cost and Margin Foundation is already installed.';
  end if;
end;
$$;

create table public.contractor_price_book_item_costs (
  price_book_item_id uuid primary key references public.contractor_price_book_items(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  internal_cost_cents integer not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_price_book_item_costs_nonnegative_check
    check (internal_cost_cents >= 0)
);

comment on table public.contractor_price_book_item_costs is
  'Private manager-only internal cost for contractor Price Book items. Never customer-facing or copied into work documents.';
comment on column public.contractor_price_book_item_costs.internal_cost_cents is
  'Optional internal contractor cost in integer cents. Absence means cost is not set; zero is an explicit cost.';

create index contractor_price_book_item_costs_contractor_idx
  on public.contractor_price_book_item_costs(contractor_id, price_book_item_id);

create or replace function public.servsync_private_price_book_cost_contractor_id()
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select profile.id
    into v_contractor_id
    from public.servsync_current_contractor_profile() profile
   limit 1;

  if v_contractor_id is null
     or not public.current_user_can_manage_contractor_estimate_settings(v_contractor_id) then
    return null;
  end if;

  return v_contractor_id;
end;
$$;

create or replace function public.servsync_private_validate_price_book_item_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.contractor_price_book_items item
     where item.id = new.price_book_item_id
       and item.contractor_id = new.contractor_id
  ) then
    raise exception 'Price Book internal cost does not match its contractor-owned item.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger contractor_price_book_item_costs_validate
  before insert or update on public.contractor_price_book_item_costs
  for each row execute function public.servsync_private_validate_price_book_item_cost();

alter table public.contractor_price_book_item_costs enable row level security;
alter table public.contractor_price_book_item_costs force row level security;
revoke all privileges on table public.contractor_price_book_item_costs from public, anon, authenticated;

create or replace function public.servsync_list_price_book_internal_costs()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  v_contractor_id := public.servsync_private_price_book_cost_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book internal cost is unavailable for this account.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'price_book_item_id', cost.price_book_item_id,
      'internal_cost_cents', cost.internal_cost_cents
    ) order by cost.price_book_item_id)
      from public.contractor_price_book_item_costs cost
     where cost.contractor_id = v_contractor_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.servsync_save_price_book_item_with_cost(
  p_item_id uuid,
  p_title text,
  p_customer_description text,
  p_internal_notes text,
  p_trade text,
  p_category text,
  p_subcategory text,
  p_line_type text,
  p_unit text,
  p_default_unit_price_cents integer,
  p_taxable boolean,
  p_labor_hours numeric,
  p_sku text,
  p_active boolean,
  p_internal_cost_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_item public.contractor_price_book_items%rowtype;
begin
  v_contractor_id := public.servsync_private_price_book_cost_contractor_id();
  if v_contractor_id is null then
    raise exception 'Price Book management is unavailable for this account.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 1 then
    raise exception 'Price Book item name is required.';
  end if;
  if p_line_type not in ('labor', 'material', 'fee', 'other') then
    raise exception 'Price Book item type is invalid.';
  end if;
  if p_default_unit_price_cents is not null and p_default_unit_price_cents < 0 then
    raise exception 'Selling price must be zero or more.';
  end if;
  if p_internal_cost_cents is not null and p_internal_cost_cents < 0 then
    raise exception 'Internal cost must be zero or more.';
  end if;
  if p_labor_hours is not null and (p_labor_hours < 0 or p_labor_hours > 999999.99) then
    raise exception 'Labor hours are outside the supported range.';
  end if;

  if p_item_id is null then
    insert into public.contractor_price_book_items (
      contractor_id, title, customer_description, internal_notes, trade, category,
      subcategory, line_type, unit, default_unit_price_cents, taxable, labor_hours,
      sku, source, active, archived_at
    ) values (
      v_contractor_id, trim(p_title), trim(coalesce(p_customer_description, '')),
      trim(coalesce(p_internal_notes, '')), trim(coalesce(p_trade, '')),
      trim(coalesce(p_category, '')), nullif(trim(coalesce(p_subcategory, '')), ''),
      p_line_type, nullif(trim(coalesce(p_unit, '')), ''), p_default_unit_price_cents,
      coalesce(p_taxable, true), p_labor_hours, nullif(trim(coalesce(p_sku, '')), ''),
      'manual', coalesce(p_active, true),
      case when coalesce(p_active, true) then null else now() end
    ) returning * into v_item;
  else
    update public.contractor_price_book_items item
       set title = trim(p_title),
           customer_description = trim(coalesce(p_customer_description, '')),
           internal_notes = trim(coalesce(p_internal_notes, '')),
           trade = trim(coalesce(p_trade, '')),
           category = trim(coalesce(p_category, '')),
           subcategory = nullif(trim(coalesce(p_subcategory, '')), ''),
           line_type = p_line_type,
           unit = nullif(trim(coalesce(p_unit, '')), ''),
           default_unit_price_cents = p_default_unit_price_cents,
           taxable = coalesce(p_taxable, true),
           labor_hours = p_labor_hours,
           sku = nullif(trim(coalesce(p_sku, '')), ''),
           source = 'manual',
           active = coalesce(p_active, true),
           archived_at = case
             when coalesce(p_active, true) then null
             else coalesce(item.archived_at, now())
           end
     where item.id = p_item_id
       and item.contractor_id = v_contractor_id
    returning * into v_item;
    if not found then
      raise exception 'Price Book item is unavailable.';
    end if;
  end if;

  if p_internal_cost_cents is null then
    delete from public.contractor_price_book_item_costs cost
     where cost.price_book_item_id = v_item.id
       and cost.contractor_id = v_contractor_id;
  else
    insert into public.contractor_price_book_item_costs (
      price_book_item_id, contractor_id, internal_cost_cents, created_by, updated_by
    ) values (
      v_item.id, v_contractor_id, p_internal_cost_cents, auth.uid(), auth.uid()
    )
    on conflict (price_book_item_id) do update
      set internal_cost_cents = excluded.internal_cost_cents,
          updated_by = auth.uid(),
          updated_at = now()
      where contractor_price_book_item_costs.contractor_id = v_contractor_id;
  end if;

  return jsonb_build_object(
    'item_id', v_item.id,
    'internal_cost_cents', p_internal_cost_cents
  );
end;
$$;

revoke all on function public.servsync_private_price_book_cost_contractor_id()
  from public, anon, authenticated;
revoke all on function public.servsync_private_validate_price_book_item_cost()
  from public, anon, authenticated;

revoke all on function public.servsync_list_price_book_internal_costs()
  from public, anon, authenticated;
grant execute on function public.servsync_list_price_book_internal_costs()
  to authenticated;

revoke all on function public.servsync_save_price_book_item_with_cost(
  uuid, text, text, text, text, text, text, text, text, integer, boolean, numeric, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.servsync_save_price_book_item_with_cost(
  uuid, text, text, text, text, text, text, text, text, integer, boolean, numeric, text, boolean, integer
) to authenticated;

notify pgrst, 'reload schema';

commit;
