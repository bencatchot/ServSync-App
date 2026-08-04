-- ServSync FB-003B request-free local invoice delivery, Slice 1.
--
-- Run after:
--   - servsync-invoices-schema.sql
--   - servsync-estimate-invoice-home-id.sql
--   - servsync-partial-invoicing-data-foundation.sql
--   - servsync-structured-line-items-foundation.sql
--   - servsync-fb020-immutable-invoice-rls.sql
--   - servsync-contractor-team-access.sql
--
-- This additive foundation issues saved local invoices into the existing
-- immutable sent lifecycle and creates revocable, expiring, document-specific
-- bearer grants. Only SHA-256 token hashes are retained. The raw token is
-- returned once by authenticated create/rotate RPCs and is never listable.

begin;

create extension if not exists pgcrypto;

create table if not exists public.local_invoice_delivery_links (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  local_contact_id uuid not null references public.contractor_local_contacts(id) on delete cascade,
  local_home_id uuid not null references public.contractor_local_homes(id) on delete cascade,
  token_hash bytea not null unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or revocation_reason in ('manual', 'replaced', 'expired')),
  rotated_from_id uuid references public.local_invoice_delivery_links(id) on delete set null,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count bigint not null default 0 check (open_count >= 0),
  constraint local_invoice_delivery_links_token_hash_length_check
    check (octet_length(token_hash) = 32),
  constraint local_invoice_delivery_links_expiration_check
    check (expires_at > created_at and expires_at <= created_at + interval '90 days'),
  constraint local_invoice_delivery_links_revocation_check
    check (
      (status = 'active' and revoked_at is null and revoked_by is null and revocation_reason is null)
      or
      (status = 'revoked' and revoked_at is not null and revocation_reason is not null)
    ),
  constraint local_invoice_delivery_links_open_history_check
    check (
      (open_count = 0 and first_opened_at is null and last_opened_at is null)
      or
      (open_count > 0 and first_opened_at is not null and last_opened_at is not null and last_opened_at >= first_opened_at)
    ),
  constraint local_invoice_delivery_links_rotation_check
    check (rotated_from_id is null or rotated_from_id <> id)
);

alter table public.local_invoice_delivery_links owner to postgres;

create unique index if not exists local_invoice_delivery_links_one_active_invoice_idx
  on public.local_invoice_delivery_links(invoice_id)
  where status = 'active';

create index if not exists local_invoice_delivery_links_contractor_invoice_idx
  on public.local_invoice_delivery_links(contractor_id, invoice_id, created_at desc);

create index if not exists local_invoice_delivery_links_contact_home_idx
  on public.local_invoice_delivery_links(contractor_id, local_contact_id, local_home_id, created_at desc);

create index if not exists local_invoice_delivery_links_expiration_idx
  on public.local_invoice_delivery_links(expires_at)
  where status = 'active';

alter table public.local_invoice_delivery_links enable row level security;

revoke all on table public.local_invoice_delivery_links from public;
revoke all on table public.local_invoice_delivery_links from anon;
revoke all on table public.local_invoice_delivery_links from authenticated;

create or replace function public.servsync_private_validate_local_invoice_delivery_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
begin
  if tg_op = 'UPDATE' then
    if new.contractor_id is distinct from old.contractor_id
       or new.invoice_id is distinct from old.invoice_id
       or new.local_contact_id is distinct from old.local_contact_id
       or new.local_home_id is distinct from old.local_home_id
       or new.token_hash is distinct from old.token_hash
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.rotated_from_id is distinct from old.rotated_from_id
       or new.expires_at is distinct from old.expires_at then
      raise exception 'Local invoice delivery grant identity is immutable.';
    end if;

    if old.status = 'revoked' and new.status <> 'revoked' then
      raise exception 'Revoked local invoice delivery grants cannot be reactivated.';
    end if;

    if new.open_count < old.open_count
       or (old.first_opened_at is not null and new.first_opened_at is distinct from old.first_opened_at)
       or (old.last_opened_at is not null and new.last_opened_at < old.last_opened_at) then
      raise exception 'Local invoice delivery access history cannot regress.';
    end if;
  end if;

  select *
    into v_invoice
    from public.invoices
   where id = new.invoice_id;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = new.local_contact_id;

  select *
    into v_home
    from public.contractor_local_homes
   where id = new.local_home_id;

  if v_invoice.id is null
     or v_contact.id is null
     or v_home.id is null
     or v_invoice.contractor_id is distinct from new.contractor_id
     or v_invoice.homeowner_user_id is not null
     or v_invoice.local_contact_id is distinct from new.local_contact_id
     or v_invoice.local_home_id is distinct from new.local_home_id
     or v_contact.contractor_id is distinct from new.contractor_id
     or v_home.contractor_id is distinct from new.contractor_id
     or v_home.local_contact_id is distinct from new.local_contact_id then
    raise exception 'Local invoice delivery grant binding is invalid.';
  end if;

  return new;
