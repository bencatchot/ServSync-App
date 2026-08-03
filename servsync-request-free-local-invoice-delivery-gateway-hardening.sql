-- ServSync FB-003B request-free local invoice delivery gateway hardening.
--
-- Run after servsync-request-free-local-invoice-delivery.sql. This additive
-- correction moves public lookup behind the same-origin service gateway,
-- adds database defense-in-depth rate buckets, bounds the exact serialized
-- public response, and leaves the original installed migration unchanged.

begin;

do $$
declare
  v_lookup_count integer;
  v_expected_count integer;
begin
  select count(*)::integer,
         count(*) filter (where procedure.oid = 'public.servsync_lookup_local_invoice_delivery(text)'::regprocedure)::integer
    into v_lookup_count, v_expected_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_lookup_local_invoice_delivery';

  if v_lookup_count <> 1 or v_expected_count <> 1 then
    raise exception 'Expected exactly one servsync_lookup_local_invoice_delivery(text) function.';
  end if;
end;
$$;

revoke all on function public.servsync_lookup_local_invoice_delivery(text) from public;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from anon;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from authenticated;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from service_role;

create table public.local_invoice_delivery_rate_buckets (
  scope text not null,
  key_hash bytea not null,
  capacity integer not null,
  refill_per_second numeric(20, 10) not null,
  tokens numeric(20, 10) not null,
  updated_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (scope, key_hash),
  constraint local_invoice_delivery_rate_buckets_scope_check
    check (scope in ('global', 'token')),
  constraint local_invoice_delivery_rate_buckets_key_hash_check
    check (octet_length(key_hash) = 32),
  constraint local_invoice_delivery_rate_buckets_capacity_check
    check (capacity > 0 and capacity <= 10000),
  constraint local_invoice_delivery_rate_buckets_refill_check
    check (refill_per_second > 0 and refill_per_second <= capacity),
  constraint local_invoice_delivery_rate_buckets_tokens_check
    check (tokens >= 0 and tokens <= capacity),
  constraint local_invoice_delivery_rate_buckets_timestamps_check
    check (last_seen_at >= updated_at)
);

alter table public.local_invoice_delivery_rate_buckets owner to postgres;
alter table public.local_invoice_delivery_rate_buckets enable row level security;

create index local_invoice_delivery_rate_buckets_idle_cleanup_idx
  on public.local_invoice_delivery_rate_buckets(last_seen_at, key_hash)
  where scope = 'token';

revoke all on table public.local_invoice_delivery_rate_buckets from public;
revoke all on table public.local_invoice_delivery_rate_buckets from anon;
revoke all on table public.local_invoice_delivery_rate_buckets from authenticated;
revoke all on table public.local_invoice_delivery_rate_buckets from service_role;

