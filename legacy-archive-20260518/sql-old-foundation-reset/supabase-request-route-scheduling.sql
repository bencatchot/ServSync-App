-- ServSync scheduling bridge for routed service requests.
-- Paste this into Supabase SQL Editor after service request routing/response/quote SQL.
-- Safe to re-run.

alter table public.service_request_routes
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

create index if not exists service_request_routes_appointment_idx
  on public.service_request_routes(appointment_id);

create or replace function public.propose_request_route_appointment(
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
  v_start timestamptz;
  v_end timestamptz;
  v_appt public.appointments%rowtype;
  v_accept_requested boolean;
  v_customer_note text;
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

  if v_route.appointment_id is not null then
    select *
      into v_existing
      from public.appointments
     where id = v_route.appointment_id;
  end if;

  v_accept_requested :=
    position('[ACCEPT_REQUESTED_TIME]' in coalesce(p_customer_note, '')) > 0
    or lower(coalesce(p_customer_note, '')) like '%accepted the homeowner requested appointment time%'
    or (
      v_existing.id is not null
      and v_existing.customer_requested_start is not null
      and v_existing.customer_requested_start = v_start
    );
  v_customer_note := trim(replace(coalesce(nullif(trim(p_customer_note), ''), 'Recommended appointment time for this service request.'), '[ACCEPT_REQUESTED_TIME]', ''));

  if v_route.appointment_id is not null then
    update public.appointments
       set title = 'Service visit: ' || v_request.category,
           status = case when v_accept_requested then 'Confirmed' else 'Recommended' end,
           visit_type = case when v_request.priority = 'Urgent' then 'Urgent' else 'Follow-up' end,
           recommended_date = v_start::date,
           scheduled_start = v_start,
           scheduled_end = v_end,
           duration_minutes = 60,
           time_window = p_time_window,
           customer_notes = v_customer_note,
           source = 'Service request route',
           customer_visible = true,
           customer_requested_start = case when v_accept_requested then null else customer_requested_start end,
           customer_request_notes = case
             when v_accept_requested then 'Contractor accepted the homeowner requested appointment time.'
             else customer_request_notes
           end,
           updated_at = now()
     where id = v_route.appointment_id
     returning * into v_appt;
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
      source,
      source_schedule_item_id,
      customer_visible
    ) values (
      gen_random_uuid(),
      v_route.organization_id,
      v_route.property_id,
      'Service visit: ' || v_request.category,
      case when v_accept_requested then 'Confirmed' else 'Recommended' end,
      case when v_request.priority = 'Urgent' then 'Urgent' else 'Follow-up' end,
      v_start::date,
      v_start,
      v_end,
      60,
      p_time_window,
      'Created from routed service request ' || v_route.request_id::text,
      v_customer_note,
      'Service request route',
      v_route.id,
      true
    )
    returning * into v_appt;

    update public.service_request_routes
       set appointment_id = v_appt.id,
           updated_at = now()
     where id = v_route.id;
  end if;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    v_route.property_id,
    v_route.organization_id,
    case when v_accept_requested then 'service_request_appointment_confirmed' else 'service_request_appointment_recommended' end,
    jsonb_build_object(
      'request_id', v_route.request_id,
      'route_id', v_route.id,
      'appointment_id', v_appt.id,
      'scheduled_start', v_appt.scheduled_start
    )
  );

  return v_appt;
end;
$$;

grant execute on function public.propose_request_route_appointment(uuid, text, text, text) to authenticated;

create or replace function public.contractor_accept_route_requested_time(p_route_id uuid)
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
    raise exception 'No appointment is linked to this request route.';
  end if;

  select *
    into v_existing
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
         scheduled_end = v_requested + make_interval(mins => coalesce(v_existing.duration_minutes, 60)),
         time_window = 'Custom',
         customer_requested_start = null,
         customer_request_notes = 'Contractor accepted the homeowner requested appointment time.',
         customer_visible = true,
         updated_at = now()
   where id = v_existing.id
   returning * into v_updated;

  update public.service_request_routes
     set updated_at = now()
   where id = v_route.id;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    v_route.property_id,
    v_route.organization_id,
    'service_request_appointment_confirmed',
    jsonb_build_object(
      'request_id', v_route.request_id,
      'route_id', v_route.id,
      'appointment_id', v_updated.id,
      'scheduled_start', v_updated.scheduled_start,
      'accepted_homeowner_requested_time', true
    )
  );

  return v_updated;
end;
$$;

grant execute on function public.contractor_accept_route_requested_time(uuid) to authenticated;

