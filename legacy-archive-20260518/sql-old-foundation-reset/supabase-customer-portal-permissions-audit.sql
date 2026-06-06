-- Customer Portal Permission Tightening for Prevention Pros LLC
-- Safe to re-run. This limits customer-visible data to what should appear in the portal.

-- 1) Customers should only read invoices that have actually been sent/posted.
drop policy if exists "Invoices: customers read own" on public.invoices;
create policy "Invoices: customers read own non-draft"
  on public.invoices
  for select
  to authenticated
  using (
    property_id = public.current_user_property_id()
    and status <> 'Draft'
  );

-- 2) Customers should only read reports explicitly published to the customer portal.
-- Internal drafts and older unmarked reports remain admin-only until you publish them.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'report_logs') then
    drop policy if exists "Report logs: customers read own published" on public.report_logs;
    create policy "Report logs: customers read own explicitly published"
      on public.report_logs
      for select
      to authenticated
      using (
        property_id = public.current_user_property_id()
        and coalesce(notes, '') like '%[Published to Customer]%'
        and coalesce(notes, '') not like '%[Internal Draft]%'
      );
  end if;
end $$;

-- 3) Customers should not be able to directly update full appointment rows.
-- They can only confirm, cancel, or request a new time through narrow RPC functions.
drop policy if exists "Appointments: customers update visible own" on public.appointments;

create or replace function public.customer_confirm_appointment(p_appointment_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_appointment public.appointments;
begin
  select property_id into v_property_id from public.profiles where id = auth.uid();
  if v_property_id is null then
    raise exception 'No customer property is linked to this account.';
  end if;

  update public.appointments
     set status = 'Confirmed',
         customer_request_notes = 'Customer confirmed appointment.',
         updated_at = now()
   where id = p_appointment_id
     and property_id = v_property_id
     and customer_visible = true
     and status in ('Confirmed', 'Customer Requested')
  returning * into v_appointment;

  if v_appointment.id is null then
    raise exception 'Appointment not found or cannot be confirmed.';
  end if;

  return v_appointment;
end;
$$;

grant execute on function public.customer_confirm_appointment(uuid) to authenticated;

create or replace function public.customer_cancel_appointment(p_appointment_id uuid, p_notes text default '')
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_appointment public.appointments;
begin
  select property_id into v_property_id from public.profiles where id = auth.uid();
  if v_property_id is null then
    raise exception 'No customer property is linked to this account.';
  end if;

  update public.appointments
     set status = 'Cancelled',
         customer_request_notes = coalesce(nullif(p_notes, ''), 'Customer cancelled appointment.'),
         updated_at = now()
   where id = p_appointment_id
     and property_id = v_property_id
     and customer_visible = true
     and status in ('Confirmed', 'Customer Requested')
  returning * into v_appointment;

  if v_appointment.id is null then
    raise exception 'Appointment not found or cannot be cancelled.';
  end if;

  return v_appointment;
end;
$$;

grant execute on function public.customer_cancel_appointment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
