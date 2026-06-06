-- ServSync estimates foundation.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- This creates contractor-owned estimate drafts with simple line items.

begin;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid references public.profiles(id) on delete set null,
  local_contact_id uuid references public.contractor_local_contacts(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null,
  title text not null default '',
  scope text not null default '',
  notes text not null default '',
  terms text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'revised')),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimates_subject_check check (
    homeowner_user_id is not null or local_contact_id is not null
  )
);

create table if not exists public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  line_type text not null default 'labor'
    check (line_type in ('labor', 'material', 'equipment', 'fee', 'other')),
  description text not null default '',
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit text not null default 'each',
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimates_contractor_updated_idx
  on public.estimates(contractor_id, updated_at desc);

create index if not exists estimates_homeowner_idx
  on public.estimates(homeowner_user_id, updated_at desc);

create index if not exists estimates_local_contact_idx
  on public.estimates(local_contact_id, updated_at desc);

create index if not exists estimate_line_items_estimate_idx
  on public.estimate_line_items(estimate_id, sort_order);

drop trigger if exists estimates_touch_updated_at on public.estimates;
create trigger estimates_touch_updated_at
  before update on public.estimates
  for each row execute function public.touch_updated_at();

drop trigger if exists estimate_line_items_touch_updated_at on public.estimate_line_items;
create trigger estimate_line_items_touch_updated_at
  before update on public.estimate_line_items
  for each row execute function public.touch_updated_at();

alter table public.estimates enable row level security;
alter table public.estimate_line_items enable row level security;

drop policy if exists "Estimates: contractor manages own" on public.estimates;
create policy "Estimates: contractor manages own"
  on public.estimates for all to authenticated
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

drop policy if exists "Estimates: homeowner reads shared" on public.estimates;
create policy "Estimates: homeowner reads shared"
  on public.estimates for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    and status <> 'draft'
  );

drop policy if exists "Estimate lines: contractor manages own" on public.estimate_line_items;
create policy "Estimate lines: contractor manages own"
  on public.estimate_line_items for all to authenticated
  using (
    exists (
      select 1
        from public.estimates e
        join public.contractor_profiles cp on cp.id = e.contractor_id
       where e.id = estimate_line_items.estimate_id
         and cp.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.estimates e
        join public.contractor_profiles cp on cp.id = e.contractor_id
       where e.id = estimate_line_items.estimate_id
         and cp.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Estimate lines: homeowner reads shared" on public.estimate_line_items;
create policy "Estimate lines: homeowner reads shared"
  on public.estimate_line_items for select to authenticated
  using (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_line_items.estimate_id
         and e.homeowner_user_id = auth.uid()
         and e.status <> 'draft'
    )
  );

grant select, insert, update, delete on public.estimates to authenticated;
grant select, insert, update, delete on public.estimate_line_items to authenticated;

create or replace function public.servsync_homeowner_respond_to_estimate(
  p_estimate_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate public.estimates;
  v_next_status text;
begin
  if p_action not in ('accept', 'decline') then
    raise exception 'Action must be accept or decline.';
  end if;

  select *
    into v_estimate
    from public.estimates
   where id = p_estimate_id
     and homeowner_user_id = auth.uid()
   limit 1;

  if v_estimate.id is null then
    raise exception 'Estimate not found.';
  end if;

  if v_estimate.status <> 'sent' then
    raise exception 'Only sent estimates can be accepted or declined.';
  end if;

  v_next_status := case when p_action = 'accept' then 'accepted' else 'declined' end;

  update public.estimates
     set status = v_next_status
   where id = v_estimate.id;

  return jsonb_build_object(
    'estimate_id', v_estimate.id,
    'status', v_next_status
  );
end;
$$;

grant execute on function public.servsync_homeowner_respond_to_estimate(uuid, text) to authenticated;

alter table if exists public.notifications
  add column if not exists estimate_id uuid references public.estimates(id) on delete cascade;

create index if not exists notifications_estimate_idx
  on public.notifications(estimate_id)
  where estimate_id is not null;

create or replace function public.notify_on_estimate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_uid uuid;
  v_title text;
  v_body text;
begin
  if TG_OP = 'INSERT' then
    if new.status <> 'sent' or new.homeowner_user_id is null then
      return new;
    end if;

    insert into public.notifications (user_id, type, title, body, estimate_id)
    values (
      new.homeowner_user_id,
      'estimate_sent',
      'Estimate sent',
      coalesce(nullif(trim(new.title), ''), 'A contractor sent you an estimate.'),
      new.id
    );

    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  v_contractor_uid := public._notif_contractor_user(new.contractor_id);

  if new.status = 'sent' and new.homeowner_user_id is not null then
    insert into public.notifications (user_id, type, title, body, estimate_id)
    values (
      new.homeowner_user_id,
      'estimate_sent',
      'Estimate sent',
      coalesce(nullif(trim(new.title), ''), 'A contractor sent you an estimate.'),
      new.id
    );
  elsif new.status = 'accepted' then
    insert into public.notifications (user_id, type, title, body, estimate_id)
    values (
      v_contractor_uid,
      'estimate_accepted',
      'Estimate accepted',
      coalesce(nullif(trim(new.title), ''), 'A homeowner accepted an estimate.'),
      new.id
    );
  elsif new.status = 'declined' then
    insert into public.notifications (user_id, type, title, body, estimate_id)
    values (
      v_contractor_uid,
      'estimate_declined',
      'Estimate declined',
      coalesce(nullif(trim(new.title), ''), 'A homeowner declined an estimate.'),
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_estimate on public.estimates;
create trigger trg_notify_on_estimate
  after insert or update on public.estimates
  for each row execute function public.notify_on_estimate();

notify pgrst, 'reload schema';

commit;