create or replace function public.get_contractor_calendar_appointments()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(to_jsonb(a) order by coalesce(a.scheduled_start, a.recommended_date::timestamptz, a.created_at)),
    '[]'::jsonb
  )
  from public.appointments a
  where (
      a.organization_id = public.current_user_organization_id()
      and public.current_user_can_manage_organization(a.organization_id)
    )
    or exists (
      select 1
        from public.service_request_routes srr
       where srr.appointment_id = a.id
         and srr.organization_id = public.current_user_organization_id()
         and public.current_user_can_manage_organization(srr.organization_id)
    );
$$;

grant execute on function public.get_contractor_calendar_appointments() to authenticated;

create or replace function public.get_contractor_routed_requests()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_id', srr.id,
        'request_id', srr.request_id,
        'property_id', srr.property_id,
        'connection_id', srr.connection_id,
        'organization_id', srr.organization_id,
        'status', srr.status,
        'response_message', srr.response_message,
        'response_next_action', srr.response_next_action,
        'estimate_range', srr.estimate_range,
        'responded_at', srr.responded_at,
        'homeowner_action', srr.homeowner_action,
        'homeowner_action_at', srr.homeowner_action_at,
        'quote_pdf_path', srr.quote_pdf_path,
        'quote_file_name', srr.quote_file_name,
        'quote_status', srr.quote_status,
        'quote_uploaded_at', srr.quote_uploaded_at,
        'appointment_id', srr.appointment_id,
        'appointment', case when a.id is null then null else jsonb_build_object(
          'id', a.id,
          'status', a.status,
          'scheduled_start', a.scheduled_start,
          'scheduled_end', a.scheduled_end,
          'time_window', a.time_window,
          'customer_requested_start', a.customer_requested_start,
          'customer_request_notes', a.customer_request_notes
        ) end,
        'routed_at', srr.created_at,
        'updated_at', srr.updated_at,
        'request', jsonb_build_object(
          'customer_name', r.customer_name,
          'category', r.category,
          'room', r.room,
          'description', r.description,
          'priority', r.priority,
          'photo_url', coalesce(r.photo_url, ''),
          'request_status', r.status,
          'contractor_notes', r.contractor_notes,
          'created_at', r.created_at
        ),
        'property', jsonb_build_object(
          'name', p.name,
          'owner', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.owner
            else ''
          end
        )
      )
      order by srr.created_at desc
    ),
    '[]'::jsonb
  )
  from public.service_request_routes srr
  join public.requests r on r.id = srr.request_id
  join public.properties p on p.id = srr.property_id
  join public.home_contractor_connections hcc on hcc.id = srr.connection_id
  left join public.appointments a on a.id = srr.appointment_id
  where srr.organization_id = public.current_user_organization_id()
    and public.current_user_can_manage_organization(srr.organization_id)
    and hcc.status = 'active';
$$;

grant execute on function public.get_contractor_routed_requests() to authenticated;

create or replace function public.get_my_request_routes(p_property_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_id', srr.id,
        'request_id', srr.request_id,
        'status', srr.status,
        'response_message', srr.response_message,
        'response_next_action', srr.response_next_action,
        'estimate_range', srr.estimate_range,
        'responded_at', srr.responded_at,
        'homeowner_action', srr.homeowner_action,
        'homeowner_action_at', srr.homeowner_action_at,
        'quote_pdf_path', srr.quote_pdf_path,
        'quote_file_name', srr.quote_file_name,
        'quote_status', srr.quote_status,
        'quote_uploaded_at', srr.quote_uploaded_at,
        'appointment_id', srr.appointment_id,
        'appointment', case when a.id is null then null else jsonb_build_object(
          'id', a.id,
          'status', a.status,
          'scheduled_start', a.scheduled_start,
          'scheduled_end', a.scheduled_end,
          'time_window', a.time_window,
          'customer_requested_start', a.customer_requested_start,
          'customer_request_notes', a.customer_request_notes
        ) end,
        'created_at', srr.created_at,
        'updated_at', srr.updated_at,
        'contractor', jsonb_build_object(
          'name', o.name,
          'support_email', o.support_email,
          'support_phone', o.support_phone
        )
      )
      order by srr.created_at desc
    ),
    '[]'::jsonb
  )
  from public.service_request_routes srr
  join public.organizations o on o.id = srr.organization_id
  left join public.appointments a on a.id = srr.appointment_id
  where srr.property_id = p_property_id
    and public.current_user_owns_property(p_property_id);
$$;

grant execute on function public.get_my_request_routes(uuid) to authenticated;

notify pgrst, 'reload schema';
