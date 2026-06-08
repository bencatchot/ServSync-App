-- ServSync Discover media browser-safe image fix.
-- Paste this into the Supabase SQL Editor for the ServSync project if
-- Discover feed photos appear broken after the go-live hardening patch.
--
-- Discover is public-facing marketing/community media, so it should only accept
-- browser-safe image formats that reliably render in the web feed.

begin;

update storage.buckets
   set public = true,
       file_size_limit = 20971520,
       allowed_mime_types = array[
         'image/jpeg',
         'image/jpg',
         'image/png',
         'image/webp'
       ]::text[]
 where id = 'discover-media';

drop policy if exists "discover_media_upload_contractor" on storage.objects;
create policy "discover_media_upload_contractor"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp']::text[]
    )
    and exists (
      select 1
        from public.contractor_profiles cp
       where public.current_user_can_access_contractor(cp.id)
    )
  );

notify pgrst, 'reload schema';

commit;
