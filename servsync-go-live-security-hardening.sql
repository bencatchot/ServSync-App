-- ServSync go-live security hardening.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Adds:
--   1) Stripe webhook idempotency tracking.
--   2) AI assistant rate-limit tracking.
--   3) Server-side storage content type and file extension restrictions.

begin;

create extension if not exists pgcrypto;

-- ── Stripe webhook idempotency ──────────────────────────────────────────────
-- Stripe may retry or duplicate webhook events. This table lets the Edge
-- Function process each Stripe event ID only once.

create table if not exists public.stripe_webhook_events (
  id          text primary key,
  event_type  text not null default '',
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- No authenticated client policies are added on purpose. The Stripe Edge
-- Function writes with the service role key, which bypasses RLS.

-- ── AI assistant rate-limit log ─────────────────────────────────────────────

create table if not exists public.ai_call_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  function_name text not null,
  called_at     timestamptz not null default now()
);

create index if not exists ai_call_log_user_function_time_idx
  on public.ai_call_log(user_id, function_name, called_at desc);

alter table public.ai_call_log enable row level security;

-- No authenticated client policies are added on purpose. AI Edge Functions write
-- with the service role key and users cannot read or edit rate-limit records.

-- ── Storage type helpers ────────────────────────────────────────────────────

create or replace function public.servsync_storage_extension_is_allowed(
  p_name text,
  p_allowed_extensions text[]
)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(storage.extension(p_name), '')) = any(p_allowed_extensions);
$$;

grant execute on function public.servsync_storage_extension_is_allowed(text, text[]) to authenticated;

-- Bucket MIME restrictions provide a server-side backstop even if a browser
-- skips the app's client-side checks.

update storage.buckets
   set public = false,
       file_size_limit = 52428800,
       allowed_mime_types = array[
         'application/pdf',
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif'
       ]::text[]
 where id = 'home-documents';

update storage.buckets
   set public = false,
       file_size_limit = 20971520,
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif',
         'video/mp4',
         'video/quicktime',
         'video/webm'
       ]::text[]
 where id = 'service-request-media';

update storage.buckets
   set public = false,
       file_size_limit = 20971520,
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif'
       ]::text[]
 where id = 'inspection-media';

update storage.buckets
   set public = true,
       file_size_limit = 20971520,
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif'
       ]::text[]
 where id = 'discover-media';

update storage.buckets
   set public = true,
       file_size_limit = 4194304,
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp'
       ]::text[]
 where id = 'contractor-assets';

-- ── home-documents upload policies ──────────────────────────────────────────

drop policy if exists "home_docs_upload" on storage.objects;
create policy "home_docs_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.servsync_storage_extension_is_allowed(
      name,
      array['pdf','jpg','jpeg','png','webp','heic','heif']::text[]
    )
  );

drop policy if exists "home_docs_upload_contractor_field_work_reports" on storage.objects;
create policy "home_docs_upload_contractor_field_work_reports"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and public.servsync_can_upload_field_work_report_path(name)
    and public.servsync_storage_extension_is_allowed(name, array['pdf']::text[])
  );

-- ── service-request-media upload policies ───────────────────────────────────

drop policy if exists "homeowner_upload_media" on storage.objects;
drop policy if exists "contractor_upload_media" on storage.objects;

create policy "homeowner_upload_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp','heic','heif','mp4','mov','webm']::text[]
    )
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
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp','heic','heif','mp4','mov','webm']::text[]
    )
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

-- ── inspection-media upload policy ──────────────────────────────────────────

drop policy if exists "insp_media_upload" on storage.objects;
create policy "insp_media_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-media'
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp','heic','heif']::text[]
    )
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.id::text = (storage.foldername(name))[1]
         and public.current_user_can_access_contractor(cp.id)
    )
  );

-- ── discover-media public upload policy ─────────────────────────────────────

drop policy if exists "discover_media_upload_contractor" on storage.objects;
create policy "discover_media_upload_contractor"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp','heic','heif']::text[]
    )
    and exists (
      select 1
        from public.contractor_profiles cp
       where public.current_user_can_access_contractor(cp.id)
    )
  );

-- ── contractor logo upload policy ───────────────────────────────────────────

drop policy if exists "contractor_assets_insert_public_logo_bucket" on storage.objects;
drop policy if exists "contractor_assets_upload_authenticated" on storage.objects;
drop policy if exists "contractor_assets_upload_own_folder" on storage.objects;

create policy "contractor_assets_insert_public_logo_bucket"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contractor-assets'
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp']::text[]
    )
  );

notify pgrst, 'reload schema';

commit;
