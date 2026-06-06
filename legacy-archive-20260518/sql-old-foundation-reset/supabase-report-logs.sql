-- Report history + original PDF storage for Prevention Pros.
-- Run this in Supabase SQL Editor. Safe to run more than once.

create table if not exists public.report_logs (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  issue_count integer not null default 0,
  urgent_count integer not null default 0,
  pass_count integer not null default 0,
  room_count integer not null default 0,
  photo_count integer not null default 0,
  notes text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  pdf_url text,
  pdf_path text,
  file_name text
);

alter table public.report_logs
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pdf_url text,
  add column if not exists pdf_path text,
  add column if not exists file_name text;

alter table public.report_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'report_logs'
      and policyname = 'Allow all report logs'
  ) then
    create policy "Allow all report logs"
      on public.report_logs
      for all
      using (true)
      with check (true);
  end if;
end $$;

create index if not exists report_logs_property_created_idx
  on public.report_logs(property_id, created_at desc);

-- Public storage bucket for original PDF reports.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', true, 52428800, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Allow all report PDF storage'
  ) then
    create policy "Allow all report PDF storage"
      on storage.objects
      for all
      using (bucket_id = 'reports')
      with check (bucket_id = 'reports');
  end if;
end $$;

-- Force PostgREST/Supabase API to reload schema after adding columns.
notify pgrst, 'reload schema';
