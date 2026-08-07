-- ServSync Finalized Report External Email Delivery v1.
--
-- Publishes one finalized contractor-local Job Report through an expiring,
-- revocable recipient session and the existing server-side Resend boundary.
-- The private filed PDF remains canonical. Storage identity, version, ETag,
-- size, and source binding are snapshotted and revalidated on every access.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.inspections') is null
     or to_regclass('public.contractor_profiles') is null
     or to_regclass('public.contractor_team_members') is null
     or to_regclass('public.contractor_local_contacts') is null
     or to_regclass('public.contractor_local_homes') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure('public.servsync_current_contractor_profile()') is null then
    raise exception 'Required finalized-report, customer, storage, or contractor-team foundation is missing.';
  end if;
end;
$$;

create table public.finalized_report_delivery_links (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  token_hash bytea not null unique,
  document_snapshot jsonb not null,
  source_updated_at timestamptz not null,
  storage_path text not null,
  storage_object_id uuid not null,
  storage_version text not null,
  storage_etag text not null,
  storage_size_bytes bigint not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or revocation_reason in ('manual', 'replaced', 'expired')),
  rotated_from_id uuid references public.finalized_report_delivery_links(id) on delete set null,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count bigint not null default 0 check (open_count >= 0),
  constraint finalized_report_delivery_links_token_hash_length_check check (octet_length(token_hash) = 32),
  constraint finalized_report_delivery_links_snapshot_shape_check check (
    jsonb_typeof(document_snapshot) = 'object'
    and document_snapshot ->> 'state' = 'valid'
    and jsonb_typeof(document_snapshot -> 'report') = 'object'
    and document_snapshot - 'state' - 'report' = '{}'::jsonb
  ),
  constraint finalized_report_delivery_links_storage_path_check check (
    storage_path ~ '^contractor-field-work/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  ),
  constraint finalized_report_delivery_links_storage_version_check check (
    storage_version ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint finalized_report_delivery_links_storage_etag_check check (storage_etag ~ '^"[0-9a-f]{32,128}"$'),
  constraint finalized_report_delivery_links_storage_size_check check (storage_size_bytes between 5 and 20971520),
  constraint finalized_report_delivery_links_expiration_check check (expires_at > created_at and expires_at <= created_at + interval '90 days'),
  constraint finalized_report_delivery_links_revocation_check check (
    (status = 'active' and revoked_at is null and revoked_by is null and revocation_reason is null)
    or (status = 'revoked' and revoked_at is not null and revocation_reason is not null)
  ),
  constraint finalized_report_delivery_links_open_history_check check (
    (open_count = 0 and first_opened_at is null and last_opened_at is null)
    or (open_count > 0 and first_opened_at is not null and last_opened_at is not null and last_opened_at >= first_opened_at)
  ),
  constraint finalized_report_delivery_links_rotation_check check (rotated_from_id is null or rotated_from_id <> id)
);

alter table public.finalized_report_delivery_links owner to postgres;
alter table public.finalized_report_delivery_links enable row level security;
alter table public.finalized_report_delivery_links force row level security;
create unique index finalized_report_delivery_links_one_active_report_idx on public.finalized_report_delivery_links(inspection_id) where status = 'active';
create index finalized_report_delivery_links_contractor_report_idx on public.finalized_report_delivery_links(contractor_id, inspection_id, created_at desc);
create index finalized_report_delivery_links_expiration_idx on public.finalized_report_delivery_links(expires_at) where status = 'active';
revoke all on table public.finalized_report_delivery_links from public, anon, authenticated, service_role;

create table public.finalized_report_delivery_sessions (
  session_hash bytea primary key,
  delivery_link_id uuid not null references public.finalized_report_delivery_links(id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint finalized_report_delivery_sessions_hash_check check (octet_length(session_hash) = 32),
  constraint finalized_report_delivery_sessions_lifetime_check check (expires_at = created_at + interval '30 minutes')
);
alter table public.finalized_report_delivery_sessions owner to postgres;
alter table public.finalized_report_delivery_sessions enable row level security;
alter table public.finalized_report_delivery_sessions force row level security;
create index finalized_report_delivery_sessions_expiry_idx on public.finalized_report_delivery_sessions(expires_at, session_hash);
create index finalized_report_delivery_sessions_link_idx on public.finalized_report_delivery_sessions(delivery_link_id, expires_at);
revoke all on table public.finalized_report_delivery_sessions from public, anon, authenticated, service_role;

create table public.finalized_report_delivery_rate_buckets (
  scope text not null check (scope in ('global', 'token')),
  key_hash bytea not null check (octet_length(key_hash) = 32),
  capacity integer not null check (capacity > 0 and capacity <= 10000),
  refill_per_second numeric(20, 10) not null check (refill_per_second > 0 and refill_per_second <= capacity),
  tokens numeric(20, 10) not null check (tokens >= 0 and tokens <= capacity),
  updated_at timestamptz not null,
  last_seen_at timestamptz not null check (last_seen_at >= updated_at),
  primary key (scope, key_hash)
);
alter table public.finalized_report_delivery_rate_buckets owner to postgres;
alter table public.finalized_report_delivery_rate_buckets enable row level security;
alter table public.finalized_report_delivery_rate_buckets force row level security;
create index finalized_report_delivery_rate_buckets_cleanup_idx on public.finalized_report_delivery_rate_buckets(last_seen_at, key_hash) where scope = 'token';
revoke all on table public.finalized_report_delivery_rate_buckets from public, anon, authenticated, service_role;

create table public.finalized_report_delivery_email_attempts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  delivery_link_id uuid not null references public.finalized_report_delivery_links(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'prepared' check (status in ('prepared', 'sent', 'failed')),
  attempted_by uuid not null references public.profiles(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  failure_code text check (failure_code is null or failure_code in ('provider_rejected', 'provider_rate_limited', 'provider_unavailable')),
  constraint finalized_report_delivery_email_recipient_check check (
    recipient_email = lower(btrim(recipient_email))
    and length(recipient_email) between 3 and 254
    and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint finalized_report_delivery_email_result_check check (
    (status = 'prepared' and sent_at is null and failed_at is null and provider_message_id is null and failure_code is null)
    or (status = 'sent' and sent_at is not null and failed_at is null and failure_code is null)
    or (status = 'failed' and sent_at is null and failed_at is not null and provider_message_id is null and failure_code is not null)
  ),
  constraint finalized_report_delivery_email_provider_id_check check (
    provider_message_id is null or (length(provider_message_id) between 1 and 128 and provider_message_id ~ '^[A-Za-z0-9._:-]+$')
  )
);
alter table public.finalized_report_delivery_email_attempts owner to postgres;
alter table public.finalized_report_delivery_email_attempts enable row level security;
alter table public.finalized_report_delivery_email_attempts force row level security;
create index finalized_report_delivery_email_report_idx on public.finalized_report_delivery_email_attempts(contractor_id, inspection_id, attempted_at desc, id);
create index finalized_report_delivery_email_link_idx on public.finalized_report_delivery_email_attempts(delivery_link_id, attempted_at desc, id);
create index finalized_report_delivery_email_rate_idx on public.finalized_report_delivery_email_attempts(contractor_id, attempted_at desc);
revoke all on table public.finalized_report_delivery_email_attempts from public, anon, authenticated, service_role;

create function public.servsync_private_can_manage_finalized_report_delivery(p_contractor_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select auth.uid() is not null and (
    exists (select 1 from public.contractor_profiles contractor where contractor.id = p_contractor_id and contractor.owner_user_id = auth.uid() and contractor.account_status = 'active')
    or exists (select 1 from public.contractor_team_members member where member.contractor_id = p_contractor_id and member.user_id = auth.uid() and member.status = 'active' and member.role in ('admin', 'office'))
  );
$$;
alter function public.servsync_private_can_manage_finalized_report_delivery(uuid) owner to postgres;
revoke all on function public.servsync_private_can_manage_finalized_report_delivery(uuid) from public, anon, authenticated, service_role;

create function public.servsync_private_current_report_delivery_contractor_id()
returns uuid language sql security definer set search_path = public stable as $$
  select contractor.id from public.servsync_current_contractor_profile() contractor
   where public.servsync_private_can_manage_finalized_report_delivery(contractor.id) limit 1;
$$;
alter function public.servsync_private_current_report_delivery_contractor_id() owner to postgres;
revoke all on function public.servsync_private_current_report_delivery_contractor_id() from public, anon, authenticated, service_role;

create function public.servsync_private_finalized_report_email_attempt_metadata(p_attempt public.finalized_report_delivery_email_attempts)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'id', p_attempt.id, 'delivery_link_id', p_attempt.delivery_link_id, 'recipient_email', p_attempt.recipient_email,
    'status', case when p_attempt.status = 'prepared' then 'sending' else p_attempt.status end,
    'attempted_at', p_attempt.attempted_at, 'sent_at', p_attempt.sent_at, 'failed_at', p_attempt.failed_at,
    'failure_code', p_attempt.failure_code,
    'attempted_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_attempt.attempted_by), '')
  );
$$;
alter function public.servsync_private_finalized_report_email_attempt_metadata(public.finalized_report_delivery_email_attempts) owner to postgres;
revoke all on function public.servsync_private_finalized_report_email_attempt_metadata(public.finalized_report_delivery_email_attempts) from public, anon, authenticated, service_role;

create function public.servsync_private_finalized_report_delivery_metadata(p_link public.finalized_report_delivery_links)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'id', p_link.id,
    'state', case when p_link.status = 'active' and p_link.expires_at <= now() then 'expired' when p_link.status = 'active' then 'active' when p_link.revocation_reason = 'replaced' then 'replaced' when p_link.revocation_reason = 'expired' then 'expired' else 'revoked' end,
    'created_at', p_link.created_at, 'expires_at', p_link.expires_at, 'source_updated_at', p_link.source_updated_at,
    'revoked_at', p_link.revoked_at, 'first_opened_at', p_link.first_opened_at, 'last_opened_at', p_link.last_opened_at,
    'open_count', p_link.open_count,
    'created_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_link.created_by), ''),
    'revoked_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_link.revoked_by), ''),
    'email_deliveries', coalesce((select jsonb_agg(public.servsync_private_finalized_report_email_attempt_metadata(attempt) order by attempt.attempted_at desc, attempt.id) from public.finalized_report_delivery_email_attempts attempt where attempt.delivery_link_id = p_link.id), '[]'::jsonb)
  );
$$;
alter function public.servsync_private_finalized_report_delivery_metadata(public.finalized_report_delivery_links) owner to postgres;
revoke all on function public.servsync_private_finalized_report_delivery_metadata(public.finalized_report_delivery_links) from public, anon, authenticated, service_role;

create function public.servsync_private_finalized_report_access_state(p_link public.finalized_report_delivery_links)
returns text language plpgsql security definer set search_path = public stable as $$
declare
  v_inspection public.inspections;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_object storage.objects;
begin
  if p_link.status = 'revoked' then return case when p_link.revocation_reason = 'replaced' then 'replaced' else 'revoked' end; end if;
  if p_link.expires_at <= now() then return 'expired'; end if;
  select * into v_inspection from public.inspections where id = p_link.inspection_id;
  select * into v_contact from public.contractor_local_contacts where id = p_link.local_contact_id and contractor_id = p_link.contractor_id;
  select * into v_home from public.contractor_local_homes where id = p_link.local_home_id and contractor_id = p_link.contractor_id and local_contact_id = p_link.local_contact_id;
  select * into v_object from storage.objects where id = p_link.storage_object_id and bucket_id = 'home-documents' and name = p_link.storage_path;
  if v_inspection.id is null or v_contact.id is null or v_home.id is null or v_object.id is null
     or not exists (select 1 from public.contractor_profiles contractor where contractor.id = p_link.contractor_id and contractor.account_status = 'active')
     or v_inspection.contractor_id is distinct from p_link.contractor_id
     or v_inspection.homeowner_user_id is not null
     or v_inspection.local_contact_id is distinct from p_link.local_contact_id
     or v_inspection.local_home_id is distinct from p_link.local_home_id
     or v_inspection.status <> 'finalized'
     or v_inspection.report_storage_path is distinct from p_link.storage_path
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null
     or exists (select 1 from public.contractor_local_homes mapped where mapped.contractor_id = p_link.contractor_id and mapped.local_contact_id = p_link.local_contact_id and (mapped.home_id is not null or mapped.claimed_at is not null))
     or coalesce(v_object.version, '') is distinct from p_link.storage_version
     or coalesce(v_object.metadata ->> 'eTag', '') is distinct from p_link.storage_etag
     or coalesce(v_object.metadata ->> 'mimetype', '') <> 'application/pdf'
     or coalesce(v_object.metadata ->> 'size', '') !~ '^[0-9]+$'
     or (v_object.metadata ->> 'size')::bigint is distinct from p_link.storage_size_bytes then return 'unavailable';
  end if;
  return 'valid';
end;
$$;
alter function public.servsync_private_finalized_report_access_state(public.finalized_report_delivery_links) owner to postgres;
revoke all on function public.servsync_private_finalized_report_access_state(public.finalized_report_delivery_links) from public, anon, authenticated, service_role;

create function public.servsync_private_validate_finalized_report_delivery_link()
returns trigger language plpgsql set search_path = public as $$
declare
  v_inspection public.inspections;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_object storage.objects;
begin
  if tg_op = 'UPDATE' then
    if new.contractor_id is distinct from old.contractor_id or new.inspection_id is distinct from old.inspection_id
       or new.local_contact_id is distinct from old.local_contact_id or new.local_home_id is distinct from old.local_home_id
       or new.token_hash is distinct from old.token_hash or new.document_snapshot is distinct from old.document_snapshot
       or new.source_updated_at is distinct from old.source_updated_at or new.storage_path is distinct from old.storage_path
       or new.storage_object_id is distinct from old.storage_object_id or new.storage_version is distinct from old.storage_version
       or new.storage_etag is distinct from old.storage_etag or new.storage_size_bytes is distinct from old.storage_size_bytes
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.rotated_from_id is distinct from old.rotated_from_id or new.expires_at is distinct from old.expires_at then
      raise exception 'Finalized report delivery identity, PDF fingerprint, and snapshot are immutable.';
    end if;
    if old.status = 'revoked' and new.status <> 'revoked' then raise exception 'Revoked report links cannot be reactivated.'; end if;
    if new.open_count < old.open_count or (old.first_opened_at is not null and new.first_opened_at is distinct from old.first_opened_at) or (old.last_opened_at is not null and new.last_opened_at < old.last_opened_at) then raise exception 'Report delivery access history cannot regress.'; end if;
  end if;
  select * into v_inspection from public.inspections where id = new.inspection_id;
  select * into v_contact from public.contractor_local_contacts where id = new.local_contact_id;
  select * into v_home from public.contractor_local_homes where id = new.local_home_id;
  select * into v_object from storage.objects where id = new.storage_object_id and bucket_id = 'home-documents' and name = new.storage_path;
  if v_inspection.id is null or v_contact.id is null or v_home.id is null or v_object.id is null
     or v_inspection.contractor_id is distinct from new.contractor_id or v_inspection.homeowner_user_id is not null
     or v_inspection.local_contact_id is distinct from new.local_contact_id or v_inspection.local_home_id is distinct from new.local_home_id
     or v_inspection.status <> 'finalized' or v_inspection.report_storage_path is distinct from new.storage_path
     or v_contact.contractor_id is distinct from new.contractor_id or v_home.contractor_id is distinct from new.contractor_id
     or v_home.local_contact_id is distinct from new.local_contact_id
     or coalesce(v_object.version, '') is distinct from new.storage_version
     or coalesce(v_object.metadata ->> 'eTag', '') is distinct from new.storage_etag
     or coalesce(v_object.metadata ->> 'mimetype', '') <> 'application/pdf'
     or coalesce(v_object.metadata ->> 'size', '') !~ '^[0-9]+$'
     or (v_object.metadata ->> 'size')::bigint is distinct from new.storage_size_bytes then raise exception 'Finalized report delivery binding is invalid.';
  end if;
  return new;
end;
$$;
alter function public.servsync_private_validate_finalized_report_delivery_link() owner to postgres;
revoke all on function public.servsync_private_validate_finalized_report_delivery_link() from public, anon, authenticated, service_role;
create trigger finalized_report_delivery_links_validate before insert or update on public.finalized_report_delivery_links for each row execute function public.servsync_private_validate_finalized_report_delivery_link();

create function public.servsync_private_validate_finalized_report_email_attempt()
returns trigger language plpgsql set search_path = public as $$
declare v_link public.finalized_report_delivery_links;
begin
  if tg_op = 'UPDATE' then
    if new.contractor_id is distinct from old.contractor_id or new.inspection_id is distinct from old.inspection_id
       or new.delivery_link_id is distinct from old.delivery_link_id or new.local_contact_id is distinct from old.local_contact_id
       or new.local_home_id is distinct from old.local_home_id or new.recipient_email is distinct from old.recipient_email
       or new.attempted_by is distinct from old.attempted_by or new.attempted_at is distinct from old.attempted_at then raise exception 'Report email delivery identity is immutable.'; end if;
    if old.status <> 'prepared' and new is distinct from old then raise exception 'Completed report email delivery results are immutable.'; end if;
  end if;
  select * into v_link from public.finalized_report_delivery_links link where link.id = new.delivery_link_id;
  if v_link.id is null or v_link.contractor_id is distinct from new.contractor_id or v_link.inspection_id is distinct from new.inspection_id or v_link.local_contact_id is distinct from new.local_contact_id or v_link.local_home_id is distinct from new.local_home_id then raise exception 'Report email delivery binding is invalid.'; end if;
  return new;
end;
$$;
alter function public.servsync_private_validate_finalized_report_email_attempt() owner to postgres;
revoke all on function public.servsync_private_validate_finalized_report_email_attempt() from public, anon, authenticated, service_role;
create trigger finalized_report_delivery_email_attempts_validate before insert or update on public.finalized_report_delivery_email_attempts for each row execute function public.servsync_private_validate_finalized_report_email_attempt();

create function public.servsync_list_finalized_report_delivery_links(p_inspection_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_contractor_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  v_contractor_id := public.servsync_private_current_report_delivery_contractor_id();
  if v_contractor_id is null or not exists (select 1 from public.inspections inspection where inspection.id = p_inspection_id and inspection.contractor_id = v_contractor_id) then raise exception 'Report delivery history is unavailable.'; end if;
  return coalesce((select jsonb_agg(public.servsync_private_finalized_report_delivery_metadata(link) order by link.created_at desc, link.id) from public.finalized_report_delivery_links link where link.inspection_id = p_inspection_id and link.contractor_id = v_contractor_id), '[]'::jsonb);
end;
$$;
alter function public.servsync_list_finalized_report_delivery_links(uuid) owner to postgres;
revoke all on function public.servsync_list_finalized_report_delivery_links(uuid) from public, anon, authenticated, service_role;
grant execute on function public.servsync_list_finalized_report_delivery_links(uuid) to authenticated;

create function public.servsync_prepare_finalized_report_email_delivery(p_inspection_id uuid, p_recipient_email text, p_expires_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_contractor_id uuid;
  v_contractor public.contractor_profiles;
  v_inspection public.inspections;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_object storage.objects;
  v_active_link public.finalized_report_delivery_links;
  v_new_link public.finalized_report_delivery_links;
  v_attempt public.finalized_report_delivery_email_attempts;
  v_recipient_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_token text;
  v_daily_attempts integer;
  v_snapshot jsonb;
  v_property_label text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_inspection_id is null then raise exception 'Report email delivery is unavailable.'; end if;
  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then raise exception 'Link expiration must be between 1 and 90 days.'; end if;
  if length(v_recipient_email) < 3 or length(v_recipient_email) > 254 or v_recipient_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid recipient email is required.'; end if;
  v_contractor_id := public.servsync_private_current_report_delivery_contractor_id();
  if v_contractor_id is null then raise exception 'Report email delivery is unavailable.'; end if;

  select * into v_contractor from public.contractor_profiles contractor where contractor.id = v_contractor_id and contractor.account_status = 'active';
  select * into v_inspection from public.inspections inspection where inspection.id = p_inspection_id and inspection.contractor_id = v_contractor_id for update;
  if v_inspection.id is null or v_inspection.local_contact_id is null or v_inspection.local_home_id is null then raise exception 'Report email delivery is unavailable.'; end if;
  select * into v_contact from public.contractor_local_contacts contact where contact.id = v_inspection.local_contact_id and contact.contractor_id = v_contractor_id for update;
  select * into v_home from public.contractor_local_homes home where home.id = v_inspection.local_home_id and home.contractor_id = v_contractor_id and home.local_contact_id = v_inspection.local_contact_id for update;
  select * into v_object from storage.objects object where object.bucket_id = 'home-documents' and object.name = v_inspection.report_storage_path for update;
  if v_contractor.id is null or v_contact.id is null or v_home.id is null or v_object.id is null
     or v_inspection.homeowner_user_id is not null or v_inspection.status <> 'finalized'
     or coalesce(v_inspection.report_storage_path, '') !~ ('^contractor-field-work/' || v_contractor_id::text || '/' || v_inspection.id::text || '/[0-9a-f-]{36}\.pdf$')
     or coalesce(v_inspection.report_file_name, '') = ''
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null
     or exists (select 1 from public.contractor_local_homes mapped where mapped.contractor_id = v_contractor_id and mapped.local_contact_id = v_contact.id and (mapped.home_id is not null or mapped.claimed_at is not null))
     or coalesce(v_object.version, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(v_object.metadata ->> 'eTag', '') !~ '^"[0-9a-f]{32,128}"$'
     or coalesce(v_object.metadata ->> 'mimetype', '') <> 'application/pdf'
     or coalesce(v_object.metadata ->> 'size', '') !~ '^[0-9]+$'
     or (v_object.metadata ->> 'size')::bigint not between 5 and 20971520 then raise exception 'Report email delivery is unavailable.';
  end if;
  if exists (select 1 from public.finalized_report_delivery_email_attempts attempt where attempt.contractor_id = v_contractor_id and attempt.inspection_id = v_inspection.id and attempt.attempted_at > now() - interval '1 minute') then raise exception 'Please wait before sending this report again.'; end if;
  select count(*)::integer into v_daily_attempts from public.finalized_report_delivery_email_attempts attempt where attempt.contractor_id = v_contractor_id and attempt.attempted_at > now() - interval '1 day';
  if v_daily_attempts >= 100 then raise exception 'The daily report email limit has been reached.'; end if;
  select * into v_active_link from public.finalized_report_delivery_links link where link.inspection_id = v_inspection.id and link.contractor_id = v_contractor_id and link.status = 'active' for update;

  v_property_label := concat_ws(', ', nullif(trim(v_home.address_line1), ''), nullif(trim(v_home.city), ''), nullif(trim(v_home.state), ''));
  v_snapshot := jsonb_build_object('state', 'valid', 'report', jsonb_build_object(
    'contractor_business_name', coalesce(nullif(trim(v_contractor.business_name), ''), 'Your contractor'),
    'customer_display_name', coalesce(nullif(trim(v_contact.display_name), ''), 'Customer'),
    'property_label', coalesce(nullif(v_property_label, ''), 'Customer property'),
    'report_title', coalesce(nullif(trim(v_inspection.name), ''), 'Finalized Job Report'),
    'file_name', v_inspection.report_file_name,
    'source_updated_at', v_inspection.updated_at,
    'storage_size_bytes', (v_object.metadata ->> 'size')::bigint
  ));
  if octet_length(convert_to(v_snapshot::text, 'UTF8')) > 16384 then raise exception 'Report email delivery is unavailable.'; end if;
  if v_active_link.id is not null then
    update public.finalized_report_delivery_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revocation_reason = case when v_active_link.expires_at <= now() then 'expired' else 'replaced' end where id = v_active_link.id;
  end if;
  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));
  insert into public.finalized_report_delivery_links (
    contractor_id, inspection_id, local_contact_id, local_home_id, token_hash, document_snapshot, source_updated_at,
    storage_path, storage_object_id, storage_version, storage_etag, storage_size_bytes, expires_at, created_by, rotated_from_id
  ) values (
    v_contractor_id, v_inspection.id, v_contact.id, v_home.id, extensions.digest(v_token, 'sha256'), v_snapshot, v_inspection.updated_at,
    v_object.name, v_object.id, v_object.version, v_object.metadata ->> 'eTag', (v_object.metadata ->> 'size')::bigint,
    now() + make_interval(days => p_expires_days), auth.uid(), v_active_link.id
  ) returning * into v_new_link;
  insert into public.finalized_report_delivery_email_attempts (contractor_id, inspection_id, delivery_link_id, local_contact_id, local_home_id, recipient_email, attempted_by)
  values (v_contractor_id, v_inspection.id, v_new_link.id, v_contact.id, v_home.id, v_recipient_email, auth.uid()) returning * into v_attempt;
  return jsonb_build_object(
    'token', v_token, 'attempt_id', v_attempt.id, 'delivery_link_id', v_new_link.id, 'recipient_email', v_recipient_email,
    'expires_at', v_new_link.expires_at, 'contractor_business_name', v_snapshot #>> '{report,contractor_business_name}',
    'customer_display_name', v_snapshot #>> '{report,customer_display_name}', 'report_title', v_snapshot #>> '{report,report_title}',
    'property_label', v_snapshot #>> '{report,property_label}'
  );
end;
$$;
alter function public.servsync_prepare_finalized_report_email_delivery(uuid, text, integer) owner to postgres;
revoke all on function public.servsync_prepare_finalized_report_email_delivery(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.servsync_prepare_finalized_report_email_delivery(uuid, text, integer) to authenticated;

create function public.servsync_revoke_finalized_report_delivery_link(p_link_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_link public.finalized_report_delivery_links; v_contractor_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  v_contractor_id := public.servsync_private_current_report_delivery_contractor_id();
  select * into v_link from public.finalized_report_delivery_links link where link.id = p_link_id and link.contractor_id = v_contractor_id for update;
  if v_link.id is null then raise exception 'Report delivery link is unavailable.'; end if;
  if v_link.status = 'active' then update public.finalized_report_delivery_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revocation_reason = 'manual' where id = v_link.id returning * into v_link; end if;
  delete from public.finalized_report_delivery_sessions where delivery_link_id = v_link.id;
  return public.servsync_private_finalized_report_delivery_metadata(v_link);
end;
$$;
alter function public.servsync_revoke_finalized_report_delivery_link(uuid) owner to postgres;
revoke all on function public.servsync_revoke_finalized_report_delivery_link(uuid) from public, anon, authenticated, service_role;
grant execute on function public.servsync_revoke_finalized_report_delivery_link(uuid) to authenticated;

create function public.servsync_record_finalized_report_email_delivery_result(p_attempt_id uuid, p_status text, p_provider_message_id text default null, p_failure_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attempt public.finalized_report_delivery_email_attempts; v_status text := lower(btrim(coalesce(p_status, ''))); v_provider_message_id text := nullif(btrim(coalesce(p_provider_message_id, '')), ''); v_failure_code text := nullif(lower(btrim(coalesce(p_failure_code, ''))), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Report email delivery result recording is unavailable.'; end if;
  if v_status not in ('sent', 'failed') then raise exception 'Report email delivery result is invalid.'; end if;
  if v_provider_message_id is not null and (length(v_provider_message_id) > 128 or v_provider_message_id !~ '^[A-Za-z0-9._:-]+$') then raise exception 'Report email provider result is invalid.'; end if;
  if v_status = 'sent' and v_failure_code is not null then raise exception 'Report email delivery result is invalid.'; end if;
  if v_status = 'failed' and v_failure_code not in ('provider_rejected', 'provider_rate_limited', 'provider_unavailable') then raise exception 'Report email delivery result is invalid.'; end if;
  select * into v_attempt from public.finalized_report_delivery_email_attempts attempt where attempt.id = p_attempt_id for update;
  if v_attempt.id is null then raise exception 'Report email delivery result is unavailable.'; end if;
  if v_attempt.status <> 'prepared' then
    if v_attempt.status = v_status then return public.servsync_private_finalized_report_email_attempt_metadata(v_attempt); end if;
    raise exception 'Report email delivery result is already final.';
  end if;
  update public.finalized_report_delivery_email_attempts set status = v_status,
    sent_at = case when v_status = 'sent' then now() else null end, failed_at = case when v_status = 'failed' then now() else null end,
    provider_message_id = case when v_status = 'sent' then v_provider_message_id else null end,
    failure_code = case when v_status = 'failed' then v_failure_code else null end
   where id = v_attempt.id returning * into v_attempt;
  return public.servsync_private_finalized_report_email_attempt_metadata(v_attempt);
end;
$$;
alter function public.servsync_record_finalized_report_email_delivery_result(uuid, text, text, text) owner to postgres;
revoke all on function public.servsync_record_finalized_report_email_delivery_result(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_record_finalized_report_email_delivery_result(uuid, text, text, text) to service_role;

create function public.servsync_private_consume_finalized_report_delivery_rate_limit(p_scope text, p_key_hash bytea, p_capacity integer, p_refill_per_second numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := clock_timestamp(); v_allowed boolean := false;
begin
  if p_scope not in ('global', 'token') or p_key_hash is null or octet_length(p_key_hash) <> 32 or p_capacity is null or p_capacity <= 0 or p_capacity > 10000 or p_refill_per_second is null or p_refill_per_second <= 0 or p_refill_per_second > p_capacity then return false; end if;
  insert into public.finalized_report_delivery_rate_buckets as bucket (scope, key_hash, capacity, refill_per_second, tokens, updated_at, last_seen_at)
  values (p_scope, p_key_hash, p_capacity, p_refill_per_second, p_capacity - 1, v_now, v_now)
  on conflict (scope, key_hash) do update set capacity = excluded.capacity, refill_per_second = excluded.refill_per_second,
    tokens = least(excluded.capacity::numeric, bucket.tokens + greatest(extract(epoch from (v_now - bucket.updated_at)), 0)::numeric * excluded.refill_per_second) - 1,
    updated_at = v_now, last_seen_at = v_now
  where least(excluded.capacity::numeric, bucket.tokens + greatest(extract(epoch from (v_now - bucket.updated_at)), 0)::numeric * excluded.refill_per_second) >= 1 returning true into v_allowed;
  return coalesce(v_allowed, false);
exception when others then return false;
end;
$$;
alter function public.servsync_private_consume_finalized_report_delivery_rate_limit(text, bytea, integer, numeric) owner to postgres;
revoke all on function public.servsync_private_consume_finalized_report_delivery_rate_limit(text, bytea, integer, numeric) from public, anon, authenticated, service_role;

create function public.servsync_private_cleanup_finalized_report_delivery_state()
returns integer language plpgsql security definer set search_path = public as $$
declare v_deleted integer := 0; v_rows integer := 0;
begin
  with stale as (select session.ctid from public.finalized_report_delivery_sessions session where session.expires_at <= clock_timestamp() order by session.expires_at, session.session_hash for update skip locked limit 25)
  delete from public.finalized_report_delivery_sessions session using stale where session.ctid = stale.ctid;
  get diagnostics v_deleted = row_count;
  with stale as (select bucket.ctid from public.finalized_report_delivery_rate_buckets bucket where bucket.scope = 'token' and bucket.last_seen_at < clock_timestamp() - interval '24 hours' order by bucket.last_seen_at, bucket.key_hash limit 25)
  delete from public.finalized_report_delivery_rate_buckets bucket using stale where bucket.ctid = stale.ctid;
  get diagnostics v_rows = row_count;
  return v_deleted + v_rows;
end;
$$;
alter function public.servsync_private_cleanup_finalized_report_delivery_state() owner to postgres;
revoke all on function public.servsync_private_cleanup_finalized_report_delivery_state() from public, anon, authenticated, service_role;

create function public.servsync_private_finalized_report_gateway_payload(p_link public.finalized_report_delivery_links)
returns text language sql security definer set search_path = public stable as $$
  select jsonb_build_object('state', 'valid', 'report', jsonb_build_object(
    'bucket_id', 'home-documents', 'storage_path', p_link.storage_path,
    'file_name', p_link.document_snapshot #>> '{report,file_name}', 'storage_object_id', p_link.storage_object_id,
    'storage_version', p_link.storage_version, 'storage_etag', p_link.storage_etag, 'storage_size_bytes', p_link.storage_size_bytes
  ))::text;
$$;
alter function public.servsync_private_finalized_report_gateway_payload(public.finalized_report_delivery_links) owner to postgres;
revoke all on function public.servsync_private_finalized_report_gateway_payload(public.finalized_report_delivery_links) from public, anon, authenticated, service_role;

create function public.servsync_bootstrap_finalized_report_delivery_session(p_token text, p_session_digest text, p_previous_session_digest text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_token_hash bytea; v_session_hash bytea; v_previous_session_hash bytea; v_global_key bytea; v_link public.finalized_report_delivery_links; v_state text; v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Report recipient bootstrap is unavailable.'; end if;
  if p_session_digest is null or length(trim(p_session_digest)) <> 64 or trim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then raise exception 'Invalid recipient session digest.'; end if;
  if p_previous_session_digest is not null and (length(trim(p_previous_session_digest)) <> 64 or trim(p_previous_session_digest) !~ '^[0-9a-fA-F]{64}$') then raise exception 'Invalid prior recipient session digest.'; end if;
  if p_token is null or length(trim(p_token)) <> 64 or trim(p_token) !~ '^[0-9a-fA-F]{64}$' then return jsonb_build_object('state', 'invalid')::text; end if;
  v_global_key := extensions.digest('servsync-request-free-finalized-report-delivery-global-v1', 'sha256');
  if not public.servsync_private_consume_finalized_report_delivery_rate_limit('global', v_global_key, 300, 5::numeric) then return jsonb_build_object('state', 'rate_limited')::text; end if;
  v_token_hash := extensions.digest(lower(trim(p_token)), 'sha256');
  if not public.servsync_private_consume_finalized_report_delivery_rate_limit('token', v_token_hash, 10, (1::numeric / 6::numeric)) then return jsonb_build_object('state', 'rate_limited')::text; end if;
  select * into v_link from public.finalized_report_delivery_links where token_hash = v_token_hash for update;
  if v_link.id is null then return jsonb_build_object('state', 'invalid')::text; end if;
  v_state := public.servsync_private_finalized_report_access_state(v_link);
  if v_state <> 'valid' then return jsonb_build_object('state', v_state)::text; end if;
  v_session_hash := decode(lower(trim(p_session_digest)), 'hex');
  v_previous_session_hash := case when p_previous_session_digest is null then null else decode(lower(trim(p_previous_session_digest)), 'hex') end;
  if v_previous_session_hash is not null then delete from public.finalized_report_delivery_sessions where session_hash = v_previous_session_hash; end if;
  insert into public.finalized_report_delivery_sessions(session_hash, delivery_link_id, created_at, expires_at) values (v_session_hash, v_link.id, v_now, v_now + interval '30 minutes');
  update public.finalized_report_delivery_links set first_opened_at = coalesce(first_opened_at, v_now), last_opened_at = v_now, open_count = case when open_count < 9223372036854775807 then open_count + 1 else 9223372036854775807 end where id = v_link.id returning * into v_link;
  perform public.servsync_private_cleanup_finalized_report_delivery_state();
  return public.servsync_private_finalized_report_gateway_payload(v_link);
exception when others then return jsonb_build_object('state', 'error')::text;
end;
$$;
alter function public.servsync_bootstrap_finalized_report_delivery_session(text, text, text) owner to postgres;
revoke all on function public.servsync_bootstrap_finalized_report_delivery_session(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_bootstrap_finalized_report_delivery_session(text, text, text) to service_role;

create function public.servsync_lookup_finalized_report_delivery_session(p_session_digest text)
returns text language plpgsql security definer set search_path = public as $$
declare v_session public.finalized_report_delivery_sessions; v_link public.finalized_report_delivery_links; v_session_hash bytea; v_global_key bytea; v_state text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Report recipient lookup is unavailable.'; end if;
  if p_session_digest is null or length(trim(p_session_digest)) <> 64 or trim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then return jsonb_build_object('state', 'unavailable')::text; end if;
  v_session_hash := decode(lower(trim(p_session_digest)), 'hex');
  v_global_key := extensions.digest('servsync-request-free-finalized-report-delivery-global-v1', 'sha256');
  if not public.servsync_private_consume_finalized_report_delivery_rate_limit('global', v_global_key, 300, 5::numeric) then return jsonb_build_object('state', 'rate_limited')::text; end if;
  select * into v_session from public.finalized_report_delivery_sessions where session_hash = v_session_hash and expires_at > clock_timestamp() for update;
  if v_session.session_hash is null then return jsonb_build_object('state', 'unavailable')::text; end if;
  select * into v_link from public.finalized_report_delivery_links where id = v_session.delivery_link_id for update;
  if v_link.id is null then delete from public.finalized_report_delivery_sessions where session_hash = v_session_hash; return jsonb_build_object('state', 'unavailable')::text; end if;
  if not public.servsync_private_consume_finalized_report_delivery_rate_limit('token', v_link.token_hash, 10, (1::numeric / 6::numeric)) then return jsonb_build_object('state', 'rate_limited')::text; end if;
  v_state := public.servsync_private_finalized_report_access_state(v_link);
  if v_state <> 'valid' then delete from public.finalized_report_delivery_sessions where session_hash = v_session_hash; return jsonb_build_object('state', v_state)::text; end if;
  update public.finalized_report_delivery_links set first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(), open_count = case when open_count < 9223372036854775807 then open_count + 1 else 9223372036854775807 end where id = v_link.id returning * into v_link;
  return public.servsync_private_finalized_report_gateway_payload(v_link);
exception when others then return jsonb_build_object('state', 'error')::text;
end;
$$;
alter function public.servsync_lookup_finalized_report_delivery_session(text) owner to postgres;
revoke all on function public.servsync_lookup_finalized_report_delivery_session(text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_lookup_finalized_report_delivery_session(text) to service_role;

do $$
declare v_name text; v_count integer;
begin
  foreach v_name in array array[
    'servsync_private_can_manage_finalized_report_delivery', 'servsync_private_current_report_delivery_contractor_id',
    'servsync_private_finalized_report_email_attempt_metadata', 'servsync_private_finalized_report_delivery_metadata',
    'servsync_private_finalized_report_access_state', 'servsync_private_validate_finalized_report_delivery_link',
    'servsync_private_validate_finalized_report_email_attempt', 'servsync_list_finalized_report_delivery_links',
    'servsync_prepare_finalized_report_email_delivery', 'servsync_revoke_finalized_report_delivery_link',
    'servsync_record_finalized_report_email_delivery_result', 'servsync_private_consume_finalized_report_delivery_rate_limit',
    'servsync_private_cleanup_finalized_report_delivery_state', 'servsync_private_finalized_report_gateway_payload',
    'servsync_bootstrap_finalized_report_delivery_session', 'servsync_lookup_finalized_report_delivery_session'
  ] loop
    select count(*)::integer into v_count from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = v_name;
    if v_count <> 1 then raise exception 'Unexpected % overload count: %.', v_name, v_count; end if;
  end loop;
end;
$$;

comment on table public.finalized_report_delivery_links is 'Private finalized Job Report delivery snapshots. Raw bearer tokens are never stored.';
comment on table public.finalized_report_delivery_email_attempts is 'Private sanitized send-attempt history for finalized Job Reports; provider payloads and raw bearers are excluded.';
comment on function public.servsync_prepare_finalized_report_email_delivery(uuid, text, integer) is 'Owner/Admin/Office server preparation boundary for a finalized contractor-local Job Report email.';
comment on function public.servsync_bootstrap_finalized_report_delivery_session(text, text, text) is 'Service-gateway-only bearer bootstrap for a bounded finalized-report recipient session.';

notify pgrst, 'reload schema';

commit;
