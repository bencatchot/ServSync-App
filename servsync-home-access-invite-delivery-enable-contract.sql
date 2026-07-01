-- ServSync FB-030 Slice 1H-F-A home access invite delivery enable contract.
-- Adds a private DB runtime setting for Home Access invite email delivery.
-- This patch does not send email/SMS/push, deploy Edge Functions, add UI,
-- broaden existing homeowner RLS, change storage policies, or grant shared
-- members access to additional record surfaces.

begin;

create table if not exists public.servsync_runtime_settings (
  setting_key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  notes text
);

comment on table public.servsync_runtime_settings is
  'Private ServSync runtime settings for operator-controlled feature gates. Browser roles have no direct access.';

comment on column public.servsync_runtime_settings.setting_key is
  'Stable setting key. Do not store secrets in this table.';

comment on column public.servsync_runtime_settings.enabled is
  'Boolean runtime flag. Home Access invite email delivery must default disabled unless explicitly enabled by an approved operator action.';

insert into public.servsync_runtime_settings (
  setting_key,
  enabled,
  notes
) values (
  'home_access_invite_email_delivery_enabled',
  false,
  'FB-030 Home Access invite email delivery DB-side enable contract. Defaults disabled everywhere.'
)
on conflict (setting_key) do nothing;

alter table public.servsync_runtime_settings enable row level security;

revoke all on table public.servsync_runtime_settings from public;
revoke all on table public.servsync_runtime_settings from anon;
revoke all on table public.servsync_runtime_settings from authenticated;

create or replace function public.servsync_prepare_home_access_invite_delivery(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_invite public.home_membership_email_invites%rowtype;
  v_home public.homes%rowtype;
  v_inviter_label text;
  v_pending_home_count integer;
  v_daily_home_attempt_count integer;
  v_expires_at timestamptz;
  v_delivery_enabled boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_invite_id is null then
    raise exception 'Invite is required.';
  end if;

  select *
    into v_invite
    from public.home_membership_email_invites
   where id = p_invite_id
   for update;

  if not found then
    raise exception 'Home membership email invite not found.';
  end if;

  select *
    into v_home
    from public.homes
   where id = v_invite.home_id;

  if not found then
    raise exception 'Home not found.';
  end if;

  v_actor_role := public.current_user_home_role(v_invite.home_id);

  if coalesce(v_actor_role, '') not in ('owner', 'admin') then
    raise exception 'You do not have permission to prepare home access invite delivery.';
  end if;

  if v_invite.role = 'admin' and v_home.homeowner_user_id is distinct from v_actor_id then
    raise exception 'Only the primary homeowner can prepare admin home access invite delivery.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Only pending home access invites can be prepared for delivery.';
  end if;

  v_expires_at := coalesce(v_invite.expires_at, v_invite.created_at + interval '30 days');
  if v_expires_at <= now() then
    raise exception 'Home access invite has expired.';
  end if;

  if v_invite.delivery_attempt_count >= 5 then
    raise exception 'Home access invite delivery attempt limit reached.';
  end if;

  if v_invite.last_delivery_attempt_at is not null
     and v_invite.last_delivery_attempt_at > now() - interval '10 minutes' then
    raise exception 'Please wait before preparing this home access invite for delivery again.';
  end if;

  select count(*)::int
    into v_pending_home_count
    from public.home_membership_email_invites ei
   where ei.home_id = v_invite.home_id
     and ei.status = 'pending'
     and coalesce(ei.expires_at, ei.created_at + interval '30 days') > now();

  if v_pending_home_count > 25 then
    raise exception 'This home has too many pending access invites.';
  end if;

  select count(*)::int
    into v_daily_home_attempt_count
    from public.home_membership_email_invites ei
   where ei.home_id = v_invite.home_id
     and ei.last_delivery_attempt_at >= now() - interval '1 day';

  if v_daily_home_attempt_count >= 50 then
    raise exception 'This home has reached the daily access invite delivery preparation limit.';
  end if;

  select coalesce((
    select rs.enabled
      from public.servsync_runtime_settings rs
     where rs.setting_key = 'home_access_invite_email_delivery_enabled'
  ), false)
    into v_delivery_enabled;

  select coalesce(nullif(btrim(p.full_name), ''), 'A homeowner')
    into v_inviter_label
    from public.profiles p
   where p.id = v_invite.invited_by_user_id;

  update public.home_membership_email_invites
     set delivery_status = case when v_delivery_enabled then 'not_sent' else 'disabled' end,
         delivery_attempt_count = delivery_attempt_count + 1,
         last_delivery_attempt_at = now(),
         last_delivery_error_code = case when v_delivery_enabled then null else 'delivery_disabled' end,
         provider_message_id = null
   where id = v_invite.id
  returning * into v_invite;

  insert into public.home_membership_audit_events (
    home_id,
    membership_id,
    actor_user_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status,
    metadata
  ) values (
    v_invite.home_id,
    null,
    v_actor_id,
    null,
    case when v_delivery_enabled then 'email_invite_delivery_prepared' else 'email_invite_delivery_disabled' end,
    null,
    v_invite.role,
    null,
    null,
    jsonb_build_object(
      'email_invite_id', v_invite.id,
      'delivery_enabled', v_delivery_enabled,
      'delivery_status', v_invite.delivery_status,
      'error_code', case when v_delivery_enabled then null else 'delivery_disabled' end
    )
  );

  return jsonb_build_object(
    'delivery_enabled', v_delivery_enabled,
    'route_hint', 'home-access-invite',
    'invite_id', v_invite.id,
    'home_id', v_invite.home_id,
    'invited_email', v_invite.invited_email,
    'role', v_invite.role,
    'home_display_label', coalesce(nullif(btrim(v_home.nickname), ''), nullif(btrim(concat_ws(', ', v_home.city, v_home.state)), ''), 'Shared home'),
    'city', v_home.city,
    'state', v_home.state,
    'inviter_display_label', coalesce(v_inviter_label, 'A homeowner'),
    'expires_at', v_expires_at,
    'delivery_status', v_invite.delivery_status,
    'delivery_attempt_count', v_invite.delivery_attempt_count
  );
end;
$$;

revoke execute on function public.servsync_prepare_home_access_invite_delivery(uuid) from public;
revoke execute on function public.servsync_prepare_home_access_invite_delivery(uuid) from anon;
grant execute on function public.servsync_prepare_home_access_invite_delivery(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
