-- ServSync inspection-media storage bucket.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-inspections.sql.
--
-- Creates a private 'inspection-media' bucket for per-item inspection photos
-- attached by contractors during inspections. The app uses signed URLs.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('inspection-media', 'inspection-media', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520;

-- Storage RLS: authenticated users can upload and delete (contractor owns the inspection)
drop policy if exists "insp_media_upload" on storage.objects;
drop policy if exists "inspection_media_read_parties" on storage.objects;
drop policy if exists "insp_media_delete" on storage.objects;

create policy "insp_media_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-media'
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.id::text = (storage.foldername(name))[1]
         and public.current_user_can_access_contractor(cp.id)
    )
  );

create policy "inspection_media_read_parties"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'inspection-media'
    and (
      exists (
        select 1
          from public.contractor_profiles cp
         where cp.id::text = (storage.foldername(name))[1]
           and public.current_user_can_access_contractor(cp.id)
      )
      or exists (
        select 1
          from public.inspections insp
         where insp.homeowner_user_id = auth.uid()
           and insp.status = 'finalized'
           and insp.rooms_with_findings::text like '%' || storage.objects.name || '%'
      )
      or public.current_user_is_platform_admin()
    )
  );

create policy "insp_media_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inspection-media'
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.id::text = (storage.foldername(name))[1]
         and public.current_user_can_access_contractor(cp.id)
    )
  );

commit;
