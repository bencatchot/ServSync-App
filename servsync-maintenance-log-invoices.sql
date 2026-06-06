-- ServSync maintenance log invoice/receipt links.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-home-documents.sql and servsync-maintenance-log.sql.

begin;

alter table public.home_maintenance_log
  add column if not exists invoice_document_id uuid references public.home_documents(id) on delete set null;

create index if not exists maintenance_log_invoice_document_idx
  on public.home_maintenance_log(invoice_document_id);

notify pgrst, 'reload schema';

commit;
