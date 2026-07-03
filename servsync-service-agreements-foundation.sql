-- ServSync FB-032 Slice 2
-- Service Agreements Foundation: SQL/RLS/RPC only.
--
-- This additive patch creates the minimal service agreement template, offer,
-- and accepted-agreement foundation. It intentionally does not create
-- agreement visits, jobs, invoices, reminders, notifications, payments,
-- renewals, e-signatures, or external delivery behavior.

begin;

create extension if not exists pgcrypto;

create or replace function public.current_user_can_manage_service_agreements(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
        from public.contractor_profiles cp
       where cp.id = p_contractor_id
         and cp.owner_user_id = auth.uid()
    )
    or exists (
      select 1
        from public.contractor_team_members tm
       where tm.contractor_id = p_contractor_id
         and tm.user_id = auth.uid()
         and tm.status = 'active'
         and tm.role in ('admin', 'office')
    )
    or public.current_user_is_platform_admin();
$$;

create table if not exists public.service_agreement_templates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  name text not null,
  description text,
  service_frequency text,
  default_duration_months integer,
  default_price_cents integer,
  included_visit_count integer,
  terms_summary text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_agreement_templates_status_check
    check (status in ('active', 'archived')),
  constraint service_agreement_templates_name_check
    check (length(trim(coalesce(name, ''))) > 0),
  constraint service_agreement_templates_duration_check
    check (default_duration_months is null or default_duration_months > 0),
  constraint service_agreement_templates_price_check
    check (default_price_cents is null or default_price_cents >= 0),
  constraint service_agreement_templates_visit_count_check
    check (included_visit_count is null or included_visit_count >= 0)
);

create table if not exists public.service_agreement_offers (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.service_agreement_templates(id) on delete set null,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  connection_id uuid not null references public.homeowner_contractor_connections(id) on delete restrict,
  title text not null,
  description text,
  price_cents integer,
  duration_months integer,
  included_visit_count integer,
  starts_on date,
  ends_on date,
  terms_summary text,
  status text not null default 'draft',
  sent_at timestamptz,
  responded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_agreement_offers_status_check
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn')),
  constraint service_agreement_offers_title_check
    check (length(trim(coalesce(title, ''))) > 0),
  constraint service_agreement_offers_price_check
    check (price_cents is null or price_cents >= 0),
  constraint service_agreement_offers_duration_check
    check (duration_months is null or duration_months > 0),
  constraint service_agreement_offers_visit_count_check
    check (included_visit_count is null or included_visit_count >= 0),
  constraint service_agreement_offers_date_order_check
    check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint service_agreement_offers_sent_at_check
    check (status = 'draft' or sent_at is not null),
  constraint service_agreement_offers_response_at_check
    check (
      (status in ('accepted', 'declined') and responded_at is not null)
      or (status not in ('accepted', 'declined'))
    )
);

