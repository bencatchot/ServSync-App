-- ServSync durable Draft contractor cohort entitlement.
--
-- Adds a default-deny tenant entitlement and a narrow browser RPC. This file
-- does not enroll a contractor or change durable Draft authorization.

begin;

do $$
declare
  v_type regtype;
  v_not_null boolean;
  v_default text;
begin
  if to_regclass('public.contractor_billing_accounts') is null then
    raise exception 'Missing required table public.contractor_billing_accounts.';
  end if;

  if to_regclass('public.contractor_profiles') is null then
    raise exception 'Missing required table public.contractor_profiles.';
  end if;

  if to_regclass('public.contractor_team_members') is null then
    raise exception 'Missing required table public.contractor_team_members.';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception 'Missing required authentication helper auth.uid().';
  end if;

  if to_regprocedure('public.servsync_current_contractor_profile()') is null then
    raise exception 'Missing required helper public.servsync_current_contractor_profile().';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.contractor_billing_accounts'::regclass
       and a.attname = 'contractor_id'
       and a.atttypid = 'uuid'::regtype
       and not a.attisdropped
  ) then
    raise exception 'public.contractor_billing_accounts.contractor_id must exist as uuid.';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_attribute id_column
      join pg_catalog.pg_attribute owner_column
        on owner_column.attrelid = id_column.attrelid
     where id_column.attrelid = 'public.contractor_profiles'::regclass
       and id_column.attname = 'id'
       and id_column.atttypid = 'uuid'::regtype
       and owner_column.attname = 'owner_user_id'
       and owner_column.atttypid = 'uuid'::regtype
       and not id_column.attisdropped
       and not owner_column.attisdropped
  ) then
    raise exception 'public.contractor_profiles identity columns must exist as uuid.';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_attribute contractor_column
      join pg_catalog.pg_attribute user_column
        on user_column.attrelid = contractor_column.attrelid
      join pg_catalog.pg_attribute status_column
        on status_column.attrelid = contractor_column.attrelid
     where contractor_column.attrelid = 'public.contractor_team_members'::regclass
       and contractor_column.attname = 'contractor_id'
       and contractor_column.atttypid = 'uuid'::regtype
       and user_column.attname = 'user_id'
       and user_column.atttypid = 'uuid'::regtype
       and status_column.attname = 'status'
       and status_column.atttypid = 'text'::regtype
       and not contractor_column.attisdropped
       and not user_column.attisdropped
       and not status_column.attisdropped
  ) then
    raise exception 'public.contractor_team_members identity/status columns are incompatible.';
  end if;

  alter table public.contractor_billing_accounts
    add column if not exists durable_draft_beta_enabled boolean not null default false;

  select
    a.atttypid::regtype,
    a.attnotnull,
    pg_get_expr(d.adbin, d.adrelid)
    into v_type, v_not_null, v_default
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d
      on d.adrelid = a.attrelid
     and d.adnum = a.attnum
   where a.attrelid = 'public.contractor_billing_accounts'::regclass
     and a.attname = 'durable_draft_beta_enabled'
     and not a.attisdropped;

  if v_type is distinct from 'boolean'::regtype
     or v_not_null is distinct from true
     or coalesce(v_default, '') not in ('false', 'false::boolean') then
    raise exception 'public.contractor_billing_accounts.durable_draft_beta_enabled has an incompatible definition.';
  end if;
end;
$$;

comment on column public.contractor_billing_accounts.durable_draft_beta_enabled is
  'Default-deny contractor-tenant exposure flag for the durable Draft beta UI. This does not grant Draft or output mutation authority.';

create or replace function public.servsync_current_contractor_durable_draft_entitlement(
  p_contractor_id uuid default null
)
returns table (
  contractor_id uuid,
  can_use_durable_drafts boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_contractor_id uuid;
begin
  if v_user_id is null then
    return query select null::uuid, false;
    return;
  end if;

  if p_contractor_id is null then
    select cp.id
      into v_contractor_id
      from public.servsync_current_contractor_profile() cp
     limit 1;
  else
    v_contractor_id := p_contractor_id;
  end if;

  if v_contractor_id is null then
    return query select null::uuid, false;
    return;
  end if;

  if not (
    exists (
      select 1
        from public.contractor_profiles cp
       where cp.id = v_contractor_id
         and cp.owner_user_id = v_user_id
    )
    or exists (
      select 1
        from public.contractor_team_members tm
       where tm.contractor_id = v_contractor_id
         and tm.user_id = v_user_id
         and tm.status = 'active'
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'You do not have permission to read this contractor entitlement.';
  end if;

  return query
  select
    v_contractor_id,
    coalesce((
      select cba.durable_draft_beta_enabled
        from public.contractor_billing_accounts cba
       where cba.contractor_id = v_contractor_id
       limit 1
    ), false);
end;
$$;

revoke all on function public.servsync_current_contractor_durable_draft_entitlement(uuid) from public;
revoke all on function public.servsync_current_contractor_durable_draft_entitlement(uuid) from anon;
revoke all on function public.servsync_current_contractor_durable_draft_entitlement(uuid) from authenticated;
grant execute on function public.servsync_current_contractor_durable_draft_entitlement(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
