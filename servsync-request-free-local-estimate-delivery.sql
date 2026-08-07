-- ServSync Not-Connected Customer Capability Parity v1.
--
-- Adds revocable, expiring, document-specific delivery for contractor-created
-- Estimates without requiring a customer account. Each link contains an
-- immutable allowlisted snapshot. The raw 256-bit bearer is returned once;
-- only its SHA-256 digest is stored. Recipient access is exchanged for a
-- 30-minute same-origin gateway session.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.estimates') is null
     or to_regclass('public.estimate_line_items') is null
     or to_regclass('public.estimate_payment_schedule_items') is null
     or to_regclass('public.contractor_profiles') is null
     or to_regclass('public.contractor_team_members') is null
     or to_regclass('public.contractor_local_contacts') is null
     or to_regclass('public.contractor_local_homes') is null
     or to_regprocedure('public.servsync_current_contractor_profile()') is null then
    raise exception 'Required customer, Estimate, or contractor-team foundation is missing.';
  end if;
end;
$$;

create table public.local_estimate_delivery_links (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  token_hash bytea not null unique,
  document_snapshot jsonb not null,
  source_updated_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or revocation_reason in ('manual', 'replaced', 'expired')),
  rotated_from_id uuid references public.local_estimate_delivery_links(id) on delete set null,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count bigint not null default 0 check (open_count >= 0),
  constraint local_estimate_delivery_links_token_hash_length_check check (octet_length(token_hash) = 32),
  constraint local_estimate_delivery_links_snapshot_shape_check check (
    jsonb_typeof(document_snapshot) = 'object'
    and document_snapshot ->> 'state' = 'valid'
    and jsonb_typeof(document_snapshot -> 'estimate') = 'object'
    and document_snapshot - 'state' - 'estimate' = '{}'::jsonb
  ),
  constraint local_estimate_delivery_links_expiration_check
    check (expires_at > created_at and expires_at <= created_at + interval '90 days'),
  constraint local_estimate_delivery_links_revocation_check check (
    (status = 'active' and revoked_at is null and revoked_by is null and revocation_reason is null)
    or (status = 'revoked' and revoked_at is not null and revocation_reason is not null)
  ),
  constraint local_estimate_delivery_links_open_history_check check (
    (open_count = 0 and first_opened_at is null and last_opened_at is null)
    or (open_count > 0 and first_opened_at is not null and last_opened_at is not null and last_opened_at >= first_opened_at)
  ),
  constraint local_estimate_delivery_links_rotation_check check (rotated_from_id is null or rotated_from_id <> id)
);

alter table public.local_estimate_delivery_links owner to postgres;
alter table public.local_estimate_delivery_links enable row level security;
alter table public.local_estimate_delivery_links force row level security;

create unique index local_estimate_delivery_links_one_active_estimate_idx
  on public.local_estimate_delivery_links(estimate_id)
  where status = 'active';
create index local_estimate_delivery_links_contractor_estimate_idx
  on public.local_estimate_delivery_links(contractor_id, estimate_id, created_at desc);
create index local_estimate_delivery_links_expiration_idx
  on public.local_estimate_delivery_links(expires_at)
  where status = 'active';

revoke all on table public.local_estimate_delivery_links from public, anon, authenticated, service_role;

