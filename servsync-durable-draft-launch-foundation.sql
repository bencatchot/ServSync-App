-- ServSync durable Draft launch foundation.
-- Paste into the Supabase SQL Editor only after explicit sandbox SQL approval.
--
-- This patch creates the dedicated contractor-only Draft persistence and launch
-- contract for the future shared Draft Composer. It does not expose Create
-- Estimate/Create Job UI, does not add direct Draft-to-Invoice launch, and does
-- not migrate or delete existing inspection-backed Draft Job records.

begin;

create extension if not exists pgcrypto;

create table if not exists public.contractor_work_drafts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  homeowner_user_id uuid references public.profiles(id) on delete set null,
  home_id uuid references public.homes(id) on delete set null,
  local_contact_id uuid references public.contractor_local_contacts(id) on delete set null,
  local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  title text not null default '',
  scope_description text not null default '',
  private_notes text not null default '',
  intended_output text check (intended_output is null or intended_output in ('estimate', 'job')),
  work_format text not null default 'standard' check (work_format = 'standard'),
  labor_mode text check (labor_mode is null or labor_mode in ('job_total', 'line_specific')),
  labor_rate_cents integer check (labor_rate_cents is null or labor_rate_cents >= 0),
  job_labor_hours numeric(10,2) check (job_labor_hours is null or job_labor_hours >= 0),
  status text not null default 'active' check (status in ('active', 'consumed', 'discarded')),
  legacy_inspection_id uuid references public.inspections(id) on delete set null,
  launched_output_type text check (launched_output_type is null or launched_output_type in ('estimate', 'job')),
  launched_estimate_id uuid references public.estimates(id) on delete set null,
  launched_job_id uuid references public.inspections(id) on delete set null,
  launched_at timestamptz,
  launched_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_work_drafts_id_contractor_unique unique (id, contractor_id),
  constraint contractor_work_drafts_subject_check check (
    (homeowner_user_id is not null and local_contact_id is null)
    or (homeowner_user_id is null and local_contact_id is not null)
  ),
  constraint contractor_work_drafts_property_subject_check check (
    (home_id is null or homeowner_user_id is not null)
    and (local_home_id is null or local_contact_id is not null)
  ),
  constraint contractor_work_drafts_launch_state_check check (
    (
      status in ('active', 'discarded')
      and launched_output_type is null
      and launched_estimate_id is null
      and launched_job_id is null
      and launched_at is null
      and launched_by_user_id is null
    )
    or (
      status = 'consumed'
      and launched_output_type is not null
      and launched_at is not null
      and launched_by_user_id is not null
      and (
        (launched_output_type = 'estimate' and launched_estimate_id is not null and launched_job_id is null)
        or (launched_output_type = 'job' and launched_job_id is not null and launched_estimate_id is null)
      )
    )
  )
);

create table if not exists public.contractor_work_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.contractor_work_drafts(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  customer_description text not null default '',
  internal_notes text not null default '',
  line_type text not null default 'labor' check (line_type in ('labor', 'material', 'fee', 'other')),
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit text not null default 'each',
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0),
  labor_hours numeric(10,2) check (labor_hours is null or labor_hours >= 0),
  room_id text,
  room_label text,
  location_label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_work_draft_items_title_not_blank check (length(trim(title)) > 0),
  constraint contractor_work_draft_items_contractor_match_fk
    foreign key (draft_id, contractor_id)
    references public.contractor_work_drafts(id, contractor_id)
    on delete cascade
);

