-- ServSync beta homeowner Documents-tab upload limits.
-- Do not apply to production without separate approval.
--
-- Scope:
--   - Enforces beta limits for manual homeowner Documents-tab uploads.
--   - Does not count contractor-filed reports, accepted-estimate filing,
--     profile photos, home photos, Home History receipt attachments, or other
--     generated app records against the manual document quota.
--   - Keeps the shared private home-documents bucket at its existing bucket
--     size setting so other flows are not blocked by the 10 MB manual limit.

begin;

-- Production rollout precheck:
-- Contractor-filed reports use a separate storage policy and helper function.
-- Verify both are present before tightening the general homeowner upload policy
-- so report filing remains excluded from manual Documents-tab beta quotas.
do $$
begin
  if to_regprocedure('public.servsync_can_upload_field_work_report_path(text)') is null then
    raise exception 'Missing required contractor report helper: public.servsync_can_upload_field_work_report_path(text). Apply the field-work report delivery SQL before this patch.';
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'home_docs_upload_contractor_field_work_reports'
  ) then
    raise exception 'Missing required storage policy: home_docs_upload_contractor_field_work_reports. Apply the field-work report delivery storage policy before this patch.';
  end if;
end;
$$;

alter table public.home_documents
  add column if not exists upload_source text not null default 'legacy';

alter table public.home_documents
  alter column upload_source set default 'manual_documents_tab';

alter table public.home_documents
  drop constraint if exists home_documents_upload_source_check;

alter table public.home_documents
  add constraint home_documents_upload_source_check
  check (
    upload_source in (
      'legacy',
      'manual_documents_tab',
      'home_history_receipt',
      'estimate_filing',
      'contractor_report',
      'profile_photo',
      'home_photo',
      'app_generated'
    )
  );

create index if not exists home_documents_manual_owner_created_idx
  on public.home_documents(homeowner_user_id, created_at desc)
  where upload_source = 'manual_documents_tab';

create index if not exists home_documents_manual_owner_home_created_idx
  on public.home_documents(homeowner_user_id, home_id, created_at desc)
  where upload_source = 'manual_documents_tab';

alter table public.home_documents
  drop constraint if exists home_documents_manual_source_path_check;

alter table public.home_documents
  add constraint home_documents_manual_source_path_check
  check (
    upload_source = 'manual_documents_tab'
    or storage_path !~ '^[^/]+/manual-documents/'
  );

create or replace function public.servsync_classify_home_document_upload_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.upload_source = 'manual_documents_tab'
     and (
       new.storage_path ~ '^[^/]+/field-work/'
       or new.storage_path ~ '^contractor-field-work/'
     ) then
    new.upload_source := 'contractor_report';
  end if;

  return new;
end;
$$;

drop trigger if exists home_documents_upload_source_classifier on public.home_documents;
create trigger home_documents_upload_source_classifier
  before insert or update of storage_path, upload_source
  on public.home_documents
  for each row
  execute function public.servsync_classify_home_document_upload_source();

revoke execute on function public.servsync_classify_home_document_upload_source() from public;
revoke execute on function public.servsync_classify_home_document_upload_source() from anon;
grant execute on function public.servsync_classify_home_document_upload_source() to authenticated;

create table if not exists public.home_document_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  document_type text not null default 'other'
    check (document_type in ('warranty','manual','inspection','insurance','permit','receipt','other')),
  notes text not null default '',
  upload_source text not null default 'manual_documents_tab'
    check (upload_source = 'manual_documents_tab'),
  status text not null default 'pending'
    check (status in ('pending','completed','expired','failed')),
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists home_doc_upload_reservations_owner_status_idx
  on public.home_document_upload_reservations(homeowner_user_id, status, created_at desc);

