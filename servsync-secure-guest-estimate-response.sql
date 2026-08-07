-- ServSync Secure Guest Estimate Response v1.
--
-- Adds exact-snapshot Request changes and Decline actions to the existing
-- request-free Estimate recipient session. Secure guest acceptance keeps its
-- established lifecycle semantics; all three outcomes are mutually exclusive.

begin;

do $$
begin
  if to_regclass('public.estimates') is null
     or to_regclass('public.estimate_line_items') is null
     or to_regclass('public.estimate_payment_schedule_items') is null
     or to_regclass('public.local_estimate_delivery_links') is null
     or to_regclass('public.local_estimate_delivery_sessions') is null
     or to_regclass('public.local_estimate_delivery_email_attempts') is null
     or to_regclass('public.local_estimate_delivery_acceptances') is null
     or to_regclass('public.notifications') is null
     or to_regprocedure('public.servsync_private_build_local_estimate_snapshot(uuid)') is null
     or to_regprocedure('public.servsync_private_consume_local_estimate_delivery_rate_limit(text,bytea,integer,numeric)') is null
     or to_regprocedure('public.servsync_append_workflow_activity_event(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)') is null
     or to_regprocedure('public._notif_contractor_user(uuid)') is null
     or to_regprocedure('public.servsync_accept_local_estimate_delivery_session(text)') is null then
    raise exception 'Required secure Estimate delivery, acceptance, notification, or activity foundation is missing.';
  end if;
end;
$$;

do $$
declare
  v_relation record;
  v_column_count integer;
