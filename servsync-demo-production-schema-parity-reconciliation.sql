-- ServSync Demo-to-Production schema parity reconciliation.
--
-- Apply only to the curated Demo project after the canonical repository
-- migrations listed in the Demo parity rollout record. Production is the
-- read-only definition authority for the four legacy appointment RPCs below.
-- This patch also removes superseded Draft-optional classifier helpers after
-- the canonical Durable Draft foundation and customer RPCs are installed.

begin;

do $$
declare
  v_mismatch text;
begin
  if to_regclass('public.demo_scenarios') is null
     or to_regclass('public.demo_scenario_runs') is null
     or to_regclass('public.demo_scenario_records') is null then
    raise exception 'DEMO_PARITY_TARGET_MISMATCH';
  end if;

  if to_regclass('public.contractor_work_drafts') is null
     or to_regclass('public.contractor_work_draft_items') is null
     or to_regclass('public.contractor_work_draft_launches') is null then
    raise exception 'DEMO_PARITY_DURABLE_DRAFT_MISSING';
  end if;

  select string_agg(expected.signature, ', ' order by expected.signature)
    into v_mismatch
    from (values
      ('public.servsync_contractor_propose_appointment(uuid,timestamp with time zone,text)'),
      ('public.servsync_contractor_respond_to_appointment(uuid,text,timestamp with time zone,text)'),
      ('public.servsync_homeowner_propose_appointment(uuid,timestamp with time zone,text)'),
      ('public.servsync_homeowner_respond_to_appointment(uuid,text,timestamp with time zone,text)')
    ) expected(signature)
   where to_regprocedure(expected.signature) is null;

  if v_mismatch is not null then
    raise exception 'DEMO_PARITY_APPOINTMENT_RPC_MISSING: %', v_mismatch;
  end if;

  select string_agg(p.proname, ', ' order by p.proname)
    into v_mismatch
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'servsync_contractor_propose_appointment',
       'servsync_contractor_respond_to_appointment',
       'servsync_homeowner_propose_appointment',
       'servsync_homeowner_respond_to_appointment'
     )
   group by p.proname
  having count(*) <> 1;

  if v_mismatch is not null then
    raise exception 'DEMO_PARITY_APPOINTMENT_RPC_OVERLOAD_MISMATCH: %', v_mismatch;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.servsync_contractor_propose_appointment(p_request_id uuid, p_proposed_at timestamp with time zone, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contractor_id uuid;
  v_request       public.service_requests;
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

  return jsonb_build_object('request_id', v_request.id, 'status', 'proposed', 'proposed_by', 'contractor');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.servsync_contractor_respond_to_appointment(p_request_id uuid, p_action text, p_proposed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    from public.servsync_current_contractor_profile()
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

    update public.contractor_visit_events
       set scheduled_at = p_proposed_at,
           notes = coalesce(nullif(trim(p_notes), ''), notes),
           homeowner_response_status = 'shared_waiting',
           updated_at = now()
     where id = v_appt.visit_event_id;

    update public.service_requests
       set status = 'contractor_responded',
           updated_at = now()
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

    update public.contractor_visit_events
       set scheduled_at = case when p_action = 'confirm' then v_appt.proposed_at else scheduled_at end,
           homeowner_response_status = case when p_action = 'confirm' then 'accepted' else 'declined' end,
           updated_at = now()
     where id = v_appt.visit_event_id;

    update public.service_requests
       set status = 'contractor_responded',
           updated_at = now()
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
$function$
;

CREATE OR REPLACE FUNCTION public.servsync_homeowner_propose_appointment(p_request_id uuid, p_proposed_at timestamp with time zone, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request public.service_requests;
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

  return jsonb_build_object('request_id', v_request.id, 'status', 'proposed', 'proposed_by', 'homeowner');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.servsync_homeowner_respond_to_appointment(p_request_id uuid, p_action text, p_proposed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    update public.contractor_visit_events
       set homeowner_response_status = 'countered',
           updated_at = now()
     where id = v_appt.visit_event_id;

    update public.service_requests
       set status = 'homeowner_replied',
           updated_at = now()
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

    update public.contractor_visit_events
       set homeowner_response_status = case when p_action = 'confirm' then 'accepted' else 'declined' end,
           updated_at = now()
     where id = v_appt.visit_event_id;

    update public.service_requests
       set status = case when p_action = 'confirm' then 'contractor_responded' else 'homeowner_replied' end,
           updated_at = now()
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
$function$
;

alter function public.servsync_contractor_propose_appointment(uuid, timestamptz, text) owner to postgres;
alter function public.servsync_contractor_respond_to_appointment(uuid, text, timestamptz, text) owner to postgres;
alter function public.servsync_homeowner_propose_appointment(uuid, timestamptz, text) owner to postgres;
alter function public.servsync_homeowner_respond_to_appointment(uuid, text, timestamptz, text) owner to postgres;

revoke all on function public.servsync_contractor_propose_appointment(uuid, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_contractor_respond_to_appointment(uuid, text, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_homeowner_propose_appointment(uuid, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.servsync_homeowner_respond_to_appointment(uuid, text, timestamptz, text) from public, anon, authenticated, service_role;

grant execute on function public.servsync_contractor_propose_appointment(uuid, timestamptz, text) to public, anon, authenticated, service_role;
grant execute on function public.servsync_contractor_respond_to_appointment(uuid, text, timestamptz, text) to public, anon, authenticated, service_role;
grant execute on function public.servsync_homeowner_propose_appointment(uuid, timestamptz, text) to public, anon, authenticated, service_role;
grant execute on function public.servsync_homeowner_respond_to_appointment(uuid, text, timestamptz, text) to public, anon, authenticated, service_role;

drop function if exists public.servsync_private_assert_canonical_customer_draft_foundation();
drop function if exists public.servsync_private_customer_draft_foundation_available();
drop function if exists public.servsync_private_local_customer_has_readable_work(uuid, uuid, uuid);

notify pgrst, 'reload schema';

commit;