create table if not exists public.home_document_upload_events (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  home_document_id uuid references public.home_documents(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  upload_source text not null default 'manual_documents_tab'
    check (upload_source = 'manual_documents_tab'),
  created_at timestamptz not null default now()
);

create index if not exists home_doc_upload_events_owner_created_idx
  on public.home_document_upload_events(homeowner_user_id, created_at desc);

create index if not exists home_doc_upload_events_owner_month_idx
  on public.home_document_upload_events(homeowner_user_id, created_at)
  where upload_source = 'manual_documents_tab';

create unique index if not exists home_doc_upload_events_storage_path_unique_idx
  on public.home_document_upload_events(storage_path)
  where upload_source = 'manual_documents_tab';

alter table public.home_document_upload_reservations enable row level security;
alter table public.home_document_upload_events enable row level security;

drop policy if exists "docs_insert_own" on public.home_documents;
create policy "docs_insert_own"
  on public.home_documents for insert to authenticated
  with check (
    homeowner_user_id = auth.uid()
    and upload_source in ('home_history_receipt', 'estimate_filing', 'app_generated')
    and storage_path !~ ('^' || auth.uid()::text || '/manual-documents/')
  );

drop policy if exists "home_doc_upload_reservations_select_own" on public.home_document_upload_reservations;
create policy "home_doc_upload_reservations_select_own"
  on public.home_document_upload_reservations for select to authenticated
  using (homeowner_user_id = auth.uid());

drop policy if exists "home_doc_upload_events_select_own" on public.home_document_upload_events;
create policy "home_doc_upload_events_select_own"
  on public.home_document_upload_events for select to authenticated
  using (homeowner_user_id = auth.uid());

grant select on public.home_document_upload_reservations to authenticated;
grant select on public.home_document_upload_events to authenticated;

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

revoke execute on function public.servsync_storage_extension_is_allowed(text, text[]) from public;
revoke execute on function public.servsync_storage_extension_is_allowed(text, text[]) from anon;
grant execute on function public.servsync_storage_extension_is_allowed(text, text[]) to authenticated;

drop policy if exists "home_docs_upload" on storage.objects;
create policy "home_docs_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((storage.foldername(name))[2], '') <> 'manual-documents'
    and public.servsync_storage_extension_is_allowed(
      name,
      array['pdf','jpg','jpeg','png','webp','heic','heif']::text[]
    )
  );

drop policy if exists "home_docs_upload_manual_document_reservations" on storage.objects;
create policy "home_docs_upload_manual_document_reservations"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'home-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'manual-documents'
    and public.servsync_storage_extension_is_allowed(
      name,
      array['pdf','jpg','jpeg','png','webp']::text[]
    )
    and exists (
      select 1
        from public.home_document_upload_reservations r
       where r.storage_path = name
         and r.homeowner_user_id = auth.uid()
         and r.status = 'pending'
         and r.expires_at > now()
    )
  );

create or replace function public.servsync_manual_home_document_upload_limits()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'max_file_bytes', 10485760,
    'max_account_bytes', 262144000,
    'max_home_bytes', 104857600,
    'max_account_count', 50,
    'max_monthly_bytes', 104857600,
    'allowed_content_types', jsonb_build_array(
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ),
    'allowed_extensions', jsonb_build_array('pdf','jpg','jpeg','png','webp')
  );
$$;

revoke execute on function public.servsync_manual_home_document_upload_limits() from public;
revoke execute on function public.servsync_manual_home_document_upload_limits() from anon;
grant execute on function public.servsync_manual_home_document_upload_limits() to authenticated;

create or replace function public.servsync_normalized_manual_home_document_extension(p_file_name text)
returns text
language sql
immutable
as $$
  select lower(coalesce(storage.extension(coalesce(p_file_name, '')), ''));
$$;

revoke execute on function public.servsync_normalized_manual_home_document_extension(text) from public;
revoke execute on function public.servsync_normalized_manual_home_document_extension(text) from anon;
grant execute on function public.servsync_normalized_manual_home_document_extension(text) to authenticated;

