-- Admin-prepared public unclaimed contractor listings and email-bound ownership claim.
-- Source approval does not authorize applying this migration to shared environments.
-- Requires clean foundation, contractor logos, billing readiness and public signup hardening.
begin;

do $$
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass
       and tgfoid=to_regprocedure('public.servsync_guard_self_service_profile_role()') and tgenabled<>'D') then
    raise exception 'Contractor prospects require the existing public signup role hardening.';
  end if;
  if to_regprocedure('public.servsync_create_default_contractor_billing_account()') is null
     or not exists(select 1 from pg_trigger where tgrelid='public.contractor_profiles'::regclass
       and tgfoid=to_regprocedure('public.servsync_create_default_contractor_billing_account()') and tgenabled<>'D') then
    raise exception 'Contractor prospect claims require the existing billing initialization foundation.';
  end if;
end $$;

create table if not exists public.contractor_prospects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  details jsonb not null,
  published boolean not null default false,
  revision integer not null default 1,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invited_email text,
  token_hash text unique,
  expires_at timestamptz,
  invitation_revoked_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references public.profiles(id),
  contractor_id uuid references public.contractor_profiles(id),
  check ((claimed_at is null and claimed_by is null and contractor_id is null)
      or (claimed_at is not null and claimed_by is not null and contractor_id is not null and contractor_id = id))
);
alter table public.contractor_prospects enable row level security;
revoke all on public.contractor_prospects from public, anon, authenticated, service_role;

-- Normalize an explicit allowlist. Internal notes, ownership, account status,
-- billing, privileges and invitation controls can never enter the copied profile.
create or replace function public.servsync_private_prospect_details(p_details jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public as $$
declare v jsonb := '{}'::jsonb; k text; t text; a jsonb;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then raise exception 'Profile details are required.'; end if;
  foreach k in array array['business_name','contact_name','email','phone','website_url','logo_url','city','state','zip_code','business_summary'] loop
    if p_details ? k and jsonb_typeof(p_details->k) <> 'string' then raise exception 'Invalid profile field.'; end if;
    t := btrim(coalesce(p_details->>k,''));
    if length(t) > (case when k = 'business_summary' then 4000 else 500 end) then raise exception 'Profile field is too long.'; end if;
    if k in ('website_url','logo_url') and t <> '' and t !~ '^https://[^[:space:]]+$' then raise exception 'Use an HTTPS URL.'; end if;
    v := v || jsonb_build_object(k,t);
  end loop;
  if v->>'business_name' = '' then raise exception 'Business name is required.'; end if;
  foreach k in array array['service_categories','service_zip_codes'] loop
    a := coalesce(p_details->k,'[]'::jsonb);
    if jsonb_typeof(a) <> 'array' then raise exception 'Invalid service list.'; end if;
    if jsonb_array_length(a) > 100 then raise exception 'Service list is too long.'; end if;
    if exists(select 1 from jsonb_array_elements(a) x where jsonb_typeof(x) <> 'string' or length(x#>>'{}') > 100) then raise exception 'Invalid service value.'; end if;
    v := v || jsonb_build_object(k,coalesce((select jsonb_agg(s.t order by s.t) from (select distinct btrim(x) t from jsonb_array_elements_text(a) x where btrim(x) <> '') s),'[]'::jsonb));
  end loop;
  return v;
end $$;

-- A prospect is not a contractor identity. Reserve both UUID and slug so a
-- browser cannot create a lookalike owned profile and receive homeowner data.
-- Advisory locking serializes cross-table inserts/renames, including claim.
create or replace function public.servsync_private_guard_prospect_identity()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('contractor-profile-slug:' || new.slug,0));
  perform pg_advisory_xact_lock(hashtextextended('contractor-profile-id:' || new.id::text,0));
  if tg_table_name = 'contractor_prospects' then
    if exists(select 1 from public.contractor_profiles where slug = new.slug or id = new.id) then raise exception 'This profile address is unavailable.'; end if;
  elsif exists(select 1 from public.contractor_prospects where slug = new.slug or id = new.id) then
    if exists(select 1 from public.contractor_prospects where slug=new.slug and id<>new.id) then raise exception 'This profile address is unavailable.'; end if;
    -- Only the claim function, running as postgres, may create the exact reserved
    -- identity. Existing owned profiles can subsequently retain their identity.
    if not exists(select 1 from public.contractor_prospects p where p.id = new.id
      and p.claimed_by = new.owner_user_id and p.contractor_id = new.id and p.claimed_at is not null) then
      raise exception 'This profile address is reserved for a claim.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists contractor_prospect_identity_guard on public.contractor_prospects;
create trigger contractor_prospect_identity_guard before insert or update of slug, id on public.contractor_prospects
for each row execute function public.servsync_private_guard_prospect_identity();
drop trigger if exists contractor_profile_prospect_identity_guard on public.contractor_profiles;
create trigger contractor_profile_prospect_identity_guard before insert or update of slug, id, owner_user_id on public.contractor_profiles
for each row execute function public.servsync_private_guard_prospect_identity();
-- Claim marks ownership before inserting the owned profile inside one transaction.
alter table public.contractor_prospects drop constraint if exists contractor_prospects_contractor_id_fkey;
alter table public.contractor_prospects add constraint contractor_prospects_contractor_id_fkey
foreign key (contractor_id) references public.contractor_profiles(id) deferrable initially deferred;

create or replace function public.servsync_private_prospect_public(p public.contractor_prospects)
returns jsonb language sql immutable set search_path = pg_catalog, public as $$
  select jsonb_build_object('id',p.id,'slug',p.slug,'claim_status','unclaimed','details',
    jsonb_build_object('business_name',p.details->'business_name','logo_url',p.details->'logo_url',
      'city',p.details->'city','state',p.details->'state','zip_code',p.details->'zip_code',
      'business_summary',p.details->'business_summary','service_categories',p.details->'service_categories',
      'service_zip_codes',p.details->'service_zip_codes'));
$$;
create or replace function public.servsync_private_prospect_admin(p public.contractor_prospects)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  select jsonb_build_object('id',p.id,'slug',p.slug,'details',p.details,'published',p.published,
    'revision',p.revision,'invited_email',p.invited_email,'expires_at',p.expires_at,'claimed_at',p.claimed_at,
    'status',case when p.claimed_at is not null then 'claimed' when p.token_hash is not null and p.expires_at <= now() then 'expired'
    when p.token_hash is not null then 'pending' when p.invitation_revoked_at is not null then 'revoked' else 'draft' end);
$$;

create or replace function public.servsync_admin_contractor_prospects()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.servsync_private_prospect_admin(p) order by p.created_at desc) from public.contractor_prospects p),'[]'::jsonb);
end $$;