create or replace function public.servsync_private_consume_local_invoice_delivery_rate_limit(
  p_scope text,
  p_key_hash bytea,
  p_capacity integer,
  p_refill_per_second numeric
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
  if p_scope not in ('global', 'token')
     or p_key_hash is null
     or octet_length(p_key_hash) <> 32
     or p_capacity is null
     or p_capacity <= 0
     or p_capacity > 10000
     or p_refill_per_second is null
     or p_refill_per_second <= 0
     or p_refill_per_second > p_capacity then
    return false;
  end if;

  insert into public.local_invoice_delivery_rate_buckets as bucket (
    scope,
    key_hash,
    capacity,
    refill_per_second,
    tokens,
    updated_at,
    last_seen_at
  ) values (
    p_scope,
    p_key_hash,
    p_capacity,
    p_refill_per_second,
    p_capacity - 1,
    v_now,
    v_now
  )
  on conflict (scope, key_hash) do update
    set capacity = excluded.capacity,
        refill_per_second = excluded.refill_per_second,
        tokens = least(
          excluded.capacity::numeric,
          bucket.tokens
            + greatest(extract(epoch from (v_now - bucket.updated_at)), 0)::numeric
              * excluded.refill_per_second
        ) - 1,
        updated_at = v_now,
        last_seen_at = v_now
    where least(
      excluded.capacity::numeric,
      bucket.tokens
        + greatest(extract(epoch from (v_now - bucket.updated_at)), 0)::numeric
          * excluded.refill_per_second
    ) >= 1
  returning true into v_allowed;

  return coalesce(v_allowed, false);
exception
  when others then
    return false;
end;
$$;

alter function public.servsync_private_consume_local_invoice_delivery_rate_limit(text, bytea, integer, numeric) owner to postgres;
revoke all on function public.servsync_private_consume_local_invoice_delivery_rate_limit(text, bytea, integer, numeric) from public;
revoke all on function public.servsync_private_consume_local_invoice_delivery_rate_limit(text, bytea, integer, numeric) from anon;
revoke all on function public.servsync_private_consume_local_invoice_delivery_rate_limit(text, bytea, integer, numeric) from authenticated;
revoke all on function public.servsync_private_consume_local_invoice_delivery_rate_limit(text, bytea, integer, numeric) from service_role;

create or replace function public.servsync_private_cleanup_local_invoice_delivery_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  with stale as (
    select bucket.ctid
      from public.local_invoice_delivery_rate_buckets bucket
     where bucket.scope = 'token'
       and bucket.last_seen_at < clock_timestamp() - interval '24 hours'
     order by bucket.last_seen_at, bucket.key_hash
     limit 25
  )
  delete from public.local_invoice_delivery_rate_buckets bucket
   using stale
   where bucket.ctid = stale.ctid;

  get diagnostics v_deleted = row_count;
  return v_deleted;
exception
  when others then
    return 0;
end;
$$;

alter function public.servsync_private_cleanup_local_invoice_delivery_rate_limits() owner to postgres;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_rate_limits() from public;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_rate_limits() from anon;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_rate_limits() from authenticated;
revoke all on function public.servsync_private_cleanup_local_invoice_delivery_rate_limits() from service_role;

create or replace function public.servsync_private_render_local_invoice_delivery(
  p_invoice_id uuid,
  p_status_override text,
  p_issued_at_override timestamptz
)
returns table (
  serialized_payload text,
  failure_reason text,
  public_line_count integer,
  serialized_bytes integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_contractor public.contractor_profiles;
  v_lines jsonb;
  v_payload jsonb;
begin
  select * into v_invoice
    from public.invoices
   where id = p_invoice_id;

  if v_invoice.id is null then
    failure_reason := 'unavailable';
    return next;
    return;
  end if;

  select * into v_contact
    from public.contractor_local_contacts
   where id = v_invoice.local_contact_id
     and contractor_id = v_invoice.contractor_id;

  select * into v_home
    from public.contractor_local_homes
   where id = v_invoice.local_home_id
     and contractor_id = v_invoice.contractor_id
     and local_contact_id = v_invoice.local_contact_id;

  select * into v_contractor
    from public.contractor_profiles
   where id = v_invoice.contractor_id;

  if v_contact.id is null or v_home.id is null or v_contractor.id is null then
    failure_reason := 'unavailable';
    return next;
    return;
  end if;

  select count(*)::integer
    into public_line_count
    from (
      select 1
        from public.invoice_line_items line
       where line.invoice_id = v_invoice.id
       limit 101
    ) bounded_lines;

  if public_line_count = 0 then
    failure_reason := 'no_lines';
    return next;
    return;
  end if;

  if public_line_count > 100 then
    failure_reason := 'line_limit';
    return next;
    return;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'title', coalesce(nullif(trim(line.line_title), ''), nullif(trim(line.description), ''), 'Invoice item'),
      'description', coalesce(nullif(trim(line.customer_description), ''), ''),
      'quantity', line.quantity,
      'unit', line.unit,
      'unit_price_cents', line.unit_price_cents
    ) order by line.sort_order, line.id
  )
    into v_lines
    from public.invoice_line_items line
   where line.invoice_id = v_invoice.id;

  v_payload := jsonb_build_object(
    'state', 'valid',
    'invoice', jsonb_build_object(
      'contractor', jsonb_build_object(
        'business_name', v_contractor.business_name
      ),
      'customer', jsonb_build_object(
        'display_name', v_contact.display_name
      ),
      'property', jsonb_build_object(
        'address_line1', v_home.address_line1,
        'address_line2', v_home.address_line2,
        'city', v_home.city,
        'state', v_home.state,
        'zip_code', v_home.zip_code
      ),
      'invoice_number', v_invoice.invoice_number,
      'title', v_invoice.title,
      'scope', v_invoice.scope,
      'notes', v_invoice.notes,
      'terms', v_invoice.terms,
      'status', coalesce(p_status_override, v_invoice.status),
      'subtotal_cents', v_invoice.subtotal_cents,
      'tax_cents', v_invoice.tax_cents,
      'discount_cents', v_invoice.discount_cents,
      'total_cents', v_invoice.total_cents,
      'amount_paid_cents', v_invoice.amount_paid_cents,
      'issued_at', coalesce(p_issued_at_override, v_invoice.issued_at),
      'due_at', v_invoice.due_at,
      'line_items', v_lines
    )
  );

  serialized_payload := v_payload::text;
  serialized_bytes := octet_length(convert_to(serialized_payload, 'UTF8'));

  if serialized_bytes > 262144 then
    serialized_payload := null;
    failure_reason := 'response_limit';
  end if;

  return next;
