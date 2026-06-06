-- ServSync local customer + Field Work subject foundation.
-- Paste into Supabase SQL Editor after servsync-inspections.sql.
-- This lets contractors create Field Work for:
--   1) connected ServSync homeowners, or
--   2) local customers who are not on ServSync yet.

begin;

create table if not exists public.contractor_local_contacts (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  display_name  text not null default '',
  phone         text not null default '',
  email         text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.contractor_local_homes (
  id               uuid primary key default gen_random_uuid(),
  contractor_id    uuid not null references public.contractor_profiles(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  nickname         text not null default 'Home',
  address_line1    text not null default '',
  address_line2    text not null default '',
  city             text not null default '',
  state            text not null default '',
  zip_code         text not null default '',
  home_type        text not null default '',
  year_built       text not null default '',
  square_feet      text not null default '',
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists contractor_local_contacts_contractor_idx
  on public.contractor_local_contacts(contractor_id, created_at desc);

create index if not exists contractor_local_homes_contact_idx
  on public.contractor_local_homes(local_contact_id);

drop trigger if exists contractor_local_contacts_touch_updated_at on public.contractor_local_contacts;
create trigger contractor_local_contacts_touch_updated_at
  before update on public.contractor_local_contacts
  for each row execute function public.touch_updated_at();

drop trigger if exists contractor_local_homes_touch_updated_at on public.contractor_local_homes;
create trigger contractor_local_homes_touch_updated_at
  before update on public.contractor_local_homes
  for each row execute function public.touch_updated_at();

alter table public.contractor_local_contacts enable row level security;
alter table public.contractor_local_homes enable row level security;

drop policy if exists "Local contacts: contractor manages own" on public.contractor_local_contacts;
create policy "Local contacts: contractor manages own"
  on public.contractor_local_contacts for all to authenticated
  using (
    contractor_id in (
      select id from public.contractor_profiles where owner_user_id = auth.uid()
    )
  )
  with check (
    contractor_id in (
      select id from public.contractor_profiles where owner_user_id = auth.uid()
    )
  );

drop policy if exists "Local homes: contractor manages own" on public.contractor_local_homes;
create policy "Local homes: contractor manages own"
  on public.contractor_local_homes for all to authenticated
  using (
    contractor_id in (
      select id from public.contractor_profiles where owner_user_id = auth.uid()
    )
  )
  with check (
    contractor_id in (
      select id from public.contractor_profiles where owner_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.contractor_local_contacts to authenticated;
grant select, insert, update, delete on public.contractor_local_homes to authenticated;

alter table if exists public.inspections
  add column if not exists local_contact_id uuid references public.contractor_local_contacts(id) on delete set null,
  add column if not exists local_home_id uuid references public.contractor_local_homes(id) on delete set null;

alter table if exists public.inspections
  alter column homeowner_user_id drop not null;

drop index if exists inspections_local_contact_idx;
create index inspections_local_contact_idx
  on public.inspections(local_contact_id, created_at desc);

alter table if exists public.inspections
  drop constraint if exists inspections_subject_check;

alter table if exists public.inspections
  add constraint inspections_subject_check
  check (homeowner_user_id is not null or local_contact_id is not null);

create or replace function public.servsync_create_local_contact(
  p_display_name   text default '',
  p_phone          text default '',
  p_email          text default '',
  p_notes          text default '',
  p_home_nickname  text default 'Home',
  p_address_line1  text default '',
  p_address_line2  text default '',
  p_city           text default '',
  p_state          text default '',
  p_zip_code       text default '',
  p_home_type      text default '',
  p_year_built     text default '',
  p_square_feet    text default '',
  p_home_notes     text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  if v_contractor_id is null then
    raise exception 'Contractor profile not found.';
  end if;

  if length(trim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'Local customer name is required.';
  end if;

  insert into public.contractor_local_contacts (
    contractor_id, display_name, phone, email, notes
  ) values (
    v_contractor_id,
    trim(coalesce(p_display_name, '')),
    trim(coalesce(p_phone, '')),
    trim(coalesce(p_email, '')),
    coalesce(p_notes, '')
  )
  returning * into v_contact;

  insert into public.contractor_local_homes (
    contractor_id, local_contact_id, nickname, address_line1, address_line2,
    city, state, zip_code, home_type, year_built, square_feet, notes
  ) values (
    v_contractor_id,
    v_contact.id,
    coalesce(nullif(trim(coalesce(p_home_nickname, '')), ''), 'Home'),
    trim(coalesce(p_address_line1, '')),
    trim(coalesce(p_address_line2, '')),
    trim(coalesce(p_city, '')),
    trim(coalesce(p_state, '')),
    trim(coalesce(p_zip_code, '')),
    trim(coalesce(p_home_type, '')),
    trim(coalesce(p_year_built, '')),
    trim(coalesce(p_square_feet, '')),
    coalesce(p_home_notes, '')
  )
  returning * into v_home;

  return jsonb_build_object(
    'contact', to_jsonb(v_contact),
    'home', to_jsonb(v_home)
  );
end;
$$;

grant execute on function public.servsync_create_local_contact(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.servsync_create_field_work(
  p_homeowner_user_id    uuid  default null,
  p_local_contact_id     uuid  default null,
  p_local_home_id        uuid  default null,
  p_service_request_id   uuid  default null,
  p_name                 text  default '',
  p_rooms_with_findings  jsonb default '[]'::jsonb,
  p_template_id          uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request public.service_requests;
  v_local_home public.contractor_local_homes;
  v_new_id uuid;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  if v_contractor_id is null then
    raise exception 'Contractor profile not found.';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Field work name is required.';
  end if;

  if p_service_request_id is not null then
    select * into v_request
      from public.service_requests
     where id = p_service_request_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_request.id is null then
      raise exception 'Service request not found for this contractor.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_request.homeowner_user_id;
    elsif p_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception 'Field work homeowner does not match the service request.';
    end if;
  end if;

  if p_local_home_id is not null then
    select * into v_local_home
      from public.contractor_local_homes
     where id = p_local_home_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_local_home.id is null then
      raise exception 'Local home not found for this contractor.';
    end if;

    if p_local_contact_id is null then
      p_local_contact_id := v_local_home.local_contact_id;
    elsif p_local_contact_id <> v_local_home.local_contact_id then
      raise exception 'Local customer does not match the selected local home.';
    end if;
  end if;

  if p_homeowner_user_id is null and p_local_contact_id is null then
    raise exception 'Choose a homeowner or local customer before starting field work.';
  end if;

  if p_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = p_homeowner_user_id
       and status = 'active'
  ) then
    raise exception 'Homeowner is not connected to this contractor.';
  end if;

  if p_local_contact_id is not null and not exists (
    select 1
      from public.contractor_local_contacts
     where id = p_local_contact_id
       and contractor_id = v_contractor_id
  ) then
    raise exception 'Local customer not found for this contractor.';
  end if;

  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    template_id,
    name,
    rooms_with_findings
  ) values (
    v_contractor_id,
    p_homeowner_user_id,
    p_local_contact_id,
    p_local_home_id,
    p_service_request_id,
    p_template_id,
    trim(p_name),
    coalesce(p_rooms_with_findings, '[]'::jsonb)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, text, jsonb, uuid
) to authenticated;

create or replace function public.servsync_finalize_field_work(
  p_inspection_id       uuid,
  p_rooms_with_findings jsonb,
  p_summary             text,
  p_storage_path        text,
  p_file_name           text,
  p_file_size_bytes     int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_contractor_name text;
  v_insp public.inspections;
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
    raise exception 'Field work not found.';
  end if;

  update public.inspections
     set status = 'finalized',
         rooms_with_findings = p_rooms_with_findings,
         summary = coalesce(p_summary, ''),
         report_storage_path = p_storage_path,
         report_file_name = p_file_name,
         updated_at = now()
   where id = p_inspection_id;

  if v_insp.homeowner_user_id is not null then
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
      'Field work report from ' || coalesce(v_contractor_name, 'contractor') || '. Auto-saved from ServSync.'
    );

    insert into public.notifications (user_id, type, title, body, request_id)
    values (
      v_insp.homeowner_user_id,
      'inspection_report_filed',
      'Field work report filed',
      coalesce(v_contractor_name, 'Your contractor') || ' filed a field work report for your home. Check your Documents tab to view and download it.',
      v_insp.service_request_id
    );
  end if;
end;
$$;

grant execute on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, int) to authenticated;

notify pgrst, 'reload schema';

commit;
