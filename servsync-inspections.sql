-- ServSync inspections, templates, and reporting.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-home-documents.sql.
--
-- Contractors (premium feature) can create reusable checklist templates,
-- run inspections against any connected homeowner, mark each item with a
-- finding status (Pass / Monitor / Fixed On Site / Needs Repair / Urgent),
-- generate a professional PDF report, and auto-save it to the homeowner's
-- Documents tab.

begin;

-- ── Inspection templates ──────────────────────────────────────────────────────
-- A template is a reusable set of room/item checklists. Rooms + items stored
-- as JSONB: [{room: text, items: text[]}]

create table if not exists public.inspection_templates (
  id            uuid        primary key default gen_random_uuid(),
  contractor_id uuid        not null references public.contractor_profiles(id) on delete cascade,
  name          text        not null,
  rooms         jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.inspection_templates enable row level security;

drop policy if exists "tpl_select_own" on public.inspection_templates;
drop policy if exists "tpl_insert_own" on public.inspection_templates;
drop policy if exists "tpl_delete_own" on public.inspection_templates;

create policy "tpl_select_own"
  on public.inspection_templates for select to authenticated
  using (contractor_id in (
    select id from public.contractor_profiles where owner_user_id = auth.uid()
  ));

create policy "tpl_insert_own"
  on public.inspection_templates for insert to authenticated
  with check (contractor_id in (
    select id from public.contractor_profiles where owner_user_id = auth.uid()
  ));

create policy "tpl_delete_own"
  on public.inspection_templates for delete to authenticated
  using (contractor_id in (
    select id from public.contractor_profiles where owner_user_id = auth.uid()
  ));

grant select, insert, delete on public.inspection_templates to authenticated;

-- ── Inspections ───────────────────────────────────────────────────────────────
-- One inspection per visit. Findings stored as JSONB for simplicity:
-- rooms_with_findings: [{room: text, findings: [{title, status, notes}]}]
-- status: 'Pass' | 'Monitor' | 'Fixed On Site' | 'Needs Repair' | 'Urgent'

create table if not exists public.inspections (
  id                   uuid        primary key default gen_random_uuid(),
  contractor_id        uuid        not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id    uuid        not null references auth.users(id) on delete cascade,
  service_request_id   uuid        references public.service_requests(id) on delete set null,
  template_id          uuid        references public.inspection_templates(id) on delete set null,
  name                 text        not null,
  summary              text        not null default '',
  status               text        not null default 'draft'
                       check (status in ('draft', 'finalized')),
  rooms_with_findings  jsonb       not null default '[]'::jsonb,
  report_storage_path  text,
  report_file_name     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists inspections_contractor_idx
  on public.inspections(contractor_id, created_at desc);

create index if not exists inspections_homeowner_idx
  on public.inspections(homeowner_user_id, created_at desc);

alter table public.inspections enable row level security;

drop policy if exists "insp_select_contractor" on public.inspections;
drop policy if exists "insp_insert_contractor"  on public.inspections;
drop policy if exists "insp_update_contractor"  on public.inspections;
drop policy if exists "insp_select_homeowner"   on public.inspections;

-- Contractor sees their own inspections
create policy "insp_select_contractor"
  on public.inspections for select to authenticated
  using (contractor_id in (
    select id from public.contractor_profiles where owner_user_id = auth.uid()
  ));

create policy "insp_insert_contractor"
  on public.inspections for insert to authenticated
  with check (contractor_id in (
    select id from public.contractor_profiles where owner_user_id = auth.uid()
  ));

create policy "insp_update_contractor"
  on public.inspections for update to authenticated
  using (contractor_id in (
    select id from public.contractor_profiles where owner_user_id = auth.uid()
  ));

-- Homeowner can see finalized inspections for their account
create policy "insp_select_homeowner"
  on public.inspections for select to authenticated
  using (homeowner_user_id = auth.uid() and status = 'finalized');

grant select, insert, update on public.inspections to authenticated;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Create a new inspection (draft)
create or replace function public.servsync_create_inspection(
  p_homeowner_user_id  uuid,
  p_name               text,
  p_rooms_with_findings jsonb,
  p_template_id        uuid    default null,
  p_service_request_id uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_new_id        uuid;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  if v_contractor_id is null then
    raise exception 'Contractor profile not found.';
  end if;

  -- Verify the homeowner is connected to this contractor
  if not exists (
    select 1 from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = p_homeowner_user_id
       and status = 'active'
  ) then
    raise exception 'Homeowner is not connected to this contractor.';
  end if;

  insert into public.inspections (
    contractor_id, homeowner_user_id, service_request_id, template_id,
    name, rooms_with_findings
  ) values (
    v_contractor_id, p_homeowner_user_id, p_service_request_id, p_template_id,
    p_name, coalesce(p_rooms_with_findings, '[]'::jsonb)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.servsync_create_inspection(uuid, text, jsonb, uuid, uuid) to authenticated;

-- Save inspection progress (update findings + summary, keep draft status)
create or replace function public.servsync_update_inspection(
  p_inspection_id       uuid,
  p_rooms_with_findings jsonb,
  p_summary             text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  update public.inspections
     set rooms_with_findings = p_rooms_with_findings,
         summary             = coalesce(p_summary, ''),
         updated_at          = now()
   where id             = p_inspection_id
     and contractor_id  = v_contractor_id
     and status         = 'draft';

  if not found then
    raise exception 'Inspection not found or already finalized.';
  end if;
end;
$$;

grant execute on function public.servsync_update_inspection(uuid, jsonb, text) to authenticated;

-- Finalize inspection: save findings, mark finalized, save report to home_documents,
-- notify homeowner
create or replace function public.servsync_finalize_inspection(
  p_inspection_id       uuid,
  p_rooms_with_findings jsonb,
  p_summary             text,
  p_storage_path        text,
  p_file_name           text,
  p_file_size_bytes     int    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id   uuid;
  v_contractor_name text;
  v_insp            public.inspections;
begin
  select id, business_name
    into v_contractor_id, v_contractor_name
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  select * into v_insp
    from public.inspections
   where id = p_inspection_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_insp.id is null then
    raise exception 'Inspection not found.';
  end if;

  -- Mark finalized and store report path
  update public.inspections
     set status               = 'finalized',
         rooms_with_findings  = p_rooms_with_findings,
         summary              = coalesce(p_summary, ''),
         report_storage_path  = p_storage_path,
         report_file_name     = p_file_name,
         updated_at           = now()
   where id = p_inspection_id;

  -- Auto-save PDF to homeowner's documents
  insert into public.home_documents (
    homeowner_user_id, storage_path, file_name, content_type,
    file_size_bytes, document_type, notes
  ) values (
    v_insp.homeowner_user_id,
    p_storage_path,
    p_file_name,
    'application/pdf',
    p_file_size_bytes,
    'inspection',
    'Inspection report from ' || coalesce(v_contractor_name, 'contractor') || '. Auto-saved from ServSync.'
  );

  -- Notify homeowner
  insert into public.notifications (user_id, type, title, body, request_id)
  values (
    v_insp.homeowner_user_id,
    'inspection_report_filed',
    'Inspection report filed',
    coalesce(v_contractor_name, 'Your contractor') || ' filed an inspection report for your home. Check your Documents tab to view and download it.',
    v_insp.service_request_id
  );
end;
$$;

grant execute on function public.servsync_finalize_inspection(uuid, jsonb, text, text, text, int) to authenticated;

notify pgrst, 'reload schema';

commit;
