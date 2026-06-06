-- Calendar v2 updates: actual calendar/manual blocked time/customer availability request
-- Run in Supabase SQL Editor after supabase-appointments-calendar.sql. Safe to re-run.

alter table public.appointments
  alter column property_id drop not null;

alter table public.appointments
  drop constraint if exists appointments_visit_type_check;

alter table public.appointments
  add constraint appointments_visit_type_check
  check (visit_type in ('Inspection', 'Follow-up', 'Urgent', 'Seasonal', 'Blocked', 'Other'));

-- Let customer request a new time without seeing the admin calendar.
-- Rule: if requested day has 2+ confirmed/requested appointments, recommend the next lighter day.
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
  v_day_count integer;
  v_recommend_date date;
  v_recommend_start timestamptz;
  i integer;
begin
  select property_id into v_property_id from public.profiles where id = auth.uid();
  if v_property_id is null then
    raise exception 'No customer property is linked to this account.';
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

  select count(*) into v_day_count
  from public.appointments
  where scheduled_start::date = v_requested::date
    and status in ('Confirmed', 'Customer Requested')
    and id <> p_appointment_id;

  if v_day_count < 2 then
    update public.appointments
    set status = 'Customer Requested',
        customer_requested_start = v_requested,
        customer_request_notes = coalesce(nullif(p_notes, ''), 'Customer requested a new appointment time.'),
        updated_at = now()
    where id = p_appointment_id;

    return jsonb_build_object(
      'available', true,
      'recommended_start', v_requested,
      'message', 'Your requested time has been sent to the contractor. This does not confirm the appointment; the contractor still needs to approve or offer another time.'
    );
  end if;

  for i in 1..21 loop
    v_recommend_date := (v_requested::date + i);
    select count(*) into v_day_count
    from public.appointments
    where scheduled_start::date = v_recommend_date
      and status in ('Confirmed', 'Customer Requested');
    if v_day_count < 2 then
      v_recommend_start := (v_recommend_date::text || ' 09:00:00')::timestamptz;
      exit;
    end if;
  end loop;

  update public.appointments
  set status = 'Customer Requested',
      customer_requested_start = v_recommend_start,
      customer_request_notes = 'Requested date was heavily booked. Suggested alternate: ' || coalesce(v_recommend_start::text, 'Please contact the contractor.'),
      updated_at = now()
  where id = p_appointment_id;

  return jsonb_build_object(
    'available', false,
    'recommended_start', v_recommend_start,
    'message', 'That day already has multiple appointments. We suggested another available day to the contractor. This does not confirm the appointment; the contractor still needs to approve or offer another time.'
  );
end;
$$;

grant execute on function public.request_appointment_time(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
