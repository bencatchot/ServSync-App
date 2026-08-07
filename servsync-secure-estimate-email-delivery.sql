-- ServSync Secure Estimate Email Delivery v1.
--
-- Extends the existing request-free local Estimate boundary with server-mediated
-- email delivery. Every send rotates to a fresh immutable snapshot so older
-- links and recipient sessions stop working. Raw bearers are returned only by
-- the preparation RPC and are never stored in delivery history.

begin;

do $$
begin
  if to_regclass('public.local_estimate_delivery_links') is null
     or to_regclass('public.local_estimate_delivery_sessions') is null
     or to_regprocedure('public.servsync_private_can_manage_local_estimate_delivery(uuid)') is null
     or to_regprocedure('public.servsync_private_current_local_estimate_delivery_contractor_id()') is null
     or to_regprocedure('public.servsync_private_build_local_estimate_snapshot(uuid)') is null
     or to_regprocedure('public.servsync_private_local_estimate_delivery_metadata(public.local_estimate_delivery_links)') is null then
    raise exception 'Request-free local Estimate delivery foundation is missing.';
  end if;
end;
$$;

create table public.local_estimate_delivery_email_attempts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  delivery_link_id uuid not null references public.local_estimate_delivery_links(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'prepared' check (status in ('prepared', 'sent', 'failed')),
  attempted_by uuid not null references public.profiles(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  failure_code text check (
    failure_code is null
    or failure_code in ('provider_rejected', 'provider_rate_limited', 'provider_unavailable')
  ),
  constraint local_estimate_delivery_email_recipient_check check (
    recipient_email = lower(btrim(recipient_email))
    and length(recipient_email) between 3 and 254
    and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint local_estimate_delivery_email_result_check check (
    (status = 'prepared' and sent_at is null and failed_at is null and provider_message_id is null and failure_code is null)
    or (status = 'sent' and sent_at is not null and failed_at is null and failure_code is null)
    or (status = 'failed' and sent_at is null and failed_at is not null and provider_message_id is null and failure_code is not null)
  ),
  constraint local_estimate_delivery_email_provider_id_check check (
    provider_message_id is null
    or (length(provider_message_id) between 1 and 128 and provider_message_id ~ '^[A-Za-z0-9._:-]+$')
  )
);

alter table public.local_estimate_delivery_email_attempts owner to postgres;
alter table public.local_estimate_delivery_email_attempts enable row level security;
alter table public.local_estimate_delivery_email_attempts force row level security;
create index local_estimate_delivery_email_estimate_idx
  on public.local_estimate_delivery_email_attempts(contractor_id, estimate_id, attempted_at desc, id);
create index local_estimate_delivery_email_link_idx
  on public.local_estimate_delivery_email_attempts(delivery_link_id, attempted_at desc, id);
create index local_estimate_delivery_email_rate_idx
  on public.local_estimate_delivery_email_attempts(contractor_id, attempted_at desc);
revoke all on table public.local_estimate_delivery_email_attempts from public, anon, authenticated, service_role;

create function public.servsync_private_validate_local_estimate_email_attempt()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_link public.local_estimate_delivery_links;
begin
  if tg_op = 'UPDATE' then
    if new.contractor_id is distinct from old.contractor_id
       or new.estimate_id is distinct from old.estimate_id
       or new.delivery_link_id is distinct from old.delivery_link_id
       or new.local_contact_id is distinct from old.local_contact_id
       or new.local_home_id is distinct from old.local_home_id
       or new.recipient_email is distinct from old.recipient_email
       or new.attempted_by is distinct from old.attempted_by
       or new.attempted_at is distinct from old.attempted_at then
      raise exception 'Estimate email delivery identity is immutable.';
    end if;
    if old.status <> 'prepared' and new is distinct from old then
      raise exception 'Completed Estimate email delivery results are immutable.';
    end if;
  end if;

  select * into v_link
    from public.local_estimate_delivery_links link
   where link.id = new.delivery_link_id;
  if v_link.id is null
     or v_link.contractor_id is distinct from new.contractor_id
     or v_link.estimate_id is distinct from new.estimate_id
     or v_link.local_contact_id is distinct from new.local_contact_id
     or v_link.local_home_id is distinct from new.local_home_id then
    raise exception 'Estimate email delivery binding is invalid.';
  end if;
  return new;
end;
$$;

alter function public.servsync_private_validate_local_estimate_email_attempt() owner to postgres;
revoke all on function public.servsync_private_validate_local_estimate_email_attempt() from public, anon, authenticated, service_role;
create trigger local_estimate_delivery_email_attempts_validate
  before insert or update on public.local_estimate_delivery_email_attempts
  for each row execute function public.servsync_private_validate_local_estimate_email_attempt();

create function public.servsync_private_local_estimate_email_attempt_metadata(
  p_attempt public.local_estimate_delivery_email_attempts
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', p_attempt.id,
    'delivery_link_id', p_attempt.delivery_link_id,
    'recipient_email', p_attempt.recipient_email,
    'status', case when p_attempt.status = 'prepared' then 'sending' else p_attempt.status end,
    'attempted_at', p_attempt.attempted_at,
    'sent_at', p_attempt.sent_at,
    'failed_at', p_attempt.failed_at,
    'failure_code', p_attempt.failure_code,
    'attempted_by_name', coalesce((
      select nullif(trim(profile.full_name), '')
        from public.profiles profile
       where profile.id = p_attempt.attempted_by
    ), '')
  );
$$;

alter function public.servsync_private_local_estimate_email_attempt_metadata(public.local_estimate_delivery_email_attempts) owner to postgres;
revoke all on function public.servsync_private_local_estimate_email_attempt_metadata(public.local_estimate_delivery_email_attempts) from public, anon, authenticated, service_role;

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
    ), '[]'::jsonb)
  );