create or replace function public.servsync_validate_manual_home_document_upload(
  p_homeowner_user_id uuid,
  p_home_id uuid,
  p_file_name text,
  p_content_type text,
  p_file_size_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ext text;
  v_account_bytes bigint;
  v_home_bytes bigint;
  v_account_count bigint;
  v_monthly_bytes bigint;
begin
  if auth.uid() is null or p_homeowner_user_id <> auth.uid() then
    raise exception 'Sign in again before uploading documents.';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception 'Choose a document before uploading.';
  end if;

  if p_file_size_bytes > 10485760 then
    raise exception 'This file is over the 10 MB beta document limit. Try a smaller PDF or compressed image.';
  end if;

  v_ext := public.servsync_normalized_manual_home_document_extension(p_file_name);

  if lower(coalesce(p_content_type, '')) not in ('application/pdf','image/jpeg','image/png','image/webp')
     or v_ext not in ('pdf','jpg','jpeg','png','webp') then
    raise exception 'For beta, Documents supports PDF, JPG, PNG, and WebP files.';
  end if;

  if p_home_id is not null and not exists (
    select 1
      from public.homes h
     where h.id = p_home_id
       and h.homeowner_user_id = p_homeowner_user_id
  ) then
    raise exception 'Choose one of your properties before uploading this document.';
  end if;

  select coalesce(sum(file_size_bytes), 0), count(*)
    into v_account_bytes, v_account_count
    from public.home_documents
   where homeowner_user_id = p_homeowner_user_id
     and upload_source = 'manual_documents_tab';

  if v_account_count >= 50 then
    raise exception 'Your beta document library has reached the 50 document limit. Delete an old document before uploading another.';
  end if;

  if v_account_bytes + p_file_size_bytes > 262144000 then
    raise exception 'Your beta document storage is full. You can still use requests, estimates, invoices, Home History, and reminders. Delete an old document to upload another.';
  end if;

  if p_home_id is not null then
    select coalesce(sum(file_size_bytes), 0)
      into v_home_bytes
      from public.home_documents
     where homeowner_user_id = p_homeowner_user_id
       and home_id = p_home_id
       and upload_source = 'manual_documents_tab';

    if v_home_bytes + p_file_size_bytes > 104857600 then
      raise exception 'This property has reached the 100 MB beta document limit. You can upload to another property or delete older files for this home.';
    end if;
  end if;

  select coalesce(sum(file_size_bytes), 0)
    into v_monthly_bytes
    from public.home_document_upload_events
   where homeowner_user_id = p_homeowner_user_id
     and upload_source = 'manual_documents_tab'
     and created_at >= date_trunc('month', now());

  if v_monthly_bytes + p_file_size_bytes > 104857600 then
    raise exception 'You have reached the beta monthly upload limit for documents. You can still view and manage your existing files.';
  end if;
end;
$$;

revoke execute on function public.servsync_validate_manual_home_document_upload(uuid, uuid, text, text, bigint) from public;
revoke execute on function public.servsync_validate_manual_home_document_upload(uuid, uuid, text, text, bigint) from anon;
grant execute on function public.servsync_validate_manual_home_document_upload(uuid, uuid, text, text, bigint) to authenticated;

create or replace function public.servsync_prepare_manual_home_document_upload(
  p_home_id uuid,
  p_file_name text,
  p_content_type text,
  p_file_size_bytes bigint,
  p_document_type text default 'other',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ext text;
  v_storage_path text;
  v_reservation public.home_document_upload_reservations;
begin
  if v_user_id is null then
    raise exception 'Sign in again before uploading documents.';
  end if;

  if coalesce(p_document_type, 'other') not in ('warranty','manual','inspection','insurance','permit','receipt','other') then
    raise exception 'Choose a valid document type before uploading.';
  end if;

  perform public.servsync_validate_manual_home_document_upload(
    v_user_id,
    p_home_id,
    p_file_name,
    p_content_type,
    p_file_size_bytes
  );

  v_ext := public.servsync_normalized_manual_home_document_extension(p_file_name);
  v_storage_path := v_user_id::text || '/manual-documents/' || gen_random_uuid()::text || '.' || v_ext;

  insert into public.home_document_upload_reservations (
    homeowner_user_id,
    home_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes,
    document_type,
    notes
  ) values (
    v_user_id,
    p_home_id,
    v_storage_path,
    left(coalesce(p_file_name, 'Document'), 255),
    lower(coalesce(p_content_type, '')),
    p_file_size_bytes,
    coalesce(p_document_type, 'other'),
    coalesce(p_notes, '')
  )
  returning * into v_reservation;

  return jsonb_build_object(
    'reservation_id', v_reservation.id,
    'storage_path', v_reservation.storage_path,
    'expires_at', v_reservation.expires_at
  );
end;
$$;

revoke execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text) from public;
revoke execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text) from anon;
grant execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text) to authenticated;

create or replace function public.servsync_register_manual_home_document_upload(
  p_storage_path text
)
returns public.home_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.home_document_upload_reservations;
  v_document public.home_documents;
begin
  if v_user_id is null then
    raise exception 'Sign in again before uploading documents.';
  end if;

  select *
    into v_reservation
    from public.home_document_upload_reservations
   where storage_path = p_storage_path
     and homeowner_user_id = v_user_id
     and status = 'pending'
     and expires_at > now()
   limit 1
   for update;

  if v_reservation.id is null then
    raise exception 'This document upload was not prepared or has expired. Please choose the file again.';
  end if;

  perform public.servsync_validate_manual_home_document_upload(
    v_user_id,
    v_reservation.home_id,
    v_reservation.file_name,
    v_reservation.content_type,
    v_reservation.file_size_bytes
  );

  insert into public.home_documents (
    homeowner_user_id,
    home_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes,
    document_type,
    notes,
    upload_source
  ) values (
    v_user_id,
    v_reservation.home_id,
    v_reservation.storage_path,
    v_reservation.file_name,
    v_reservation.content_type,
    v_reservation.file_size_bytes::int,
    v_reservation.document_type,
    v_reservation.notes,
    'manual_documents_tab'
  )
  returning * into v_document;

  insert into public.home_document_upload_events (
    homeowner_user_id,
    home_id,
    home_document_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes
  ) values (
    v_user_id,
    v_reservation.home_id,
    v_document.id,
    v_reservation.storage_path,
    v_reservation.file_name,
    v_reservation.content_type,
    v_reservation.file_size_bytes
  );

  update public.home_document_upload_reservations
     set status = 'completed',
         completed_at = now()
   where id = v_reservation.id;

  return v_document;
end;
$$;

revoke execute on function public.servsync_register_manual_home_document_upload(text) from public;
revoke execute on function public.servsync_register_manual_home_document_upload(text) from anon;
grant execute on function public.servsync_register_manual_home_document_upload(text) to authenticated;

notify pgrst, 'reload schema';

commit;
