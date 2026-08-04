-- ServSync FB-003B request-free local invoice delivery recipient sessions.
--
-- Run after servsync-request-free-local-invoice-delivery-gateway-hardening.sql.
-- This additive correction exchanges the visible one-time link bearer for a
-- short-lived HttpOnly recipient session while preserving the existing invoice
-- renderer, delivery-link lifecycle, and database defense-in-depth limits.

begin;

do $$
declare
  v_lookup_count integer;
  v_rate_helper_count integer;
  v_render_helper_count integer;
begin
  select count(*)::integer
    into v_lookup_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_lookup_local_invoice_delivery'
     and procedure.oid = 'public.servsync_lookup_local_invoice_delivery(text)'::regprocedure;

  select count(*)::integer
    into v_rate_helper_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_private_consume_local_invoice_delivery_rate_limit'
     and procedure.oid = 'public.servsync_private_consume_local_invoice_delivery_rate_limit(text,bytea,integer,numeric)'::regprocedure;

  select count(*)::integer
    into v_render_helper_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_private_render_local_invoice_delivery'
     and procedure.oid = 'public.servsync_private_render_local_invoice_delivery(uuid,text,timestamp with time zone)'::regprocedure;

  if v_lookup_count <> 1 or v_rate_helper_count <> 1 or v_render_helper_count <> 1 then
    raise exception 'Required request-free invoice delivery gateway foundation is missing.';
  end if;
end;
$$;

revoke all on function public.servsync_lookup_local_invoice_delivery(text) from public;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from anon;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from authenticated;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from service_role;

