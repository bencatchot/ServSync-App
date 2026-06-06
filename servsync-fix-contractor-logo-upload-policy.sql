-- ServSync contractor logo upload policy fix.
-- Paste this into the Supabase SQL Editor if logo upload fails with:
-- "new row violates row-level security policy"

begin;

insert into storage.buckets (id, name, public)
values ('contractor-assets', 'contractor-assets', true)
on conflict (id) do update
set public = true;

drop policy if exists "contractor_assets_upload_own_folder" on storage.objects;
create policy "contractor_assets_upload_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contractor-assets'
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.owner_user_id = auth.uid()
    )
  );

drop policy if exists "contractor_assets_update_own_folder" on storage.objects;
create policy "contractor_assets_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'contractor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'contractor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "contractor_assets_delete_own_folder" on storage.objects;
create policy "contractor_assets_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'contractor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';

commit;