create table if not exists public.service_agreements (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.service_agreement_offers(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  connection_id uuid not null references public.homeowner_contractor_connections(id) on delete restrict,
  title text not null,
  description text,
  price_cents integer,
  duration_months integer,
  included_visit_count integer,
  starts_on date,
  ends_on date,
  renewal_due_on date,
  terms_summary text,
  status text not null default 'active',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_agreements_status_check
    check (status in ('active', 'cancelled', 'expired')),
  constraint service_agreements_title_check
    check (length(trim(coalesce(title, ''))) > 0),
  constraint service_agreements_price_check
    check (price_cents is null or price_cents >= 0),
  constraint service_agreements_duration_check
    check (duration_months is null or duration_months > 0),
  constraint service_agreements_visit_count_check
    check (included_visit_count is null or included_visit_count >= 0),
  constraint service_agreements_date_order_check
    check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint service_agreements_cancelled_at_check
    check (
      (status = 'cancelled' and cancelled_at is not null)
      or (status <> 'cancelled')
    )
);

create index if not exists service_agreement_templates_contractor_status_idx
  on public.service_agreement_templates(contractor_id, status, created_at desc);

create index if not exists service_agreement_offers_contractor_status_idx
  on public.service_agreement_offers(contractor_id, status, created_at desc);

create index if not exists service_agreement_offers_homeowner_status_idx
  on public.service_agreement_offers(homeowner_user_id, status, created_at desc);

create index if not exists service_agreement_offers_home_status_idx
  on public.service_agreement_offers(home_id, status, created_at desc);

create index if not exists service_agreement_offers_connection_idx
  on public.service_agreement_offers(connection_id, created_at desc);

create index if not exists service_agreements_contractor_status_idx
  on public.service_agreements(contractor_id, status, created_at desc);

create index if not exists service_agreements_homeowner_status_idx
  on public.service_agreements(homeowner_user_id, status, created_at desc);

create index if not exists service_agreements_home_status_idx
  on public.service_agreements(home_id, status, created_at desc);

drop trigger if exists service_agreement_templates_touch_updated_at
  on public.service_agreement_templates;
create trigger service_agreement_templates_touch_updated_at
  before update on public.service_agreement_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists service_agreement_offers_touch_updated_at
  on public.service_agreement_offers;
create trigger service_agreement_offers_touch_updated_at
  before update on public.service_agreement_offers
  for each row execute function public.touch_updated_at();

drop trigger if exists service_agreements_touch_updated_at
  on public.service_agreements;
create trigger service_agreements_touch_updated_at
  before update on public.service_agreements
  for each row execute function public.touch_updated_at();

alter table public.service_agreement_templates enable row level security;
alter table public.service_agreement_offers enable row level security;
alter table public.service_agreements enable row level security;

drop policy if exists "Service agreement templates: contractor managers read"
  on public.service_agreement_templates;
create policy "Service agreement templates: contractor managers read"
  on public.service_agreement_templates for select to authenticated
  using (
    public.current_user_can_manage_service_agreements(contractor_id)
  );

drop policy if exists "Service agreement offers: contractor managers read"
  on public.service_agreement_offers;
create policy "Service agreement offers: contractor managers read"
  on public.service_agreement_offers for select to authenticated
  using (
    public.current_user_can_manage_service_agreements(contractor_id)
  );

drop policy if exists "Service agreement offers: homeowner reads sent"
  on public.service_agreement_offers;
create policy "Service agreement offers: homeowner reads sent"
  on public.service_agreement_offers for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    and status <> 'draft'
  );

drop policy if exists "Service agreements: contractor managers read"
  on public.service_agreements;
create policy "Service agreements: contractor managers read"
  on public.service_agreements for select to authenticated
  using (
    public.current_user_can_manage_service_agreements(contractor_id)
  );

drop policy if exists "Service agreements: homeowner reads own"
  on public.service_agreements;
create policy "Service agreements: homeowner reads own"
  on public.service_agreements for select to authenticated
  using (
    homeowner_user_id = auth.uid()
  );

revoke all on table public.service_agreement_templates from public;
revoke all on table public.service_agreement_templates from anon;
revoke all on table public.service_agreement_templates from authenticated;
grant select on table public.service_agreement_templates to authenticated;

revoke all on table public.service_agreement_offers from public;
revoke all on table public.service_agreement_offers from anon;
revoke all on table public.service_agreement_offers from authenticated;
grant select on table public.service_agreement_offers to authenticated;

revoke all on table public.service_agreements from public;
revoke all on table public.service_agreements from anon;
revoke all on table public.service_agreements from authenticated;
grant select on table public.service_agreements to authenticated;