create table public.local_estimate_delivery_sessions (
  session_hash bytea primary key,
  delivery_link_id uuid not null references public.local_estimate_delivery_links(id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint local_estimate_delivery_sessions_hash_check check (octet_length(session_hash) = 32),
  constraint local_estimate_delivery_sessions_lifetime_check check (expires_at = created_at + interval '30 minutes')
);

alter table public.local_estimate_delivery_sessions owner to postgres;
alter table public.local_estimate_delivery_sessions enable row level security;
alter table public.local_estimate_delivery_sessions force row level security;
create index local_estimate_delivery_sessions_expiry_idx on public.local_estimate_delivery_sessions(expires_at, session_hash);
create index local_estimate_delivery_sessions_link_idx on public.local_estimate_delivery_sessions(delivery_link_id, expires_at);
revoke all on table public.local_estimate_delivery_sessions from public, anon, authenticated, service_role;

create table public.local_estimate_delivery_rate_buckets (
  scope text not null check (scope in ('global', 'token')),
  key_hash bytea not null check (octet_length(key_hash) = 32),
  capacity integer not null check (capacity > 0 and capacity <= 10000),
  refill_per_second numeric(20, 10) not null check (refill_per_second > 0 and refill_per_second <= capacity),
  tokens numeric(20, 10) not null check (tokens >= 0 and tokens <= capacity),
  updated_at timestamptz not null,
  last_seen_at timestamptz not null check (last_seen_at >= updated_at),
  primary key (scope, key_hash)
);

alter table public.local_estimate_delivery_rate_buckets owner to postgres;
alter table public.local_estimate_delivery_rate_buckets enable row level security;
alter table public.local_estimate_delivery_rate_buckets force row level security;
create index local_estimate_delivery_rate_buckets_cleanup_idx
  on public.local_estimate_delivery_rate_buckets(last_seen_at, key_hash)
  where scope = 'token';
revoke all on table public.local_estimate_delivery_rate_buckets from public, anon, authenticated, service_role;

create function public.servsync_private_can_manage_local_estimate_delivery(p_contractor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.contractor_profiles contractor
       where contractor.id = p_contractor_id
         and contractor.owner_user_id = auth.uid()
         and contractor.account_status = 'active'
    )
    or exists (
      select 1 from public.contractor_team_members member
       where member.contractor_id = p_contractor_id
         and member.user_id = auth.uid()
         and member.status = 'active'
         and member.role in ('admin', 'office')
    )
  );
$$;

alter function public.servsync_private_can_manage_local_estimate_delivery(uuid) owner to postgres;
revoke all on function public.servsync_private_can_manage_local_estimate_delivery(uuid) from public, anon, authenticated, service_role;

create function public.servsync_private_current_local_estimate_delivery_contractor_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select contractor.id
    from public.servsync_current_contractor_profile() contractor
   where public.servsync_private_can_manage_local_estimate_delivery(contractor.id)
   limit 1;
$$;

alter function public.servsync_private_current_local_estimate_delivery_contractor_id() owner to postgres;
revoke all on function public.servsync_private_current_local_estimate_delivery_contractor_id() from public, anon, authenticated, service_role;

create function public.servsync_private_local_estimate_delivery_metadata(p_link public.local_estimate_delivery_links)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', p_link.id,
    'state', case
      when p_link.status = 'active' and p_link.expires_at <= now() then 'expired'
      when p_link.status = 'active' then 'active'
      when p_link.revocation_reason = 'replaced' then 'replaced'
      when p_link.revocation_reason = 'expired' then 'expired'
      else 'revoked'
    end,
    'created_at', p_link.created_at,
    'expires_at', p_link.expires_at,
    'source_updated_at', p_link.source_updated_at,
    'revoked_at', p_link.revoked_at,
    'first_opened_at', p_link.first_opened_at,
    'last_opened_at', p_link.last_opened_at,
    'open_count', p_link.open_count,
    'created_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_link.created_by), ''),
    'revoked_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_link.revoked_by), '')
  );
$$;

alter function public.servsync_private_local_estimate_delivery_metadata(public.local_estimate_delivery_links) owner to postgres;
revoke all on function public.servsync_private_local_estimate_delivery_metadata(public.local_estimate_delivery_links) from public, anon, authenticated, service_role;

create function public.servsync_private_build_local_estimate_snapshot(p_estimate_id uuid)
returns table (document_snapshot jsonb, source_updated_at timestamptz, failure_reason text, serialized_bytes integer)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_estimate public.estimates;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_contractor public.contractor_profiles;
  v_lines jsonb;
  v_schedule jsonb;
  v_line_count integer;
