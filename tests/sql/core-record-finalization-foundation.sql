create schema auth;
create schema storage;
create schema extensions;
create extension pgcrypto with schema extensions;

create role postgres superuser;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.profiles (
  id uuid primary key
);

create table public.contractor_profiles (
  id uuid primary key,
  business_name text
);

create table public.homes (
  id uuid primary key,
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade
);

create table public.service_requests (
  id uuid primary key,
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  category text,
  title text,
  description text
);

create table public.service_request_quotes (
  id uuid primary key,
  request_id uuid not null references public.service_requests(id) on delete cascade,
  amount_cents integer,
  status text not null,
  created_at timestamptz not null default now()
);

create table public.inspections (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid references public.profiles(id) on delete set null,
  home_id uuid references public.homes(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  name text,
  status text not null default 'draft',
  job_status text not null default 'in_progress',
  completed_at timestamptz,
  rooms_with_findings jsonb not null default '[]'::jsonb,
  summary text not null default '',
  report_storage_path text,
  report_file_name text,
  updated_at timestamptz not null default now()
);

create table public.home_documents (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  file_size_bytes integer,
  document_type text not null,
  notes text not null default '',
  upload_source text,
  created_at timestamptz not null default now()
);

create table public.home_maintenance_log (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete cascade,
  report_document_id uuid references public.home_documents(id) on delete set null,
  invoice_document_id uuid references public.home_documents(id) on delete set null,
  home_id uuid references public.homes(id) on delete set null,
  category text not null,
  title text not null,
  description text not null,
  performed_at date not null,
  contractor_name text not null,
  cost_cents integer,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index maintenance_log_unique_inspection_idx
  on public.home_maintenance_log(inspection_id)
  where inspection_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  request_id uuid,
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner_id text,
  metadata jsonb,
  user_metadata jsonb,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

create function storage.foldername(p_name text)
returns text[]
language sql
immutable
as $$
  select case
    when array_length(string_to_array(p_name, '/'), 1) > 1
      then (string_to_array(p_name, '/'))[1:array_length(string_to_array(p_name, '/'), 1) - 1]
    else array[]::text[]
  end;
$$;

create function public.servsync_storage_extension_is_allowed(p_name text, p_extensions text[])
returns boolean
language sql
immutable
as $$
  select lower(coalesce(substring(p_name from '\.([^.]+)$'), '')) = any(p_extensions);
$$;

create function public.current_user_can_write_contractor_jobs(p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = '10000000-0000-4000-8000-000000000001'::uuid;
$$;

create function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer)
returns void
language sql
security definer
set search_path = public
as $$ select; $$;

create function public.servsync_can_upload_field_work_report_path(text)
returns boolean
language sql
security definer
set search_path = public
as $$ select false; $$;

create policy "home_docs_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'home-documents');

create policy "home_docs_upload_contractor_field_work_reports"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'home-documents' and public.servsync_can_upload_field_work_report_path(name));

grant usage on schema public, auth, storage to authenticated, service_role;
grant select, insert, update, delete on public.home_maintenance_log to authenticated;
grant execute on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) to authenticated, service_role;
grant execute on function public.servsync_can_upload_field_work_report_path(text) to authenticated, service_role;
