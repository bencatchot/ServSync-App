-- ServSync FB-030 Slice 1H-A home access invite delivery SQL foundation.
-- Adds delivery metadata and guarded RPC scaffolding only.
-- This patch does not send email/SMS/push, add Edge Functions, add UI,
-- broaden existing homeowner RLS, change storage policies, or grant shared
-- members access to service/work/financial/document/message/storage records.

begin;

alter table public.home_membership_audit_events
  drop constraint if exists home_membership_audit_events_event_type_check;
alter table public.home_membership_audit_events
  add constraint home_membership_audit_events_event_type_check
  check (event_type in (
    'invited',
    'accepted',
    'declined',
    'revoked',
    'email_invite_created',
    'email_invite_accepted',
    'email_invite_declined',
    'email_invite_revoked',
    'email_invite_delivery_prepared',
    'email_invite_delivery_disabled',
    'email_invite_delivery_sent',
    'email_invite_delivery_failed'
  ));

alter table public.home_membership_email_invites
  add column if not exists delivery_status text not null default 'not_sent',
  add column if not exists delivery_attempt_count integer not null default 0,
  add column if not exists last_delivery_attempt_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_delivery_error_code text,
  add column if not exists provider_message_id text;

alter table public.home_membership_email_invites
  drop constraint if exists home_membership_email_invites_delivery_status_check;
alter table public.home_membership_email_invites
  add constraint home_membership_email_invites_delivery_status_check
  check (delivery_status in ('not_sent', 'disabled', 'sent', 'failed'));

alter table public.home_membership_email_invites
  drop constraint if exists home_membership_email_invites_delivery_attempt_count_check;
alter table public.home_membership_email_invites
  add constraint home_membership_email_invites_delivery_attempt_count_check
  check (delivery_attempt_count >= 0 and delivery_attempt_count <= 100);

alter table public.home_membership_email_invites
  drop constraint if exists home_membership_email_invites_delivery_metadata_check;
alter table public.home_membership_email_invites
  add constraint home_membership_email_invites_delivery_metadata_check
  check (
    (delivery_status = 'sent'
      and last_sent_at is not null
      and last_delivery_error_code is null)
    or (delivery_status in ('not_sent', 'disabled', 'failed'))
  );

create index if not exists home_membership_email_invites_delivery_status_idx
  on public.home_membership_email_invites(delivery_status);

create index if not exists home_membership_email_invites_last_delivery_attempt_idx
  on public.home_membership_email_invites(last_delivery_attempt_at);

comment on column public.home_membership_email_invites.delivery_status is
  'FB-030 Slice 1H-A delivery scaffold status. This does not mean email delivery is enabled.';

comment on column public.home_membership_email_invites.provider_message_id is
  'Optional sanitized provider message id for future delivery worker use. Browser roles cannot update this column directly.';

create or replace function public.servsync_create_home_membership_email_invite(
  p_home_id uuid,
  p_invited_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_home public.homes%rowtype;
  v_actor_role text;
  v_invite public.home_membership_email_invites%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_home_id is null then
    raise exception 'Home is required.';
  end if;

  if v_email = ''
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid invited email is required.';
  end if;

  if v_role not in ('admin', 'member', 'viewer') then
    raise exception 'Home membership email invite role must be admin, member, or viewer.';
  end if;

  select *
    into v_home
    from public.homes
   where id = p_home_id;

  if not found then
    raise exception 'Home not found.';
  end if;

  v_actor_role := public.current_user_home_role(p_home_id);

  if coalesce(v_actor_role, '') not in ('owner', 'admin') then
    raise exception 'You do not have permission to invite home members.';
  end if;

  if v_role = 'admin' and v_home.homeowner_user_id is distinct from v_actor_id then
    raise exception 'Only the primary homeowner can invite home admins.';
  end if;

  if exists (
    select 1
      from public.home_membership_email_invites ei
     where ei.home_id = p_home_id
       and ei.invited_email_normalized = v_email
       and ei.status = 'pending'
  ) then
    raise exception 'A pending invite already exists for this email and home.';
  end if;

  insert into public.home_membership_email_invites (
    home_id,
    invited_email,
    invited_email_normalized,
    role,
    status,
    invited_by_user_id,
    expires_at
  ) values (
    p_home_id,
    btrim(p_invited_email),
    v_email,
    v_role,
    'pending',
    v_actor_id,
    now() + interval '30 days'
  )
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
    p_home_id,
    null,
    v_actor_id,
    null,
    'email_invite_created',
    null,
    v_role,
    null,
    'pending',
    jsonb_build_object(
      'email_invite_id', v_invite.id,
      'target_email', v_email
    )
  );

  return jsonb_build_object(
    'id', v_invite.id,
    'home_id', v_invite.home_id,
    'invited_email', v_invite.invited_email,
    'invited_email_normalized', v_invite.invited_email_normalized,
    'role', v_invite.role,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'delivery_status', v_invite.delivery_status,
    'delivery_attempt_count', v_invite.delivery_attempt_count,
    'created_at', v_invite.created_at
  );