end;
$$;

alter function public.servsync_private_validate_local_invoice_delivery_link() owner to postgres;
revoke all on function public.servsync_private_validate_local_invoice_delivery_link() from public;
revoke all on function public.servsync_private_validate_local_invoice_delivery_link() from anon;
revoke all on function public.servsync_private_validate_local_invoice_delivery_link() from authenticated;

drop trigger if exists local_invoice_delivery_links_validate on public.local_invoice_delivery_links;
create trigger local_invoice_delivery_links_validate
  before insert or update on public.local_invoice_delivery_links
  for each row execute function public.servsync_private_validate_local_invoice_delivery_link();

create or replace function public.servsync_private_can_manage_local_invoice_delivery(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
          from public.contractor_profiles contractor
         where contractor.id = p_contractor_id
           and contractor.owner_user_id = auth.uid()
      )
      or exists (
        select 1
          from public.contractor_team_members member
         where member.contractor_id = p_contractor_id
           and member.user_id = auth.uid()
           and member.status = 'active'
           and member.role in ('admin', 'office')
      )
    );
$$;

alter function public.servsync_private_can_manage_local_invoice_delivery(uuid) owner to postgres;
revoke all on function public.servsync_private_can_manage_local_invoice_delivery(uuid) from public;
revoke all on function public.servsync_private_can_manage_local_invoice_delivery(uuid) from anon;
revoke all on function public.servsync_private_can_manage_local_invoice_delivery(uuid) from authenticated;

create or replace function public.servsync_private_current_local_invoice_delivery_contractor_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select contractor.id
    from public.servsync_current_contractor_profile() contractor
   where public.servsync_private_can_manage_local_invoice_delivery(contractor.id)
   limit 1;
$$;

alter function public.servsync_private_current_local_invoice_delivery_contractor_id() owner to postgres;
revoke all on function public.servsync_private_current_local_invoice_delivery_contractor_id() from public;
revoke all on function public.servsync_private_current_local_invoice_delivery_contractor_id() from anon;
revoke all on function public.servsync_private_current_local_invoice_delivery_contractor_id() from authenticated;

create or replace function public.servsync_private_local_invoice_delivery_metadata(
  p_link public.local_invoice_delivery_links
)
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
    'revoked_at', p_link.revoked_at,
    'first_opened_at', p_link.first_opened_at,
    'last_opened_at', p_link.last_opened_at,
    'open_count', p_link.open_count,
    'created_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_link.created_by), ''),
    'revoked_by_name', coalesce((select nullif(trim(profile.full_name), '') from public.profiles profile where profile.id = p_link.revoked_by), '')
  );
$$;

alter function public.servsync_private_local_invoice_delivery_metadata(public.local_invoice_delivery_links) owner to postgres;
revoke all on function public.servsync_private_local_invoice_delivery_metadata(public.local_invoice_delivery_links) from public;
revoke all on function public.servsync_private_local_invoice_delivery_metadata(public.local_invoice_delivery_links) from anon;
revoke all on function public.servsync_private_local_invoice_delivery_metadata(public.local_invoice_delivery_links) from authenticated;

