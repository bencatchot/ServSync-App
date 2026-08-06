create table public.contractor_work_drafts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  local_contact_id uuid references public.contractor_local_contacts(id) on delete set null,
  local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  status text not null default 'active',
  launched_invoice_id uuid references public.invoices(id) on delete set null,
  launched_invoice_id_snapshot uuid,
  created_at timestamptz not null default now(),
  constraint contractor_work_drafts_id_contractor_unique unique (id, contractor_id)
);

create table public.contractor_work_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.contractor_work_drafts(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  constraint contractor_work_draft_items_contractor_match_fk
    foreign key (draft_id, contractor_id)
    references public.contractor_work_drafts(id, contractor_id)
    on delete cascade
);

create table public.contractor_work_draft_launches (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.contractor_work_drafts(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  idempotency_key uuid not null default gen_random_uuid(),
  requested_output text not null,
  status text not null,
  launched_estimate_id uuid references public.estimates(id) on delete set null,
  launched_job_id uuid references public.inspections(id) on delete set null,
  launched_invoice_id uuid references public.invoices(id) on delete set null,
  launched_invoice_id_snapshot uuid,
  constraint contractor_work_draft_launches_contractor_match_fk
    foreign key (draft_id, contractor_id)
    references public.contractor_work_drafts(id, contractor_id)
    on delete restrict
);

alter table public.contractor_work_drafts owner to postgres;
alter table public.contractor_work_draft_items owner to postgres;
alter table public.contractor_work_draft_launches owner to postgres;

alter table public.contractor_work_drafts enable row level security;
alter table public.contractor_work_draft_items enable row level security;
alter table public.contractor_work_draft_launches enable row level security;

create policy "Contractor work drafts: contractor team reads"
  on public.contractor_work_drafts for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

create policy "Contractor work draft items: contractor team reads"
  on public.contractor_work_draft_items for select to authenticated
  using (
    exists (
      select 1
        from public.contractor_work_drafts draft
       where draft.id = contractor_work_draft_items.draft_id
         and draft.contractor_id = contractor_work_draft_items.contractor_id
         and (
           public.current_user_can_access_contractor(draft.contractor_id)
           or public.current_user_is_platform_admin()
         )
    )
  );

create policy "Contractor work draft launches: contractor team reads"
  on public.contractor_work_draft_launches for select to authenticated
  using (
    exists (
      select 1
        from public.contractor_work_drafts draft
       where draft.id = contractor_work_draft_launches.draft_id
         and draft.contractor_id = contractor_work_draft_launches.contractor_id
         and (
           public.current_user_can_access_contractor(draft.contractor_id)
           or public.current_user_is_platform_admin()
         )
    )
  );

revoke all on table public.contractor_work_drafts from public, anon, authenticated;
grant select on table public.contractor_work_drafts to authenticated;
revoke all on table public.contractor_work_draft_items from public, anon, authenticated;
grant select on table public.contractor_work_draft_items to authenticated;
revoke all on table public.contractor_work_draft_launches from public, anon, authenticated;
grant select on table public.contractor_work_draft_launches to authenticated;

create function public.servsync_get_work_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$ begin return '{}'::jsonb; end $$;

create function public.servsync_save_work_draft(
  p_draft_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_removed_item_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$ begin return '{}'::jsonb; end $$;

create function public.servsync_launch_work_draft(
  p_draft_id uuid,
  p_intended_output text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$ begin return '{}'::jsonb; end $$;

alter function public.servsync_get_work_draft(uuid) owner to postgres;
alter function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) owner to postgres;
alter function public.servsync_launch_work_draft(uuid, text, uuid) owner to postgres;

revoke execute on function public.servsync_get_work_draft(uuid) from public, anon;
grant execute on function public.servsync_get_work_draft(uuid) to authenticated;
revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.servsync_launch_work_draft(uuid, text, uuid) from public, anon;
grant execute on function public.servsync_launch_work_draft(uuid, text, uuid) to authenticated;