begin
  if to_regclass('public.local_estimate_delivery_responses') is null then
    return;
  end if;

  select role.rolname as owner_name, relation.relrowsecurity, relation.relforcerowsecurity
    into v_relation
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_roles role on role.oid = relation.relowner
   where namespace.nspname = 'public' and relation.relname = 'local_estimate_delivery_responses';
  if v_relation.owner_name <> 'postgres'
     or not v_relation.relrowsecurity
     or not v_relation.relforcerowsecurity then
    raise exception 'Existing secure guest Estimate response relation has incompatible ownership or RLS.';
  end if;

  select count(*)::integer into v_column_count
    from pg_attribute attribute
   where attribute.attrelid = 'public.local_estimate_delivery_responses'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped;
  if v_column_count <> 13
     or not exists (select 1 from pg_attribute where attrelid = 'public.local_estimate_delivery_responses'::regclass and attname = 'id' and format_type(atttypid, atttypmod) = 'uuid' and attnotnull)
     or not exists (select 1 from pg_attribute where attrelid = 'public.local_estimate_delivery_responses'::regclass and attname = 'snapshot_hash' and format_type(atttypid, atttypmod) = 'bytea' and attnotnull)
     or not exists (select 1 from pg_attribute where attrelid = 'public.local_estimate_delivery_responses'::regclass and attname = 'response_type' and format_type(atttypid, atttypmod) = 'text' and attnotnull)
     or not exists (select 1 from pg_attribute where attrelid = 'public.local_estimate_delivery_responses'::regclass and attname = 'response_message' and format_type(atttypid, atttypmod) = 'text' and not attnotnull)
     or not exists (select 1 from pg_attribute where attrelid = 'public.local_estimate_delivery_responses'::regclass and attname = 'responded_at' and format_type(atttypid, atttypmod) = 'timestamp with time zone' and attnotnull) then
    raise exception 'Existing secure guest Estimate response relation has an incompatible column contract.';
  end if;

  if (select count(*) from pg_policy where polrelid = 'public.local_estimate_delivery_responses'::regclass) <> 0
     or has_table_privilege('anon', 'public.local_estimate_delivery_responses', 'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('authenticated', 'public.local_estimate_delivery_responses', 'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('service_role', 'public.local_estimate_delivery_responses', 'select,insert,update,delete,truncate,references,trigger') then
    raise exception 'Existing secure guest Estimate response relation has an incompatible security contract.';
  end if;
end;
$$;

create table if not exists public.local_estimate_delivery_responses (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  delivery_link_id uuid not null references public.local_estimate_delivery_links(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  snapshot_hash bytea not null,
  source_updated_at timestamptz not null,
  recipient_email text,
  response_type text not null,
  response_message text,
  response_channel text not null default 'secure_guest',
  responded_at timestamptz not null default clock_timestamp(),
  constraint local_estimate_delivery_responses_link_unique unique (delivery_link_id),
  constraint local_estimate_delivery_responses_snapshot_hash_check check (octet_length(snapshot_hash) = 32),
  constraint local_estimate_delivery_responses_recipient_email_check check (
    recipient_email is null
    or (recipient_email = lower(btrim(recipient_email)) and length(recipient_email) between 3 and 254)
  ),
  constraint local_estimate_delivery_responses_type_check check (response_type in ('request_changes', 'declined')),
  constraint local_estimate_delivery_responses_message_check check (
    (response_type = 'request_changes'
      and response_message = btrim(response_message)
      and char_length(response_message) between 3 and 1000)
    or
    (response_type = 'declined'
      and (response_message is null
        or (response_message = btrim(response_message) and char_length(response_message) between 1 and 1000)))
  ),
  constraint local_estimate_delivery_responses_channel_check check (response_channel = 'secure_guest')
);

alter table public.local_estimate_delivery_responses owner to postgres;
alter table public.local_estimate_delivery_responses enable row level security;
alter table public.local_estimate_delivery_responses force row level security;

create index if not exists local_estimate_delivery_responses_estimate_idx
  on public.local_estimate_delivery_responses(estimate_id, responded_at desc, id);
create index if not exists local_estimate_delivery_responses_contractor_idx
  on public.local_estimate_delivery_responses(contractor_id, responded_at desc, id);
create index if not exists local_estimate_delivery_responses_contact_idx
  on public.local_estimate_delivery_responses(local_contact_id, responded_at desc, id);
create index if not exists local_estimate_delivery_responses_home_idx
  on public.local_estimate_delivery_responses(local_home_id, responded_at desc, id);

revoke all on table public.local_estimate_delivery_responses from public, anon, authenticated, service_role;

create or replace function public.servsync_private_reject_local_estimate_response_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Secure guest Estimate response evidence is immutable.';
end;
$$;

alter function public.servsync_private_reject_local_estimate_response_update() owner to postgres;
revoke all on function public.servsync_private_reject_local_estimate_response_update() from public, anon, authenticated, service_role;

drop trigger if exists local_estimate_delivery_responses_immutable on public.local_estimate_delivery_responses;
create trigger local_estimate_delivery_responses_immutable
  before update on public.local_estimate_delivery_responses
  for each row execute function public.servsync_private_reject_local_estimate_response_update();

create or replace function public.servsync_private_local_estimate_response_metadata(
  p_response public.local_estimate_delivery_responses
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'state', case when p_response.response_type = 'request_changes' then 'changes_requested' else 'declined' end,
    'channel', p_response.response_channel,
    'responded_at', p_response.responded_at,
    'source_updated_at', p_response.source_updated_at,
    'recipient_email', p_response.recipient_email,
    'message', p_response.response_message
  );
$$;

alter function public.servsync_private_local_estimate_response_metadata(public.local_estimate_delivery_responses) owner to postgres;
revoke all on function public.servsync_private_local_estimate_response_metadata(public.local_estimate_delivery_responses) from public, anon, authenticated, service_role;

create or replace function public.servsync_private_local_estimate_recipient_response_state(
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
  v_response public.local_estimate_delivery_responses;
  v_estimate public.estimates;
  v_snapshot record;
begin
  select * into v_acceptance
    from public.local_estimate_delivery_acceptances acceptance
   where acceptance.delivery_link_id = p_link.id;
  if v_acceptance.id is not null then
    return jsonb_build_object('state', 'accepted', 'accepted_at', v_acceptance.accepted_at);
  end if;

  select * into v_response
    from public.local_estimate_delivery_responses response
   where response.delivery_link_id = p_link.id;
  if v_response.id is not null then
    return jsonb_build_object(
      'state', case when v_response.response_type = 'request_changes' then 'changes_requested' else 'declined' end,
      'responded_at', v_response.responded_at,
      'message', v_response.response_message
    );
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

alter function public.servsync_private_local_estimate_recipient_response_state(public.local_estimate_delivery_links) owner to postgres;
revoke all on function public.servsync_private_local_estimate_recipient_response_state(public.local_estimate_delivery_links) from public, anon, authenticated, service_role;

-- Keep the pre-response acceptance endpoint fail-closed during migration-first
-- rollout. Older source sees an ineligible Estimate once another outcome exists.
create or replace function public.servsync_private_local_estimate_recipient_acceptance_state(
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
  v_response public.local_estimate_delivery_responses;
  v_estimate public.estimates;
  v_snapshot record;
begin
  select * into v_acceptance
    from public.local_estimate_delivery_acceptances acceptance
   where acceptance.delivery_link_id = p_link.id;
  if v_acceptance.id is not null then
    return jsonb_build_object('state', 'accepted', 'accepted_at', v_acceptance.accepted_at);
  end if;

  select * into v_response
    from public.local_estimate_delivery_responses response
   where response.delivery_link_id = p_link.id;
  if v_response.id is not null then
    return jsonb_build_object('state', 'ineligible');
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

create or replace function public.servsync_lookup_local_estimate_delivery_response(p_session_digest text)
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

  return public.servsync_private_local_estimate_recipient_response_state(v_link)::text;
exception when others then
  return jsonb_build_object('state', 'error')::text;
end;
$$;

alter function public.servsync_lookup_local_estimate_delivery_response(text) owner to postgres;
revoke all on function public.servsync_lookup_local_estimate_delivery_response(text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_lookup_local_estimate_delivery_response(text) to service_role;

create or replace function public.servsync_respond_local_estimate_delivery_session(
  p_session_digest text,
  p_action text,
  p_message text default null
)
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
  v_response public.local_estimate_delivery_responses;
  v_snapshot record;
  v_session_hash bytea;
  v_recipient_email text;
  v_message text;
  v_now timestamptz := clock_timestamp();
begin
  if p_action not in ('request_changes', 'decline') then
    return jsonb_build_object('state', 'invalid')::text;
  end if;

  v_message := nullif(btrim(regexp_replace(coalesce(p_message, ''), E'\\r\\n?', E'\\n', 'g')), '');
  if p_action = 'request_changes' and (v_message is null or char_length(v_message) < 3 or char_length(v_message) > 1000) then
    return jsonb_build_object('state', 'invalid')::text;
  end if;
  if p_action = 'decline' and v_message is not null and char_length(v_message) > 1000 then
    return jsonb_build_object('state', 'invalid')::text;
  end if;

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

  select * into v_response from public.local_estimate_delivery_responses response
   where response.delivery_link_id = v_link.id;
  if v_response.id is not null then
    return jsonb_build_object(
      'state', case when v_response.response_type = 'request_changes' then 'changes_requested' else 'declined' end,
      'responded_at', v_response.responded_at,
      'message', v_response.response_message
    )::text;
  end if;

  if v_estimate.status <> 'sent' then
    return jsonb_build_object('state', 'ineligible')::text;
  end if;

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

  insert into public.local_estimate_delivery_responses (
    contractor_id,
    estimate_id,
    delivery_link_id,
    local_contact_id,
    local_home_id,
    snapshot_hash,
    source_updated_at,
    recipient_email,
    response_type,
    response_message,
    responded_at
  ) values (
    v_link.contractor_id,
    v_link.estimate_id,
    v_link.id,
    v_link.local_contact_id,
    v_link.local_home_id,
    extensions.digest(convert_to(v_link.document_snapshot::text, 'UTF8'), 'sha256'),
    v_link.source_updated_at,
    v_recipient_email,
    case when p_action = 'request_changes' then 'request_changes' else 'declined' end,
    v_message,
    v_now
  ) returning * into v_response;

  if p_action = 'decline' then
    update public.estimates estimate
       set status = 'declined'
     where estimate.id = v_estimate.id and estimate.status = 'sent';
    if not found then raise exception 'Estimate decline could not be completed.'; end if;

    perform public.servsync_append_workflow_activity_event(
      p_context_type => 'estimate',
      p_event_type => 'estimate_declined',
      p_service_request_id => v_estimate.service_request_id,
      p_inspection_id => v_estimate.inspection_id,
      p_estimate_id => v_estimate.id,
      p_actor_user_id => null,
      p_metadata => jsonb_build_object(
        'source_rpc', 'servsync_respond_local_estimate_delivery_session',
        'response_channel', 'secure_guest',
        'delivery_link_id', v_link.id,
        'response_id', v_response.id
      )
    );
  else
    update public.estimates estimate
       set status = 'draft'
     where estimate.id = v_estimate.id and estimate.status = 'sent';
    if not found then raise exception 'Estimate change request could not be completed.'; end if;

    begin
      insert into public.notifications (user_id, type, title, body, estimate_id)
      values (
        public._notif_contractor_user(v_link.contractor_id),
        'estimate_changes_requested',
        'Estimate changes requested',
        coalesce(nullif(btrim(v_estimate.title), ''), 'A Customer requested changes to an Estimate.'),
        v_estimate.id
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'state', case when v_response.response_type = 'request_changes' then 'changes_requested' else 'declined' end,
    'responded_at', v_response.responded_at,
    'message', v_response.response_message
  )::text;
exception
  when unique_violation then
    select * into v_acceptance from public.local_estimate_delivery_acceptances acceptance
     where acceptance.delivery_link_id = v_link.id;
    if v_acceptance.id is not null then
      return jsonb_build_object('state', 'accepted', 'accepted_at', v_acceptance.accepted_at)::text;
    end if;
    select * into v_response from public.local_estimate_delivery_responses response
     where response.delivery_link_id = v_link.id;
    if v_response.id is not null then
      return jsonb_build_object(
        'state', case when v_response.response_type = 'request_changes' then 'changes_requested' else 'declined' end,
        'responded_at', v_response.responded_at,
        'message', v_response.response_message
      )::text;
    end if;
    return jsonb_build_object('state', 'ineligible')::text;
  when others then
    return jsonb_build_object('state', 'error')::text;
end;
$$;

alter function public.servsync_respond_local_estimate_delivery_session(text, text, text) owner to postgres;
revoke all on function public.servsync_respond_local_estimate_delivery_session(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_respond_local_estimate_delivery_session(text, text, text) to service_role;

-- Preserve acceptance semantics while making Accept mutually exclusive with the
-- new response outcomes under the same Estimate advisory lock.
create or replace function public.servsync_accept_local_estimate_delivery_session(p_session_digest text)
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
  v_response public.local_estimate_delivery_responses;
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

  select * into v_response from public.local_estimate_delivery_responses response
   where response.delivery_link_id = v_link.id;
  if v_response.id is not null then
    return jsonb_build_object('state', 'ineligible')::text;
  end if;

  if v_estimate.status <> 'sent' then
    return jsonb_build_object('state', 'ineligible')::text;
  end if;

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
    contractor_id, estimate_id, delivery_link_id, local_contact_id, local_home_id,
    snapshot_hash, source_updated_at, recipient_email, accepted_at
  ) values (
    v_link.contractor_id, v_link.estimate_id, v_link.id, v_link.local_contact_id, v_link.local_home_id,
    extensions.digest(convert_to(v_link.document_snapshot::text, 'UTF8'), 'sha256'),
    v_link.source_updated_at, v_recipient_email, v_now
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
    ), jsonb_build_object('state', 'not_accepted')),
    'response', coalesce((
      select public.servsync_private_local_estimate_acceptance_metadata(acceptance)
        from public.local_estimate_delivery_acceptances acceptance
       where acceptance.delivery_link_id = p_link.id
    ), (
      select public.servsync_private_local_estimate_response_metadata(response)
        from public.local_estimate_delivery_responses response
       where response.delivery_link_id = p_link.id
    ), jsonb_build_object('state', 'no_response'))
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
    'servsync_lookup_local_estimate_delivery_response',
    'servsync_respond_local_estimate_delivery_session',
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

comment on table public.local_estimate_delivery_responses is
  'Private immutable audit evidence for exact-snapshot change requests and declines through a secure guest Estimate session.';
comment on function public.servsync_respond_local_estimate_delivery_session(text, text, text) is
  'Service-gateway-only exact-snapshot Estimate change request or decline. Records secure guest response without asserting verified identity or signature.';

notify pgrst, 'reload schema';

commit;
