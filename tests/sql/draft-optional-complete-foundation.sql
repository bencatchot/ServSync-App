create table public.contractor_work_drafts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null,
  local_contact_id uuid,
  local_home_id uuid,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint contractor_work_drafts_id_contractor_unique unique (id, contractor_id)
);

create table public.contractor_work_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  contractor_id uuid not null,
  constraint contractor_work_draft_items_contractor_match_fk
    foreign key (draft_id, contractor_id)
    references public.contractor_work_drafts(id, contractor_id)
);

create table public.contractor_work_draft_launches (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  contractor_id uuid not null,
  idempotency_key uuid not null default gen_random_uuid(),
  requested_output text not null,
  status text not null,
  launched_estimate_id uuid,
  launched_job_id uuid,
  launched_invoice_id uuid,
  constraint contractor_work_draft_launches_contractor_match_fk
    foreign key (draft_id, contractor_id)
    references public.contractor_work_drafts(id, contractor_id)
);

alter table public.contractor_work_drafts owner to postgres;
alter table public.contractor_work_draft_items owner to postgres;
alter table public.contractor_work_draft_launches owner to postgres;
alter table public.contractor_work_drafts enable row level security;
alter table public.contractor_work_draft_items enable row level security;
alter table public.contractor_work_draft_launches enable row level security;

create function public.servsync_get_work_draft(uuid)
returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
create function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb)
returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
create function public.servsync_launch_work_draft(uuid, text, uuid)
returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
alter function public.servsync_get_work_draft(uuid) owner to postgres;
alter function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) owner to postgres;
alter function public.servsync_launch_work_draft(uuid, text, uuid) owner to postgres;
