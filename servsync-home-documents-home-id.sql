-- ServSync homeowner private documents property context.
-- Paste into the Supabase SQL Editor.
--
-- Adds optional home_id support for homeowner-uploaded private documents.
-- Existing documents remain unassigned until a later backfill/assignment flow.

begin;

alter table public.home_documents
  add column if not exists home_id uuid references public.homes(id) on delete set null;

create index if not exists home_documents_owner_home_created_idx
  on public.home_documents(homeowner_user_id, home_id, created_at desc);

notify pgrst, 'reload schema';

commit;
