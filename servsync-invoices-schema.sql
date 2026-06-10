-- ServSync first-class invoices schema.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Run after:
--   - servsync-clean-foundation.sql
--   - servsync-contractor-team-access.sql
--   - servsync-estimates.sql
--   - servsync-job-lifecycle.sql
--
-- Adds first-class invoice tables separate from estimates. This patch does
-- not migrate legacy invoice-like estimate records and does not add payments.

begin;

create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  contractor_id      uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id  uuid references public.profiles(id) on delete set null,
  local_contact_id   uuid references public.contractor_local_contacts(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  job_id             uuid references public.inspections(id) on delete set null,
  estimate_id        uuid references public.estimates(id) on delete set null,
  invoice_number     text not null default '',
  title              text not null default '',
  scope              text not null default '',
  notes              text not null default '',
  terms              text not null default '',
  status             text not null default 'draft'
                     check (status in ('draft', 'sent', 'viewed', 'paid', 'partially_paid', 'void', 'overdue')),
  subtotal_cents     integer not null default 0 check (subtotal_cents >= 0),
  tax_cents          integer not null default 0 check (tax_cents >= 0),
  discount_cents     integer not null default 0 check (discount_cents >= 0),
  total_cents        integer not null default 0 check (total_cents >= 0),
  amount_paid_cents  integer not null default 0 check (amount_paid_cents >= 0),
  issued_at          timestamptz,
  due_at             timestamptz,
  paid_at            timestamptz,
  voided_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint invoices_customer_check check (
    homeowner_user_id is not null or local_contact_id is not null
  ),
  constraint invoices_amount_paid_check check (
    amount_paid_cents <= total_cents
  )
);

create table if not exists public.invoice_line_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  line_type        text not null default 'labor'
                   check (line_type in ('labor', 'material', 'equipment', 'fee', 'other')),
  description      text not null default '',
  quantity         numeric(12,2) not null default 1 check (quantity >= 0),
  unit             text not null default 'each',
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists invoices_contractor_status_updated_idx
  on public.invoices(contractor_id, status, updated_at desc);

create index if not exists invoices_homeowner_status_updated_idx
  on public.invoices(homeowner_user_id, status, updated_at desc)
  where homeowner_user_id is not null;

create index if not exists invoices_local_contact_updated_idx
  on public.invoices(local_contact_id, updated_at desc)
  where local_contact_id is not null;

create index if not exists invoices_service_request_idx
  on public.invoices(service_request_id)
  where service_request_id is not null;

create index if not exists invoices_job_idx
  on public.invoices(job_id)
  where job_id is not null;

create index if not exists invoices_estimate_idx
  on public.invoices(estimate_id)
  where estimate_id is not null;

create unique index if not exists invoices_contractor_invoice_number_uidx
  on public.invoices(contractor_id, lower(invoice_number))
  where nullif(trim(invoice_number), '') is not null;

create index if not exists invoice_line_items_invoice_sort_idx
  on public.invoice_line_items(invoice_id, sort_order);

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
  before update on public.invoices
  for each row execute function public.touch_updated_at();

drop trigger if exists invoice_line_items_touch_updated_at on public.invoice_line_items;
create trigger invoice_line_items_touch_updated_at
  before update on public.invoice_line_items
  for each row execute function public.touch_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;

drop policy if exists "Invoices: contractor team reads" on public.invoices;
create policy "Invoices: contractor team reads"
  on public.invoices for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Invoices: contractor team creates" on public.invoices;
create policy "Invoices: contractor team creates"
  on public.invoices for insert to authenticated
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
  );

drop policy if exists "Invoices: contractor team updates" on public.invoices;
create policy "Invoices: contractor team updates"
  on public.invoices for update to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
  )
  with check (
    public.current_user_can_write_contractor_jobs(contractor_id)
  );

drop policy if exists "Invoices: contractor team deletes drafts" on public.invoices;
create policy "Invoices: contractor team deletes drafts"
  on public.invoices for delete to authenticated
  using (
    status = 'draft'
    and public.current_user_can_write_contractor_jobs(contractor_id)
  );

drop policy if exists "Invoices: homeowner reads shared" on public.invoices;
create policy "Invoices: homeowner reads shared"
  on public.invoices for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    and status <> 'draft'
  );

drop policy if exists "Invoice lines: contractor team reads" on public.invoice_line_items;
create policy "Invoice lines: contractor team reads"
  on public.invoice_line_items for select to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and (
           public.current_user_can_access_contractor(i.contractor_id)
           or public.current_user_is_platform_admin()
         )
    )
  );

drop policy if exists "Invoice lines: contractor team creates" on public.invoice_line_items;
create policy "Invoice lines: contractor team creates"
  on public.invoice_line_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  );

drop policy if exists "Invoice lines: contractor team updates" on public.invoice_line_items;
create policy "Invoice lines: contractor team updates"
  on public.invoice_line_items for update to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  );

drop policy if exists "Invoice lines: contractor team deletes drafts" on public.invoice_line_items;
create policy "Invoice lines: contractor team deletes drafts"
  on public.invoice_line_items for delete to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_write_contractor_jobs(i.contractor_id)
    )
  );

drop policy if exists "Invoice lines: homeowner reads shared" on public.invoice_line_items;
create policy "Invoice lines: homeowner reads shared"
  on public.invoice_line_items for select to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and i.homeowner_user_id = auth.uid()
         and i.status <> 'draft'
    )
  );

grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_line_items to authenticated;

notify pgrst, 'reload schema';

commit;