end;
$$;

alter function public.servsync_private_render_local_invoice_delivery(uuid, text, timestamptz) owner to postgres;
revoke all on function public.servsync_private_render_local_invoice_delivery(uuid, text, timestamptz) from public;
revoke all on function public.servsync_private_render_local_invoice_delivery(uuid, text, timestamptz) from anon;
revoke all on function public.servsync_private_render_local_invoice_delivery(uuid, text, timestamptz) from authenticated;
revoke all on function public.servsync_private_render_local_invoice_delivery(uuid, text, timestamptz) from service_role;

create or replace function public.servsync_create_local_invoice_delivery_link(
  p_invoice_id uuid,
  p_expires_days int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_link public.local_invoice_delivery_links;
  v_render record;
  v_authorized_contractor_id uuid;
  v_contractor_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_effective_issued_at timestamptz;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then
    raise exception 'Link expiration must be between 1 and 90 days.';
  end if;

  v_authorized_contractor_id := public.servsync_private_current_local_invoice_delivery_contractor_id();
  if v_authorized_contractor_id is null then
    raise exception 'Invoice is not eligible for local delivery.';
  end if;

  select invoice.contractor_id, invoice.local_contact_id, invoice.local_home_id
    into v_contractor_id, v_local_contact_id, v_local_home_id
    from public.invoices invoice
   where invoice.id = p_invoice_id
     and invoice.contractor_id = v_authorized_contractor_id;

  if v_contractor_id is null or v_local_contact_id is null or v_local_home_id is null then
    raise exception 'Invoice is not eligible for local delivery.';
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
   where id = p_invoice_id and contractor_id = v_authorized_contractor_id
   for update;

  if v_contact.id is null
     or v_home.id is null
     or v_invoice.id is null
     or v_invoice.contractor_id is distinct from v_contractor_id
     or v_invoice.local_contact_id is distinct from v_local_contact_id
     or v_invoice.local_home_id is distinct from v_local_home_id
     or v_invoice.homeowner_user_id is not null
     or v_contact.homeowner_user_id is not null
     or v_contact.claimed_at is not null
     or v_home.home_id is not null
     or v_home.claimed_at is not null then
    raise exception 'Invoice is not eligible for local delivery.';
  end if;

  if v_invoice.status not in ('draft', 'sent', 'viewed', 'paid', 'partially_paid', 'overdue') then
    raise exception 'Invoice is not eligible for local delivery.';
  end if;

  v_effective_issued_at := case
    when v_invoice.status = 'draft' then coalesce(v_invoice.issued_at, clock_timestamp())
    else v_invoice.issued_at
  end;

  select * into v_render
    from public.servsync_private_render_local_invoice_delivery(
      v_invoice.id,
      case when v_invoice.status = 'draft' then 'sent' else v_invoice.status end,
      v_effective_issued_at
    );

  if v_render.failure_reason = 'no_lines' then
    raise exception 'Add at least one invoice line before creating a delivery link.';
  end if;
  if v_render.failure_reason in ('line_limit', 'response_limit') then
    raise exception 'Invoice exceeds secure delivery limits. Reduce it to 100 items and 262,144 bytes before creating a link.';
  end if;
  if v_render.serialized_payload is null then
    raise exception 'Invoice is not eligible for local delivery.';
  end if;

  update public.local_invoice_delivery_links link
     set status = 'revoked',
         revoked_by = auth.uid(),
         revoked_at = now(),
         revocation_reason = 'expired'
   where link.invoice_id = v_invoice.id
     and link.status = 'active'
     and link.expires_at <= now();

  if exists (
    select 1 from public.local_invoice_delivery_links link
     where link.invoice_id = v_invoice.id and link.status = 'active'
  ) then
    raise exception 'An active delivery link already exists. Rotate it to receive a new copy.';
  end if;

  if v_invoice.status = 'draft' then
    update public.invoices
       set status = 'sent',
           issued_at = v_effective_issued_at,
           updated_at = now()
     where id = v_invoice.id
     returning * into v_invoice;

    update public.job_work_items item
       set billing_status = 'invoiced',
           reserved_invoice_id = null,
           invoiced_invoice_id = v_invoice.id,
           updated_at = now()
      from public.invoice_line_items line
     where line.invoice_id = v_invoice.id
       and line.job_work_item_id = item.id
       and item.billing_status = 'drafted'
       and item.reserved_invoice_id = v_invoice.id;
  end if;

  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));

  insert into public.local_invoice_delivery_links (
    contractor_id, invoice_id, local_contact_id, local_home_id, token_hash, expires_at, created_by
  ) values (
    v_invoice.contractor_id,
    v_invoice.id,
    v_invoice.local_contact_id,
    v_invoice.local_home_id,
    extensions.digest(v_token, 'sha256'),
    now() + make_interval(days => p_expires_days),
    auth.uid()
  )
  returning * into v_link;

  return jsonb_build_object(
    'link', public.servsync_private_local_invoice_delivery_metadata(v_link),
    'token', v_token
  );
