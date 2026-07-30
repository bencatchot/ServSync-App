-- ServSync durable Draft Preview/Sandbox all-contractor rollout mode.
-- Source file: servsync-durable-draft-preview-rollout-mode.sql
--
-- Adds a private runtime-setting-backed rollout mode for controlled Preview
-- and Sandbox validation. Defaults to cohort mode everywhere and does not
-- enroll billing rows, enable Production gates, or change Draft action
-- authority.

begin;

do $$
begin
  if to_regclass('public.contractor_profiles') is null then
    raise exception 'Missing required table public.contractor_profiles.';
  end if;

  if to_regclass('public.contractor_billing_accounts') is null then
    raise exception 'Missing required table public.contractor_billing_accounts.';
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

  if to_regprocedure('public.servsync_private_can_persist_work_draft(uuid)') is null then
    raise exception 'Missing required durable Draft helper public.servsync_private_can_persist_work_draft(uuid).';
  end if;
end;
$$;

create table if not exists public.servsync_runtime_settings (
  setting_key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  notes text
);

comment on table public.servsync_runtime_settings is
  'Private ServSync runtime settings for operator-controlled feature gates. Browser roles have no direct access.';

insert into public.servsync_runtime_settings (
  setting_key,
  enabled,
  notes
) values (
  'durable_draft_preview_all_contractors_enabled',
  false,
  'FB-035 durable Draft Preview/Sandbox all-contractor rollout mode. Defaults cohort/off everywhere.'
)
on conflict (setting_key) do nothing;

alter table public.servsync_runtime_settings enable row level security;

revoke all on table public.servsync_runtime_settings from public;
revoke all on table public.servsync_runtime_settings from anon;
revoke all on table public.servsync_runtime_settings from authenticated;

create or replace function public.servsync_private_durable_draft_rollout_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((
      select rs.enabled
        from public.servsync_runtime_settings rs
       where rs.setting_key = 'durable_draft_preview_all_contractors_enabled'
    ), false)
      then 'all_contractors'
    else 'cohort'
  end;
$$;

comment on function public.servsync_private_durable_draft_rollout_mode() is
  'Returns cohort by default, or all_contractors only when the private Preview/Sandbox runtime setting is explicitly enabled.';

create or replace function public.servsync_private_contractor_has_durable_draft_entitlement(
  p_contractor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_contractor_id is not null
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.id = p_contractor_id
    )
    and (
      public.servsync_private_durable_draft_rollout_mode() = 'all_contractors'
      or exists (
        select 1
          from public.contractor_billing_accounts account
         where account.contractor_id = p_contractor_id
           and account.durable_draft_beta_enabled is true
      )
    );
$$;

comment on function public.servsync_private_contractor_has_durable_draft_entitlement(uuid) is
  'Private durable Draft tenant exposure helper. all_contractors mode broadens tenant exposure only; existing save, launch, RLS, and role helpers remain authoritative.';

create or replace function public.servsync_current_contractor_durable_draft_entitlement(
  p_contractor_id uuid default null
)
returns table (
  contractor_id uuid,
  can_use_durable_drafts boolean
)
language plpgsql
security definer
set search_path = public
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
    public.servsync_private_contractor_has_durable_draft_entitlement(v_contractor_id);
end;
$$;

revoke all on function public.servsync_private_durable_draft_rollout_mode() from public;
revoke all on function public.servsync_private_durable_draft_rollout_mode() from anon;
revoke all on function public.servsync_private_durable_draft_rollout_mode() from authenticated;

revoke all on function public.servsync_private_contractor_has_durable_draft_entitlement(uuid) from public;
revoke all on function public.servsync_private_contractor_has_durable_draft_entitlement(uuid) from anon;
revoke all on function public.servsync_private_contractor_has_durable_draft_entitlement(uuid) from authenticated;

revoke all on function public.servsync_current_contractor_durable_draft_entitlement(uuid) from public;
revoke all on function public.servsync_current_contractor_durable_draft_entitlement(uuid) from anon;
revoke all on function public.servsync_current_contractor_durable_draft_entitlement(uuid) from authenticated;
grant execute on function public.servsync_current_contractor_durable_draft_entitlement(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