create table if not exists public.contractor_work_draft_launches (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.contractor_work_drafts(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  idempotency_key uuid not null,
  requested_output text not null check (requested_output in ('estimate', 'job')),
  status text not null check (status in ('succeeded', 'failed')),
  launched_estimate_id uuid references public.estimates(id) on delete set null,
  launched_job_id uuid references public.inspections(id) on delete set null,
  requested_by_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  constraint contractor_work_draft_launches_contractor_match_fk
    foreign key (draft_id, contractor_id)
    references public.contractor_work_drafts(id, contractor_id)
    on delete cascade,
  constraint contractor_work_draft_launches_status_linkage_check check (
    (
      status = 'succeeded'
      and completed_at is not null
      and failure_code is null
      and (
        (requested_output = 'estimate' and launched_estimate_id is not null and launched_job_id is null)
        or (requested_output = 'job' and launched_job_id is not null and launched_estimate_id is null)
      )
    )
    or (
      status = 'failed'
      and launched_estimate_id is null
      and launched_job_id is null
    )
  )
);

create unique index if not exists contractor_work_drafts_legacy_inspection_unique_idx
  on public.contractor_work_drafts(legacy_inspection_id)
  where legacy_inspection_id is not null;

create index if not exists contractor_work_drafts_contractor_status_updated_idx
  on public.contractor_work_drafts(contractor_id, status, updated_at desc);

create index if not exists contractor_work_drafts_homeowner_idx
  on public.contractor_work_drafts(homeowner_user_id, updated_at desc)
  where homeowner_user_id is not null;

create index if not exists contractor_work_drafts_local_contact_idx
  on public.contractor_work_drafts(local_contact_id, updated_at desc)
  where local_contact_id is not null;

create index if not exists contractor_work_draft_items_draft_sort_idx
  on public.contractor_work_draft_items(draft_id, sort_order, created_at);

create unique index if not exists contractor_work_draft_launches_one_success_idx
  on public.contractor_work_draft_launches(draft_id)
  where status = 'succeeded';

create unique index if not exists contractor_work_draft_launches_idempotency_idx
  on public.contractor_work_draft_launches(contractor_id, idempotency_key);

create index if not exists contractor_work_draft_launches_draft_created_idx
  on public.contractor_work_draft_launches(draft_id, created_at desc);

alter table public.estimates
  add column if not exists source_work_draft_id uuid;

alter table public.inspections
  add column if not exists source_work_draft_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'estimates_source_work_draft_fk'
       and conrelid = 'public.estimates'::regclass
  ) then
    alter table public.estimates
      add constraint estimates_source_work_draft_fk
      foreign key (source_work_draft_id)
      references public.contractor_work_drafts(id)
      on delete set null;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'inspections_source_work_draft_fk'
       and conrelid = 'public.inspections'::regclass
  ) then
    alter table public.inspections
      add constraint inspections_source_work_draft_fk
      foreign key (source_work_draft_id)
      references public.contractor_work_drafts(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists estimates_source_work_draft_unique_idx
  on public.estimates(source_work_draft_id)
  where source_work_draft_id is not null;

create unique index if not exists inspections_source_work_draft_unique_idx
  on public.inspections(source_work_draft_id)
  where source_work_draft_id is not null;

alter table public.job_work_items
  drop constraint if exists job_work_items_source_type_check;

alter table public.job_work_items
  add constraint job_work_items_source_type_check
  check (
    source_type is null
    or source_type in ('estimate_line_item', 'simple_task', 'manual', 'inspection_finding', 'draft_job_scope', 'work_draft_item')
  );

drop trigger if exists contractor_work_drafts_touch_updated_at on public.contractor_work_drafts;
create trigger contractor_work_drafts_touch_updated_at
  before update on public.contractor_work_drafts
  for each row execute function public.touch_updated_at();

drop trigger if exists contractor_work_draft_items_touch_updated_at on public.contractor_work_draft_items;
create trigger contractor_work_draft_items_touch_updated_at
  before update on public.contractor_work_draft_items
  for each row execute function public.touch_updated_at();

alter table public.contractor_work_drafts enable row level security;
alter table public.contractor_work_draft_items enable row level security;
alter table public.contractor_work_draft_launches enable row level security;

drop policy if exists "Contractor work drafts: contractor team reads" on public.contractor_work_drafts;
create policy "Contractor work drafts: contractor team reads"
  on public.contractor_work_drafts for select to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Contractor work draft items: contractor team reads" on public.contractor_work_draft_items;
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

drop policy if exists "Contractor work draft launches: contractor team reads" on public.contractor_work_draft_launches;
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

revoke all on table public.contractor_work_drafts from public;
revoke all on table public.contractor_work_drafts from anon;
revoke all on table public.contractor_work_drafts from authenticated;
grant select on public.contractor_work_drafts to authenticated;

revoke all on table public.contractor_work_draft_items from public;
revoke all on table public.contractor_work_draft_items from anon;
revoke all on table public.contractor_work_draft_items from authenticated;
grant select on public.contractor_work_draft_items to authenticated;

revoke all on table public.contractor_work_draft_launches from public;
revoke all on table public.contractor_work_draft_launches from anon;
revoke all on table public.contractor_work_draft_launches from authenticated;
grant select on public.contractor_work_draft_launches to authenticated;

create or replace function public.servsync_get_work_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.contractor_work_drafts;
  v_items jsonb;
  v_launches jsonb;
begin
  if p_draft_id is null then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  select *
    into v_draft
    from public.contractor_work_drafts
   where id = p_draft_id;

  if v_draft.id is null then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  if not (
    public.current_user_can_access_contractor(v_draft.contractor_id)
    or public.current_user_is_platform_admin()
  ) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(item) order by item.sort_order asc, item.created_at asc),
    '[]'::jsonb
  )
    into v_items
    from public.contractor_work_draft_items item
   where item.draft_id = v_draft.id
     and item.contractor_id = v_draft.contractor_id;

  select coalesce(
    jsonb_agg(to_jsonb(launch) order by launch.created_at desc),
    '[]'::jsonb
  )
    into v_launches
    from public.contractor_work_draft_launches launch
   where launch.draft_id = v_draft.id
     and launch.contractor_id = v_draft.contractor_id;

  return jsonb_build_object(
    'draft', to_jsonb(v_draft),
    'items', v_items,
    'launches', v_launches
  );