create or replace function public.servsync_list_local_invoice_delivery_links(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invoice public.invoices;
  v_authorized_contractor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  v_authorized_contractor_id := public.servsync_private_current_local_invoice_delivery_contractor_id();
  if v_authorized_contractor_id is null then
    raise exception 'Invoice delivery history is unavailable.';
  end if;

  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
     and contractor_id = v_authorized_contractor_id;

  if v_invoice.id is null then
    raise exception 'Invoice delivery history is unavailable.';
  end if;

  return coalesce((
    select jsonb_agg(
      public.servsync_private_local_invoice_delivery_metadata(link)
      order by link.created_at desc, link.id
    )
      from public.local_invoice_delivery_links link
     where link.invoice_id = v_invoice.id
       and link.contractor_id = v_invoice.contractor_id
  ), '[]'::jsonb);
end;
$$;

alter function public.servsync_list_local_invoice_delivery_links(uuid) owner to postgres;
revoke all on function public.servsync_list_local_invoice_delivery_links(uuid) from public;
revoke all on function public.servsync_list_local_invoice_delivery_links(uuid) from anon;
revoke all on function public.servsync_list_local_invoice_delivery_links(uuid) from authenticated;
grant execute on function public.servsync_list_local_invoice_delivery_links(uuid) to authenticated;

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
  v_authorized_contractor_id uuid;
  v_contractor_id uuid;
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

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = v_local_contact_id
     and contractor_id = v_contractor_id
   for update;

  select *
    into v_home
    from public.contractor_local_homes
   where id = v_local_home_id
     and contractor_id = v_contractor_id
     and local_contact_id = v_local_contact_id
   for update;

  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
     and contractor_id = v_authorized_contractor_id
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

  if not exists (
    select 1
      from public.invoice_line_items line
     where line.invoice_id = v_invoice.id
  ) then
    raise exception 'Add at least one invoice line before creating a delivery link.';
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
    select 1
      from public.local_invoice_delivery_links link
     where link.invoice_id = v_invoice.id
       and link.status = 'active'
  ) then
    raise exception 'An active delivery link already exists. Rotate it to receive a new copy.';
  end if;

  if v_invoice.status = 'draft' then
    update public.invoices
       set status = 'sent',
           issued_at = coalesce(issued_at, now()),
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
    contractor_id,
    invoice_id,
    local_contact_id,
    local_home_id,
    token_hash,
    expires_at,
    created_by
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
   where link.id = p_link_id
     and link.contractor_id = v_authorized_contractor_id;

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

  update public.local_invoice_delivery_links
     set status = 'revoked',
         revoked_by = auth.uid(),
         revoked_at = now(),
         revocation_reason = 'replaced'
   where id = v_old_link.id;

  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));

  insert into public.local_invoice_delivery_links (
    contractor_id,
    invoice_id,
    local_contact_id,
    local_home_id,
    token_hash,
    expires_at,
    created_by,
    rotated_from_id
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

create or replace function public.servsync_revoke_local_invoice_delivery_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.local_invoice_delivery_links;
  v_invoice public.invoices;
  v_contact public.contractor_local_contacts;
  v_home public.contractor_local_homes;
  v_authorized_contractor_id uuid;
  v_contractor_id uuid;
  v_invoice_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  v_authorized_contractor_id := public.servsync_private_current_local_invoice_delivery_contractor_id();
  if v_authorized_contractor_id is null then
    raise exception 'Invoice delivery link is unavailable.';
  end if;

  select link.contractor_id, link.invoice_id, link.local_contact_id, link.local_home_id
    into v_contractor_id, v_invoice_id, v_local_contact_id, v_local_home_id
    from public.local_invoice_delivery_links link
   where link.id = p_link_id
     and link.contractor_id = v_authorized_contractor_id;

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

  select * into v_link
    from public.local_invoice_delivery_links
   where id = p_link_id and contractor_id = v_authorized_contractor_id
   for update;

  if v_contact.id is null
     or v_home.id is null
     or v_invoice.id is null
     or v_link.id is null
     or v_link.contractor_id is distinct from v_contractor_id
     or v_link.invoice_id is distinct from v_invoice_id
     or v_link.local_contact_id is distinct from v_local_contact_id
     or v_link.local_home_id is distinct from v_local_home_id
     or v_invoice.contractor_id is distinct from v_contractor_id
     or v_invoice.local_contact_id is distinct from v_local_contact_id
     or v_invoice.local_home_id is distinct from v_local_home_id then
    raise exception 'Invoice delivery link is unavailable.';
  end if;

  if v_link.status = 'active' then
    update public.local_invoice_delivery_links
       set status = 'revoked',
           revoked_by = auth.uid(),
           revoked_at = now(),
           revocation_reason = 'manual'
     where id = v_link.id
     returning * into v_link;
  end if;

  return public.servsync_private_local_invoice_delivery_metadata(v_link);
end;
$$;

alter function public.servsync_revoke_local_invoice_delivery_link(uuid) owner to postgres;
revoke all on function public.servsync_revoke_local_invoice_delivery_link(uuid) from public;
revoke all on function public.servsync_revoke_local_invoice_delivery_link(uuid) from anon;
revoke all on function public.servsync_revoke_local_invoice_delivery_link(uuid) from authenticated;
grant execute on function public.servsync_revoke_local_invoice_delivery_link(uuid) to authenticated;

create or replace function public.servsync_lookup_local_invoice_delivery(p_token text)
returns jsonb
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
  v_contractor_id uuid;
  v_invoice_id uuid;
  v_local_contact_id uuid;
  v_local_home_id uuid;
  v_token_hash bytea;
  v_lines jsonb;
begin
  if p_token is null or length(trim(p_token)) <> 64 or trim(p_token) !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('state', 'invalid');
  end if;

  v_token_hash := extensions.digest(lower(trim(p_token)), 'sha256');

  select link.contractor_id, link.invoice_id, link.local_contact_id, link.local_home_id
    into v_contractor_id, v_invoice_id, v_local_contact_id, v_local_home_id
    from public.local_invoice_delivery_links link
   where link.token_hash = v_token_hash;

  if v_contractor_id is null then
    return jsonb_build_object('state', 'invalid');
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
    return jsonb_build_object('state', 'unavailable');
  end if;

  if v_link.status = 'revoked' then
    return jsonb_build_object(
      'state', case when v_link.revocation_reason = 'replaced' then 'replaced' else 'revoked' end
    );
  end if;

  if v_link.expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;

  if v_invoice.status not in ('sent', 'viewed', 'paid', 'partially_paid', 'overdue') then
    return jsonb_build_object('state', 'unavailable');
  end if;

  select *
    into v_contractor
    from public.contractor_profiles
   where id = v_invoice.contractor_id
     and account_status = 'active';

  if v_contractor.id is null then
    return jsonb_build_object('state', 'unavailable');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'title', coalesce(nullif(trim(line.line_title), ''), nullif(trim(line.description), ''), 'Invoice item'),
      'description', coalesce(nullif(trim(line.customer_description), ''), ''),
      'quantity', line.quantity,
      'unit', line.unit,
      'unit_price_cents', line.unit_price_cents
    ) order by line.sort_order, line.id
  ), '[]'::jsonb)
    into v_lines
    from public.invoice_line_items line
   where line.invoice_id = v_invoice.id;

  if jsonb_array_length(v_lines) = 0 then
    return jsonb_build_object('state', 'unavailable');
  end if;

  update public.local_invoice_delivery_links
     set first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at = now(),
         open_count = open_count + 1
   where id = v_link.id;

  return jsonb_build_object(
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
      'status', v_invoice.status,
      'subtotal_cents', v_invoice.subtotal_cents,
      'tax_cents', v_invoice.tax_cents,
      'discount_cents', v_invoice.discount_cents,
      'total_cents', v_invoice.total_cents,
      'amount_paid_cents', v_invoice.amount_paid_cents,
      'issued_at', v_invoice.issued_at,
      'due_at', v_invoice.due_at,
      'line_items', v_lines
    )
  );
exception
  when others then
    return jsonb_build_object('state', 'error');
end;
$$;

alter function public.servsync_lookup_local_invoice_delivery(text) owner to postgres;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from public;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from anon;
revoke all on function public.servsync_lookup_local_invoice_delivery(text) from authenticated;
grant execute on function public.servsync_lookup_local_invoice_delivery(text) to anon;

comment on table public.local_invoice_delivery_links is
  'Private document-specific bearer grants for request-free local invoice viewing. Stores SHA-256 token hashes only; raw tokens are never persisted.';

comment on function public.servsync_lookup_local_invoice_delivery(text) is
  'Token-only anonymous invoice lookup. Returns a customer-safe DTO and records link opens without changing authenticated homeowner invoice status.';

notify pgrst, 'reload schema';

commit;
