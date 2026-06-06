-- ServSync inspection-media storage bucket.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-inspections.sql.
--
-- Creates a public 'inspection-media' bucket for per-item inspection photos
-- attached by contractors during inspections. Separate from service-request-media.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('inspection-media', 'inspection-media', true, 20971520)
on conflict (id) do nothing;

-- Storage RLS: authenticated users can upload and delete (contractor owns the inspection)
drop policy if exists "insp_media_upload" on storage.objects;
drop policy if exists "insp_media_delete" on storage.objects;

create policy "insp_media_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-media');

create policy "insp_media_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-media');

commit;
