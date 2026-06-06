-- ServSync homeowner profile and home photos.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Adds private storage path fields for homeowner profile photos and home photos.
-- The actual images use the existing private home-documents bucket, so they
-- are not public assets like contractor logos.

begin;

alter table public.homeowner_profiles
  add column if not exists profile_photo_path text not null default '';

alter table public.homes
  add column if not exists home_photo_path text not null default '';

notify pgrst, 'reload schema';

commit;
