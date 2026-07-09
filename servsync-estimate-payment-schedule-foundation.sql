-- ServSync estimate payment schedule foundation.
--
-- Adds structured, provider-neutral estimate payment schedule items for future
-- deposit/progress/final invoice workflows. This patch does not create UI,
-- generate invoices from schedule items, apply payment collection, or backfill
-- existing estimates with schedule rows.

begin;

create extension if not exists pgcrypto;

create table if not exists public.estimate_payment_schedule_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  invoice_type text not null,
  label text not null default '',
  amount_type text not null,
  amount_value numeric(12,2) not null,
  calculated_amount_cents integer not null default 0,
  due_trigger text not null default '',
  sort_order integer not null default 0,
  linked_invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_payment_schedule_items_invoice_type_check
    check (invoice_type in ('total', 'deposit', 'progress', 'final')),
  constraint estimate_payment_schedule_items_amount_type_check
    check (amount_type in ('fixed', 'percentage')),
  constraint estimate_payment_schedule_items_amount_value_nonnegative_check
    check (amount_value >= 0),
  constraint estimate_payment_schedule_items_calculated_amount_nonnegative_check
    check (calculated_amount_cents >= 0)
);

comment on table public.estimate_payment_schedule_items is
  'Structured estimate payment schedule items for future total/deposit/progress/final invoice generation. Existing estimates without rows remain valid legacy estimates.';

comment on column public.estimate_payment_schedule_items.invoice_type is
  'Future invoice purpose seeded from the approved estimate schedule: total, deposit, progress, or final.';

comment on column public.estimate_payment_schedule_items.amount_type is
  'How amount_value should be interpreted by future UI: fixed currency amount or percentage of estimate total.';

comment on column public.estimate_payment_schedule_items.amount_value is
  'Provider-neutral schedule amount value. For percentage rows this is the percentage; for fixed rows this is the currency amount before conversion to cents.';

comment on column public.estimate_payment_schedule_items.calculated_amount_cents is
  'Snapshot amount in cents calculated by the app from the estimate total and schedule amount settings.';

comment on column public.estimate_payment_schedule_items.linked_invoice_id is
  'Optional future link from a schedule item to the invoice generated from it; deleting an invoice clears this link.';

comment on column public.estimate_payment_schedule_items.id is
  'Stable ServSync schedule item identifier. External accounting IDs such as QuickBooks IDs should live in a future provider-neutral mapping table, not this core schedule table.';

create index if not exists estimate_payment_schedule_items_estimate_sort_idx
  on public.estimate_payment_schedule_items(estimate_id, sort_order);

create index if not exists estimate_payment_schedule_items_linked_invoice_idx
  on public.estimate_payment_schedule_items(linked_invoice_id)
  where linked_invoice_id is not null;

drop trigger if exists estimate_payment_schedule_items_touch_updated_at
  on public.estimate_payment_schedule_items;
create trigger estimate_payment_schedule_items_touch_updated_at
  before update on public.estimate_payment_schedule_items
  for each row execute function public.touch_updated_at();

alter table public.estimate_payment_schedule_items enable row level security;

drop policy if exists "Estimate payment schedule: contractor team reads" on public.estimate_payment_schedule_items;
create policy "Estimate payment schedule: contractor team reads"
  on public.estimate_payment_schedule_items for select to authenticated
  using (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_payment_schedule_items.estimate_id
         and (
           public.current_user_can_access_contractor(e.contractor_id)
           or public.current_user_is_platform_admin()
         )
    )
  );

drop policy if exists "Estimate payment schedule: homeowner reads non-draft" on public.estimate_payment_schedule_items;
create policy "Estimate payment schedule: homeowner reads non-draft"
  on public.estimate_payment_schedule_items for select to authenticated
  using (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_payment_schedule_items.estimate_id
         and e.status <> 'draft'
         and (
           e.homeowner_user_id = auth.uid()
           or (
             e.home_id is not null
             and public.current_user_can_access_home(e.home_id)
           )
         )
    )
  );

drop policy if exists "Estimate payment schedule: billing team creates draft schedule" on public.estimate_payment_schedule_items;
create policy "Estimate payment schedule: billing team creates draft schedule"
  on public.estimate_payment_schedule_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_payment_schedule_items.estimate_id
         and e.status = 'draft'
         and public.current_user_can_manage_contractor_billing(e.contractor_id)
    )
  );

drop policy if exists "Estimate payment schedule: billing team updates draft schedule" on public.estimate_payment_schedule_items;
create policy "Estimate payment schedule: billing team updates draft schedule"
  on public.estimate_payment_schedule_items for update to authenticated
  using (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_payment_schedule_items.estimate_id
         and e.status = 'draft'
         and public.current_user_can_manage_contractor_billing(e.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_payment_schedule_items.estimate_id
         and e.status = 'draft'
         and public.current_user_can_manage_contractor_billing(e.contractor_id)
    )
  );

drop policy if exists "Estimate payment schedule: billing team deletes draft schedule" on public.estimate_payment_schedule_items;
create policy "Estimate payment schedule: billing team deletes draft schedule"
  on public.estimate_payment_schedule_items for delete to authenticated
  using (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_payment_schedule_items.estimate_id
         and e.status = 'draft'
         and public.current_user_can_manage_contractor_billing(e.contractor_id)
    )
  );

revoke all on table public.estimate_payment_schedule_items from public;
revoke all on table public.estimate_payment_schedule_items from anon;
revoke all on table public.estimate_payment_schedule_items from authenticated;
grant select, insert, update, delete on table public.estimate_payment_schedule_items to authenticated;

notify pgrst, 'reload schema';

commit;
