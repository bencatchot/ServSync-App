-- Focused canonical work-record foundation layered on the Property Asset test
-- foundation. The validation harness applies the real Trade Pack and Property
-- Asset migrations before Durable Trade Section Instances v1.

create table public.estimates (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  homeowner_user_id uuid,
  home_id uuid references public.homes(id) on delete set null,
  local_contact_id uuid,
  local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  inspection_id uuid,
  status text not null default 'draft'
);

create table public.inspections (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  homeowner_user_id uuid,
  home_id uuid references public.homes(id) on delete set null,
  local_contact_id uuid,
  local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  status text not null default 'draft',
  job_status text not null default 'draft'
);

alter table public.estimates
  add constraint estimates_inspection_id_fkey
  foreign key (inspection_id) references public.inspections(id) on delete set null;

create table public.contractor_work_drafts (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  homeowner_user_id uuid,
  home_id uuid references public.homes(id) on delete set null,
  local_contact_id uuid,
  local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  status text not null default 'active',
  launched_output_type text,
  launched_estimate_id_snapshot uuid,
  launched_job_id_snapshot uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estimates owner to postgres;
alter table public.inspections owner to postgres;
alter table public.contractor_work_drafts owner to postgres;

grant all privileges on table public.estimates, public.inspections, public.contractor_work_drafts to service_role;