$$;

alter function public.servsync_private_local_estimate_delivery_metadata(public.local_estimate_delivery_links) owner to postgres;
revoke all on function public.servsync_private_local_estimate_delivery_metadata(public.local_estimate_delivery_links) from public, anon, authenticated, service_role;

create function public.servsync_prepare_local_estimate_email_delivery(
  p_estimate_id uuid,
  p_recipient_email text,
  p_expires_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_contractor public.contractor_profiles;
  v_estimate public.estimates;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_active_link public.local_estimate_delivery_links;
  v_new_link public.local_estimate_delivery_links;
  v_attempt public.local_estimate_delivery_email_attempts;
  v_snapshot record;
  v_recipient_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_token text;
  v_daily_attempts integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_estimate_id is null then raise exception 'Estimate delivery is unavailable.'; end if;
  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then
    raise exception 'Link expiration must be between 1 and 90 days.';
  end if;
  if length(v_recipient_email) < 3
     or length(v_recipient_email) > 254
     or v_recipient_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid recipient email is required.';
  end if;

  v_contractor_id := public.servsync_private_current_local_estimate_delivery_contractor_id();
  if v_contractor_id is null then raise exception 'Estimate email delivery is unavailable.'; end if;

  select * into v_contractor
    from public.contractor_profiles contractor
   where contractor.id = v_contractor_id
     and contractor.account_status = 'active';
  select * into v_estimate
    from public.estimates estimate
   where estimate.id = p_estimate_id
     and estimate.contractor_id = v_contractor_id
   for update;
  if v_estimate.id is null or v_estimate.local_contact_id is null or v_estimate.local_home_id is null then
    raise exception 'Estimate email delivery is unavailable.';
  end if;

  select * into v_contact
    from public.contractor_local_contacts contact
   where contact.id = v_estimate.local_contact_id
     and contact.contractor_id = v_contractor_id
   for update;
  select * into v_home
    from public.contractor_local_homes home
   where home.id = v_estimate.local_home_id
     and home.contractor_id = v_contractor_id
     and home.local_contact_id = v_estimate.local_contact_id
   for update;

  if v_contractor.id is null or v_contact.id is null or v_home.id is null
     or v_estimate.homeowner_user_id is not null
     or v_contact.homeowner_user_id is not null
     or v_contact.claimed_at is not null
     or v_contact.archived_at is not null
     or v_home.home_id is not null
     or v_home.claimed_at is not null
     or v_home.archived_at is not null
     or v_estimate.status not in ('draft', 'sent', 'revised') then
    raise exception 'Estimate email delivery is unavailable.';
  end if;

  if exists (
    select 1
      from public.local_estimate_delivery_email_attempts attempt
     where attempt.contractor_id = v_contractor_id
       and attempt.estimate_id = v_estimate.id
       and attempt.attempted_at > now() - interval '1 minute'
  ) then
    raise exception 'Please wait before sending this Estimate again.';
  end if;

  select count(*)::integer into v_daily_attempts
    from public.local_estimate_delivery_email_attempts attempt
   where attempt.contractor_id = v_contractor_id
     and attempt.attempted_at > now() - interval '1 day';
  if v_daily_attempts >= 100 then
    raise exception 'The daily Estimate email limit has been reached.';
  end if;

  select * into v_active_link
    from public.local_estimate_delivery_links link
   where link.estimate_id = v_estimate.id
     and link.contractor_id = v_contractor_id
     and link.status = 'active'
   for update;

  if v_estimate.status in ('draft', 'revised') then
    update public.estimates
       set status = 'sent', updated_at = now()
     where id = v_estimate.id
    returning * into v_estimate;
  end if;

  select * into v_snapshot
    from public.servsync_private_build_local_estimate_snapshot(v_estimate.id);
  if v_snapshot.document_snapshot is null then
    raise exception 'Estimate snapshot is unavailable (%).', coalesce(v_snapshot.failure_reason, 'unknown');
  end if;

  if v_active_link.id is not null then
    update public.local_estimate_delivery_links
       set status = 'revoked',
           revoked_by = auth.uid(),
           revoked_at = now(),
           revocation_reason = case when v_active_link.expires_at <= now() then 'expired' else 'replaced' end
     where id = v_active_link.id;
  end if;

  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));
  insert into public.local_estimate_delivery_links (
    contractor_id,
    estimate_id,
    local_contact_id,
    local_home_id,
    token_hash,
    document_snapshot,
    source_updated_at,
    expires_at,
    created_by,
    rotated_from_id
  ) values (
    v_contractor_id,
    v_estimate.id,
    v_contact.id,
    v_home.id,
    extensions.digest(v_token, 'sha256'),
    v_snapshot.document_snapshot,
    v_snapshot.source_updated_at,
    now() + make_interval(days => p_expires_days),
    auth.uid(),
    v_active_link.id
  ) returning * into v_new_link;

  insert into public.local_estimate_delivery_email_attempts (
    contractor_id,
    estimate_id,
    delivery_link_id,
    local_contact_id,
    local_home_id,
    recipient_email,
    attempted_by
  ) values (
    v_contractor_id,
    v_estimate.id,
    v_new_link.id,
    v_contact.id,
    v_home.id,
    v_recipient_email,
    auth.uid()
  ) returning * into v_attempt;

  return jsonb_build_object(
    'token', v_token,
    'attempt_id', v_attempt.id,
    'delivery_link_id', v_new_link.id,
    'recipient_email', v_recipient_email,
    'expires_at', v_new_link.expires_at,
    'contractor_business_name', coalesce(nullif(trim(v_contractor.business_name), ''), 'Your contractor'),
    'customer_display_name', coalesce(nullif(trim(v_contact.display_name), ''), 'Customer'),
    'estimate_title', coalesce(nullif(trim(v_estimate.title), ''), 'Estimate'),
    'estimate_total_cents', v_estimate.total_cents
  );