begin
  select * into v_estimate from public.estimates where id = p_estimate_id;
  if v_estimate.id is null then failure_reason := 'unavailable'; return next; return; end if;

  select * into v_contact from public.contractor_local_contacts
   where id = v_estimate.local_contact_id and contractor_id = v_estimate.contractor_id;
  select * into v_home from public.contractor_local_homes
   where id = v_estimate.local_home_id
     and contractor_id = v_estimate.contractor_id
     and local_contact_id = v_estimate.local_contact_id;
  select * into v_contractor from public.contractor_profiles
   where id = v_estimate.contractor_id and account_status = 'active';

  if v_contact.id is null or v_home.id is null or v_contractor.id is null then
    failure_reason := 'unavailable'; return next; return;
  end if;

  select count(*)::integer into v_line_count
    from (select 1 from public.estimate_line_items line where line.estimate_id = v_estimate.id limit 101) bounded;
  if v_line_count = 0 then failure_reason := 'no_lines'; return next; return; end if;
  if v_line_count > 100 then failure_reason := 'line_limit'; return next; return; end if;

  select jsonb_agg(jsonb_build_object(
    'line_type', case when line.line_type = 'equipment' then 'material' else line.line_type end,
    'title', coalesce(nullif(trim(line.line_title), ''), nullif(trim(line.description), ''), 'Estimate item'),
    'description', coalesce(nullif(trim(line.customer_description), ''), ''),
    'model_spec', coalesce(nullif(trim(line.model_spec), ''), ''),
    'supply_status', line.supply_status,
    'quantity', line.quantity,
    'unit', line.unit,
    'unit_price_cents', line.unit_price_cents,
    'labor_hours', line.labor_hours
  ) order by line.sort_order, line.id) into v_lines
    from public.estimate_line_items line where line.estimate_id = v_estimate.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_type', schedule.invoice_type,
    'label', coalesce(nullif(trim(schedule.label), ''), 'Scheduled invoice'),
    'calculated_amount_cents', schedule.calculated_amount_cents,
    'due_trigger', coalesce(nullif(trim(schedule.due_trigger), ''), 'Due date to be confirmed')
  ) order by schedule.sort_order, schedule.id), '[]'::jsonb) into v_schedule
    from public.estimate_payment_schedule_items schedule where schedule.estimate_id = v_estimate.id;

  source_updated_at := v_estimate.updated_at;
  document_snapshot := jsonb_build_object(
    'state', 'valid',
    'estimate', jsonb_build_object(
      'contractor', jsonb_build_object('business_name', v_contractor.business_name),
      'customer', jsonb_build_object('display_name', v_contact.display_name),
      'property', jsonb_build_object(
        'address_line1', v_home.address_line1,
        'address_line2', v_home.address_line2,
        'city', v_home.city,
        'state', v_home.state,
        'zip_code', v_home.zip_code
      ),
      'title', v_estimate.title,
      'scope', v_estimate.scope,
      'notes', v_estimate.notes,
      'terms', v_estimate.terms,
      'status', 'sent',
      'source_updated_at', v_estimate.updated_at,
      'subtotal_cents', v_estimate.subtotal_cents,
      'material_total_cents', coalesce(v_estimate.material_total_cents, 0),
      'labor_total_cents', coalesce(v_estimate.labor_total_cents, 0),
      'fee_total_cents', coalesce(v_estimate.fee_total_cents, 0),
      'other_total_cents', coalesce(v_estimate.other_total_cents, 0),
      'tax_cents', coalesce(v_estimate.tax_cents, 0),
      'total_cents', v_estimate.total_cents,
      'line_items', v_lines,
      'payment_schedule_items', v_schedule
    )
  );
  serialized_bytes := octet_length(convert_to(document_snapshot::text, 'UTF8'));
  if serialized_bytes > 262144 then document_snapshot := null; failure_reason := 'response_limit'; end if;
  return next;
end;
$$;

alter function public.servsync_private_build_local_estimate_snapshot(uuid) owner to postgres;
revoke all on function public.servsync_private_build_local_estimate_snapshot(uuid) from public, anon, authenticated, service_role;

