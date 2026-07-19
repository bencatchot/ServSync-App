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
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  homeowner_user_id uuid references public.profiles(id) on delete set null,
  home_id uuid references public.homes(id) on delete set null,
  local_contact_id uuid references public.contractor_local_contacts(id) on delete set null,
  local_home_id uuid references public.contractor_local_homes(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  subject_type text not null check (subject_type in ('connected_homeowner', 'local_contact')),
  subject_display_name_snapshot text not null,
  property_display_snapshot text not null default '',
  title text not null default '',
  scope_description text not null default '',
  private_notes text not null default '',
  intended_output text check (intended_output is null or intended_output in ('estimate', 'job')),
  work_format text not null default 'standard' check (work_format = 'standard'),
  labor_mode text check (labor_mode is null or labor_mode in ('job_total', 'line_specific')),
  labor_rate_cents integer check (labor_rate_cents is null or labor_rate_cents >= 0),
  job_labor_hours numeric(8,2) check (job_labor_hours is null or job_labor_hours >= 0),
  status text not null default 'active' check (status in ('active', 'consumed', 'discarded')),
  legacy_inspection_id uuid references public.inspections(id) on delete set null,
  launched_output_type text check (launched_output_type is null or launched_output_type in ('estimate', 'job')),
  launched_estimate_id uuid references public.estimates(id) on delete restrict,
  launched_job_id uuid references public.inspections(id) on delete restrict,
  launched_at timestamptz,
  launched_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_work_drafts_id_contractor_unique unique (id, contractor_id),
  constraint contractor_work_drafts_subject_check check (
    (
      subject_type = 'connected_homeowner'
      and local_contact_id is null
      and local_home_id is null
      and (status <> 'active' or homeowner_user_id is not null)
    )
    or (
      subject_type = 'local_contact'
      and homeowner_user_id is null
      and home_id is null
      and service_request_id is null
      and (status <> 'active' or local_contact_id is not null)
    )
  ),
  constraint contractor_work_drafts_property_subject_check check (
    status <> 'active'
    or (
      (home_id is null or homeowner_user_id is not null)
      and (local_home_id is null or local_contact_id is not null)
    )
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
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  title text not null,
  description text not null default '',
  customer_description text not null default '',
  internal_notes text not null default '',
  line_type text not null default 'labor' check (line_type in ('labor', 'material', 'fee', 'other')),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit text not null default 'each',
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0),
  labor_hours numeric(8,2) check (labor_hours is null or labor_hours >= 0),
  room_id text,
  room_label text,
  location_label text,
  sort_order integer not null default 0 check (sort_order >= 0),
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
  draft_id uuid not null references public.contractor_work_drafts(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  idempotency_key uuid not null,
  requested_output text not null check (requested_output in ('estimate', 'job')),
  status text not null default 'succeeded' check (status = 'succeeded'),
  launched_estimate_id uuid references public.estimates(id) on delete restrict,
  launched_job_id uuid references public.inspections(id) on delete restrict,
  requested_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint contractor_work_draft_launches_contractor_match_fk
    foreign key (draft_id, contractor_id)
    references public.contractor_work_drafts(id, contractor_id)
    on delete restrict,
  constraint contractor_work_draft_launches_status_linkage_check check (
    completed_at is not null
    and (
      (requested_output = 'estimate' and launched_estimate_id is not null and launched_job_id is null)
      or (requested_output = 'job' and launched_job_id is not null and launched_estimate_id is null)
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

create unique index if not exists contractor_work_draft_launches_estimate_output_unique_idx
  on public.contractor_work_draft_launches(launched_estimate_id)
  where status = 'succeeded' and launched_estimate_id is not null;

create unique index if not exists contractor_work_draft_launches_job_output_unique_idx
  on public.contractor_work_draft_launches(launched_job_id)
  where status = 'succeeded' and launched_job_id is not null;

create index if not exists contractor_work_draft_launches_draft_created_idx
  on public.contractor_work_draft_launches(draft_id, created_at desc);

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

create or replace function public.servsync_private_work_draft_uuid(
  p_value text,
  p_error_code text default 'DRAFT_INVALID'
)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v_value is null then
    return null;
  end if;

  if v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = p_error_code;
  end if;

  return v_value::uuid;
exception
  when invalid_text_representation then
    raise exception using message = p_error_code;
end;
$$;

create or replace function public.servsync_private_work_draft_numeric(
  p_value text,
  p_error_code text default 'DRAFT_INVALID'
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v_value is null then
    return null;
  end if;

  if v_value !~ '^[+]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$' then
    raise exception using message = p_error_code;
  end if;

  return v_value::numeric;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using message = p_error_code;
end;
$$;

create or replace function public.servsync_private_work_draft_integer(
  p_value text,
  p_error_code text default 'DRAFT_INVALID'
)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v_value is null then
    return null;
  end if;

  if v_value !~ '^[+]?[0-9]+$' then
    raise exception using message = p_error_code;
  end if;

  return v_value::integer;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using message = p_error_code;
end;
$$;

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
  if auth.uid() is null then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  if p_draft_id is null then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  select *
    into v_draft
    from public.contractor_work_drafts
   where id = p_draft_id;

  if v_draft.id is null or not (
    public.current_user_can_access_contractor(v_draft.contractor_id)
    or public.current_user_is_platform_admin()
  ) then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(item) order by item.sort_order asc, item.created_at asc, item.id asc),
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
  p_removed_item_ids jsonb default '[]'::jsonb
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
  v_homeowner public.profiles;
  v_local_contact public.contractor_local_contacts;
  v_local_home public.contractor_local_homes;
  v_legacy public.inspections;
  v_draft_id uuid := p_draft_id;
  v_homeowner_user_id uuid;
  v_home_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_service_request_id uuid;
  v_legacy_inspection_id uuid;
  v_subject_type text;
  v_subject_display_name_snapshot text;
  v_property_display_snapshot text := '';
  v_intended_output text;
  v_work_format text;
  v_labor_mode text;
  v_labor_rate_cents integer;
  v_job_labor_hours numeric;
  v_item jsonb;
  v_item_id uuid;
  v_item_ids uuid[] := array[]::uuid[];
  v_removed_ids uuid[] := array[]::uuid[];
  v_removed_value jsonb;
  v_removed_id uuid;
  v_title text;
  v_line_type text;
  v_quantity numeric;
  v_unit_price_cents integer;
  v_labor_hours numeric;
  v_sort_order integer;
  v_saved_line_total bigint := 0;
  v_saved_schema_labor_total bigint := 0;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if p_removed_item_ids is null or jsonb_typeof(p_removed_item_ids) <> 'array' then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  -- Metadata is a complete Draft snapshot. Missing optional values clear to null/empty.
  v_homeowner_user_id := public.servsync_private_work_draft_uuid(p_metadata->>'homeowner_user_id');
  v_home_id := public.servsync_private_work_draft_uuid(p_metadata->>'home_id');
  v_local_contact_id := public.servsync_private_work_draft_uuid(p_metadata->>'local_contact_id');
  v_local_home_id := public.servsync_private_work_draft_uuid(p_metadata->>'local_home_id');
  v_service_request_id := public.servsync_private_work_draft_uuid(p_metadata->>'service_request_id');
  v_legacy_inspection_id := public.servsync_private_work_draft_uuid(p_metadata->>'legacy_inspection_id', 'LEGACY_DRAFT_INCOMPATIBLE');
  v_intended_output := nullif(trim(coalesce(p_metadata->>'intended_output', '')), '');
  v_work_format := coalesce(nullif(trim(coalesce(p_metadata->>'work_format', '')), ''), 'standard');
  v_labor_mode := nullif(trim(coalesce(p_metadata->>'labor_mode', '')), '');
  v_labor_rate_cents := public.servsync_private_work_draft_integer(p_metadata->>'labor_rate_cents');
  v_job_labor_hours := public.servsync_private_work_draft_numeric(p_metadata->>'job_labor_hours');

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

  if v_labor_rate_cents is not null and v_labor_rate_cents < 0 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_job_labor_hours is not null and (
    v_job_labor_hours < 0
    or v_job_labor_hours > 999999.99
    or v_job_labor_hours <> round(v_job_labor_hours, 2)
  ) then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if v_job_labor_hours is not null
    and v_labor_rate_cents is not null
    and round(v_job_labor_hours * v_labor_rate_cents) > 2147483647 then
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

    if v_existing.legacy_inspection_id is not null then
      if v_legacy_inspection_id is null then
        v_legacy_inspection_id := v_existing.legacy_inspection_id;
      elsif v_legacy_inspection_id <> v_existing.legacy_inspection_id then
        raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
      end if;
    end if;
  end if;

  if v_homeowner_user_id is not null and (
    v_local_contact_id is not null
    or v_local_home_id is not null
  ) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_local_contact_id is not null and (
    v_homeowner_user_id is not null
    or v_home_id is not null
    or v_service_request_id is not null
  ) then
    raise exception using message = 'CUSTOMER_INVALID';
  end if;

  if v_service_request_id is not null then
    select *
      into v_request
      from public.service_requests
     where id = v_service_request_id
       and contractor_id = v_contractor_id;

    if v_request.id is null then
      raise exception using message = 'SERVICE_REQUEST_INVALID';
    end if;

    if v_homeowner_user_id is null then
      v_homeowner_user_id := v_request.homeowner_user_id;
    elsif v_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception using message = 'SERVICE_REQUEST_INVALID';
    end if;

    if v_request.home_id is not null then
      if v_home_id is null then
        v_home_id := v_request.home_id;
      elsif v_home_id <> v_request.home_id then
        raise exception using message = 'SERVICE_REQUEST_INVALID';
      end if;
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

  if v_homeowner_user_id is not null then
    select *
      into v_homeowner
      from public.profiles
     where id = v_homeowner_user_id;

    if v_homeowner.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    v_subject_type := 'connected_homeowner';
    v_subject_display_name_snapshot := coalesce(
      nullif(trim(v_homeowner.full_name), ''),
      nullif(trim(v_homeowner.email), ''),
      'Connected homeowner'
    );
    if v_home.id is not null then
      v_property_display_snapshot := coalesce(
        nullif(trim(concat_ws(', ', nullif(v_home.nickname, ''), nullif(v_home.address_line1, ''), nullif(v_home.city, ''), nullif(v_home.state, ''))), ''),
        'Selected property'
      );
    end if;
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

  if v_local_contact_id is not null then
    select *
      into v_local_contact
      from public.contractor_local_contacts
     where id = v_local_contact_id
       and contractor_id = v_contractor_id;

    if v_local_contact.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    v_subject_type := 'local_contact';
    v_subject_display_name_snapshot := coalesce(
      nullif(trim(v_local_contact.display_name), ''),
      nullif(trim(v_local_contact.email), ''),
      nullif(trim(v_local_contact.phone), ''),
      'Local customer'
    );
    if v_local_home.id is not null then
      v_property_display_snapshot := coalesce(
        nullif(trim(concat_ws(', ', nullif(v_local_home.nickname, ''), nullif(v_local_home.address_line1, ''), nullif(v_local_home.city, ''), nullif(v_local_home.state, ''))), ''),
        'Selected property'
      );
    end if;
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
       and contractor_id = v_contractor_id
     for update;

    if v_legacy.id is null
      or v_legacy.job_origin <> 'draft_composer'
      or v_legacy.status <> 'draft'
      or v_legacy.job_status <> 'draft' then
      raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
    end if;

    if exists (
      select 1
        from public.contractor_work_drafts draft
       where draft.legacy_inspection_id = v_legacy_inspection_id
         and draft.id <> coalesce(v_draft_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
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
      subject_type,
      subject_display_name_snapshot,
      property_display_snapshot,
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
      v_subject_type,
      v_subject_display_name_snapshot,
      v_property_display_snapshot,
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
           subject_type = v_subject_type,
           subject_display_name_snapshot = v_subject_display_name_snapshot,
           property_display_snapshot = v_property_display_snapshot,
           title = trim(coalesce(p_metadata->>'title', '')),
           scope_description = trim(coalesce(p_metadata->>'scope_description', '')),
           private_notes = coalesce(p_metadata->>'private_notes', ''),
           intended_output = v_intended_output,
           work_format = v_work_format,
           labor_mode = v_labor_mode,
           labor_rate_cents = v_labor_rate_cents,
           job_labor_hours = v_job_labor_hours,
           legacy_inspection_id = v_legacy_inspection_id,
           updated_at = now()
     where id = v_draft_id;
  end if;

  -- Validate all IDs before any item mutation so malformed or mixed requests fail atomically.
  for v_removed_value in select value from jsonb_array_elements(p_removed_item_ids)
  loop
    if jsonb_typeof(v_removed_value) <> 'string' then
      raise exception using message = 'DRAFT_INVALID';
    end if;
    v_removed_id := public.servsync_private_work_draft_uuid(v_removed_value #>> '{}');
    if v_removed_id is null or v_removed_id = any(v_removed_ids) then
      raise exception using message = 'DRAFT_INVALID';
    end if;
    v_removed_ids := array_append(v_removed_ids, v_removed_id);
  end loop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using message = 'DRAFT_INVALID';
    end if;
    v_item_id := public.servsync_private_work_draft_uuid(v_item->>'id');
    if v_item_id is not null then
      if v_item_id = any(v_item_ids) or v_item_id = any(v_removed_ids) then
        raise exception using message = 'DRAFT_INVALID';
      end if;
      v_item_ids := array_append(v_item_ids, v_item_id);
    end if;
  end loop;

  if cardinality(v_removed_ids) > 0 and (
    select count(*)
      from public.contractor_work_draft_items item
     where item.draft_id = v_draft_id
       and item.contractor_id = v_contractor_id
       and item.id = any(v_removed_ids)
  ) <> cardinality(v_removed_ids) then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  if cardinality(v_removed_ids) > 0 then
    delete from public.contractor_work_draft_items
     where draft_id = v_draft_id
       and contractor_id = v_contractor_id
       and id = any(v_removed_ids);
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := public.servsync_private_work_draft_uuid(v_item->>'id');

    if v_item_id is not null then
      if not exists (
        select 1
          from public.contractor_work_draft_items
       where id = v_item_id
         and draft_id = v_draft_id
         and contractor_id = v_contractor_id
      ) then
        raise exception using message = 'DRAFT_INVALID';
      end if;
    end if;

    v_title := nullif(trim(coalesce(v_item->>'title', '')), '');
    v_line_type := coalesce(nullif(trim(coalesce(v_item->>'line_type', '')), ''), 'labor');
    v_quantity := coalesce(public.servsync_private_work_draft_numeric(v_item->>'quantity'), 1);
    v_unit_price_cents := public.servsync_private_work_draft_integer(v_item->>'unit_price_cents');
    v_labor_hours := public.servsync_private_work_draft_numeric(v_item->>'labor_hours');
    v_sort_order := coalesce(public.servsync_private_work_draft_integer(v_item->>'sort_order'), 0);

    if v_title is null then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_line_type not in ('labor', 'material', 'fee', 'other')
      or v_quantity <= 0
      or v_quantity > 9999999999.99
      or v_quantity <> round(v_quantity, 2) then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_unit_price_cents is not null and v_unit_price_cents < 0 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_labor_hours is not null and (
      v_labor_hours < 0
      or v_labor_hours > 999999.99
      or v_labor_hours <> round(v_labor_hours, 2)
    ) then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_sort_order < 0 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_unit_price_cents is not null
      and round(v_quantity * v_unit_price_cents) > 2147483647 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_labor_hours is not null
      and v_labor_rate_cents is not null
      and round(v_labor_hours * v_labor_rate_cents) > 2147483647 then
      raise exception using message = 'DRAFT_INVALID';
    end if;

    if v_labor_mode = 'line_specific'
      and v_labor_hours is not null
      and v_labor_hours > 0
      and v_line_type not in ('material', 'other') then
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
        v_sort_order
      );
    else
      update public.contractor_work_draft_items
         set title = v_title,
             description = coalesce(v_item->>'description', ''),
             customer_description = coalesce(v_item->>'customer_description', ''),
             internal_notes = coalesce(v_item->>'internal_notes', ''),
             line_type = v_line_type,
             quantity = v_quantity,
             unit = coalesce(nullif(trim(coalesce(v_item->>'unit', '')), ''), 'each'),
             unit_price_cents = v_unit_price_cents,
             labor_hours = v_labor_hours,
             room_id = nullif(trim(coalesce(v_item->>'room_id', '')), ''),
             room_label = nullif(trim(coalesce(v_item->>'room_label', '')), ''),
             location_label = nullif(trim(coalesce(v_item->>'location_label', '')), ''),
             sort_order = v_sort_order,
             updated_at = now()
       where id = v_item_id
         and draft_id = v_draft_id
         and contractor_id = v_contractor_id;
    end if;
  end loop;

  select coalesce(sum(round(item.quantity * coalesce(item.unit_price_cents, 0))), 0)::bigint
    into v_saved_line_total
    from public.contractor_work_draft_items item
   where item.draft_id = v_draft_id
     and item.contractor_id = v_contractor_id;

  if v_labor_rate_cents is not null then
    if v_labor_mode = 'job_total' then
      v_saved_schema_labor_total := round(coalesce(v_job_labor_hours, 0) * v_labor_rate_cents)::bigint;
    elsif v_labor_mode = 'line_specific' then
      select coalesce(sum(round(coalesce(item.labor_hours, 0) * v_labor_rate_cents)), 0)::bigint
        into v_saved_schema_labor_total
        from public.contractor_work_draft_items item
       where item.draft_id = v_draft_id
         and item.contractor_id = v_contractor_id
         and item.line_type in ('material', 'other');
    end if;
  end if;

  if v_saved_line_total > 2147483647
    or v_saved_schema_labor_total > 2147483647
    or v_saved_line_total + v_saved_schema_labor_total > 2147483647 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  return public.servsync_get_work_draft(v_draft_id);
end;
$$;

create or replace function public.servsync_private_validate_work_draft_relationships(
  p_draft public.contractor_work_drafts,
  p_requested_output text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_connection public.homeowner_contractor_connections;
  v_shared_property public.connection_shared_properties;
  v_home public.homes;
  v_local_contact public.contractor_local_contacts;
  v_local_home public.contractor_local_homes;
  v_request_authorizes_home boolean := false;
begin
  if p_draft.homeowner_user_id is not null then
    if p_draft.local_contact_id is not null or p_draft.local_home_id is not null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    -- Lock order: Draft (caller), service request, connection, shared property,
    -- home, local contact, then local home. FOR SHARE blocks authorization-row
    -- updates/deletes until the launch transaction completes.
    if p_draft.service_request_id is not null then
      select *
        into v_request
        from public.service_requests request
       where request.id = p_draft.service_request_id
         and request.contractor_id = p_draft.contractor_id
       for share;

      if v_request.id is null
        or v_request.homeowner_user_id <> p_draft.homeowner_user_id
        or (v_request.home_id is not null and v_request.home_id is distinct from p_draft.home_id) then
        raise exception using message = 'SERVICE_REQUEST_INVALID';
      end if;

      v_request_authorizes_home := v_request.home_id is not null
        and v_request.home_id = p_draft.home_id;
    end if;

    select *
      into v_connection
      from public.homeowner_contractor_connections connection
     where connection.contractor_id = p_draft.contractor_id
       and connection.homeowner_user_id = p_draft.homeowner_user_id
       and connection.status = 'active'
     for share;

    if v_connection.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    if p_requested_output = 'job'
      and p_draft.home_id is not null
      and not v_request_authorizes_home then
      select *
        into v_shared_property
        from public.connection_shared_properties shared_property
       where shared_property.connection_id = v_connection.id
         and shared_property.home_id = p_draft.home_id
       for share;

      if v_shared_property.id is null then
        raise exception using message = 'PROPERTY_NOT_SHARED';
      end if;
    end if;

    if p_draft.home_id is not null then
      select *
        into v_home
        from public.homes home
       where home.id = p_draft.home_id
         and home.homeowner_user_id = p_draft.homeowner_user_id
       for share;

      if v_home.id is null then
        raise exception using message = 'PROPERTY_INVALID';
      end if;
    end if;

    if not exists (
      select 1 from public.profiles profile where profile.id = p_draft.homeowner_user_id
    ) then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;
  elsif p_draft.local_contact_id is not null then
    if p_draft.home_id is not null or p_draft.service_request_id is not null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    select *
      into v_local_contact
      from public.contractor_local_contacts contact
     where contact.id = p_draft.local_contact_id
       and contact.contractor_id = p_draft.contractor_id
     for share;

    if v_local_contact.id is null then
      raise exception using message = 'CUSTOMER_INVALID';
    end if;

    if p_draft.local_home_id is not null then
      select *
        into v_local_home
        from public.contractor_local_homes home
       where home.id = p_draft.local_home_id
         and home.contractor_id = p_draft.contractor_id
         and home.local_contact_id = p_draft.local_contact_id
       for share;

      if v_local_home.id is null then
        raise exception using message = 'PROPERTY_INVALID';
      end if;
    end if;
  else
    raise exception using message = 'CUSTOMER_INVALID';
  end if;
end;
$$;

create or replace function public.servsync_private_can_create_work_draft_estimate(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  -- Compatibility boundary: mirrors the current owner-scoped normal Estimate insert policy.
  select exists (
    select 1
      from public.contractor_profiles contractor
     where contractor.id = p_contractor_id
       and contractor.owner_user_id = auth.uid()
  );
$$;

create or replace function public.servsync_import_legacy_draft_job(
  p_inspection_id uuid,
  p_intended_output text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_contractor_id uuid;
  v_is_platform_admin boolean := public.current_user_is_platform_admin();
  v_existing_id uuid;
  v_draft_id uuid;
  v_subject_type text;
  v_subject_display_name_snapshot text;
  v_property_display_snapshot text := '';
begin
  if p_inspection_id is null then
    raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
  end if;

  select id
    into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if not v_is_platform_admin and (
    v_contractor_id is null
    or not public.current_user_can_manage_contractor_billing(v_contractor_id)
  ) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
     and (v_is_platform_admin or contractor_id = v_contractor_id)
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

  if v_job.homeowner_user_id is not null then
    v_subject_type := 'connected_homeowner';
    select coalesce(nullif(trim(profile.full_name), ''), nullif(trim(profile.email), ''), 'Connected homeowner')
      into v_subject_display_name_snapshot
      from public.profiles profile
     where profile.id = v_job.homeowner_user_id;
    if v_job.home_id is not null then
      select coalesce(
        nullif(trim(concat_ws(', ', nullif(home.nickname, ''), nullif(home.address_line1, ''), nullif(home.city, ''), nullif(home.state, ''))), ''),
        'Selected property'
      )
        into v_property_display_snapshot
        from public.homes home
       where home.id = v_job.home_id;
    end if;
  elsif v_job.local_contact_id is not null then
    v_subject_type := 'local_contact';
    select coalesce(
      nullif(trim(contact.display_name), ''),
      nullif(trim(contact.email), ''),
      nullif(trim(contact.phone), ''),
      'Local customer'
    )
      into v_subject_display_name_snapshot
      from public.contractor_local_contacts contact
     where contact.id = v_job.local_contact_id
       and contact.contractor_id = v_job.contractor_id;
    if v_job.local_home_id is not null then
      select coalesce(
        nullif(trim(concat_ws(', ', nullif(home.nickname, ''), nullif(home.address_line1, ''), nullif(home.city, ''), nullif(home.state, ''))), ''),
        'Selected property'
      )
        into v_property_display_snapshot
        from public.contractor_local_homes home
       where home.id = v_job.local_home_id
         and home.contractor_id = v_job.contractor_id;
    end if;
  else
    raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
  end if;

  if v_subject_display_name_snapshot is null then
    raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
  end if;

  select id
    into v_existing_id
    from public.contractor_work_drafts
   where legacy_inspection_id = v_job.id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if exists (
    select 1
      from public.job_work_items item
     where item.inspection_id = v_job.id
       and item.contractor_id = v_job.contractor_id
       and item.completion_status <> 'removed'
       and item.work_state <> 'removed'
       and (
         length(trim(item.title)) = 0
         or
         item.line_type not in ('labor', 'material', 'fee', 'other')
         or item.quantity <= 0
         or item.unit_price_cents < 0
         or item.labor_hours < 0
         or item.labor_hours > 999999.99
         or item.sort_order < 0
       )
  ) then
    raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE';
  end if;

  insert into public.contractor_work_drafts (
    contractor_id,
    created_by_user_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    subject_type,
    subject_display_name_snapshot,
    property_display_snapshot,
    title,
    scope_description,
    intended_output,
    work_format,
    legacy_inspection_id
  ) values (
    v_job.contractor_id,
    case
      when exists (select 1 from public.profiles profile where profile.id = v_job.draft_created_by)
        then v_job.draft_created_by
      else auth.uid()
    end,
    v_job.homeowner_user_id,
    v_job.home_id,
    v_job.local_contact_id,
    v_job.local_home_id,
    v_job.service_request_id,
    v_subject_type,
    v_subject_display_name_snapshot,
    v_property_display_snapshot,
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
  order by item.sort_order asc, item.created_at asc, item.id asc;

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
  v_material_total bigint := 0;
  v_labor_line_total bigint := 0;
  v_schema_labor_total bigint := 0;
  v_fee_total bigint := 0;
  v_other_total bigint := 0;
  v_subtotal bigint := 0;
begin
  if not public.servsync_private_can_create_work_draft_estimate(p_draft.contractor_id) then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

  select
    coalesce(sum(case when line_type in ('material', 'other') then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::bigint,
    coalesce(sum(case when line_type = 'labor' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::bigint,
    coalesce(sum(case when line_type = 'fee' then round(quantity * coalesce(unit_price_cents, 0)) else 0 end), 0)::bigint
    into v_material_total, v_labor_line_total, v_fee_total
    from public.contractor_work_draft_items
   where draft_id = p_draft.id
     and contractor_id = p_draft.contractor_id;

  if p_draft.labor_rate_cents is not null then
    if p_draft.labor_mode = 'job_total' and p_draft.job_labor_hours is not null then
      v_schema_labor_total := round(p_draft.job_labor_hours * p_draft.labor_rate_cents)::bigint;
    elsif p_draft.labor_mode = 'line_specific' then
      select coalesce(sum(round(coalesce(labor_hours, 0) * p_draft.labor_rate_cents)), 0)::bigint
        into v_schema_labor_total
        from public.contractor_work_draft_items
       where draft_id = p_draft.id
         and contractor_id = p_draft.contractor_id
         and line_type in ('material', 'other');
    end if;
  end if;

  v_subtotal := v_material_total + v_labor_line_total + v_schema_labor_total + v_fee_total + v_other_total;

  if greatest(v_material_total, v_labor_line_total + v_schema_labor_total, v_fee_total, v_other_total, v_subtotal) > 2147483647 then
    raise exception using message = 'DRAFT_INVALID';
  end if;

  insert into public.estimates (
    contractor_id,
    homeowner_user_id,
    local_contact_id,
    service_request_id,
    inspection_id,
    home_id,
    local_home_id,
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
    case when item.line_type in ('material', 'other') then item.labor_hours else null end,
    row_number() over (order by item.sort_order asc, item.created_at asc, item.id asc) - 1
  from public.contractor_work_draft_items item
  where item.draft_id = p_draft.id
    and item.contractor_id = p_draft.contractor_id
  order by item.sort_order asc, item.created_at asc, item.id asc;

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
    'work-draft-item:' || (row_number() over (order by item.sort_order asc, item.created_at asc, item.id asc) - 1)::text,
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
    row_number() over (order by item.sort_order asc, item.created_at asc, item.id asc) - 1
  from public.contractor_work_draft_items item
  where item.draft_id = p_draft.id
    and item.contractor_id = p_draft.contractor_id
  order by item.sort_order asc, item.created_at asc, item.id asc;

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
  if auth.uid() is null then
    raise exception using message = 'DRAFT_PERMISSION_DENIED';
  end if;

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

  -- Missing and foreign-tenant Draft IDs share one non-enumerating response.
  -- Authorization precedes every launch-ledger lookup and consumed-output return.
  if v_draft.id is null or not (
    public.current_user_can_access_contractor(v_draft.contractor_id)
    or public.current_user_is_platform_admin()
  ) then
    raise exception using message = 'DRAFT_NOT_FOUND';
  end if;

  -- Serialize contractor-scoped idempotency keys independently from Draft row locking.
  perform pg_advisory_xact_lock(
    hashtextextended(v_draft.contractor_id::text || ':' || p_idempotency_key::text, 0)
  );

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

  if v_draft.status = 'discarded' then
    raise exception using message = 'DRAFT_NOT_ACTIVE';
  end if;

  if v_draft.status = 'consumed' then
    if v_draft.launched_output_type is not null
      and (
        (v_draft.launched_output_type = 'estimate' and v_draft.launched_estimate_id is not null and v_draft.launched_job_id is null)
        or (v_draft.launched_output_type = 'job' and v_draft.launched_job_id is not null and v_draft.launched_estimate_id is null)
      ) then
      return jsonb_build_object(
        'draft_id', v_draft.id,
        'status', 'already_consumed',
        'output_type', v_draft.launched_output_type,
        'estimate_id', v_draft.launched_estimate_id,
        'job_id', v_draft.launched_job_id,
        'launch_id', null,
        'idempotent', false
      );
    end if;
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

  perform public.servsync_private_validate_work_draft_relationships(v_draft, v_output_type);

  if v_output_type = 'job'
    and v_draft.service_request_id is not null
    and exists (
      select 1
        from public.inspections job
       where job.contractor_id = v_draft.contractor_id
         and job.service_request_id = v_draft.service_request_id
         and job.job_status <> 'cancelled'
         and not (
           job.id = v_draft.legacy_inspection_id
           and job.job_origin = 'draft_composer'
           and job.status = 'draft'
           and job.job_status = 'draft'
         )
    ) then
    raise exception using message = 'LAUNCH_CONFLICT';
  end if;

  if v_output_type = 'estimate' then
    if not public.servsync_private_can_create_work_draft_estimate(v_draft.contractor_id) then
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
end;
$$;

revoke execute on function public.servsync_get_work_draft(uuid) from public;
revoke execute on function public.servsync_get_work_draft(uuid) from anon;
grant execute on function public.servsync_get_work_draft(uuid) to authenticated;

revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from anon;
grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated;

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

revoke all on function public.servsync_private_work_draft_uuid(text, text) from public;
revoke all on function public.servsync_private_work_draft_uuid(text, text) from anon;
revoke all on function public.servsync_private_work_draft_uuid(text, text) from authenticated;

revoke all on function public.servsync_private_work_draft_numeric(text, text) from public;
revoke all on function public.servsync_private_work_draft_numeric(text, text) from anon;
revoke all on function public.servsync_private_work_draft_numeric(text, text) from authenticated;

revoke all on function public.servsync_private_work_draft_integer(text, text) from public;
revoke all on function public.servsync_private_work_draft_integer(text, text) from anon;
revoke all on function public.servsync_private_work_draft_integer(text, text) from authenticated;

revoke all on function public.servsync_private_validate_work_draft_relationships(public.contractor_work_drafts, text) from public;
revoke all on function public.servsync_private_validate_work_draft_relationships(public.contractor_work_drafts, text) from anon;
revoke all on function public.servsync_private_validate_work_draft_relationships(public.contractor_work_drafts, text) from authenticated;

revoke all on function public.servsync_private_can_create_work_draft_estimate(uuid) from public;
revoke all on function public.servsync_private_can_create_work_draft_estimate(uuid) from anon;
revoke all on function public.servsync_private_can_create_work_draft_estimate(uuid) from authenticated;

comment on table public.contractor_work_drafts is
  'Contractor-only durable Draft planning records for the shared Work composer. Homeowners must not see these records. Contractor deletion is restricted while Draft audit records exist.';

comment on column public.contractor_work_drafts.subject_type is
  'Contractor-private audit subject kind. Active Draft saves may replace the planning subject; consumed or discarded Drafts are immutable and may retain only private snapshots after subject deletion.';

comment on column public.contractor_work_drafts.subject_display_name_snapshot is
  'Contractor-private subject audit snapshot. It is not copied automatically to homeowner-visible output fields.';

comment on column public.contractor_work_drafts.property_display_snapshot is
  'Contractor-private property audit snapshot. It is not copied automatically to homeowner-visible output fields.';

comment on column public.contractor_work_drafts.private_notes is
  'Contractor-only Draft notes. These are not automatically copied to homeowner-visible Estimate or Job fields.';

comment on column public.contractor_work_drafts.created_by_user_id is
  'Historical actor reference. It becomes null rather than deleting the Draft when the profile is removed.';

comment on column public.contractor_work_drafts.launched_by_user_id is
  'Historical launch actor reference. It may become null while consumed Draft audit metadata remains valid.';

comment on table public.contractor_work_draft_items is
  'Contractor-only durable Draft line items copied into the initial launched Estimate or Job workflow.';

comment on column public.contractor_work_draft_items.sort_order is
  'Presentation order. Duplicate values are allowed and resolved deterministically by sort_order, created_at, then id.';

comment on table public.contractor_work_draft_launches is
  'Idempotent launch ledger enforcing one successful initial workflow output per contractor Work Draft.';

comment on column public.contractor_work_draft_launches.requested_by_user_id is
  'Historical launch actor reference. It may become null without deleting the successful launch ledger row.';

comment on column public.contractor_work_draft_launches.launched_estimate_id is
  'Private reverse linkage to the canonical launched Estimate. Deletion is restricted to preserve the audit relationship.';

comment on column public.contractor_work_draft_launches.launched_job_id is
  'Private reverse linkage to the canonical launched Job. Deletion is restricted to preserve the audit relationship.';

comment on function public.servsync_get_work_draft(uuid) is
  'Typed UUID arguments are coerced by PostgREST/PostgreSQL before this function runs. ServSync error codes apply after successful argument coercion; missing and foreign Draft IDs return DRAFT_NOT_FOUND.';

comment on function public.servsync_import_legacy_draft_job(uuid, text) is
  'Typed UUID arguments are coerced before execution. Foreign and unavailable legacy Draft IDs use the same non-enumerating compatibility response.';

comment on function public.servsync_launch_work_draft(uuid, text, uuid) is
  'Typed UUID arguments are coerced before execution. ServSync launch errors apply after coercion, and foreign or missing Draft IDs return DRAFT_NOT_FOUND before launch-state disclosure.';

notify pgrst, 'reload schema';

commit;

-- Sandbox validation checklist:
-- 1. Apply only to sandbox ref zpzdkoaubyjtsomccxya after owner approval.
-- 2. Create connected and local active Drafts with nullable and changed intended_output.
-- 3. Save, reorder, and explicitly remove Draft items.
-- 4. Launch one Draft as Estimate and verify status=draft, private-ledger reverse linkage, line copy, and private_notes not copied.
-- 5. Launch one Draft as Job and verify private-ledger reverse linkage, job_work_items copy, and no Estimate/Invoice.
-- 6. Retry same idempotency key and verify no duplicate output.
-- 7. Retry different key after success and verify canonical consumed output response.
-- 8. Reuse same key on another Draft and verify IDEMPOTENCY_CONFLICT.
-- 9. Verify consumed/discarded Draft edits and launches fail.
-- 10. Verify homeowner and cross-contractor reads are denied by RLS/RPC checks.