end;
$$;

alter function public.servsync_prepare_local_estimate_email_delivery(uuid, text, integer) owner to postgres;
revoke all on function public.servsync_prepare_local_estimate_email_delivery(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.servsync_prepare_local_estimate_email_delivery(uuid, text, integer) to authenticated;

create function public.servsync_record_local_estimate_email_delivery_result(
  p_attempt_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.local_estimate_delivery_email_attempts;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_provider_message_id text := nullif(btrim(coalesce(p_provider_message_id, '')), '');
  v_failure_code text := nullif(lower(btrim(coalesce(p_failure_code, ''))), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Estimate email delivery result recording is unavailable.';
  end if;
  if v_status not in ('sent', 'failed') then raise exception 'Estimate email delivery result is invalid.'; end if;
  if v_provider_message_id is not null
     and (length(v_provider_message_id) > 128 or v_provider_message_id !~ '^[A-Za-z0-9._:-]+$') then
    raise exception 'Estimate email provider result is invalid.';
  end if;
  if v_status = 'sent' and v_failure_code is not null then raise exception 'Estimate email delivery result is invalid.'; end if;
  if v_status = 'failed' and v_failure_code not in ('provider_rejected', 'provider_rate_limited', 'provider_unavailable') then
    raise exception 'Estimate email delivery result is invalid.';
  end if;

  select * into v_attempt
    from public.local_estimate_delivery_email_attempts attempt
   where attempt.id = p_attempt_id
   for update;
  if v_attempt.id is null then raise exception 'Estimate email delivery result is unavailable.'; end if;

  if v_attempt.status <> 'prepared' then
    if v_attempt.status = v_status then
      return public.servsync_private_local_estimate_email_attempt_metadata(v_attempt);
    end if;
    raise exception 'Estimate email delivery result is already final.';
  end if;

  update public.local_estimate_delivery_email_attempts
     set status = v_status,
         sent_at = case when v_status = 'sent' then now() else null end,
         failed_at = case when v_status = 'failed' then now() else null end,
         provider_message_id = case when v_status = 'sent' then v_provider_message_id else null end,
         failure_code = case when v_status = 'failed' then v_failure_code else null end
   where id = v_attempt.id
  returning * into v_attempt;

  return public.servsync_private_local_estimate_email_attempt_metadata(v_attempt);
end;
$$;

alter function public.servsync_record_local_estimate_email_delivery_result(uuid, text, text, text) owner to postgres;
revoke all on function public.servsync_record_local_estimate_email_delivery_result(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.servsync_record_local_estimate_email_delivery_result(uuid, text, text, text) to service_role;

do $$
declare
  v_name text;
  v_count integer;
begin
  foreach v_name in array array[
    'servsync_private_validate_local_estimate_email_attempt',
    'servsync_private_local_estimate_email_attempt_metadata',
    'servsync_prepare_local_estimate_email_delivery',
    'servsync_record_local_estimate_email_delivery_result'
  ] loop
    select count(*)::integer into v_count
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.proname = v_name;
    if v_count <> 1 then raise exception 'Unexpected % overload count: %.', v_name, v_count; end if;
  end loop;
end;
$$;

comment on table public.local_estimate_delivery_email_attempts is
  'Private sanitized send-attempt history for request-free local Estimate delivery. Raw bearer tokens and provider payloads are never stored.';
comment on function public.servsync_prepare_local_estimate_email_delivery(uuid, text, integer) is
  'Owner/Admin/Office preparation boundary. Derives tenant context, rotates the secure snapshot, rate-limits sends, and returns one bearer only to the authenticated server caller.';
comment on function public.servsync_record_local_estimate_email_delivery_result(uuid, text, text, text) is
  'Service-role-only terminal result recorder for sanitized Estimate email delivery outcomes.';

notify pgrst, 'reload schema';

commit;