end;
$$;

alter function public.servsync_create_local_invoice_delivery_link(uuid, int) owner to postgres;
revoke all on function public.servsync_create_local_invoice_delivery_link(uuid, int) from public;
revoke all on function public.servsync_create_local_invoice_delivery_link(uuid, int) from anon;
revoke all on function public.servsync_create_local_invoice_delivery_link(uuid, int) from authenticated;
grant execute on function public.servsync_create_local_invoice_delivery_link(uuid, int) to authenticated;

create or replace function public.servsync_rotate_local_invoice_delivery_link(
  p_link_id uuid,
  p_expires_days int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_link public.local_invoice_delivery_links;
  v_new_link public.local_invoice_delivery_links;
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_render record;
  v_authorized_contractor_id uuid;
  v_contractor_id uuid;
  v_invoice_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then
    raise exception 'Link expiration must be between 1 and 90 days.';
  end if;

  v_authorized_contractor_id := public.servsync_private_current_local_invoice_delivery_contractor_id();
  if v_authorized_contractor_id is null then
    raise exception 'Invoice delivery link is unavailable.';
  end if;

  select link.contractor_id, link.invoice_id, link.local_contact_id, link.local_home_id
    into v_contractor_id, v_invoice_id, v_local_contact_id, v_local_home_id
    from public.local_invoice_delivery_links link
   where link.id = p_link_id and link.contractor_id = v_authorized_contractor_id;

  if v_contractor_id is null then
    raise exception 'Invoice delivery link is unavailable.';
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
   where id = v_invoice_id and contractor_id = v_authorized_contractor_id
   for update;

  select * into v_old_link
    from public.local_invoice_delivery_links
   where id = p_link_id and contractor_id = v_authorized_contractor_id
   for update;

  if v_contact.id is null
     or v_home.id is null
     or v_invoice.id is null
     or v_old_link.id is null
     or v_old_link.contractor_id is distinct from v_contractor_id
     or v_old_link.invoice_id is distinct from v_invoice_id
     or v_old_link.local_contact_id is distinct from v_local_contact_id
     or v_old_link.local_home_id is distinct from v_local_home_id
     or v_invoice.contractor_id is distinct from v_contractor_id
     or v_invoice.homeowner_user_id is not null
     or v_invoice.local_contact_id is distinct from v_local_contact_id
     or v_invoice.local_home_id is distinct from v_local_home_id
     or v_contact.homeowner_user_id is not null
     or v_contact.claimed_at is not null
     or v_home.home_id is not null
     or v_home.claimed_at is not null
     or v_invoice.status not in ('sent', 'viewed', 'paid', 'partially_paid', 'overdue') then
    raise exception 'Invoice delivery link is unavailable.';
  end if;

  if v_old_link.status <> 'active' or v_old_link.expires_at <= now() then
    raise exception 'Only the current active delivery link can be rotated.';
  end if;

  select * into v_render
    from public.servsync_private_render_local_invoice_delivery(v_invoice.id, v_invoice.status, v_invoice.issued_at);

  if v_render.failure_reason = 'no_lines' then
    raise exception 'Invoice delivery link is unavailable.';
  end if;
  if v_render.failure_reason in ('line_limit', 'response_limit') then
    raise exception 'Invoice exceeds secure delivery limits. Reduce it to 100 items and 262,144 bytes before rotating the link.';
  end if;
  if v_render.serialized_payload is null then
    raise exception 'Invoice delivery link is unavailable.';
  end if;

  update public.local_invoice_delivery_links
     set status = 'revoked',
         revoked_by = auth.uid(),
         revoked_at = now(),
         revocation_reason = 'replaced'
   where id = v_old_link.id;

  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));

  insert into public.local_invoice_delivery_links (
    contractor_id, invoice_id, local_contact_id, local_home_id, token_hash,
    expires_at, created_by, rotated_from_id
  ) values (
    v_invoice.contractor_id,
    v_invoice.id,
    v_invoice.local_contact_id,
    v_invoice.local_home_id,
    extensions.digest(v_token, 'sha256'),
    now() + make_interval(days => p_expires_days),
    auth.uid(),
    v_old_link.id
  )
  returning * into v_new_link;

  return jsonb_build_object(
    'link', public.servsync_private_local_invoice_delivery_metadata(v_new_link),
    'token', v_token
  );
