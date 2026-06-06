-- ServSync appointment workflow v3.
-- Paste into Supabase SQL Editor after the appointments and service_request_routes tables exist.
-- This intentionally uses new servsync_* RPC names to avoid older cached function behavior.

alter table public.service_request_routes
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

create index if not exists service_request_routes_appointment_idx
  on public.service_request_routes(appointment_id);

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  property_id uuid references public.properties(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null default 'system',
  event_type text not null,
  message text not null default '',
  previous_scheduled_start timestamptz,
  new_scheduled_start timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  notification_email_status text not null default 'pending',
  notification_sms_status text not null default 'pending',
  notification_push_status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.appointment_events enable row level security;

create index if not exists appointment_events_appointment_created_idx
  on public.appointment_events(appointment_id, created_at desc);

create index if not exists appointment_events_property_created_idx
  on public.appointment_events(property_id, created_at desc);

create or replace function public.servsync_log_appointment_event(
  p_appointment_id uuid,
  p_event_type text,
  p_message text default '',
  p_previous_scheduled_start timestamptz default null,
  p_new_scheduled_start timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.appointment_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_event public.appointment_events%rowtype;
  v_actor_role text := 'system';
begin
  select *
    into v_appointment
    from public.appointments
   where id = p_appointment_id;

  if v_appointment.id is null then
    raise exception 'Appointment not found.';
  end if;

  if auth.uid() is not null then
    if public.current_user_can_manage_organization(v_appointment.organization_id) then
      v_actor_role := 'contractor';
    elsif v_appointment.property_id = public.current_user_property_id() then
      v_actor_role := 'homeowner';
    else
      v_actor_role := 'user';
    end if;
  end if;

  insert into public.appointment_events (
    appointment_id,
    organization_id,
    property_id,
    actor_user_id,
    actor_role,
    event_type,
    message,
    previous_scheduled_start,
    new_scheduled_start,
    metadata
  ) values (
    v_appointment.id,
    v_appointment.organization_id,
    v_appointment.property_id,
    auth.uid(),
    v_actor_role,
    p_event_type,
    coalesce(p_message, ''),
    p_previous_scheduled_start,
    p_new_scheduled_start,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.servsync_contractor_propose_route_appointment(
  p_route_id uuid,
  p_scheduled_start text,
  p_time_window text default 'Morning',
  p_customer_note text default ''
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.service_request_routes%rowtype;
  v_request public.requests%rowtype;
  v_existing public.appointments%rowtype;
  v_appointment public.appointments%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_note text;
begin
  if p_time_window not in ('Morning', 'Midday', 'Afternoon', 'Custom') then
    raise exception 'Invalid time window.';
  end if;

  select *
    into v_route
    from public.service_request_routes
   where id = p_route_id
     and organization_id = public.current_user_organization_id()
     and public.current_user_can_manage_organization(organization_id);

  if v_route.id is null then
    raise exception 'Request route not found.';
  end if;

  select *
    into v_request
    from public.requests
   where id = v_route.request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  v_start := p_scheduled_start::timestamptz;
  v_end := v_start + interval '1 hour';
  v_note := coalesce(nullif(trim(p_customer_note), ''), 'Contractor recommended an appointment time.');

  if v_route.appointment_id is not null then
    select *
      into v_existing
      from public.appointments
     where id = v_route.appointment_id;
  end if;

  if v_existing.id is not null then
    update public.appointments
       set title = 'Service visit: ' || v_request.category,
           status = 'Recommended',
           visit_type = case when v_request.priority = 'Urgent' then 'Urgent' else 'Follow-up' end,
           recommended_date = v_start::date,
           scheduled_start = v_start,
           scheduled_end = v_end,
           duration_minutes = 60,
           time_window = p_time_window,
           customer_notes = v_note,
           customer_requested_start = null,
           customer_request_notes = 'Contractor proposed an appointment time. Homeowner confirmation is required.',
           source = 'Service request route',
           source_schedule_item_id = v_route.id,
           customer_visible = true,
           updated_at = now()
     where id = v_existing.id
     returning * into v_appointment;
  else
    insert into public.appointments (
      id,
      organization_id,
      property_id,
      title,
      status,
      visit_type,
      recommended_date,
      scheduled_start,
      scheduled_end,
      duration_minutes,
      time_window,
      internal_notes,
      customer_notes,
      customer_request_notes,
      source,
      source_schedule_item_id,
      customer_visible
    ) values (
      gen_random_uuid(),
      v_route.organization_id,
      v_route.property_id,
      'Service visit: ' || v_request.category,
      'Recommended',
      case when v_request.priority = 'Urgent' then 'Urgent' else 'Follow-up' end,
      v_start::date,
      v_start,
      v_end,
      60,
      p_time_window,
      'Created from routed service request ' || v_route.request_id::text,
      v_note,
      'Contractor proposed an appointment time. Homeowner confirmation is required.',
      'Service request route',
      v_route.id,
      true
    )
    returning * into v_appointment;

    update public.service_request_routes
       set appointment_id = v_appointment.id,
           updated_at = now()
     where id = v_route.id;
  end if;

  perform public.servsync_log_appointment_event(
    v_appointment.id,
    'contractor_proposed_time',
    'Contractor proposed an appointment time for homeowner review.',
    v_existing.scheduled_start,
    v_appointment.scheduled_start,
    jsonb_build_object('route_id', v_route.id, 'request_id', v_route.request_id, 'notification_ready', true)
  );

  return v_appointment;
end;
$$;

create or replace function public.servsync_homeowner_request_appointment_time(
  p_appointment_id uuid,
  p_requested_start text,
  p_notes text default ''
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_requested timestamptz;
begin
  select *
    into v_existing
    from public.appointments
   where id = p_appointment_id
     and property_id = public.current_user_property_id()
     and customer_visible = true;

  if v_existing.id is null then
    raise exception 'Appointment not found.';
  end if;

  v_requested := p_requested_start::timestamptz;

  update public.appointments
     set status = 'Customer Requested',
         customer_requested_start = v_requested,
         customer_request_notes = coalesce(nullif(trim(p_notes), ''), 'Homeowner requested a different appointment time.'),
         customer_visible = true,
         updated_at = now()
   where id = v_existing.id
   returning * into v_updated;

  perform public.servsync_log_appointment_event(
    v_updated.id,
    'homeowner_requested_time',
    'Homeowner requested a different appointment time. The official scheduled time is unchanged until the contractor accepts.',
    v_existing.scheduled_start,
    v_requested,
    jsonb_build_object('notification_ready', true)
  );

  return v_updated;
end;
$$;

create or replace function public.servsync_homeowner_confirm_appointment(
  p_appointment_id uuid
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.appointments%rowtype;
  v_updated public.appointments%rowtype;
begin
  select *
    into v_existing
    from public.appointments
   where id = p_appointment_id
     and property_id = public.current_user_property_id()
     and customer_visible = true;

  if v_existing.id is null then
    raise exception 'Appointment not found.';
  end if;

  update public.appointments
     set status = 'Confirmed',
         customer_requested_start = null,
         customer_request_notes = 'Homeowner accepted the contractor proposed appointment time.',
         customer_visible = true,
         updated_at = now()
   where id = v_existing.id
   returning * into v_updated;

  perform public.servsync_log_appointment_event(
    v_updated.id,
    'homeowner_confirmed_time',
    'Homeowner accepted the contractor proposed appointment time.',
    v_existing.scheduled_start,
    v_updated.scheduled_start,
    jsonb_build_object('notification_ready', true)
  );

  return v_updated;
end;
$$;

create or replace function public.servsync_contractor_accept_homeowner_time(
  p_route_id uuid
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.service_request_routes%rowtype;
  v_existing public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_requested timestamptz;
begin
  select *
    into v_route
    from public.service_request_routes
   where id = p_route_id
     and organization_id = public.current_user_organization_id()
     and public.current_user_can_manage_organization(organization_id);

  if v_route.id is null then
    raise exception 'Request route not found.';
  end if;

  if v_route.appointment_id is null then
    raise exception 'No appointment is linked to this request.';
  end if;

  select *
    into v_existing
    from public.appointments
   where id = v_route.appointment_id;

  if v_existing.id is null then
    raise exception 'Linked appointment not found.';
  end if;

  if v_existing.customer_requested_start is null then
    raise exception 'No homeowner requested time is waiting for contractor acceptance.';
  end if;

  v_requested := v_existing.customer_requested_start;

  update public.appointments
     set status = 'Confirmed',
         recommended_date = v_requested::date,
         scheduled_start = v_requested,
         scheduled_end = v_requested + make_interval(mins => coalesce(v_existing.duration_minutes, 60)),
         time_window = 'Custom',
         customer_notes = 'Contractor accepted the homeowner requested appointment time.',
         customer_requested_start = null,
         customer_request_notes = 'Contractor accepted the homeowner requested appointment time. No additional homeowner confirmation is required.',
         customer_visible = true,
         updated_at = now()
   where id = v_existing.id
   returning * into v_updated;

  update public.service_request_routes
     set updated_at = now()
   where id = v_route.id;

  perform public.servsync_log_appointment_event(
    v_updated.id,
    'contractor_accepted_homeowner_time',
    'Contractor accepted the homeowner requested appointment time.',
    v_existing.scheduled_start,
    v_updated.scheduled_start,
    jsonb_build_object('route_id', v_route.id, 'request_id', v_route.request_id, 'notification_ready', true)
  );

  return v_updated;
end;
$$;

grant execute on function public.servsync_log_appointment_event(uuid, text, text, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.servsync_contractor_propose_route_appointment(uuid, text, text, text) to authenticated;
grant execute on function public.servsync_homeowner_request_appointment_time(uuid, text, text) to authenticated;
grant execute on function public.servsync_homeowner_confirm_appointment(uuid) to authenticated;
grant execute on function public.servsync_contractor_accept_homeowner_time(uuid) to authenticated;

create or replace function public.servsync_clear_test_request_workflow()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to clear test workflow data.';
  end if;

  delete from public.appointment_events;
  delete from public.service_request_routes;
  delete from public.appointments;
  delete from public.requests;

  return jsonb_build_object(
    'requests_remaining', (select count(*) from public.requests),
    'routes_remaining', (select count(*) from public.service_request_routes),
    'appointments_remaining', (select count(*) from public.appointments),
    'appointment_events_remaining', (select count(*) from public.appointment_events)
  );
end;
$$;

grant execute on function public.servsync_clear_test_request_workflow() to authenticated;

create or replace function public.servsync_clear_test_request_workflow_v2(p_reason text default 'manual_test_reset')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.appointment_events;
  delete from public.service_request_routes;
  delete from public.appointments;
  delete from public.requests;

  return jsonb_build_object(
    'reason', coalesce(p_reason, 'manual_test_reset'),
    'requests_remaining', (select count(*) from public.requests),
    'routes_remaining', (select count(*) from public.service_request_routes),
    'appointments_remaining', (select count(*) from public.appointments),
    'appointment_events_remaining', (select count(*) from public.appointment_events)
  );
end;
$$;

grant execute on function public.servsync_clear_test_request_workflow_v2(text) to authenticated;
grant execute on function public.servsync_clear_test_request_workflow_v2(text) to anon;

notify pgrst, 'reload schema';
