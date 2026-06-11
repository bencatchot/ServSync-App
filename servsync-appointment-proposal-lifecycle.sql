-- ServSync appointment proposal lifecycle visibility.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Run after:
--   - servsync-appointment-counter-proposal.sql
--   - servsync-reschedule-appointment.sql
--
-- Keeps proposed appointments visible in the service request thread and keeps
-- the parent request in an active homeowner/contractor response state.

begin;

create or replace function public.servsync_appointment_display_time(p_proposed_at timestamptz)
returns text
language sql
stable
as $$
  select to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM "UTC"');
$$;

create or replace function public.servsync_contractor_propose_appointment(
  p_request_id  uuid,
  p_proposed_at timestamptz,
  p_notes       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request       public.service_requests;
  v_body          text;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  select * into v_request
    from public.service_requests
   where id = p_request_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'Cannot propose an appointment on a closed request.';
  end if;

  if p_proposed_at <= now() then
    raise exception 'Proposed date must be in the future.';
  end if;

  insert into public.service_request_appointments
    (request_id, contractor_id, proposed_at, notes, status, proposed_by)
  values
    (v_request.id, v_contractor_id, p_proposed_at,
     coalesce(nullif(trim(p_notes), ''), ''), 'proposed', 'contractor')
  on conflict (request_id) do update
     set proposed_at  = excluded.proposed_at,
         notes        = excluded.notes,
         status       = 'proposed',
         proposed_by  = 'contractor';

  update public.service_requests
     set status = 'contractor_responded'
   where id = v_request.id
     and status not in ('declined', 'closed');

  v_body := concat_ws(
    E'\n',
    'Appointment proposed for ' || public.servsync_appointment_display_time(p_proposed_at) || '.',
    nullif(trim(coalesce(p_notes, '')), '')
  );

  insert into public.service_request_messages (
    request_id,
    actor_user_id,
    actor_role,
    message_type,
    body
  ) values (
    v_request.id,
    auth.uid(),
    'contractor',
    'appointment_update',
    v_body
  );

  return jsonb_build_object('request_id', v_request.id, 'status', 'proposed', 'proposed_by', 'contractor');
end;
$$;

create or replace function public.servsync_homeowner_propose_appointment(
  p_request_id  uuid,
  p_proposed_at timestamptz,
  p_notes       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_body    text;
begin
  select * into v_request
    from public.service_requests
   where id = p_request_id
     and homeowner_user_id = auth.uid()
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'Cannot schedule an appointment on a closed request.';
  end if;

  if p_proposed_at <= now() then
    raise exception 'Proposed date must be in the future.';
  end if;

  insert into public.service_request_appointments
    (request_id, contractor_id, proposed_at, notes, status, proposed_by)
  values
    (v_request.id, v_request.contractor_id, p_proposed_at,
     coalesce(nullif(trim(p_notes), ''), ''), 'proposed', 'homeowner')
  on conflict (request_id) do update
     set proposed_at  = excluded.proposed_at,
         notes        = excluded.notes,
         status       = 'proposed',
         proposed_by  = 'homeowner';

  update public.service_requests
     set status = 'homeowner_replied'
   where id = v_request.id
     and status not in ('declined', 'closed');

  v_body := concat_ws(
    E'\n',
    'Appointment time requested for ' || public.servsync_appointment_display_time(p_proposed_at) || '.',
    nullif(trim(coalesce(p_notes, '')), '')
  );

  insert into public.service_request_messages (
    request_id,
    actor_user_id,
    actor_role,
    message_type,
    body
  ) values (
    v_request.id,
    auth.uid(),
    'homeowner',
    'appointment_update',
    v_body
  );

  return jsonb_build_object('request_id', v_request.id, 'status', 'proposed', 'proposed_by', 'homeowner');
end;
$$;

drop function if exists public.servsync_homeowner_respond_to_appointment(uuid, text);

create or replace function public.servsync_homeowner_respond_to_appointment(
  p_request_id  uuid,
  p_action      text,
  p_proposed_at timestamptz default null,
  p_notes       text        default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt public.service_request_appointments;
  v_body text;
begin
  if p_action not in ('confirm', 'decline', 'counter') then
    raise exception 'Action must be confirm, decline, or counter.';
  end if;

  if p_action = 'counter' and p_proposed_at is null then
    raise exception 'A proposed date/time is required for a counter-proposal.';
  end if;

  if p_action = 'counter' and p_proposed_at <= now() then
    raise exception 'Proposed date must be in the future.';
  end if;

  if not exists (
    select 1 from public.service_requests
     where id = p_request_id and homeowner_user_id = auth.uid()
  ) then
    raise exception 'Request not found.';
  end if;

  select * into v_appt
    from public.service_request_appointments
   where request_id = p_request_id
   limit 1;

  if v_appt.id is null then
    raise exception 'No appointment found for this request.';
  end if;

  if v_appt.status not in ('proposed') then
    raise exception 'This appointment can no longer be changed.';
  end if;

  if v_appt.proposed_by <> 'contractor' then
    raise exception 'Waiting for contractor to respond to your counter-proposal.';
  end if;

  if p_action = 'counter' then
    update public.service_request_appointments
       set proposed_at  = p_proposed_at,
           notes        = coalesce(nullif(trim(p_notes), ''), ''),
           status       = 'proposed',
           proposed_by  = 'homeowner'
     where id = v_appt.id;

    update public.service_requests
       set status = 'homeowner_replied'
     where id = p_request_id
       and status not in ('declined', 'closed');

    v_body := concat_ws(
      E'\n',
      'New appointment time requested for ' || public.servsync_appointment_display_time(p_proposed_at) || '.',
      nullif(trim(coalesce(p_notes, '')), '')
    );

    insert into public.service_request_messages (request_id, actor_user_id, actor_role, message_type, body)
    values (p_request_id, auth.uid(), 'homeowner', 'appointment_update', v_body);

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', 'proposed',
      'proposed_by', 'homeowner'
    );
  else
    update public.service_request_appointments
       set status = case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
     where id = v_appt.id;

    update public.service_requests
       set status = case when p_action = 'confirm' then 'contractor_responded' else 'homeowner_replied' end
     where id = p_request_id
       and status not in ('declined', 'closed');

    insert into public.service_request_messages (request_id, actor_user_id, actor_role, message_type, body)
    values (
      p_request_id,
      auth.uid(),
      'homeowner',
      'appointment_update',
      case
        when p_action = 'confirm' then 'Appointment confirmed for ' || public.servsync_appointment_display_time(v_appt.proposed_at) || '.'
        else 'Appointment proposal declined.'
      end
    );

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
    );
  end if;
end;
$$;

create or replace function public.servsync_contractor_respond_to_appointment(
  p_request_id  uuid,
  p_action      text,
  p_proposed_at timestamptz default null,
  p_notes       text        default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_appt          public.service_request_appointments;
  v_body          text;
begin
  if p_action not in ('confirm', 'decline', 'counter') then
    raise exception 'Action must be confirm, decline, or counter.';
  end if;

  if p_action = 'counter' and p_proposed_at is null then
    raise exception 'A proposed date/time is required for a counter-proposal.';
  end if;

  if p_action = 'counter' and p_proposed_at <= now() then
    raise exception 'Proposed date must be in the future.';
  end if;

  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  select * into v_appt
    from public.service_request_appointments
   where request_id = p_request_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_appt.id is null then
    raise exception 'Appointment not found.';
  end if;

  if v_appt.status not in ('proposed') then
    raise exception 'This appointment can no longer be changed.';
  end if;

  if v_appt.proposed_by <> 'homeowner' then
    raise exception 'No homeowner counter-proposal to respond to.';
  end if;

  if p_action = 'counter' then
    update public.service_request_appointments
       set proposed_at  = p_proposed_at,
           notes        = coalesce(nullif(trim(p_notes), ''), ''),
           status       = 'proposed',
           proposed_by  = 'contractor'
     where id = v_appt.id;

    update public.service_requests
       set status = 'contractor_responded'
     where id = p_request_id
       and status not in ('declined', 'closed');

    v_body := concat_ws(
      E'\n',
      'New appointment time proposed for ' || public.servsync_appointment_display_time(p_proposed_at) || '.',
      nullif(trim(coalesce(p_notes, '')), '')
    );

    insert into public.service_request_messages (request_id, actor_user_id, actor_role, message_type, body)
    values (p_request_id, auth.uid(), 'contractor', 'appointment_update', v_body);

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', 'proposed',
      'proposed_by', 'contractor'
    );
  else
    update public.service_request_appointments
       set status = case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
     where id = v_appt.id;

    update public.service_requests
       set status = 'contractor_responded'
     where id = p_request_id
       and status not in ('declined', 'closed');

    insert into public.service_request_messages (request_id, actor_user_id, actor_role, message_type, body)
    values (
      p_request_id,
      auth.uid(),
      'contractor',
      'appointment_update',
      case
        when p_action = 'confirm' then 'Appointment confirmed for ' || public.servsync_appointment_display_time(v_appt.proposed_at) || '.'
        else 'Appointment proposal declined.'
      end
    );

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
    );
  end if;
end;
$$;

grant execute on function public.servsync_appointment_display_time(timestamptz) to authenticated;
grant execute on function public.servsync_contractor_propose_appointment(uuid, timestamptz, text) to authenticated;
grant execute on function public.servsync_homeowner_propose_appointment(uuid, timestamptz, text) to authenticated;
grant execute on function public.servsync_homeowner_respond_to_appointment(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.servsync_contractor_respond_to_appointment(uuid, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';

commit;