create function public.servsync_private_validate_local_estimate_delivery_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estimate public.estimates;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  if tg_op = 'UPDATE' then
    if new.contractor_id is distinct from old.contractor_id
       or new.estimate_id is distinct from old.estimate_id
       or new.local_contact_id is distinct from old.local_contact_id
       or new.local_home_id is distinct from old.local_home_id
       or new.token_hash is distinct from old.token_hash
       or new.document_snapshot is distinct from old.document_snapshot
       or new.source_updated_at is distinct from old.source_updated_at
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.rotated_from_id is distinct from old.rotated_from_id
       or new.expires_at is distinct from old.expires_at then
      raise exception 'Estimate delivery identity and snapshot are immutable.';
    end if;
    if old.status = 'revoked' and new.status <> 'revoked' then raise exception 'Revoked Estimate links cannot be reactivated.'; end if;
    if new.open_count < old.open_count
       or (old.first_opened_at is not null and new.first_opened_at is distinct from old.first_opened_at)
       or (old.last_opened_at is not null and new.last_opened_at < old.last_opened_at) then
      raise exception 'Estimate delivery access history cannot regress.';
    end if;
  end if;

  select * into v_estimate from public.estimates where id = new.estimate_id;
  select * into v_contact from public.contractor_local_contacts where id = new.local_contact_id;
  select * into v_home from public.contractor_local_homes where id = new.local_home_id;
  if v_estimate.id is null or v_contact.id is null or v_home.id is null
     or v_estimate.contractor_id is distinct from new.contractor_id
     or v_estimate.homeowner_user_id is not null
     or v_estimate.local_contact_id is distinct from new.local_contact_id
     or v_estimate.local_home_id is distinct from new.local_home_id
     or v_contact.contractor_id is distinct from new.contractor_id
     or v_home.contractor_id is distinct from new.contractor_id
     or v_home.local_contact_id is distinct from new.local_contact_id then
    raise exception 'Estimate delivery binding is invalid.';
  end if;
  return new;
end;
$$;

alter function public.servsync_private_validate_local_estimate_delivery_link() owner to postgres;
revoke all on function public.servsync_private_validate_local_estimate_delivery_link() from public, anon, authenticated, service_role;
create trigger local_estimate_delivery_links_validate
  before insert or update on public.local_estimate_delivery_links
  for each row execute function public.servsync_private_validate_local_estimate_delivery_link();

create function public.servsync_list_local_estimate_delivery_links(p_estimate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contractor_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  v_contractor_id := public.servsync_private_current_local_estimate_delivery_contractor_id();
  if v_contractor_id is null or not exists (
    select 1 from public.estimates estimate
     where estimate.id = p_estimate_id and estimate.contractor_id = v_contractor_id
  ) then raise exception 'Estimate delivery history is unavailable.'; end if;

  return coalesce((select jsonb_agg(public.servsync_private_local_estimate_delivery_metadata(link) order by link.created_at desc, link.id)
    from public.local_estimate_delivery_links link
   where link.estimate_id = p_estimate_id and link.contractor_id = v_contractor_id), '[]'::jsonb);
end;
$$;

alter function public.servsync_list_local_estimate_delivery_links(uuid) owner to postgres;
revoke all on function public.servsync_list_local_estimate_delivery_links(uuid) from public, anon, authenticated, service_role;
grant execute on function public.servsync_list_local_estimate_delivery_links(uuid) to authenticated;

create function public.servsync_create_local_estimate_delivery_link(p_estimate_id uuid, p_expires_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate public.estimates;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_link public.local_estimate_delivery_links;
  v_snapshot record;
  v_contractor_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_token text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then raise exception 'Link expiration must be between 1 and 90 days.'; end if;
  v_contractor_id := public.servsync_private_current_local_estimate_delivery_contractor_id();
  if v_contractor_id is null then raise exception 'Estimate is not eligible for account-free delivery.'; end if;

  select estimate.local_contact_id, estimate.local_home_id into v_local_contact_id, v_local_home_id
    from public.estimates estimate
   where estimate.id = p_estimate_id and estimate.contractor_id = v_contractor_id;
  if v_local_contact_id is null or v_local_home_id is null then raise exception 'Estimate is not eligible for account-free delivery.'; end if;

  select * into v_contact from public.contractor_local_contacts
   where id = v_local_contact_id and contractor_id = v_contractor_id for update;
  select * into v_home from public.contractor_local_homes
   where id = v_local_home_id and contractor_id = v_contractor_id and local_contact_id = v_local_contact_id for update;
  select * into v_estimate from public.estimates
   where id = p_estimate_id and contractor_id = v_contractor_id for update;

  if v_contact.id is null or v_home.id is null or v_estimate.id is null
     or v_estimate.homeowner_user_id is not null
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null
     or v_estimate.status not in ('draft', 'sent', 'revised') then
    raise exception 'Estimate is not eligible for account-free delivery.';
  end if;

  update public.local_estimate_delivery_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revocation_reason = 'expired'
   where estimate_id = v_estimate.id and status = 'active' and expires_at <= now();
  if exists (select 1 from public.local_estimate_delivery_links where estimate_id = v_estimate.id and status = 'active') then
    raise exception 'An active Estimate link already exists. Rotate it to publish a new snapshot.';
  end if;

  if v_estimate.status in ('draft', 'revised') then
    update public.estimates set status = 'sent', updated_at = now() where id = v_estimate.id returning * into v_estimate;
  end if;
  select * into v_snapshot from public.servsync_private_build_local_estimate_snapshot(v_estimate.id);
  if v_snapshot.document_snapshot is null then raise exception 'Estimate snapshot is unavailable (%).', coalesce(v_snapshot.failure_reason, 'unknown'); end if;

  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));
  insert into public.local_estimate_delivery_links (
    contractor_id, estimate_id, local_contact_id, local_home_id, token_hash,
    document_snapshot, source_updated_at, expires_at, created_by
  ) values (
    v_estimate.contractor_id, v_estimate.id, v_estimate.local_contact_id, v_estimate.local_home_id,
    extensions.digest(v_token, 'sha256'), v_snapshot.document_snapshot, v_snapshot.source_updated_at,
    now() + make_interval(days => p_expires_days), auth.uid()
  ) returning * into v_link;
  return jsonb_build_object('link', public.servsync_private_local_estimate_delivery_metadata(v_link), 'token', v_token);
