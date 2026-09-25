-- Isolated PostgreSQL model of the affected ownership/FK paths, not product schema.
create role anon; create role authenticated; create role service_role;
create table public.estimates(id uuid primary key, contractor_id uuid, homeowner_user_id uuid, home_id uuid, status text, total_cents int);
create table public.contractor_work_drafts(id uuid primary key, contractor_id uuid, homeowner_user_id uuid, home_id uuid,
 status text, work_format text, intended_output text, launched_output_type text,
 launched_estimate_id uuid references estimates on delete set null, launched_estimate_id_snapshot uuid,
 launched_job_id uuid, unique(id,contractor_id));
create table public.contractor_work_draft_items(id uuid primary key, contractor_id uuid, draft_id uuid references contractor_work_drafts on delete cascade,
 foreign key(draft_id,contractor_id) references contractor_work_drafts(id,contractor_id) on delete cascade);
create table public.contractor_work_draft_launches(id uuid primary key, contractor_id uuid, draft_id uuid references contractor_work_drafts on delete restrict,
 requested_output text, status text, launched_estimate_id uuid references estimates on delete set null, launched_estimate_id_snapshot uuid,
 foreign key(draft_id,contractor_id) references contractor_work_drafts(id,contractor_id) on delete restrict);
create table public.estimate_line_items(id uuid primary key, estimate_id uuid references estimates on delete cascade);
create table public.unexpected_dependency(id uuid primary key, estimate_id uuid references estimates on delete set null, draft_id uuid references contractor_work_drafts on delete cascade);
-- Mirrors the private automatic Estimate attribution dependency (non-id PK).
create table public.estimate_actor_audit(estimate_id uuid primary key references estimates(id) on delete cascade,
 contractor_id uuid not null, created_by_user_id uuid, sent_by_user_id uuid, sent_at timestamptz);
