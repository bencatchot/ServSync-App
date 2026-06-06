-- ServSync appointment workflow foundation.
-- Paste into Supabase SQL Editor after the request route scheduling SQL.
-- Safe to re-run.

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

drop policy if exists "Appointment events: platform admins manage all" on public.appointment_events;
drop policy if exists "Appointment events: contractors read own organization" on public.appointment_events;
drop policy if exists "Appointment events: homeowners read own property" on public.appointment_events;

create policy "Appointment events: platform admins manage all"
  on public.appointment_events
  for all
  to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

create policy "Appointment events: contractors read own organization"
  on public.appointment_events
  for select
  to authenticated
  using (
    organization_id = public.current_user_organization_id()
    and public.current_user_can_manage_organization(organization_id)
  );

create policy "Appointment events: homeowners read own property"
  on public.appointment_events
  for select
  to authenticated
  using (property_id = public.current_user_property_id());

create or replace function public.log_appointment_event(
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
  v_appointment public.appointments;
  v_event public.appointment_events;
  v_actor_role text := 'system';
begin
  select * into v_appointment
    from public.appointments
   where id = p_appointment_id;

  if v_appointment.id is null then
    raise exception 'Appointment not found.';
  end if;

  if auth.uid() is not null then
    if public.current_user_is_platform_admin() then
      v_actor_role := 'platform_admin';
    elsif public.current_user_can_manage_organization(v_appointment.organization_id) then
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

grant execute on function public.log_appointment_event(uuid, text, text, timestamptz, timestamptz, jsonb) to authenticated;

create or replace function public.contractor_update_appointment_schedule(
  p_appointment_id uuid,
  p_scheduled_start text,
  p_status text default 'Recommended',
  p_time_window text default 'Morning',
  p_customer_note text default '',
  p_internal_note text default ''
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.appointments;
  v_updated public.appointments;
  v_start timestamptz;
  v_end timestamptz;
  v_event_type text;
begin
  if p_status not in ('Recommended', 'Confirmed', 'Customer Requested', 'Cancelled', 'Completed') then
    raise exception 'Invalid appointment status.';
  end if;

  if p_time_window not in ('Morning', 'Midday', 'Afternoon', 'Custom') then
    raise exception 'Invalid time window.';
  end if;

  select * into v_existing
    from public.appointments
   where id = p_appointment_id
     and (
       (
         organization_id = public.current_user_organization_id()
         and public.current_user_can_manage_organization(organization_id)
       )
       or exists (
         select 1
           from public.service_request_routes srr
          where srr.appointment_id = appointments.id
            and srr.organization_id = public.current_user_organization_id()
            and public.current_user_can_manage_organization(srr.organization_id)
       )
     );

  if v_existing.id is null then
    raise exception 'Appointment not found.';
  end if;

  v_start := p_scheduled_start::timestamptz;
  v_end := v_start + make_interval(mins => coalesce(v_existing.duration_minutes, 60));
  v_event_type := case
    when v_existing.scheduled_start is distinct from v_start and p_status = 'Confirmed' then 'contractor_confirmed_changed_time'
    when v_existing.scheduled_start is distinct from v_start then 'contractor_proposed_changed_time'
    when p_status = 'Confirmed' then 'contractor_confirmed_time'
    else 'contractor_updated_appointment'
  end;

  update public.appointments
     set status = p_status,
         recommended_date = v_start::date,
         scheduled_start = v_start,
         scheduled_end = v_end,
         time_window = p_time_window,
         customer_notes = coalesce(nullif(trim(p_customer_note), ''), customer_notes),
         internal_notes = coalesce(nullif(trim(p_internal_note), ''), internal_notes),
         customer_visible = true,
         customer_requested_start = case when p_status = 'Confirmed' then null else customer_requested_start end,
         customer_request_notes = case
           when p_status = 'Confirmed' then 'Contractor confirmed appointment time.'
           when v_existing.scheduled_start is distinct from v_start then 'Contractor proposed a new appointment time.'
           else customer_request_notes
         end,
         updated_at = now()
   where id = v_existing.id
  returning * into v_updated;

  perform public.log_appointment_event(
    v_updated.id,
    v_event_type,
    case
      when v_existing.scheduled_start is distinct from v_start and p_status = 'Confirmed' then 'Contractor changed and confirmed the appointment time.'
      when v_existing.scheduled_start is distinct from v_start then 'Contractor proposed a new appointment time.'
      when p_status = 'Confirmed' then 'Contractor confirmed the appointment time.'
      else 'Contractor updated the appointment.'
    end,
    v_existing.scheduled_start,
    v_updated.scheduled_start,
    jsonb_build_object('status', p_status, 'notification_ready', true)
  );

  return v_updated;
end;
$$;

grant execute on function public.contractor_update_appointment_schedule(uuid, text, text, text, text, text) to authenticated;

create or replace function public.contractor_accept_requested_appointment_time(p_appointment_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.appointments;
  v_updated public.appointments;
  v_requested timestamptz;
begin
  select * into v_existing
    from public.appointments
   where id = p_appointment_id
     and organization_id = public.current_user_organization_id()
     and public.current_user_can_manage_organization(organization_id);

  if v_existing.id is null then
    raise exception 'Appointment not found.';
  end if;

  if v_existing.customer_requested_start is null then
    raise exception 'No homeowner requested time is waiting for approval.';
  end if;

  v_requested := v_existing.customer_requested_start;

  update public.appointments
     set status = 'Confirmed',
         recommended_date = v_requested::date,
         scheduled_start = v_requested,
         scheduled_end = v_requested + make_interval(mins => coalesce(duration_minutes, 60)),
         customer_requested_start = null,
         customer_request_notes = 'Contractor accepted the homeowner requested appointment time.',
         customer_visible = true,
         updated_at = now()
   where id = v_existing.id
  returning * into v_updated;

  perform public.log_appointment_event(
    v_updated.id,
    'contractor_accepted_homeowner_time',
    'Contractor accepted the homeowner requested appointment time.',
    v_existing.scheduled_start,
    v_updated.scheduled_start,
    jsonb_build_object('notification_ready', true)
  );

  return v_updated;
end;
$$;

grant execute on function public.contractor_accept_requested_appointment_time(uuid) to authenticated;

create or replace function public.contractor_accept_route_requested_time(p_route_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.service_request_routes;
  v_existing public.appointments;
  v_updated public.appointments;
  v_requested timestamptz;
begin
  select * into v_route
    from public.service_request_routes
   where id = p_route_id
     and organization_id = public.current_user_organization_id()
     and public.current_user_can_manage_organization(organization_id);

  if v_route.id is null then
    raise exception 'Request route not found.';
  end if;

  if v_route.appointment_id is null then
    raise exception 'No appointment is linked to this request route.';
  end if;

  select * into v_existing
    from public.appointments
   where id = v_route.appointment_id;

  if v_existing.id is null then
    raise exception 'Linked appointment not found.';
  end if;

  if v_existing.customer_requested_start is null then
    raise exception 'No homeowner requested time is waiting for approval.';
  end if;

  v_requested := v_existing.customer_requested_start;

  update public.appointments
     set status = 'Confirmed',
         recommended_date = v_requested::date,
         scheduled_start = v_requested,
         scheduled_end = v_requested + make_interval(mins => coalesce(duration_minutes, 60)),
         customer_requested_start = null,
         customer_request_notes = 'Contractor accepted the homeowner requested appointment time.',
         customer_visible = true,
         updated_at = now()
   where id = v_existing.id
  returning * into v_updated;

  perform public.log_appointment_event(
    v_updated.id,
    'contractor_accepted_homeowner_time',
    'Contractor accepted the homeowner requested appointment time.',
    v_existing.scheduled_start,
    v_updated.scheduled_start,
    jsonb_build_object('route_id', p_route_id, 'notification_ready', true)
  );

  update public.service_request_routes
     set updated_at = now()
   where id = v_route.id;

  return v_updated;
end;
$$;

grant execute on function public.contractor_accept_route_requested_time(uuid) to authenticated;

create or replace function public.customer_confirm_appointment(p_appointment_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_existing public.appointments;
  v_appointment public.appointments;
begin
  select property_id into v_property_id from public.profiles where id = auth.uid();
  if v_property_id is null then
    raise exception 'No homeowner property is linked to this account.';
  end if;

  select * into v_existing
    from public.appointments
   where id = p_appointment_id
     and property_id = v_property_id
     and customer_visible = true;

  if v_existing.id is null then
    raise exception 'Appointment not found or cannot be confirmed.';
  end if;

  update public.appointments
     set status = 'Confirmed',
         customer_requested_start = null,
         customer_request_notes = 'Homeowner accepted the contractor appointment time.',
         updated_at = now()
   where id = v_existing.id
  returning * into v_appointment;

  perform public.log_appointment_event(
    v_appointment.id,
    'homeowner_accepted_time',
    'Homeowner accepted the appointment time.',
    v_existing.scheduled_start,
    v_appointment.scheduled_start,
    jsonb_build_object('notification_ready', true)
  );

  return v_appointment;
end;
$$;

grant execute on function public.customer_confirm_appointment(uuid) to authenticated;

create or replace function public.request_appointment_time(
  p_appointment_id uuid,
  p_requested_start text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_appt public.appointments;
  v_requested timestamptz;
begin
  select property_id into v_property_id from public.profiles where id = auth.uid();
  if v_property_id is null then
    raise exception 'No homeowner property is linked to this account.';
  end if;

  select * into v_appt
    from public.appointments
   where id = p_appointment_id
     and property_id = v_property_id
     and customer_visible = true;

  if v_appt.id is null then
    raise exception 'Appointment not found.';
  end if;

  v_requested := p_requested_start::timestamptz;

  update public.appointments
     set status = 'Customer Requested',
         customer_requested_start = v_requested,
         customer_request_notes = coalesce(nullif(p_notes, ''), 'Homeowner requested a new appointment time.'),
         updated_at = now()
   where id = p_appointment_id;

  perform public.log_appointment_event(
    v_appt.id,
    'homeowner_requested_new_time',
    'Homeowner requested a different appointment time. The official appointment time is unchanged until the contractor confirms.',
    v_appt.scheduled_start,
    v_requested,
    jsonb_build_object('notification_ready', true)
  );

  return jsonb_build_object(
    'available', true,
    'requested_start', v_requested,
    'official_start', v_appt.scheduled_start,
    'message', 'Your requested time has been sent to the contractor. This does not confirm the appointment; the contractor still needs to approve or offer another time.'
  );
end;
$$;

grant execute on function public.request_appointment_time(uuid, text, text) to authenticated;

create or replace function public.get_my_appointment_events(p_property_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(to_jsonb(ae) order by ae.created_at desc),
    '[]'::jsonb
  )
  from public.appointment_events ae
  where ae.property_id = p_property_id
    and p_property_id = public.current_user_property_id();
$$;

grant execute on function public.get_my_appointment_events(uuid) to authenticated;

notify pgrst, 'reload schema';