create or replace function public.servsync_create_service_agreement_template(
  p_contractor_id uuid,
  p_name text,
  p_description text default null,
  p_service_frequency text default null,
  p_default_duration_months integer default null,
  p_default_price_cents integer default null,
  p_included_visit_count integer default null,
  p_terms_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.service_agreement_templates;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.current_user_can_manage_service_agreements(p_contractor_id) then
    raise exception 'You do not have permission to manage service agreement templates for this contractor.';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if length(v_name) = 0 then
    raise exception 'Enter a template name.';
  end if;

  if p_default_duration_months is not null and p_default_duration_months <= 0 then
    raise exception 'Default duration must be greater than zero.';
  end if;

  if p_default_price_cents is not null and p_default_price_cents < 0 then
    raise exception 'Default price cannot be negative.';
  end if;

  if p_included_visit_count is not null and p_included_visit_count < 0 then
    raise exception 'Included visit count cannot be negative.';
  end if;

  insert into public.service_agreement_templates (
    contractor_id,
    name,
    description,
    service_frequency,
    default_duration_months,
    default_price_cents,
    included_visit_count,
    terms_summary,
    status,
    created_by,
    updated_by
  ) values (
    p_contractor_id,
    v_name,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_service_frequency, '')), ''),
    p_default_duration_months,
    p_default_price_cents,
    p_included_visit_count,
    nullif(trim(coalesce(p_terms_summary, '')), ''),
    'active',
    auth.uid(),
    auth.uid()
  )
  returning * into v_template;

  return to_jsonb(v_template);
end;
$$;

