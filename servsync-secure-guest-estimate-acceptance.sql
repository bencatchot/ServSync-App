-- ServSync Secure Estimate Acceptance for Not Connected Customers v1.
--
-- Adds document-scoped acceptance for the existing request-free Estimate
-- recipient session. Acceptance is bound to the immutable delivered snapshot,
-- recorded as secure guest acceptance (not identity verification or signature),
-- and converges on the canonical Estimate accepted status.

begin;

do $$
begin
  if to_regclass('public.estimates') is null
     or to_regclass('public.estimate_line_items') is null
     or to_regclass('public.estimate_payment_schedule_items') is null
     or to_regclass('public.local_estimate_delivery_links') is null
     or to_regclass('public.local_estimate_delivery_sessions') is null
     or to_regclass('public.local_estimate_delivery_email_attempts') is null
     or to_regprocedure('public.servsync_private_build_local_estimate_snapshot(uuid)') is null
     or to_regprocedure('public.servsync_private_consume_local_estimate_delivery_rate_limit(text,bytea,integer,numeric)') is null
     or to_regprocedure('public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)') is null then
    raise exception 'Required Estimate delivery or workflow activity foundation is missing.';
  end if;
end;
$$;

create table public.local_estimate_delivery_acceptances (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  delivery_link_id uuid not null references public.local_estimate_delivery_links(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  snapshot_hash bytea not null,
  source_updated_at timestamptz not null,
  recipient_email text,
  acceptance_channel text not null default 'secure_guest',
  resulting_estimate_status text not null default 'accepted',
  accepted_at timestamptz not null default clock_timestamp(),
  constraint local_estimate_delivery_acceptances_estimate_unique unique (estimate_id),
  constraint local_estimate_delivery_acceptances_link_unique unique (delivery_link_id),
  constraint local_estimate_delivery_acceptances_snapshot_hash_check check (octet_length(snapshot_hash) = 32),
  constraint local_estimate_delivery_acceptances_recipient_email_check check (
    recipient_email is null
    or (recipient_email = lower(btrim(recipient_email)) and length(recipient_email) between 3 and 254)
  ),
  constraint local_estimate_delivery_acceptances_channel_check check (acceptance_channel = 'secure_guest'),
  constraint local_estimate_delivery_acceptances_status_check check (resulting_estimate_status = 'accepted')
);

alter table public.local_estimate_delivery_acceptances owner to postgres;
alter table public.local_estimate_delivery_acceptances enable row level security;
alter table public.local_estimate_delivery_acceptances force row level security;

create index local_estimate_delivery_acceptances_contractor_idx
  on public.local_estimate_delivery_acceptances(contractor_id, accepted_at desc, id);
create index local_estimate_delivery_acceptances_contact_idx
  on public.local_estimate_delivery_acceptances(local_contact_id, accepted_at desc, id);
create index local_estimate_delivery_acceptances_home_idx
  on public.local_estimate_delivery_acceptances(local_home_id, accepted_at desc, id);

revoke all on table public.local_estimate_delivery_acceptances from public, anon, authenticated, service_role;

create function public.servsync_private_reject_local_estimate_acceptance_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Secure guest Estimate acceptance evidence is immutable.';
end;
$$;

alter function public.servsync_private_reject_local_estimate_acceptance_update() owner to postgres;
revoke all on function public.servsync_private_reject_local_estimate_acceptance_update() from public, anon, authenticated, service_role;

create trigger local_estimate_delivery_acceptances_immutable
  before update on public.local_estimate_delivery_acceptances
  for each row execute function public.servsync_private_reject_local_estimate_acceptance_update();

create function public.servsync_private_local_estimate_acceptance_metadata(
  p_acceptance public.local_estimate_delivery_acceptances
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'state', 'accepted',
    'channel', p_acceptance.acceptance_channel,
    'accepted_at', p_acceptance.accepted_at,
    'source_updated_at', p_acceptance.source_updated_at,
    'recipient_email', p_acceptance.recipient_email
  );
$$;

alter function public.servsync_private_local_estimate_acceptance_metadata(public.local_estimate_delivery_acceptances) owner to postgres;
revoke all on function public.servsync_private_local_estimate_acceptance_metadata(public.local_estimate_delivery_acceptances) from public, anon, authenticated, service_role;

create function public.servsync_private_local_estimate_recipient_acceptance_state(
  p_link public.local_estimate_delivery_links
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_acceptance public.local_estimate_delivery_acceptances;
  v_estimate public.estimates;
  v_snapshot record;
begin
  select * into v_acceptance
    from public.local_estimate_delivery_acceptances acceptance
   where acceptance.delivery_link_id = p_link.id;
  if v_acceptance.id is not null then
    return jsonb_build_object('state', 'accepted', 'accepted_at', v_acceptance.accepted_at);
  end if;

  select * into v_estimate from public.estimates estimate where estimate.id = p_link.estimate_id;
  if v_estimate.id is null or v_estimate.status <> 'sent' then
    return jsonb_build_object('state', 'ineligible');
  end if;

  select * into v_snapshot from public.servsync_private_build_local_estimate_snapshot(p_link.estimate_id);
  if v_snapshot.document_snapshot is null
     or v_snapshot.source_updated_at is distinct from p_link.source_updated_at
     or v_snapshot.document_snapshot is distinct from p_link.document_snapshot then
    return jsonb_build_object('state', 'stale');
  end if;

  return jsonb_build_object('state', 'eligible');
end;
$$;

alter function public.servsync_private_local_estimate_recipient_acceptance_state(public.local_estimate_delivery_links) owner to postgres;
revoke all on function public.servsync_private_local_estimate_recipient_acceptance_state(public.local_estimate_delivery_links) from public, anon, authenticated, service_role;

create function public.servsync_lookup_local_estimate_delivery_acceptance(p_session_digest text)
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
begin
  if p_session_digest is null
     or length(btrim(p_session_digest)) <> 64
     or btrim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;
  v_session_hash := decode(lower(btrim(p_session_digest)), 'hex');

  select * into v_session
    from public.local_estimate_delivery_sessions session
   where session.session_hash = v_session_hash
     and session.expires_at > clock_timestamp();
  if v_session.session_hash is null then return jsonb_build_object('state', 'unavailable')::text; end if;

  select * into v_link from public.local_estimate_delivery_links link where link.id = v_session.delivery_link_id;
  if v_link.id is null or v_link.status <> 'active' or v_link.expires_at <= clock_timestamp() then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  select * into v_contact from public.contractor_local_contacts contact
   where contact.id = v_link.local_contact_id and contact.contractor_id = v_link.contractor_id;
  select * into v_home from public.contractor_local_homes home
   where home.id = v_link.local_home_id
     and home.contractor_id = v_link.contractor_id
     and home.local_contact_id = v_link.local_contact_id;
  select * into v_contractor from public.contractor_profiles contractor where contractor.id = v_link.contractor_id;

  if v_contact.id is null or v_home.id is null or v_contractor.id is null
     or v_contractor.account_status <> 'active'
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  return public.servsync_private_local_estimate_recipient_acceptance_state(v_link)::text;
exception when others then
  return jsonb_build_object('state', 'error')::text;
end;
$$;

alter function public.servsync_lookup_local_estimate_delivery_acceptance(text) owner to postgres;
revoke all on function public.servsync_lookup_local_estimate_delivery_acceptance(text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_lookup_local_estimate_delivery_acceptance(text) to service_role;

create function public.servsync_accept_local_estimate_delivery_session(p_session_digest text)
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
  v_estimate public.estimates;
  v_acceptance public.local_estimate_delivery_acceptances;
  v_snapshot record;
  v_session_hash bytea;
  v_recipient_email text;
  v_now timestamptz := clock_timestamp();
begin
  if p_session_digest is null
     or length(btrim(p_session_digest)) <> 64
     or btrim(p_session_digest) !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;
  v_session_hash := decode(lower(btrim(p_session_digest)), 'hex');

  select * into v_session from public.local_estimate_delivery_sessions session
   where session.session_hash = v_session_hash;
  if v_session.session_hash is null then return jsonb_build_object('state', 'unavailable')::text; end if;
  select * into v_link from public.local_estimate_delivery_links link where link.id = v_session.delivery_link_id;
  if v_link.id is null then return jsonb_build_object('state', 'unavailable')::text; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_link.estimate_id::text, 390));

  select * into v_contact from public.contractor_local_contacts contact
   where contact.id = v_link.local_contact_id and contact.contractor_id = v_link.contractor_id for update;
  select * into v_home from public.contractor_local_homes home
   where home.id = v_link.local_home_id
     and home.contractor_id = v_link.contractor_id
     and home.local_contact_id = v_link.local_contact_id for update;
  select * into v_estimate from public.estimates estimate
   where estimate.id = v_link.estimate_id and estimate.contractor_id = v_link.contractor_id for update;
  select * into v_link from public.local_estimate_delivery_links link
   where link.id = v_session.delivery_link_id for update;
  select * into v_session from public.local_estimate_delivery_sessions session
   where session.session_hash = v_session_hash for update;
  select * into v_contractor from public.contractor_profiles contractor where contractor.id = v_link.contractor_id;

  if v_session.session_hash is null or v_session.expires_at <= v_now
     or v_link.id is null or v_link.status <> 'active' or v_link.expires_at <= v_now
     or v_contact.id is null or v_home.id is null or v_contractor.id is null or v_estimate.id is null
     or v_contractor.account_status <> 'active'
     or v_estimate.homeowner_user_id is not null
     or v_estimate.local_contact_id is distinct from v_link.local_contact_id
     or v_estimate.local_home_id is distinct from v_link.local_home_id
     or v_contact.homeowner_user_id is not null or v_contact.claimed_at is not null or v_contact.archived_at is not null
     or v_home.home_id is not null or v_home.claimed_at is not null or v_home.archived_at is not null then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  if not public.servsync_private_consume_local_estimate_delivery_rate_limit(
    'token', v_link.token_hash, 10, (1::numeric / 6::numeric)
  ) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  select * into v_acceptance from public.local_estimate_delivery_acceptances acceptance
   where acceptance.delivery_link_id = v_link.id;
  if v_acceptance.id is not null then
    return jsonb_build_object('state', 'accepted', 'accepted_at', v_acceptance.accepted_at)::text;
  end if;

  if v_estimate.status <> 'sent' then
    return jsonb_build_object('state', 'ineligible')::text;
  end if;

  -- Freeze every mutable input used by the canonical snapshot builder for the
  -- short acceptance transaction. Estimate-row locking covers the parent;
  -- SHARE locks prevent child-row inserts, updates, or deletes until commit.
  lock table public.estimate_line_items, public.estimate_payment_schedule_items in share mode;
  select * into v_snapshot from public.servsync_private_build_local_estimate_snapshot(v_estimate.id);
  if v_snapshot.document_snapshot is null
     or v_snapshot.source_updated_at is distinct from v_link.source_updated_at
     or v_snapshot.document_snapshot is distinct from v_link.document_snapshot then
    return jsonb_build_object('state', 'stale')::text;
  end if;

  select attempt.recipient_email into v_recipient_email
    from public.local_estimate_delivery_email_attempts attempt
   where attempt.delivery_link_id = v_link.id and attempt.status = 'sent'
   order by attempt.sent_at desc, attempt.id desc
   limit 1;

  insert into public.local_estimate_delivery_acceptances (
    contractor_id,
    estimate_id,
    delivery_link_id,
    local_contact_id,
    local_home_id,
    snapshot_hash,
    source_updated_at,
    recipient_email,
    accepted_at
  ) values (
    v_link.contractor_id,
    v_link.estimate_id,
    v_link.id,
    v_link.local_contact_id,
    v_link.local_home_id,
    extensions.digest(convert_to(v_link.document_snapshot::text, 'UTF8'), 'sha256'),
    v_link.source_updated_at,
    v_recipient_email,
    v_now
  ) returning * into v_acceptance;

  update public.estimates estimate
     set status = 'accepted'
   where estimate.id = v_estimate.id and estimate.status = 'sent';
  if not found then raise exception 'Estimate acceptance could not be completed.'; end if;

  perform public.servsync_append_workflow_activity_event(
    p_context_type => 'estimate',
    p_event_type => 'estimate_approved',
    p_service_request_id => v_estimate.service_request_id,
    p_inspection_id => v_estimate.inspection_id,
    p_estimate_id => v_estimate.id,
    p_actor_user_id => null,
    p_metadata => jsonb_build_object(
      'source_rpc', 'servsync_accept_local_estimate_delivery_session',
      'acceptance_channel', 'secure_guest',
      'delivery_link_id', v_link.id,
      'acceptance_id', v_acceptance.id
    )
  );

  return jsonb_build_object('state', 'accepted', 'accepted_at', v_acceptance.accepted_at)::text;
exception
  when unique_violation then
    select * into v_acceptance from public.local_estimate_delivery_acceptances acceptance
     where acceptance.estimate_id = v_link.estimate_id;
    if v_acceptance.id is not null and v_acceptance.delivery_link_id = v_link.id then
      return jsonb_build_object('state', 'accepted', 'accepted_at', v_acceptance.accepted_at)::text;
    end if;
    return jsonb_build_object('state', 'ineligible')::text;
  when others then
    return jsonb_build_object('state', 'error')::text;
end;
$$;

alter function public.servsync_accept_local_estimate_delivery_session(text) owner to postgres;
revoke all on function public.servsync_accept_local_estimate_delivery_session(text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_accept_local_estimate_delivery_session(text) to service_role;

create or replace function public.servsync_private_local_estimate_delivery_metadata(p_link public.local_estimate_delivery_links)
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
    'revoked_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_link.revoked_by), ''),
    'email_deliveries', coalesce((
      select jsonb_agg(
        public.servsync_private_local_estimate_email_attempt_metadata(attempt)
        order by attempt.attempted_at desc, attempt.id
      )
        from public.local_estimate_delivery_email_attempts attempt
       where attempt.delivery_link_id = p_link.id
    ), '[]'::jsonb),
    'acceptance', coalesce((
      select public.servsync_private_local_estimate_acceptance_metadata(acceptance)
        from public.local_estimate_delivery_acceptances acceptance
       where acceptance.delivery_link_id = p_link.id
    ), jsonb_build_object('state', 'not_accepted'))
  );
$$;

alter function public.servsync_private_local_estimate_delivery_metadata(public.local_estimate_delivery_links) owner to postgres;
revoke all on function public.servsync_private_local_estimate_delivery_metadata(public.local_estimate_delivery_links) from public, anon, authenticated, service_role;

do $$
declare
  v_name text;
  v_count integer;
begin
  foreach v_name in array array[
    'servsync_lookup_local_estimate_delivery_acceptance',
    'servsync_accept_local_estimate_delivery_session'
  ] loop
    select count(*)::integer into v_count
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public' and procedure.proname = v_name;
    if v_count <> 1 then raise exception 'Unexpected % overload count: %.', v_name, v_count; end if;
  end loop;
end;
$$;

comment on table public.local_estimate_delivery_acceptances is
  'Private immutable audit evidence for exact-snapshot Estimate acceptance through a secure guest recipient session.';
comment on function public.servsync_accept_local_estimate_delivery_session(text) is
  'Service-gateway-only exact-snapshot Estimate acceptance. Records secure guest acceptance without asserting verified identity or signature.';

notify pgrst, 'reload schema';

commit;