end;
$$;

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

  select coalesce(nullif(btrim(p.full_name), ''), 'A homeowner')
    into v_inviter_label
    from public.profiles p
   where p.id = v_invite.invited_by_user_id;

  update public.home_membership_email_invites
     set delivery_status = case when v_delivery_enabled then delivery_status else 'disabled' end,
         delivery_attempt_count = delivery_attempt_count + 1,
         last_delivery_attempt_at = now(),
         last_delivery_error_code = case when v_delivery_enabled then last_delivery_error_code else 'delivery_disabled' end,
         provider_message_id = case when v_delivery_enabled then provider_message_id else null end
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

create or replace function public.servsync_record_home_access_invite_delivery_result(
  p_invite_id uuid,
  p_delivery_status text,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_delivery_status, '')));
  v_provider_message_id text := nullif(left(btrim(coalesce(p_provider_message_id, '')), 200), '');
  v_error_code text := nullif(left(regexp_replace(lower(btrim(coalesce(p_error_code, ''))), '[^a-z0-9_.:-]+', '_', 'g'), 80), '');
  v_invite public.home_membership_email_invites%rowtype;
begin
  if p_invite_id is null then
    raise exception 'Invite is required.';
  end if;

  if v_status not in ('sent', 'failed', 'disabled') then
    raise exception 'Delivery status must be sent, failed, or disabled.';
  end if;

  select *
    into v_invite
    from public.home_membership_email_invites
   where id = p_invite_id
   for update;

  if not found then
    raise exception 'Home membership email invite not found.';
  end if;

  update public.home_membership_email_invites
     set delivery_status = v_status,
         delivery_attempt_count = delivery_attempt_count + 1,
         last_delivery_attempt_at = now(),
         last_sent_at = case when v_status = 'sent' then now() else last_sent_at end,
         last_delivery_error_code = case
           when v_status = 'sent' then null
           when v_status = 'disabled' then coalesce(v_error_code, 'delivery_disabled')
           else coalesce(v_error_code, 'provider_error')
         end,
         provider_message_id = case when v_status = 'sent' then v_provider_message_id else null end
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
    null,
    null,
    case v_status
      when 'sent' then 'email_invite_delivery_sent'
      when 'failed' then 'email_invite_delivery_failed'
      else 'email_invite_delivery_disabled'
    end,
    null,
    v_invite.role,
    null,
    null,
    jsonb_build_object(
      'email_invite_id', v_invite.id,
      'delivery_status', v_invite.delivery_status,
      'error_code', v_invite.last_delivery_error_code,
      'provider_message_id_present', v_invite.provider_message_id is not null
    )
  );

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'delivery_status', v_invite.delivery_status,
    'delivery_attempt_count', v_invite.delivery_attempt_count,
    'last_delivery_attempt_at', v_invite.last_delivery_attempt_at,
    'last_sent_at', v_invite.last_sent_at,
    'last_delivery_error_code', v_invite.last_delivery_error_code,
    'provider_message_id_present', v_invite.provider_message_id is not null
  );
end;
$$;

revoke execute on function public.servsync_prepare_home_access_invite_delivery(uuid) from public;
revoke execute on function public.servsync_prepare_home_access_invite_delivery(uuid) from anon;
grant execute on function public.servsync_prepare_home_access_invite_delivery(uuid) to authenticated;

revoke execute on function public.servsync_record_home_access_invite_delivery_result(uuid, text, text, text) from public;
revoke execute on function public.servsync_record_home_access_invite_delivery_result(uuid, text, text, text) from anon;
revoke execute on function public.servsync_record_home_access_invite_delivery_result(uuid, text, text, text) from authenticated;
grant execute on function public.servsync_record_home_access_invite_delivery_result(uuid, text, text, text) to service_role;

revoke execute on function public.servsync_create_home_membership_email_invite(uuid, text, text) from public;
revoke execute on function public.servsync_create_home_membership_email_invite(uuid, text, text) from anon;
grant execute on function public.servsync_create_home_membership_email_invite(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