end;
$$;

create or replace function public.servsync_save_work_draft(
  p_draft_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_removed_item_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_existing public.contractor_work_drafts;
  v_request public.service_requests;
  v_home public.homes;
  v_local_home public.contractor_local_homes;
  v_legacy public.inspections;
  v_draft_id uuid := p_draft_id;
  v_homeowner_user_id uuid := nullif(trim(coalesce(p_metadata->>'homeowner_user_id', '')), '')::uuid;
  v_home_id uuid := nullif(trim(coalesce(p_metadata->>'home_id', '')), '')::uuid;
  v_local_contact_id uuid := nullif(trim(coalesce(p_metadata->>'local_contact_id', '')), '')::uuid;
  v_local_home_id uuid := nullif(trim(coalesce(p_metadata->>'local_home_id', '')), '')::uuid;
  v_service_request_id uuid := nullif(trim(coalesce(p_metadata->>'service_request_id', '')), '')::uuid;
  v_legacy_inspection_id uuid := nullif(trim(coalesce(p_metadata->>'legacy_inspection_id', '')), '')::uuid;
  v_intended_output text := nullif(trim(coalesce(p_metadata->>'intended_output', '')), '');
  v_work_format text := coalesce(nullif(trim(coalesce(p_metadata->>'work_format', '')), ''), 'standard');
  v_labor_mode text := nullif(trim(coalesce(p_metadata->>'labor_mode', '')), '');
  v_labor_rate_cents integer := nullif(trim(coalesce(p_metadata->>'labor_rate_cents', '')), '')::integer;
  v_job_labor_hours numeric := nullif(trim(coalesce(p_metadata->>'job_labor_hours', '')), '')::numeric;
  v_item jsonb;
  v_item_id uuid;
  v_existing_item public.contractor_work_draft_items;
  v_title text;
  v_line_type text;
  v_quantity numeric;
  v_unit_price_cents integer;
  v_labor_hours numeric;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  select id
    into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if v_contractor_id is null or not public.current_user_can_manage_contractor_billing(v_contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  if v_intended_output is not null and v_intended_output not in ('estimate', 'job') then
    raise exception using message = 'UNSUPPORTED_OUTPUT';
  end if;

  if v_work_format <> 'standard' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_labor_mode is not null and v_labor_mode not in ('job_total', 'line_specific') then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if p_draft_id is not null then
    select *
      into v_existing
      from public.contractor_work_drafts
     where id = p_draft_id
     for update;

    if v_existing.id is null then
      raise exception using message = 'DRAFT_NOT_FOUND';
    end if;

    if v_existing.contractor_id <> v_contractor_id then
      raise exception using message = 'DRAFT_PERMISSION_DENIED';
    end if;

    if v_existing.status <> 'active' then
      raise exception using message = 'DRAFT_NOT_ACTIVE';
    end if;
  end if;

  if v_service_request_id is not null then
    select *
      into v_request
      from public.service_requests
     where id = v_service_request_id
       and contractor_id = v_contractor_id;

    if v_request.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    if v_homeowner_user_id is null then
      v_homeowner_user_id := v_request.homeowner_user_id;
    elsif v_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;
  end if;

  if v_home_id is not null then
    select *
      into v_home
      from public.homes
     where id = v_home_id;

    if v_home.id is null then
      raise exception using message = 'PROPERTY_INVALID';
    end if;

    if v_homeowner_user_id is null then
      v_homeowner_user_id := v_home.homeowner_user_id;
    elsif v_homeowner_user_id <> v_home.homeowner_user_id then
      raise exception using message = 'PROPERTY_INVALID';
    end if;
  end if;

  if v_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = v_homeowner_user_id
       and status = 'active'
  ) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_local_home_id is not null then
    select *
      into v_local_home
      from public.contractor_local_homes
     where id = v_local_home_id
       and contractor_id = v_contractor_id;

    if v_local_home.id is null then
      raise exception using message = 'PROPERTY_INVALID';
    end if;

    if v_local_contact_id is null then
      v_local_contact_id := v_local_home.local_contact_id;
    elsif v_local_contact_id <> v_local_home.local_contact_id then
      raise exception using message = 'PROPERTY_INVALID';
    end if;
  end if;

  if v_local_contact_id is not null and not exists (
    select 1
      from public.contractor_local_contacts
     where id = v_local_contact_id
       and contractor_id = v_contractor_id
  ) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if (v_homeowner_user_id is null and v_local_contact_id is null)
    or (v_homeowner_user_id is not null and v_local_contact_id is not null) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_legacy_inspection_id is not null then
    select *
      into v_legacy
      from public.inspections
     where id = v_legacy_inspection_id
       and contractor_id = v_contractor_id;

    if v_legacy.id is null
      or v_legacy.job_origin <> 'draft_composer'
      or v_legacy.status <> 'draft'
      or v_legacy.job_status <> 'draft' then
      raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
    end if;
  end if;

  if v_draft_id is null then
    insert into public.contractor_work_drafts (
      contractor_id,
      created_by_user_id,
      homeowner_user_id,
      home_id,
      local_contact_id,
      local_home_id,
      service_request_id,
      title,
      scope_description,
      private_notes,
      intended_output,
      work_format,
      labor_mode,
      labor_rate_cents,
      job_labor_hours,
      legacy_inspection_id
    ) values (
      v_contractor_id,
      auth.uid(),
      v_homeowner_user_id,
      case when v_homeowner_user_id is not null then v_home_id else null end,
      v_local_contact_id,
      case when v_local_contact_id is not null then v_local_home_id else null end,
      case when v_homeowner_user_id is not null then v_service_request_id else null end,
      trim(coalesce(p_metadata->>'title', '')),
      trim(coalesce(p_metadata->>'scope_description', '')),
      coalesce(p_metadata->>'private_notes', ''),
      v_intended_output,
      v_work_format,
      v_labor_mode,
      v_labor_rate_cents,
      v_job_labor_hours,
      v_legacy_inspection_id
    )
    returning id into v_draft_id;
  else
    update public.contractor_work_drafts
       set homeowner_user_id = v_homeowner_user_id,
           home_id = case when v_homeowner_user_id is not null then v_home_id else null end,
           local_contact_id = v_local_contact_id,
           local_home_id = case when v_local_contact_id is not null then v_local_home_id else null end,
           service_request_id = case when v_homeowner_user_id is not null then v_service_request_id else null end,
           title = trim(coalesce(p_metadata->>'title', '')),
           scope_description = trim(coalesce(p_metadata->>'scope_description', '')),
           private_notes = coalesce(p_metadata->>'private_notes', ''),
           intended_output = v_intended_output,
           work_format = v_work_format,
           labor_mode = v_labor_mode,
           labor_rate_cents = v_labor_rate_cents,
           job_labor_hours = v_job_labor_hours,
           legacy_inspection_id = coalesce(v_legacy_inspection_id, legacy_inspection_id),
           updated_at = now()
     where id = v_draft_id;
  end if;

  if coalesce(array_length(p_removed_item_ids, 1), 0) > 0 then
    delete from public.contractor_work_draft_items
     where draft_id = v_draft_id
       and contractor_id = v_contractor_id
       and id = any(p_removed_item_ids);
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    v_item_id := nullif(trim(coalesce(v_item->>'id', '')), '')::uuid;
    v_existing_item := null;

    if v_item_id is not null then
      select *
        into v_existing_item
        from public.contractor_work_draft_items
       where id = v_item_id
         and draft_id = v_draft_id
         and contractor_id = v_contractor_id
       for update;

      if v_existing_item.id is null then
        raise exception using message = 'DRAFT_INVALID';
      end if;
    end if;

    v_title := nullif(trim(coalesce(v_item->>'title', v_existing_item.title, '')), '');
    v_line_type := coalesce(nullif(trim(coalesce(v_item->>'line_type', '')), ''), v_existing_item.line_type, 'labor');
    v_quantity := coalesce(nullif(trim(coalesce(v_item->>'quantity', '')), '')::numeric, v_existing_item.quantity, 1);
    v_unit_price_cents := case
      when v_item ? 'unit_price_cents' then nullif(trim(coalesce(v_item->>'unit_price_cents', '')), '')::integer
      else v_existing_item.unit_price_cents
    end;
    v_labor_hours := case
      when v_item ? 'labor_hours' then nullif(trim(coalesce(v_item->>'labor_hours', '')), '')::numeric
      else v_existing_item.labor_hours
    end;

    if v_title is null then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_line_type not in ('labor', 'material', 'fee', 'other') or v_quantity < 0 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_unit_price_cents is not null and v_unit_price_cents < 0 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_labor_hours is not null and v_labor_hours < 0 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_item_id is null then
      insert into public.contractor_work_draft_items (
        draft_id,
        contractor_id,
        title,
        description,
        customer_description,
        internal_notes,
        line_type,
        quantity,
        unit,
        unit_price_cents,
        labor_hours,
        room_id,
        room_label,
        location_label,
        sort_order
      ) values (
        v_draft_id,
        v_contractor_id,
        v_title,
        coalesce(v_item->>'description', ''),
        coalesce(v_item->>'customer_description', ''),
        coalesce(v_item->>'internal_notes', ''),
        v_line_type,
        v_quantity,
        coalesce(nullif(trim(coalesce(v_item->>'unit', '')), ''), 'each'),
        v_unit_price_cents,
        v_labor_hours,
        nullif(trim(coalesce(v_item->>'room_id', '')), ''),
        nullif(trim(coalesce(v_item->>'room_label', '')), ''),
        nullif(trim(coalesce(v_item->>'location_label', '')), ''),
        coalesce(nullif(trim(coalesce(v_item->>'sort_order', '')), '')::integer, 0)
      );
    else
      update public.contractor_work_draft_items
         set title = v_title,
             description = coalesce(v_item->>'description', v_existing_item.description, ''),
             customer_description = coalesce(v_item->>'customer_description', v_existing_item.customer_description, ''),
             internal_notes = coalesce(v_item->>'internal_notes', v_existing_item.internal_notes, ''),
             line_type = v_line_type,
             quantity = v_quantity,
             unit = coalesce(nullif(trim(coalesce(v_item->>'unit', '')), ''), v_existing_item.unit, 'each'),
             unit_price_cents = v_unit_price_cents,
             labor_hours = v_labor_hours,
             room_id = nullif(trim(coalesce(v_item->>'room_id', v_existing_item.room_id, '')), ''),
             room_label = nullif(trim(coalesce(v_item->>'room_label', v_existing_item.room_label, '')), ''),
             location_label = nullif(trim(coalesce(v_item->>'location_label', v_existing_item.location_label, '')), ''),
             sort_order = coalesce(nullif(trim(coalesce(v_item->>'sort_order', '')), '')::integer, v_existing_item.sort_order, 0),
             updated_at = now()
       where id = v_item_id;
    end if;
  end loop;

  return public.servsync_get_work_draft(v_draft_id);
end;
$$;

create or replace function public.servsync_import_legacy_draft_job(
  p_inspection_id uuid,
  p_intended_output text default 'job'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_existing_id uuid;
  v_draft_id uuid;
begin
  if p_inspection_id is null then
    raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null
    or v_job.job_origin <> 'draft_composer'
    or v_job.status <> 'draft'
    or v_job.job_status <> 'draft' then
    raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
  end if;

  if not public.current_user_can_manage_contractor_billing(v_job.contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  if p_intended_output is not null and p_intended_output not in ('estimate', 'job') then
    raise exception using message = 'UNSUPPORTED_OUTPUT';
  end if;

  select id
    into v_existing_id
    from public.contractor_work_drafts
   where legacy_inspection_id = v_job.id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.contractor_work_drafts (
    contractor_id,
    created_by_user_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    title,
    scope_description,
    intended_output,
    work_format,
    legacy_inspection_id
  ) values (
    v_job.contractor_id,
    coalesce(v_job.draft_created_by, auth.uid()),
    v_job.homeowner_user_id,
    v_job.home_id,
    v_job.local_contact_id,
    v_job.local_home_id,
    v_job.service_request_id,
    v_job.name,
    v_job.summary,
    p_intended_output,
    'standard',
    v_job.id
  )
  returning id into v_draft_id;

  insert into public.contractor_work_draft_items (
    draft_id,
    contractor_id,
    title,
    description,
    customer_description,
    internal_notes,
    line_type,
    quantity,
    unit,
    unit_price_cents,
    labor_hours,
    room_id,
    room_label,
    location_label,
    sort_order
  )
  select
    v_draft_id,
    item.contractor_id,
    item.title,
    item.description,
    item.customer_description,
    item.internal_notes,
    item.line_type,
    item.quantity,
    item.unit,
    item.unit_price_cents,
    item.labor_hours,
    item.room_id,
    item.room_label,
    item.location_label,
    item.sort_order
  from public.job_work_items item
  where item.inspection_id = v_job.id
    and item.contractor_id = v_job.contractor_id
    and item.completion_status <> 'removed'
    and item.work_state <> 'removed'
  order by item.sort_order asc, item.created_at asc;

  return v_draft_id;
end;
$$;

create or replace function public.servsync_private_launch_work_draft_as_estimate(
  p_draft public.contractor_work_drafts
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate_id uuid;
  v_material_total integer := 0;
  v_labor_line_total integer := 0;
  v_schema_labor_total integer := 0;
  v_fee_total integer := 0;
  v_other_total integer := 0;
  v_subtotal integer := 0;
begin
  if not public.current_user_can_manage_contractor_billing(p_draft.contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  select
    coalesce(sum(case when line_type = 'material' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::integer,
    coalesce(sum(case when line_type = 'labor' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::integer,
    coalesce(sum(case when line_type = 'fee' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::integer,
    coalesce(sum(case when line_type = 'other' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::integer
    into v_material_total, v_labor_line_total, v_fee_total, v_other_total
    from public.contractor_work_draft_items
   where draft_id = p_draft.id
     and contractor_id = p_draft.contractor_id;

  if p_draft.labor_rate_cents is not null then
    if p_draft.labor_mode = 'job_total' and p_draft.job_labor_hours is not null then
      v_schema_labor_total := round(p_draft.job_labor_hours * p_draft.labor_rate_cents)::integer;
    elsif p_draft.labor_mode = 'line_specific' then
      select coalesce(sum(round(coalesce(labor_hours, 0) * p_draft.labor_rate_cents)), 0)::integer
        into v_schema_labor_total
        from public.contractor_work_draft_items
       where draft_id = p_draft.id
         and contractor_id = p_draft.contractor_id;
    end if;
  end if;

  v_subtotal := v_material_total + v_labor_line_total + v_schema_labor_total + v_fee_total + v_other_total;

  insert into public.estimates (
    contractor_id,
    homeowner_user_id,
    local_contact_id,
    service_request_id,
    inspection_id,
    home_id,
    local_home_id,
    source_work_draft_id,
    title,
    scope,
    notes,
    terms,
    status,
    subtotal_cents,
    total_cents,
    labor_mode,
    labor_rate_cents,
    job_labor_hours,
    material_total_cents,
    labor_total_cents,
    fee_total_cents,
    other_total_cents,
    tax_rate_percent,
    tax_cents
  ) values (
    p_draft.contractor_id,
    p_draft.homeowner_user_id,
    p_draft.local_contact_id,
    p_draft.service_request_id,
    null,
    p_draft.home_id,
    p_draft.local_home_id,
    p_draft.id,
    coalesce(nullif(trim(p_draft.title), ''), 'Draft estimate'),
    trim(coalesce(p_draft.scope_description, '')),
    '',
    '',
    'draft',
    v_subtotal,
    v_subtotal,
    p_draft.labor_mode,
    p_draft.labor_rate_cents,
    p_draft.job_labor_hours,
    v_material_total,
    v_labor_line_total + v_schema_labor_total,
    v_fee_total,
    v_other_total,
    null,
    0
  )
  returning id into v_estimate_id;

  insert into public.estimate_line_items (
    estimate_id,
    line_type,
    description,
    line_title,
    customer_description,
    quantity,
    unit,
    unit_price_cents,
    labor_hours,
    sort_order
  )
  select
    v_estimate_id,
    item.line_type,
    item.description,
    item.title,
    item.customer_description,
    item.quantity,
    item.unit,
    item.unit_price_cents,
    item.labor_hours,
    item.sort_order
  from public.contractor_work_draft_items item
  where item.draft_id = p_draft.id
    and item.contractor_id = p_draft.contractor_id
  order by item.sort_order asc, item.created_at asc;

  return v_estimate_id;
end;
$$;

create or replace function public.servsync_private_launch_work_draft_as_job(
  p_draft public.contractor_work_drafts
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if not public.current_user_can_write_contractor_jobs(p_draft.contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    name,
    summary,
    status,
    job_type,
    job_status,
    job_origin,
    source_work_draft_id,
    rooms_with_findings
  ) values (
    p_draft.contractor_id,
    p_draft.homeowner_user_id,
    p_draft.home_id,
    p_draft.local_contact_id,
    p_draft.local_home_id,
    p_draft.service_request_id,
    coalesce(nullif(trim(p_draft.title), ''), 'Job from Draft'),
    trim(coalesce(p_draft.scope_description, '')),
    'draft',
    'service_visit',
    'draft',
    'direct',
    p_draft.id,
    '[]'::jsonb
  )
  returning id into v_job_id;

  insert into public.job_work_items (
    inspection_id,
    contractor_id,
    source_type,
    source_key,
    title,
    description,
    customer_description,
    internal_notes,
    line_type,
    quantity,
    unit,
    unit_price_cents,
    labor_hours,
    billable,
    completion_status,
    billing_status,
    work_state,
    approval_required,
    approval_status,
    room_id,
    room_label,
    location_label,
    sort_order
  )
  select
    v_job_id,
    item.contractor_id,
    'work_draft_item',
    'work-draft-item:' || item.id::text,
    item.title,
    item.description,
    item.customer_description,
    item.internal_notes,
    item.line_type,
    item.quantity,
    item.unit,
    item.unit_price_cents,
    item.labor_hours,
    true,
    'open',
    'unbilled',
    'open',
    false,
    'not_required',
    item.room_id,
    item.room_label,
    item.location_label,
    item.sort_order
  from public.contractor_work_draft_items item
  where item.draft_id = p_draft.id
    and item.contractor_id = p_draft.contractor_id
  order by item.sort_order asc, item.created_at asc;

  return v_job_id;
end;
$$;

create or replace function public.servsync_launch_work_draft(
  p_draft_id uuid,
  p_intended_output text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.contractor_work_drafts;
  v_existing_launch public.contractor_work_draft_launches;
  v_conflicting_launch public.contractor_work_draft_launches;
  v_output_type text := nullif(trim(coalesce(p_intended_output, '')), '');
  v_estimate_id uuid;
  v_job_id uuid;
  v_launch_id uuid;
begin
  if p_draft_id is null then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  if p_idempotency_key is null then
    raise exception using message = 'IDEMPOTENCY_CONFLICT';
  end if;

  if v_output_type is null then
    raise exception using message = 'INTENDED_OUTPUT_REQUIRED';
  end if;

  if v_output_type not in ('estimate', 'job') then
    raise exception using message = 'UNSUPPORTED_OUTPUT';
  end if;

  select *
    into v_draft
    from public.contractor_work_drafts
   where id = p_draft_id
   for update;

  if v_draft.id is null then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  select *
    into v_conflicting_launch
    from public.contractor_work_draft_launches
   where contractor_id = v_draft.contractor_id
     and idempotency_key = p_idempotency_key
     and draft_id <> v_draft.id
   limit 1;

  if v_conflicting_launch.id is not null then
    raise exception using message = 'IDEMPOTENCY_CONFLICT';
  end if;

  select *
    into v_existing_launch
    from public.contractor_work_draft_launches
   where draft_id = v_draft.id
     and contractor_id = v_draft.contractor_id
     and status = 'succeeded'
   order by created_at asc
   limit 1;

  if v_existing_launch.id is not null then
    return jsonb_build_object(
      'draft_id', v_draft.id,
      'status', case when v_existing_launch.idempotency_key = p_idempotency_key then 'succeeded' else 'already_consumed' end,
      'output_type', v_existing_launch.requested_output,
      'estimate_id', v_existing_launch.launched_estimate_id,
      'job_id', v_existing_launch.launched_job_id,
      'launch_id', v_existing_launch.id,
      'idempotent', v_existing_launch.idempotency_key = p_idempotency_key
    );
  end if;

  if not (
    public.current_user_can_access_contractor(v_draft.contractor_id)
    or public.current_user_is_platform_admin()
  ) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  if v_draft.status = 'discarded' then
    raise exception using message = 'DRAFT_NOT_ACTIVE';
  end if;

  if v_draft.status = 'consumed' then
    raise exception using message = 'DRAFT_ALREADY_CONSUMED';
  end if;

  if v_draft.intended_output is null then
    raise exception using message = 'INTENDED_OUTPUT_REQUIRED';
  end if;

  if v_draft.intended_output <> v_output_type then
    raise exception using message = 'INTENDED_OUTPUT_MISMATCH';
  end if;

  if v_draft.work_format <> 'standard' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if trim(coalesce(v_draft.title, '')) = '' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_draft.homeowner_user_id is null and v_draft.local_contact_id is null then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if not exists (
    select 1
      from public.contractor_work_draft_items item
     where item.draft_id = v_draft.id
       and item.contractor_id = v_draft.contractor_id
  ) then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_output_type = 'job'
    and v_draft.service_request_id is not null
    and exists (
      select 1
        from public.inspections job
       where job.contractor_id = v_draft.contractor_id
         and job.service_request_id = v_draft.service_request_id
         and job.job_origin <> 'draft_composer'
         and job.job_status <> 'cancelled'
         and job.id <> coalesce(v_draft.legacy_inspection_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
    raise exception using message = 'LAUNCH_CONFLICT';
  end if;

  if v_output_type = 'estimate' then
    if not public.current_user_can_manage_contractor_billing(v_draft.contractor_id) then
      raise exception using message = 'DRAFT_PERMISSION_DENIED';
    end if;
    v_estimate_id := public.servsync_private_launch_work_draft_as_estimate(v_draft);
  else
    if not public.current_user_can_write_contractor_jobs(v_draft.contractor_id) then
      raise exception using message = 'DRAFT_PERMISSION_DENIED';
    end if;
    v_job_id := public.servsync_private_launch_work_draft_as_job(v_draft);
  end if;

  insert into public.contractor_work_draft_launches (
    draft_id,
    contractor_id,
    idempotency_key,
    requested_output,
    status,
    launched_estimate_id,
    launched_job_id,
    requested_by_user_id,
    completed_at
  ) values (
    v_draft.id,
    v_draft.contractor_id,
    p_idempotency_key,
    v_output_type,
    'succeeded',
    v_estimate_id,
    v_job_id,
    auth.uid(),
    now()
  )
  returning id into v_launch_id;

  update public.contractor_work_drafts
     set status = 'consumed',
         launched_output_type = v_output_type,
         launched_estimate_id = v_estimate_id,
         launched_job_id = v_job_id,
         launched_at = now(),
         launched_by_user_id = auth.uid(),
         updated_at = now()
   where id = v_draft.id;

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'status', 'succeeded',
    'output_type', v_output_type,
    'estimate_id', v_estimate_id,
    'job_id', v_job_id,
    'launch_id', v_launch_id,
    'idempotent', false
  );
exception
  when unique_violation then
    raise exception using message = 'LAUNCH_CONFLICT';
end;
$$;

revoke execute on function public.servsync_get_work_draft(uuid) from public;
revoke execute on function public.servsync_get_work_draft(uuid) from anon;
grant execute on function public.servsync_get_work_draft(uuid) to authenticated;

revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, uuid[]) from public;
revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, uuid[]) from anon;
grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, uuid[]) to authenticated;

revoke execute on function public.servsync_import_legacy_draft_job(uuid, text) from public;
revoke execute on function public.servsync_import_legacy_draft_job(uuid, text) from anon;
grant execute on function public.servsync_import_legacy_draft_job(uuid, text) to authenticated;

revoke execute on function public.servsync_launch_work_draft(uuid, text, uuid) from public;
revoke execute on function public.servsync_launch_work_draft(uuid, text, uuid) from anon;
grant execute on function public.servsync_launch_work_draft(uuid, text, uuid) to authenticated;

revoke all on function public.servsync_private_launch_work_draft_as_estimate(public.contractor_work_drafts) from public;
revoke all on function public.servsync_private_launch_work_draft_as_estimate(public.contractor_work_drafts) from anon;
revoke all on function public.servsync_private_launch_work_draft_as_estimate(public.contractor_work_drafts) from authenticated;

revoke all on function public.servsync_private_launch_work_draft_as_job(public.contractor_work_drafts) from public;
revoke all on function public.servsync_private_launch_work_draft_as_job(public.contractor_work_drafts) from anon;
revoke all on function public.servsync_private_launch_work_draft_as_job(public.contractor_work_drafts) from authenticated;

comment on table public.contractor_work_drafts is
  'Contractor-only durable Draft planning records for the shared Work composer. Homeowners must not see these records.';

comment on column public.contractor_work_drafts.private_notes is
  'Contractor-only Draft notes. These are not automatically copied to homeowner-visible Estimate or Job fields.';

comment on table public.contractor_work_draft_items is
  'Contractor-only durable Draft line items copied into the initial launched Estimate or Job workflow.';

comment on table public.contractor_work_draft_launches is
  'Idempotent launch ledger enforcing one successful initial workflow output per contractor Work Draft.';

comment on column public.estimates.source_work_draft_id is
  'Private source Draft linkage for Estimate records created by durable Draft launch.';

comment on column public.inspections.source_work_draft_id is
  'Private source Draft linkage for Job records created by durable Draft launch.';

notify pgrst, 'reload schema';

commit;

-- Sandbox validation checklist:
-- 1. Apply only to sandbox ref zpzdkoaubyjtsomccxya after owner approval.
-- 2. Create connected and local active Drafts with nullable and changed intended_output.
-- 3. Save, reorder, and explicitly remove Draft items.
-- 4. Launch one Draft as Estimate and verify status=draft, source_work_draft_id, line copy, private_notes not copied.
-- 5. Launch one Draft as Job and verify source_work_draft_id, job_work_items copy, and no Estimate/Invoice.
-- 6. Retry same idempotency key and verify no duplicate output.
-- 7. Retry different key after success and verify canonical consumed output response.
-- 8. Reuse same key on another Draft and verify IDEMPOTENCY_CONFLICT.
-- 9. Verify consumed/discarded Draft edits and launches fail.
-- 10. Verify homeowner and cross-contractor reads are denied by RLS/RPC checks.
