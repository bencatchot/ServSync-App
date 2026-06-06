-- ServSync home documents.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-maintenance-log-autocreate.sql.
--
-- Creates a private 'home-documents' storage bucket and a home_documents
-- metadata table. Files are stored at {user_id}/documents/{uuid}.ext and
-- are only accessible to the owning homeowner via signed URLs.

begin;

-- ── Private storage bucket ───────────────────────────────────────────────────
-- 50 MB per file limit. Bucket is private — no public URLs.

insert into storage.buckets (id, name, public, file_size_limit)
values ('home-documents', 'home-documents', false, 52428800)
on conflict (id) do nothing;

-- Storage RLS: homeowner can only access files in their own folder
drop policy if exists "home_docs_upload" on storage.objects;
drop policy if exists "home_docs_read"   on storage.objects;
drop policy if exists "home_docs_delete" on storage.objects;

create policy "home_docs_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "home_docs_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'home-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "home_docs_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'home-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Metadata table ────────────────────────────────────────────────────────────

create table if not exists public.home_documents (
  id                uuid        primary key default gen_random_uuid(),
  homeowner_user_id uuid        not null references auth.users(id) on delete cascade,
  storage_path      text        not null,
  file_name         text        not null,
  content_type      text        not null default '',
  file_size_bytes   int,
  document_type     text        not null default 'other'
                    check (document_type in ('warranty','manual','inspection','insurance','permit','receipt','other')),
  notes             text        not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists home_documents_owner_idx
  on public.home_documents(homeowner_user_id, created_at desc);

alter table public.home_documents enable row level security;

drop policy if exists "docs_select_own" on public.home_documents;
drop policy if exists "docs_insert_own" on public.home_documents;
drop policy if exists "docs_delete_own" on public.home_documents;

create policy "docs_select_own"
  on public.home_documents for select to authenticated
  using (homeowner_user_id = auth.uid());

create policy "docs_insert_own"
  on public.home_documents for insert to authenticated
  with check (homeowner_user_id = auth.uid());

create policy "docs_delete_own"
  on public.home_documents for delete to authenticated
  using (homeowner_user_id = auth.uid());

grant select, insert, delete on public.home_documents to authenticated;

notify pgrst, 'reload schema';

commit;