end;
$$;

alter function public.servsync_create_local_estimate_delivery_link(uuid, integer) owner to postgres;
revoke all on function public.servsync_create_local_estimate_delivery_link(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.servsync_create_local_estimate_delivery_link(uuid, integer) to authenticated;

create function public.servsync_rotate_local_estimate_delivery_link(p_link_id uuid, p_expires_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_link public.local_estimate_delivery_links;
  v_new_link public.local_estimate_delivery_links;
  v_estimate public.estimates;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_snapshot record;
  v_contractor_id uuid;
  v_estimate_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_token text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then raise exception 'Link expiration must be between 1 and 90 days.'; end if;
  v_contractor_id := public.servsync_private_current_local_estimate_delivery_contractor_id();
  select estimate_id, local_contact_id, local_home_id into v_estimate_id, v_local_contact_id, v_local_home_id
    from public.local_estimate_delivery_links where id = p_link_id and contractor_id = v_contractor_id;
  if v_estimate_id is null then raise exception 'Estimate delivery link is unavailable.'; end if;

  select * into v_contact from public.contractor_local_contacts
   where id = v_local_contact_id and contractor_id = v_contractor_id for update;
  select * into v_home from public.contractor_local_homes
   where id = v_local_home_id and contractor_id = v_contractor_id and local_contact_id = v_local_contact_id for update;
  select * into v_estimate from public.estimates
   where id = v_estimate_id and contractor_id = v_contractor_id for update;
  select * into v_old_link from public.local_estimate_delivery_links
   where id = p_link_id and contractor_id = v_contractor_id for update;

  if v_contact.id is null or v_home.id is null or v_estimate.id is null or v_old_link.id is null
     or v_old_link.status <> 'active' or v_old_link.expires_at <= now()
     or v_estimate.homeowner_user_id is not null
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null
     or v_estimate.status not in ('draft', 'sent', 'revised') then
    raise exception 'Estimate delivery link is unavailable.';
  end if;

  if v_estimate.status in ('draft', 'revised') then
    update public.estimates set status = 'sent', updated_at = now() where id = v_estimate.id returning * into v_estimate;
  end if;
  select * into v_snapshot from public.servsync_private_build_local_estimate_snapshot(v_estimate.id);
  if v_snapshot.document_snapshot is null then raise exception 'Estimate snapshot is unavailable (%).', coalesce(v_snapshot.failure_reason, 'unknown'); end if;

  update public.local_estimate_delivery_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revocation_reason = 'replaced'
   where id = v_old_link.id;
  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));
  insert into public.local_estimate_delivery_links (
    contractor_id, estimate_id, local_contact_id, local_home_id, token_hash,
    document_snapshot, source_updated_at, expires_at, created_by, rotated_from_id
  ) values (
    v_estimate.contractor_id, v_estimate.id, v_estimate.local_contact_id, v_estimate.local_home_id,
    extensions.digest(v_token, 'sha256'), v_snapshot.document_snapshot, v_snapshot.source_updated_at,
    now() + make_interval(days => p_expires_days), auth.uid(), v_old_link.id
  ) returning * into v_new_link;
  return jsonb_build_object('link', public.servsync_private_local_estimate_delivery_metadata(v_new_link), 'token', v_token);
