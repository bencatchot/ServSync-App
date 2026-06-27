-- ServSync FB-020 Slice 4B
-- Immutable invoice direct-write hardening.
--
-- This patch limits direct browser/client writes to invoices and invoice line
-- items to draft invoices only. Explicit lifecycle transitions still happen
-- through SECURITY DEFINER RPCs such as send, homeowner view, mark paid, and
-- void.

begin;

drop policy if exists "Invoices: contractor team creates" on public.invoices;
create policy "Invoices: contractor team creates"
  on public.invoices for insert to authenticated
  with check (
    status = 'draft'
    and public.current_user_can_manage_contractor_billing(contractor_id)
  );

drop policy if exists "Invoices: contractor team updates" on public.invoices;
create policy "Invoices: contractor team updates"
  on public.invoices for update to authenticated
  using (
    status = 'draft'
    and public.current_user_can_manage_contractor_billing(contractor_id)
  )
  with check (
    status = 'draft'
    and public.current_user_can_manage_contractor_billing(contractor_id)
  );

drop policy if exists "Invoice lines: contractor team creates" on public.invoice_line_items;
create policy "Invoice lines: contractor team creates"
  on public.invoice_line_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
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
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  );

notify pgrst, 'reload schema';

commit;