create table public.local_invoice_delivery_sessions (
  session_hash bytea primary key,
  delivery_link_id uuid not null references public.local_invoice_delivery_links(id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  contact_claimed_at_at_creation timestamptz,
  home_claimed_at_at_creation timestamptz,
  constraint local_invoice_delivery_sessions_hash_check
    check (octet_length(session_hash) = 32),
  constraint local_invoice_delivery_sessions_lifetime_check
    check (expires_at = created_at + interval '30 minutes')
);

alter table public.local_invoice_delivery_sessions owner to postgres;
alter table public.local_invoice_delivery_sessions enable row level security;

create index local_invoice_delivery_sessions_expiry_cleanup_idx
  on public.local_invoice_delivery_sessions(expires_at, session_hash);

create index local_invoice_delivery_sessions_link_idx
  on public.local_invoice_delivery_sessions(delivery_link_id, expires_at);

revoke all on table public.local_invoice_delivery_sessions from public;
revoke all on table public.local_invoice_delivery_sessions from anon;
revoke all on table public.local_invoice_delivery_sessions from authenticated;
revoke all on table public.local_invoice_delivery_sessions from service_role;

create function public.servsync_private_cleanup_local_invoice_delivery_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  with stale as (
    select session.ctid
      from public.local_invoice_delivery_sessions session
     where session.expires_at <= clock_timestamp()
     order by session.expires_at, session.session_hash
     for update skip locked
     limit 25
  )
  delete from public.local_invoice_delivery_sessions session
   using stale
   where session.ctid = stale.ctid;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

alter function public.servsync_private_cleanup_local_invoice_delivery_sessions() owner to postgres;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_sessions() from public;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_sessions() from anon;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_sessions() from authenticated;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_sessions() from service_role;

create function public.servsync_bootstrap_local_invoice_delivery_session(
  p_token text,
  p_session_digest text,
  p_previous_session_digest text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload text;
  v_payload_state text;
  v_token_hash bytea;
  v_session_hash bytea;
  v_previous_session_hash bytea;
  v_link public.local_invoice_delivery_links;
  v_contact_claimed_at timestamptz;
  v_home_claimed_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_session_digest is null
     or length(trim(p_session_digest)) <> 64
     or trim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid recipient session digest.';
  end if;

  if p_previous_session_digest is not null
     and (
       length(trim(p_previous_session_digest)) <> 64
       or trim(p_previous_session_digest) !~ '^[0-9a-fA-F]{64}$'
     ) then
    raise exception 'Invalid prior recipient session digest.';
  end if;

  v_session_hash := decode(lower(trim(p_session_digest)), 'hex');
  v_previous_session_hash := case
    when p_previous_session_digest is null then null
    else decode(lower(trim(p_previous_session_digest)), 'hex')
  end;

  v_payload := public.servsync_lookup_local_invoice_delivery(p_token);
  v_payload_state := v_payload::jsonb ->> 'state';

  if v_payload_state <> 'valid' then
    return v_payload;
  end if;

  if v_previous_session_hash is not null then
    delete from public.local_invoice_delivery_sessions
     where session_hash = v_previous_session_hash;
  end if;

  v_token_hash := extensions.digest(lower(trim(p_token)), 'sha256');

  select * into v_link
    from public.local_invoice_delivery_links link
   where link.token_hash = v_token_hash
     and link.status = 'active'
     and link.expires_at > v_now
   for update;

  if v_link.id is null then
    raise exception 'Recipient session bootstrap state changed.';
  end if;

  select contact.claimed_at
    into v_contact_claimed_at
    from public.contractor_local_contacts contact
   where contact.id = v_link.local_contact_id
     and contact.contractor_id = v_link.contractor_id;

  select home.claimed_at
    into v_home_claimed_at
    from public.contractor_local_homes home
   where home.id = v_link.local_home_id
     and home.contractor_id = v_link.contractor_id
     and home.local_contact_id = v_link.local_contact_id;

  insert into public.local_invoice_delivery_sessions (
    session_hash,
    delivery_link_id,
    created_at,
    expires_at,
    contact_claimed_at_at_creation,
    home_claimed_at_at_creation
  ) values (
    v_session_hash,
    v_link.id,
    v_now,
    v_now + interval '30 minutes',
    v_contact_claimed_at,
    v_home_claimed_at
  );

  perform public.servsync_private_cleanup_local_invoice_delivery_sessions();

  return v_payload;
end;
$$;

alter function public.servsync_bootstrap_local_invoice_delivery_session(text, text, text) owner to postgres;
revoke all on function public.servsync_bootstrap_local_invoice_delivery_session(text, text, text) from public;
revoke all on function public.servsync_bootstrap_local_invoice_delivery_session(text, text, text) from anon;
revoke all on function public.servsync_bootstrap_local_invoice_delivery_session(text, text, text) from authenticated;
revoke all on function public.servsync_bootstrap_local_invoice_delivery_session(text, text, text) from service_role;
grant execute on function public.servsync_bootstrap_local_invoice_delivery_session(text, text, text) to service_role;

create function public.servsync_lookup_local_invoice_delivery_session(p_session_digest text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.local_invoice_delivery_sessions;
  v_link public.local_invoice_delivery_links;
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_contractor public.contractor_profiles;
  v_render record;
  v_session_hash bytea;
  v_global_key bytea;
  v_link_id uuid;
  v_contractor_id uuid;
  v_invoice_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_link_token_hash bytea;
begin
  if p_session_digest is null
     or length(trim(p_session_digest)) <> 64
     or trim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  v_session_hash := decode(lower(trim(p_session_digest)), 'hex');
  v_global_key := extensions.digest('servsync-request-free-local-invoice-delivery-global-v1', 'sha256');

  if not public.servsync_private_consume_local_invoice_delivery_rate_limit(
    'global', v_global_key, 300, 5::numeric
  ) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  select session.delivery_link_id,
         link.contractor_id,
         link.invoice_id,
         link.local_contact_id,
         link.local_home_id,
         link.token_hash
    into v_link_id,
         v_contractor_id,
         v_invoice_id,
         v_local_contact_id,
         v_local_home_id,
         v_link_token_hash
    from public.local_invoice_delivery_sessions session
    join public.local_invoice_delivery_links link on link.id = session.delivery_link_id
   where session.session_hash = v_session_hash
     and session.expires_at > clock_timestamp();

  if v_link_id is null then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  if not public.servsync_private_consume_local_invoice_delivery_rate_limit(
    'token', v_link_token_hash, 10, (1::numeric / 6::numeric)
  ) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  select * into v_contact
    from public.contractor_local_contacts
   where id = v_local_contact_id and contractor_id = v_contractor_id
   for update;

  select * into v_home
    from public.contractor_local_homes
   where id = v_local_home_id and contractor_id = v_contractor_id and local_contact_id = v_local_contact_id
   for update;

  select * into v_invoice
    from public.invoices
   where id = v_invoice_id
   for update;

  select * into v_link
    from public.local_invoice_delivery_links
   where id = v_link_id
   for update;

  select * into v_session
    from public.local_invoice_delivery_sessions
   where session_hash = v_session_hash
   for update;

  if v_session.session_hash is null
     or v_session.delivery_link_id is distinct from v_link_id
     or v_session.expires_at <= clock_timestamp()
     or v_session.contact_claimed_at_at_creation is distinct from v_contact.claimed_at
     or v_session.home_claimed_at_at_creation is distinct from v_home.claimed_at
     or v_link.id is null
     or v_contact.id is null
     or v_home.id is null
     or v_invoice.id is null
     or v_link.status <> 'active'
     or v_link.expires_at <= now()
     or v_link.contractor_id is distinct from v_contractor_id
     or v_link.invoice_id is distinct from v_invoice_id
     or v_link.local_contact_id is distinct from v_local_contact_id
     or v_link.local_home_id is distinct from v_local_home_id
     or v_invoice.contractor_id is distinct from v_contractor_id
     or v_invoice.homeowner_user_id is not null
     or v_invoice.local_contact_id is distinct from v_local_contact_id
     or v_invoice.local_home_id is distinct from v_local_home_id
     or v_invoice.status not in ('sent', 'viewed', 'paid', 'partially_paid', 'overdue') then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  select * into v_contractor
    from public.contractor_profiles
   where id = v_invoice.contractor_id
     and account_status = 'active';

  if v_contractor.id is null then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  select * into v_render
    from public.servsync_private_render_local_invoice_delivery(v_invoice.id, v_invoice.status, v_invoice.issued_at);

  if v_render.serialized_payload is null then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  update public.local_invoice_delivery_links
     set first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at = now(),
         open_count = case
           when open_count < 9223372036854775807 then open_count + 1
           else 9223372036854775807
         end
   where id = v_link.id;

  return v_render.serialized_payload;
exception
  when others then
    return jsonb_build_object('state', 'error')::text;
end;
$$;

alter function public.servsync_lookup_local_invoice_delivery_session(text) owner to postgres;
revoke all on function public.servsync_lookup_local_invoice_delivery_session(text) from public;
revoke all on function public.servsync_lookup_local_invoice_delivery_session(text) from anon;
revoke all on function public.servsync_lookup_local_invoice_delivery_session(text) from authenticated;
revoke all on function public.servsync_lookup_local_invoice_delivery_session(text) from service_role;
grant execute on function public.servsync_lookup_local_invoice_delivery_session(text) to service_role;

do $$
declare
  v_old_lookup_count integer;
  v_bootstrap_count integer;
  v_session_lookup_count integer;
begin
  select count(*)::integer
    into v_old_lookup_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_lookup_local_invoice_delivery';

  select count(*)::integer
    into v_bootstrap_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_bootstrap_local_invoice_delivery_session';

  select count(*)::integer
    into v_session_lookup_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_lookup_local_invoice_delivery_session';

  if v_old_lookup_count <> 1 or v_bootstrap_count <> 1 or v_session_lookup_count <> 1 then
    raise exception 'Unexpected request-free invoice delivery function overload remains.';
  end if;
end;
$$;

comment on table public.local_invoice_delivery_sessions is
  'Private 30-minute recipient sessions for request-free local invoice delivery. Only session digests are stored.';

comment on function public.servsync_bootstrap_local_invoice_delivery_session(text, text, text) is
  'Service-gateway-only bearer bootstrap. Creates a digest-only recipient session only after bounded invoice approval.';

comment on function public.servsync_lookup_local_invoice_delivery_session(text) is
  'Service-gateway-only recipient-session lookup. Revalidates the delivery link and invoice before returning bounded customer-safe JSON.';

notify pgrst, 'reload schema';

commit;