create or replace function public.servsync_update_service_agreement_template(
  p_template_id uuid,
  p_name text default null,
  p_description text default null,
  p_service_frequency text default null,
  p_default_duration_months integer default null,
  p_default_price_cents integer default null,
  p_included_visit_count integer default null,
  p_terms_summary text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.service_agreement_templates;
  v_template public.service_agreement_templates;
  v_name text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_existing
    from public.service_agreement_templates
   where id = p_template_id
   for update;

  if v_existing.id is null then
    raise exception 'Service agreement template not found.';
  end if;

  if not public.current_user_can_manage_service_agreements(v_existing.contractor_id) then
    raise exception 'You do not have permission to update this service agreement template.';
  end if;

  v_name := case
    when p_name is null then v_existing.name
    else trim(coalesce(p_name, ''))
  end;

  if length(v_name) = 0 then
    raise exception 'Enter a template name.';
  end if;

  v_status := coalesce(nullif(trim(coalesce(p_status, '')), ''), v_existing.status);
  if v_status not in ('active', 'archived') then
    raise exception 'Unsupported template status.';
  end if;

  if p_default_duration_months is not null and p_default_duration_months <= 0 then
    raise exception 'Default duration must be greater than zero.';
  end if;

  if p_default_price_cents is not null and p_default_price_cents < 0 then
    raise exception 'Default price cannot be negative.';
  end if;

  if p_included_visit_count is not null and p_included_visit_count < 0 then
    raise exception 'Included visit count cannot be negative.';
  end if;

  update public.service_agreement_templates
     set name = v_name,
         description = case when p_description is null then description else nullif(trim(coalesce(p_description, '')), '') end,
         service_frequency = case when p_service_frequency is null then service_frequency else nullif(trim(coalesce(p_service_frequency, '')), '') end,
         default_duration_months = coalesce(p_default_duration_months, default_duration_months),
         default_price_cents = coalesce(p_default_price_cents, default_price_cents),
         included_visit_count = coalesce(p_included_visit_count, included_visit_count),
         terms_summary = case when p_terms_summary is null then terms_summary else nullif(trim(coalesce(p_terms_summary, '')), '') end,
         status = v_status,
         updated_by = auth.uid()
   where id = v_existing.id
  returning * into v_template;

  return to_jsonb(v_template);
end;
$$;

create or replace function public.servsync_create_service_agreement_offer(
  p_connection_id uuid,
  p_home_id uuid,
  p_title text default null,
  p_template_id uuid default null,
  p_description text default null,
  p_price_cents integer default null,
  p_duration_months integer default null,
  p_included_visit_count integer default null,
  p_starts_on date default null,
  p_ends_on date default null,
  p_terms_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_template public.service_agreement_templates;
  v_offer public.service_agreement_offers;
  v_title text;
  v_description text;
  v_price_cents integer;
  v_duration_months integer;
  v_included_visit_count integer;
  v_terms_summary text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_connection
    from public.homeowner_contractor_connections
   where id = p_connection_id
     and status = 'active'
   limit 1;

  if v_connection.id is null then
    raise exception 'Active homeowner connection not found.';
  end if;

  if not public.current_user_can_manage_service_agreements(v_connection.contractor_id) then
    raise exception 'You do not have permission to create service agreement offers for this contractor.';
  end if;

  if not exists (
    select 1
      from public.connection_shared_properties csp
      join public.homes h on h.id = csp.home_id
     where csp.connection_id = p_connection_id
       and csp.home_id = p_home_id
       and h.homeowner_user_id = v_connection.homeowner_user_id
  ) then
    raise exception 'Selected home is not approved for this contractor connection.';
  end if;

  if p_template_id is not null then
    select *
      into v_template
      from public.service_agreement_templates
     where id = p_template_id
       and contractor_id = v_connection.contractor_id
       and status = 'active'
     limit 1;

    if v_template.id is null then
      raise exception 'Active service agreement template not found for this contractor.';
    end if;
  end if;

  v_title := trim(coalesce(nullif(p_title, ''), v_template.name, ''));
  if length(v_title) = 0 then
    raise exception 'Enter an offer title.';
  end if;

  v_description := nullif(trim(coalesce(p_description, v_template.description, '')), '');
  v_price_cents := coalesce(p_price_cents, v_template.default_price_cents);
  v_duration_months := coalesce(p_duration_months, v_template.default_duration_months);
  v_included_visit_count := coalesce(p_included_visit_count, v_template.included_visit_count);
  v_terms_summary := nullif(trim(coalesce(p_terms_summary, v_template.terms_summary, '')), '');

  if v_price_cents is not null and v_price_cents < 0 then
    raise exception 'Offer price cannot be negative.';
  end if;

  if v_duration_months is not null and v_duration_months <= 0 then
    raise exception 'Offer duration must be greater than zero.';
  end if;

  if v_included_visit_count is not null and v_included_visit_count < 0 then
    raise exception 'Included visit count cannot be negative.';
  end if;

  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'Offer end date cannot be before start date.';
  end if;

  insert into public.service_agreement_offers (
    template_id,
    contractor_id,
    homeowner_user_id,
    home_id,
    connection_id,
    title,
    description,
    price_cents,
    duration_months,
    included_visit_count,
    starts_on,
    ends_on,
    terms_summary,
    status,
    created_by,
    updated_by
  ) values (
    v_template.id,
    v_connection.contractor_id,
    v_connection.homeowner_user_id,
    p_home_id,
    v_connection.id,
    v_title,
    v_description,
    v_price_cents,
    v_duration_months,
    v_included_visit_count,
    p_starts_on,
    p_ends_on,
    v_terms_summary,
    'draft',
    auth.uid(),
    auth.uid()
  )
  returning * into v_offer;

  return to_jsonb(v_offer);
end;
$$;

create or replace function public.servsync_send_service_agreement_offer(
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.service_agreement_offers;
  v_offer public.service_agreement_offers;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_existing
    from public.service_agreement_offers
   where id = p_offer_id
   for update;

  if v_existing.id is null then
    raise exception 'Service agreement offer not found.';
  end if;

  if not public.current_user_can_manage_service_agreements(v_existing.contractor_id) then
    raise exception 'You do not have permission to send this service agreement offer.';
  end if;

  if v_existing.status <> 'draft' then
    raise exception 'Only draft service agreement offers can be sent.';
  end if;

  update public.service_agreement_offers
     set status = 'sent',
         sent_at = now(),
         updated_by = auth.uid()
   where id = v_existing.id
  returning * into v_offer;

  return to_jsonb(v_offer);
end;
$$;

create or replace function public.servsync_homeowner_respond_to_service_agreement_offer(
  p_offer_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.service_agreement_offers;
  v_response text;
  v_updated_offer public.service_agreement_offers;
  v_agreement public.service_agreements;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  v_response := lower(trim(coalesce(p_response, '')));
  if v_response not in ('accepted', 'declined') then
    raise exception 'Response must be accepted or declined.';
  end if;

  select *
    into v_offer
    from public.service_agreement_offers
   where id = p_offer_id
   for update;

  if v_offer.id is null then
    raise exception 'Service agreement offer not found.';
  end if;

  if v_offer.homeowner_user_id <> auth.uid() then
    raise exception 'You do not have permission to respond to this service agreement offer.';
  end if;

  if v_offer.status <> 'sent' then
    raise exception 'Only sent service agreement offers can be accepted or declined.';
  end if;

  update public.service_agreement_offers
     set status = v_response,
         responded_at = now(),
         updated_by = auth.uid()
   where id = v_offer.id
  returning * into v_updated_offer;

  if v_response = 'accepted' then
    insert into public.service_agreements (
      offer_id,
      contractor_id,
      homeowner_user_id,
      home_id,
      connection_id,
      title,
      description,
      price_cents,
      duration_months,
      included_visit_count,
      starts_on,
      ends_on,
      renewal_due_on,
      terms_summary,
      status
    ) values (
      v_updated_offer.id,
      v_updated_offer.contractor_id,
      v_updated_offer.homeowner_user_id,
      v_updated_offer.home_id,
      v_updated_offer.connection_id,
      v_updated_offer.title,
      v_updated_offer.description,
      v_updated_offer.price_cents,
      v_updated_offer.duration_months,
      v_updated_offer.included_visit_count,
      v_updated_offer.starts_on,
      v_updated_offer.ends_on,
      v_updated_offer.ends_on,
      v_updated_offer.terms_summary,
      'active'
    )
    returning * into v_agreement;
  end if;

  return jsonb_build_object(
    'offer', to_jsonb(v_updated_offer),
    'agreement', case
      when v_agreement.id is null then null
      else to_jsonb(v_agreement)
    end
  );
end;
$$;

revoke all on function public.current_user_can_manage_service_agreements(uuid)
  from public, anon, authenticated;
grant execute on function public.current_user_can_manage_service_agreements(uuid)
  to authenticated;

revoke execute on function public.servsync_create_service_agreement_template(
  uuid, text, text, text, integer, integer, integer, text
) from public;
revoke execute on function public.servsync_create_service_agreement_template(
  uuid, text, text, text, integer, integer, integer, text
) from anon;
grant execute on function public.servsync_create_service_agreement_template(
  uuid, text, text, text, integer, integer, integer, text
) to authenticated;

revoke execute on function public.servsync_update_service_agreement_template(
  uuid, text, text, text, integer, integer, integer, text, text
) from public;
revoke execute on function public.servsync_update_service_agreement_template(
  uuid, text, text, text, integer, integer, integer, text, text
) from anon;
grant execute on function public.servsync_update_service_agreement_template(
  uuid, text, text, text, integer, integer, integer, text, text
) to authenticated;

revoke execute on function public.servsync_create_service_agreement_offer(
  uuid, uuid, text, uuid, text, integer, integer, integer, date, date, text
) from public;
revoke execute on function public.servsync_create_service_agreement_offer(
  uuid, uuid, text, uuid, text, integer, integer, integer, date, date, text
) from anon;
grant execute on function public.servsync_create_service_agreement_offer(
  uuid, uuid, text, uuid, text, integer, integer, integer, date, date, text
) to authenticated;

revoke execute on function public.servsync_send_service_agreement_offer(uuid)
  from public;
revoke execute on function public.servsync_send_service_agreement_offer(uuid)
  from anon;
grant execute on function public.servsync_send_service_agreement_offer(uuid)
  to authenticated;

revoke execute on function public.servsync_homeowner_respond_to_service_agreement_offer(uuid, text)
  from public;
revoke execute on function public.servsync_homeowner_respond_to_service_agreement_offer(uuid, text)
  from anon;
grant execute on function public.servsync_homeowner_respond_to_service_agreement_offer(uuid, text)
  to authenticated;

comment on table public.service_agreement_templates is
  'FB-032 contractor-owned service agreement template foundation. No homeowner direct access and no automation.';
comment on table public.service_agreement_offers is
  'FB-032 property-scoped service agreement offers. Drafts are hidden from homeowners; writes go through RPCs.';
comment on table public.service_agreements is
  'FB-032 accepted service agreement snapshots. Separate from jobs, invoices, visits, reminders, notifications, and payments.';

commit;