end;
$$;

alter function public.servsync_rotate_local_estimate_delivery_link(uuid, integer) owner to postgres;
revoke all on function public.servsync_rotate_local_estimate_delivery_link(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.servsync_rotate_local_estimate_delivery_link(uuid, integer) to authenticated;

create function public.servsync_revoke_local_estimate_delivery_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.local_estimate_delivery_links;
  v_contractor_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  v_contractor_id := public.servsync_private_current_local_estimate_delivery_contractor_id();
  select * into v_link from public.local_estimate_delivery_links
   where id = p_link_id and contractor_id = v_contractor_id for update;
  if v_link.id is null then raise exception 'Estimate delivery link is unavailable.'; end if;
  if v_link.status = 'active' then
    update public.local_estimate_delivery_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revocation_reason = 'manual'
     where id = v_link.id returning * into v_link;
  end if;
  return public.servsync_private_local_estimate_delivery_metadata(v_link);
end;
$$;

alter function public.servsync_revoke_local_estimate_delivery_link(uuid) owner to postgres;
revoke all on function public.servsync_revoke_local_estimate_delivery_link(uuid) from public, anon, authenticated, service_role;
grant execute on function public.servsync_revoke_local_estimate_delivery_link(uuid) to authenticated;

create function public.servsync_private_consume_local_estimate_delivery_rate_limit(
  p_scope text, p_key_hash bytea, p_capacity integer, p_refill_per_second numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_allowed boolean := false;
begin
  if p_scope not in ('global', 'token') or p_key_hash is null or octet_length(p_key_hash) <> 32
     or p_capacity is null or p_capacity <= 0 or p_capacity > 10000
     or p_refill_per_second is null or p_refill_per_second <= 0 or p_refill_per_second > p_capacity then return false; end if;
  insert into public.local_estimate_delivery_rate_buckets as bucket (
    scope, key_hash, capacity, refill_per_second, tokens, updated_at, last_seen_at
  ) values (p_scope, p_key_hash, p_capacity, p_refill_per_second, p_capacity - 1, v_now, v_now)
  on conflict (scope, key_hash) do update set
    capacity = excluded.capacity,
    refill_per_second = excluded.refill_per_second,
    tokens = least(excluded.capacity::numeric, bucket.tokens + greatest(extract(epoch from (v_now - bucket.updated_at)), 0)::numeric * excluded.refill_per_second) - 1,
    updated_at = v_now,
    last_seen_at = v_now
  where least(excluded.capacity::numeric, bucket.tokens + greatest(extract(epoch from (v_now - bucket.updated_at)), 0)::numeric * excluded.refill_per_second) >= 1
  returning true into v_allowed;
  return coalesce(v_allowed, false);
exception when others then return false;
end;
$$;

alter function public.servsync_private_consume_local_estimate_delivery_rate_limit(text, bytea, integer, numeric) owner to postgres;
revoke all on function public.servsync_private_consume_local_estimate_delivery_rate_limit(text, bytea, integer, numeric) from public, anon, authenticated, service_role;

create function public.servsync_private_cleanup_local_estimate_delivery_state()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_rows integer := 0;
begin
  with stale as (
    select session.ctid from public.local_estimate_delivery_sessions session
     where session.expires_at <= clock_timestamp()
     order by session.expires_at, session.session_hash for update skip locked limit 25
  ) delete from public.local_estimate_delivery_sessions session using stale where session.ctid = stale.ctid;
  get diagnostics v_deleted = row_count;
  with stale as (
    select bucket.ctid from public.local_estimate_delivery_rate_buckets bucket
     where bucket.scope = 'token' and bucket.last_seen_at < clock_timestamp() - interval '24 hours'
     order by bucket.last_seen_at, bucket.key_hash limit 25
  ) delete from public.local_estimate_delivery_rate_buckets bucket using stale where bucket.ctid = stale.ctid;
  get diagnostics v_rows = row_count;
  return v_deleted + v_rows;
end;
$$;

alter function public.servsync_private_cleanup_local_estimate_delivery_state() owner to postgres;
revoke all on function public.servsync_private_cleanup_local_estimate_delivery_state() from public, anon, authenticated, service_role;

create function public.servsync_bootstrap_local_estimate_delivery_session(
  p_token text, p_session_digest text, p_previous_session_digest text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_hash bytea;
  v_session_hash bytea;
  v_previous_session_hash bytea;
  v_global_key bytea;
  v_link public.local_estimate_delivery_links;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_contractor public.contractor_profiles;
  v_now timestamptz := clock_timestamp();
begin
  if p_session_digest is null or length(trim(p_session_digest)) <> 64 or trim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid recipient session digest.';
  end if;
  if p_previous_session_digest is not null and (length(trim(p_previous_session_digest)) <> 64 or trim(p_previous_session_digest) !~ '^[0-9a-fA-F]{64}$') then
    raise exception 'Invalid prior recipient session digest.';
  end if;
  if p_token is null or length(trim(p_token)) <> 64 or trim(p_token) !~ '^[0-9a-fA-F]{64}$' then return jsonb_build_object('state', 'invalid')::text; end if;

  v_global_key := extensions.digest('servsync-request-free-local-estimate-delivery-global-v1', 'sha256');
  if not public.servsync_private_consume_local_estimate_delivery_rate_limit('global', v_global_key, 300, 5::numeric) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;
  v_token_hash := extensions.digest(lower(trim(p_token)), 'sha256');
  if not public.servsync_private_consume_local_estimate_delivery_rate_limit('token', v_token_hash, 10, (1::numeric / 6::numeric)) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  select * into v_link from public.local_estimate_delivery_links where token_hash = v_token_hash for update;
  if v_link.id is null then return jsonb_build_object('state', 'invalid')::text; end if;
  if v_link.status = 'revoked' then
    return jsonb_build_object('state', case when v_link.revocation_reason = 'replaced' then 'replaced' else 'revoked' end)::text;
  end if;
  if v_link.expires_at <= v_now then return jsonb_build_object('state', 'expired')::text; end if;

  select * into v_contact from public.contractor_local_contacts
   where id = v_link.local_contact_id and contractor_id = v_link.contractor_id for update;
  select * into v_home from public.contractor_local_homes
   where id = v_link.local_home_id and contractor_id = v_link.contractor_id and local_contact_id = v_link.local_contact_id for update;
  select * into v_contractor from public.contractor_profiles where id = v_link.contractor_id;
  if v_contact.id is null or v_home.id is null or v_contractor.id is null or v_contractor.account_status <> 'active'
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  v_session_hash := decode(lower(trim(p_session_digest)), 'hex');
  v_previous_session_hash := case when p_previous_session_digest is null then null else decode(lower(trim(p_previous_session_digest)), 'hex') end;
  if v_previous_session_hash is not null then delete from public.local_estimate_delivery_sessions where session_hash = v_previous_session_hash; end if;
  insert into public.local_estimate_delivery_sessions(session_hash, delivery_link_id, created_at, expires_at)
  values (v_session_hash, v_link.id, v_now, v_now + interval '30 minutes');
  update public.local_estimate_delivery_links set
    first_opened_at = coalesce(first_opened_at, v_now), last_opened_at = v_now,
    open_count = case when open_count < 9223372036854775807 then open_count + 1 else 9223372036854775807 end
   where id = v_link.id;
  perform public.servsync_private_cleanup_local_estimate_delivery_state();
  return v_link.document_snapshot::text;
exception when others then return jsonb_build_object('state', 'error')::text;
end;
$$;

alter function public.servsync_bootstrap_local_estimate_delivery_session(text, text, text) owner to postgres;
revoke all on function public.servsync_bootstrap_local_estimate_delivery_session(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_bootstrap_local_estimate_delivery_session(text, text, text) to service_role;

create function public.servsync_lookup_local_estimate_delivery_session(p_session_digest text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.local_estimate_delivery_sessions;
  v_link public.local_estimate_delivery_links;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_contractor public.contractor_profiles;
  v_session_hash bytea;
  v_global_key bytea;
begin
  if p_session_digest is null or length(trim(p_session_digest)) <> 64 or trim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;
  v_session_hash := decode(lower(trim(p_session_digest)), 'hex');
  v_global_key := extensions.digest('servsync-request-free-local-estimate-delivery-global-v1', 'sha256');
  if not public.servsync_private_consume_local_estimate_delivery_rate_limit('global', v_global_key, 300, 5::numeric) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  select * into v_session from public.local_estimate_delivery_sessions
   where session_hash = v_session_hash and expires_at > clock_timestamp() for update;
  if v_session.session_hash is null then return jsonb_build_object('state', 'unavailable')::text; end if;
  select * into v_link from public.local_estimate_delivery_links where id = v_session.delivery_link_id for update;
  if v_link.id is null or v_link.status <> 'active' or v_link.expires_at <= now() then return jsonb_build_object('state', 'unavailable')::text; end if;
  if not public.servsync_private_consume_local_estimate_delivery_rate_limit('token', v_link.token_hash, 10, (1::numeric / 6::numeric)) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  select * into v_contact from public.contractor_local_contacts
   where id = v_link.local_contact_id and contractor_id = v_link.contractor_id for update;
  select * into v_home from public.contractor_local_homes
   where id = v_link.local_home_id and contractor_id = v_link.contractor_id and local_contact_id = v_link.local_contact_id for update;
  select * into v_contractor from public.contractor_profiles where id = v_link.contractor_id;
  if v_contact.id is null or v_home.id is null or v_contractor.id is null or v_contractor.account_status <> 'active'
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;
  update public.local_estimate_delivery_links set
    first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(),
    open_count = case when open_count < 9223372036854775807 then open_count + 1 else 9223372036854775807 end
   where id = v_link.id;
  return v_link.document_snapshot::text;
exception when others then return jsonb_build_object('state', 'error')::text;
end;
$$;

alter function public.servsync_lookup_local_estimate_delivery_session(text) owner to postgres;
revoke all on function public.servsync_lookup_local_estimate_delivery_session(text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_lookup_local_estimate_delivery_session(text) to service_role;

do $$
declare
  v_name text;
  v_count integer;
begin
  foreach v_name in array array[
    'servsync_list_local_estimate_delivery_links',
    'servsync_create_local_estimate_delivery_link',
    'servsync_rotate_local_estimate_delivery_link',
    'servsync_revoke_local_estimate_delivery_link',
    'servsync_bootstrap_local_estimate_delivery_session',
    'servsync_lookup_local_estimate_delivery_session'
  ] loop
    select count(*)::integer into v_count from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = v_name;
    if v_count <> 1 then raise exception 'Unexpected % overload count: %.', v_name, v_count; end if;
  end loop;
end;
$$;

comment on table public.local_estimate_delivery_links is
  'Private revocable account-free Estimate grants with immutable allowlisted snapshots and SHA-256 bearer digests.';
comment on function public.servsync_bootstrap_local_estimate_delivery_session(text, text, text) is
  'Service-gateway-only bearer bootstrap for a bounded 30-minute Estimate-recipient session.';
comment on function public.servsync_lookup_local_estimate_delivery_session(text) is
  'Service-gateway-only Estimate-session lookup that revalidates link, tenant subject, claim, archive, and contractor state.';

notify pgrst, 'reload schema';

commit;