create or replace function public.servsync_admin_save_contractor_prospect(p_id uuid, p_revision integer, p_slug text, p_details jsonb, p_published boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare p public.contractor_prospects; d jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  d := public.servsync_private_prospect_details(p_details);
  if p_id is null then
    insert into public.contractor_prospects(slug,details,published,created_by,updated_by)
    values (lower(btrim(p_slug)),d,coalesce(p_published,false),auth.uid(),auth.uid()) returning * into p;
  else
    select * into p from public.contractor_prospects where id=p_id for update;
    if p.id is null or p.claimed_at is not null then raise exception 'Unclaimed profile is unavailable.'; end if;
    if p.revision is distinct from p_revision then raise exception 'Profile changed. Reload before saving.'; end if;
    if lower(btrim(p_slug)) is distinct from p.slug then raise exception 'The profile address cannot change after creation.'; end if;
    update public.contractor_prospects set details=d,published=coalesce(p_published,false),revision=revision+1,
      updated_at=now(),updated_by=auth.uid(),token_hash=null,expires_at=null,
      invitation_revoked_at=case when token_hash is not null then now() else invitation_revoked_at end
    where id=p_id returning * into p;
  end if;
  return public.servsync_private_prospect_admin(p);
end $$;

create or replace function public.servsync_admin_issue_contractor_claim(p_id uuid, p_revision integer, p_email text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare p public.contractor_prospects; t text; e text:=lower(btrim(p_email));
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if e is null or length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid recipient email is required.'; end if;
  select * into p from public.contractor_prospects where id=p_id for update;
  if p.id is null or p.claimed_at is not null then raise exception 'Unclaimed profile is unavailable.'; end if;
  if p.revision is distinct from p_revision then raise exception 'Profile changed. Reload before creating a link.'; end if;
  t := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  update public.contractor_prospects set invited_email=e,token_hash=encode(sha256(convert_to(t,'UTF8')),'hex'),
    expires_at=now()+interval '14 days',invitation_revoked_at=null,updated_at=now(),updated_by=auth.uid(),revision=revision+1
  where id=p_id returning * into p;
  return jsonb_build_object('token',t,'profile',public.servsync_private_prospect_admin(p));
end $$;

create or replace function public.servsync_admin_revoke_contractor_claim(p_id uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare p public.contractor_prospects;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  select * into p from public.contractor_prospects where id=p_id for update;
  if p.id is null or p.claimed_at is not null then raise exception 'Unclaimed profile is unavailable.'; end if;
  if p.revision is distinct from p_revision then raise exception 'Profile changed. Reload before revoking.'; end if;
  update public.contractor_prospects set token_hash=null,expires_at=null,invitation_revoked_at=now(),updated_at=now(),updated_by=auth.uid(),revision=revision+1
    where id=p_id returning * into p;
  return public.servsync_private_prospect_admin(p);
end $$;

create or replace function public.servsync_public_contractor_prospects(p_slug text default null, p_search text default '', p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  -- Keep claimed businesses in the Discover directory, using their current
  -- owner-maintained public fields rather than the old prospect snapshot.
  with listings as (
    select public.servsync_private_prospect_public(p) item
    from public.contractor_prospects p where p.published and p.claimed_at is null
      and (p_slug is null or p.slug=p_slug)
    union all
    select jsonb_build_object('id',cp.id,'slug',cp.slug,'claim_status','claimed','details',
      jsonb_build_object('business_name',cp.business_name,'logo_url',cp.logo_url,'city',cp.city,'state',cp.state,
        'zip_code',cp.zip_code,'business_summary',cp.business_summary,'service_categories',cp.service_categories,'service_zip_codes',cp.service_zip_codes))
    from public.contractor_prospects p join public.contractor_profiles cp on cp.id=p.contractor_id
    where p.claimed_at is not null and cp.public_profile_enabled and cp.account_status='active' and p_slug is null
  ), page as (
    select item from listings where coalesce(p_search,'')='' or concat_ws(' ',item->'details'->>'business_name',item->'details'->>'city',
      item->'details'->>'state',item->'details'->>'zip_code',item->'details'->>'service_categories',item->'details'->>'service_zip_codes') ilike '%' || left(p_search,100) || '%'
    order by item->'details'->>'business_name',item->>'id' limit 24 offset greatest(0,least(coalesce(p_offset,0),10000))
  ) select coalesce(jsonb_agg(item),'[]'::jsonb) from page;
$$;

create or replace function public.servsync_review_contractor_claim(p_token text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare p public.contractor_prospects;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'This claim link is unavailable. Ask ServSync for a new link.'; end if;
  select * into p from public.contractor_prospects where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and claimed_at is null and expires_at>now();
  if p.id is null then raise exception 'This claim link is unavailable. Ask ServSync for a new link.'; end if;
  if auth.uid() is null then return public.servsync_private_prospect_public(p) || jsonb_build_object('revision',p.revision); end if;
  if not exists(select 1 from auth.users u join public.profiles f on f.id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=p.invited_email and f.role='contractor') then
    raise exception 'Sign in with the verified contractor account invited by ServSync.' using errcode='42501';
  end if;
  return jsonb_build_object('id',p.id,'slug',p.slug,'details',p.details,'revision',p.revision,'published',p.published);
end $$;

create or replace function public.servsync_accept_contractor_claim(p_token text, p_revision integer, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare p public.contractor_prospects; d jsonb; u uuid:=auth.uid();
begin
  if u is null then raise exception 'Sign in to claim this profile.' using errcode='42501'; end if;
  -- Serialize ownership creation for this account as well as this invitation.
  perform pg_advisory_xact_lock(hashtextextended('contractor-owner:' || u::text,0));
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'This claim link is unavailable. Ask ServSync for a new link.'; end if;
  select * into p from public.contractor_prospects where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and claimed_at is null and expires_at>now() for update;
  if p.id is null then raise exception 'This claim link is unavailable. Ask ServSync for a new link.'; end if;
  if not exists(select 1 from auth.users a join public.profiles f on f.id=a.id where a.id=u and a.email_confirmed_at is not null and lower(a.email)=p.invited_email and f.role='contractor') then
    raise exception 'Sign in with the verified contractor account invited by ServSync.' using errcode='42501';
  end if;
  if p.revision is distinct from p_revision then raise exception 'Profile changed. Reopen your latest claim link.'; end if;
  if exists(select 1 from public.contractor_profiles where owner_user_id=u) then raise exception 'You already own a contractor profile. Contact ServSync for help; your existing profile has not changed.'; end if;
  d := public.servsync_private_prospect_details(p_details);
  update public.contractor_prospects set claimed_at=now(),claimed_by=u,contractor_id=p.id,token_hash=null,expires_at=null,revision=revision+1 where id=p.id;
  insert into public.contractor_profiles(id,owner_user_id,slug,business_name,contact_name,email,phone,website_url,logo_url,city,state,zip_code,service_categories,service_zip_codes,business_summary,public_profile_enabled)
  values(p.id,u,p.slug,d->>'business_name',d->>'contact_name',d->>'email',d->>'phone',d->>'website_url',d->>'logo_url',d->>'city',d->>'state',d->>'zip_code',
    array(select jsonb_array_elements_text(d->'service_categories')),array(select jsonb_array_elements_text(d->'service_zip_codes')),d->>'business_summary',p.published);
  return jsonb_build_object('contractor_id',p.id,'slug',p.slug);
end $$;

-- Explicit owner and execution grants; no reliance on project default ACLs.
do $$
declare f regprocedure;
begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
    'servsync_private_prospect_details','servsync_private_guard_prospect_identity','servsync_private_prospect_public','servsync_private_prospect_admin',
    'servsync_admin_contractor_prospects','servsync_admin_save_contractor_prospect','servsync_admin_issue_contractor_claim','servsync_admin_revoke_contractor_claim',
    'servsync_public_contractor_prospects','servsync_review_contractor_claim','servsync_accept_contractor_claim') loop
    execute format('alter function %s owner to postgres',f);
    execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
  end loop;
end $$;
grant execute on function public.servsync_admin_contractor_prospects(), public.servsync_admin_save_contractor_prospect(uuid,integer,text,jsonb,boolean),
  public.servsync_admin_issue_contractor_claim(uuid,integer,text), public.servsync_admin_revoke_contractor_claim(uuid,integer),
  public.servsync_accept_contractor_claim(text,integer,jsonb) to authenticated;
grant execute on function public.servsync_public_contractor_prospects(text,text,integer), public.servsync_review_contractor_claim(text) to anon, authenticated;
commit;