end;
$$;

alter function public.servsync_rotate_local_invoice_delivery_link(uuid, int) owner to postgres;
revoke all on function public.servsync_rotate_local_invoice_delivery_link(uuid, int) from public;
revoke all on function public.servsync_rotate_local_invoice_delivery_link(uuid, int) from anon;
revoke all on function public.servsync_rotate_local_invoice_delivery_link(uuid, int) from authenticated;
grant execute on function public.servsync_rotate_local_invoice_delivery_link(uuid, int) to authenticated;

drop function public.servsync_lookup_local_invoice_delivery(text);

create function public.servsync_lookup_local_invoice_delivery(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.local_invoice_delivery_links;
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_contractor public.contractor_profiles;
  v_render record;
  v_contractor_id uuid;
  v_invoice_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_token_hash bytea;
  v_global_key bytea;
begin
  if p_token is null or length(trim(p_token)) <> 64 or trim(p_token) !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('state', 'invalid')::text;
  end if;

  v_token_hash := extensions.digest(lower(trim(p_token)), 'sha256');
  v_global_key := extensions.digest('servsync-request-free-local-invoice-delivery-global-v1', 'sha256');

  if not public.servsync_private_consume_local_invoice_delivery_rate_limit(
    'global', v_global_key, 300, 5::numeric
  ) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  select link.contractor_id, link.invoice_id, link.local_contact_id, link.local_home_id
    into v_contractor_id, v_invoice_id, v_local_contact_id, v_local_home_id
    from public.local_invoice_delivery_links link
   where link.token_hash = v_token_hash;

  if v_contractor_id is null then
    return jsonb_build_object('state', 'invalid')::text;
  end if;

  if not public.servsync_private_consume_local_invoice_delivery_rate_limit(
    'token', v_token_hash, 10, (1::numeric / 6::numeric)
  ) then
    return jsonb_build_object('state', 'rate_limited')::text;
  end if;

  if random() < 0.02 then
    perform public.servsync_private_cleanup_local_invoice_delivery_rate_limits();
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
   where token_hash = v_token_hash
   for update;

  if v_link.id is null
     or v_contact.id is null
     or v_home.id is null
     or v_invoice.id is null
     or v_link.contractor_id is distinct from v_contractor_id
     or v_link.invoice_id is distinct from v_invoice_id
     or v_link.local_contact_id is distinct from v_local_contact_id
     or v_link.local_home_id is distinct from v_local_home_id
     or v_invoice.contractor_id is distinct from v_contractor_id
     or v_invoice.homeowner_user_id is not null
     or v_invoice.local_contact_id is distinct from v_local_contact_id
     or v_invoice.local_home_id is distinct from v_local_home_id then
    return jsonb_build_object('state', 'unavailable')::text;
  end if;

  if v_link.status = 'revoked' then
    return jsonb_build_object(
      'state', case when v_link.revocation_reason = 'replaced' then 'replaced' else 'revoked' end
    )::text;
  end if;

  if v_link.expires_at <= now() then
    return jsonb_build_object('state', 'expired')::text;
  end if;

  if v_invoice.status not in ('sent', 'viewed', 'paid', 'partially_paid', 'overdue') then
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

alter function public.servsync_lookup_local_invoice_delivery(text) owner to postgres;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from public;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from anon;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from authenticated;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from service_role;
grant execute on function public.servsync_lookup_local_invoice_delivery(text) to service_role;

do $$
declare
  v_lookup_count integer;
begin
  select count(*)::integer
    into v_lookup_count
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public'
     and procedure.proname = 'servsync_lookup_local_invoice_delivery';

  if v_lookup_count <> 1 then
    raise exception 'Unexpected servsync_lookup_local_invoice_delivery overload remains.';
  end if;
end;
$$;

comment on table public.local_invoice_delivery_rate_buckets is
  'Private bounded global and token rate buckets for request-free local invoice delivery. Raw tokens and client IP addresses are never stored.';

comment on function public.servsync_lookup_local_invoice_delivery(text) is
  'Service-gateway-only token lookup. Returns the exact bounded customer-safe JSON envelope as text and records opens only after response validation.';

notify pgrst, 'reload schema';

commit;
