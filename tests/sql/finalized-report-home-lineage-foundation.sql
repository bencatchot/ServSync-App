create schema auth;

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

create table public.contractor_profiles (
  id uuid primary key,
  business_name text
);

create table public.contractor_memberships (
  contractor_id uuid not null,
  user_id uuid not null,
  can_write_jobs boolean not null default false,
  primary key (contractor_id, user_id)
);

create function public.current_user_can_write_contractor_jobs(p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.contractor_memberships membership
     where membership.contractor_id = p_contractor_id
       and membership.user_id = auth.uid()
       and membership.can_write_jobs
  );
$$;

create table public.service_requests (
  id uuid primary key,
  category text,
  title text,
  description text
);

create table public.service_request_quotes (
  id uuid primary key,
  request_id uuid not null,
  amount_cents integer,
  status text not null,
  created_at timestamptz not null default now()
);

create table public.inspections (
  id uuid primary key,
  contractor_id uuid not null,
  homeowner_user_id uuid,
  home_id uuid,
  service_request_id uuid,
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
  homeowner_user_id uuid not null,
  home_id uuid,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  file_size_bytes integer,
  document_type text not null,
  notes text not null,
  created_at timestamptz not null default now()
);

create table public.home_maintenance_log (
  id uuid primary key default gen_random_uuid(),
  homeowner_user_id uuid not null,
  service_request_id uuid,
  inspection_id uuid,
  report_document_id uuid,
  home_id uuid,
  category text not null,
  title text not null,
  description text not null,
  performed_at date not null,
  contractor_name text not null,
  cost_cents integer,
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index maintenance_log_unique_inspection_idx
  on public.home_maintenance_log(inspection_id)
  where inspection_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  body text not null,
  request_id uuid,
  created_at timestamptz not null default now()
);

create function public.servsync_finalize_field_work(
  p_inspection_id uuid,
  p_rooms_with_findings jsonb,
  p_summary text,
  p_storage_path text,
  p_file_name text,
  p_file_size_bytes integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Migration did not replace the deployed finalizer fixture.';
end;
$$;

revoke all on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) from public;
revoke all on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) from anon;
grant execute on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) to authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant execute on function public.current_user_can_write_contractor_jobs(uuid) to authenticated, service_role;
