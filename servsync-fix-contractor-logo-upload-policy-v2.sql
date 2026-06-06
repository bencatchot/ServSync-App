-- ServSync contractor logo upload policy fix v2.
-- Paste this into the Supabase SQL Editor if logo upload still fails with:
-- "new row violates row-level security policy"
--
-- This bucket is for public contractor logos only. Homeowner private files are not stored here.

begin;

alter table public.contractor_profiles
  add column if not exists logo_url text not null default '';

insert into storage.buckets (id, name, public)
values ('contractor-assets', 'contractor-assets', true)
on conflict (id) do update
set public = true;

drop policy if exists "contractor_assets_upload_own_folder" on storage.objects;
drop policy if exists "contractor_assets_upload_authenticated" on storage.objects;
drop policy if exists "contractor_assets_insert_public_logo_bucket" on storage.objects;
drop policy if exists "contractor_assets_read_public_logo_bucket" on storage.objects;
drop policy if exists "contractor_assets_update_own_folder" on storage.objects;
drop policy if exists "contractor_assets_delete_own_folder" on storage.objects;

create policy "contractor_assets_read_public_logo_bucket"
  on storage.objects for select
  using (bucket_id = 'contractor-assets');

create policy "contractor_assets_insert_public_logo_bucket"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'contractor-assets');

create policy "contractor_assets_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'contractor-assets'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'contractor-assets'
    and owner = auth.uid()
  );

create policy "contractor_assets_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'contractor-assets'
    and owner = auth.uid()
  );

notify pgrst, 'reload schema';

commit;
