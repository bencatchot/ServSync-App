-- ServSync homeowner-filed estimates/invoices.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after:
--   1) servsync-estimates.sql
--   2) servsync-home-documents.sql
--   3) servsync-maintenance-log.sql
--
-- This supports the homeowner-owned filing flow:
--   - Contractor sends estimate/invoice through ServSync.
--   - Homeowner accepts it.
--   - Homeowner clicks "File to Documents & Log".
--   - The PDF is saved in the homeowner's private Documents.
--   - A matching maintenance log entry is created and linked to the estimate/document.

begin;

alter table public.home_maintenance_log
  add column if not exists estimate_id uuid references public.estimates(id) on delete set null,
  add column if not exists invoice_document_id uuid references public.home_documents(id) on delete set null;

create unique index if not exists maintenance_log_unique_estimate_idx
  on public.home_maintenance_log(estimate_id)
  where estimate_id is not null;

create index if not exists maintenance_log_invoice_document_idx
  on public.home_maintenance_log(invoice_document_id);

notify pgrst, 'reload schema';

commit;
