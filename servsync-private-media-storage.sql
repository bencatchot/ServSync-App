-- ServSync private media storage lockdown.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Makes service request and inspection media private, then allows signed URL
-- access only for connected parties or authorized contractor users.
--
-- Run after the core ServSync schema and contractor team access scripts.

begin;

-- ── Public Discover feed media ──────────────────────────────────────────────
--
-- Discover feed photos are public marketing/community content. They live in a
-- separate public bucket so service request attachments can stay private.

insert into storage.buckets (id, name, public, file_size_limit)
values ('discover-media', 'discover-media', true, 20971520)
on conflict (id) do update
set public = true,
    file_size_limit = 20971520;

drop policy if exists "discover_media_upload_contractor" on storage.objects;
drop policy if exists "discover_media_update_own_folder" on storage.objects;
drop policy if exists "discover_media_delete_own_folder" on storage.objects;

create policy "discover_media_upload_contractor"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
        from public.contractor_profiles cp
       where public.current_user_can_access_contractor(cp.id)
    )
  );

create policy "discover_media_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "discover_media_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Service request media ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('service-request-media', 'service-request-media', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520;

update storage.buckets
   set public = false
 where id = 'service-request-media';

drop policy if exists "homeowner_upload_media" on storage.objects;
drop policy if exists "contractor_upload_media" on storage.objects;
drop policy if exists "service_request_media_read_parties" on storage.objects;

create policy "homeowner_upload_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
        from public.service_requests sr
       where sr.id::text = (storage.foldername(name))[2]
         and sr.homeowner_user_id = auth.uid()
    )
  );

create policy "contractor_upload_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
        from public.service_requests sr
        join public.contractor_profiles cp on cp.id = sr.contractor_id
       where sr.id::text = (storage.foldername(name))[2]
         and (
           cp.owner_user_id = auth.uid()
           or public.current_user_can_access_contractor(cp.id)
         )
    )
  );

create policy "service_request_media_read_parties"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'service-request-media'
    and exists (
      select 1
        from public.service_request_media med
        join public.service_requests sr on sr.id = med.request_id
        join public.contractor_profiles cp on cp.id = sr.contractor_id
       where med.storage_path = storage.objects.name
         and (
           med.uploader_user_id = auth.uid()
           or sr.homeowner_user_id = auth.uid()
           or cp.owner_user_id = auth.uid()
           or public.current_user_can_access_contractor(cp.id)
           or public.current_user_is_platform_admin()
         )
    )
  );

-- ── Inspection media ────────────────────────────────────────────────────────

update storage.buckets
   set public = false
 where id = 'inspection-media';

insert into storage.buckets (id, name, public, file_size_limit)
values ('inspection-media', 'inspection-media', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520;

drop policy if exists "insp_media_upload" on storage.objects;
drop policy if exists "insp_media_delete" on storage.objects;
drop policy if exists "inspection_media_read_parties" on storage.objects;

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

notify pgrst, 'reload schema';

commit;
