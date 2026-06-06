-- ServSync appointment scheduling v1.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-quote-attachment.sql has been applied.
--
-- Contractor proposes a date/time. Homeowner confirms or declines.
-- One appointment per service request; contractor can re-propose after a decline.

begin;

create table if not exists public.service_request_appointments (
  id            uuid        primary key default gen_random_uuid(),
  request_id    uuid        not null unique references public.service_requests(id) on delete cascade,
  contractor_id uuid        not null references public.contractor_profiles(id) on delete cascade,
  proposed_at   timestamptz not null,
  notes         text        not null default '',
  status        text        not null default 'proposed'
                check (status in ('proposed', 'confirmed', 'completed', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists service_request_appointments_touch_updated_at on public.service_request_appointments;
create trigger service_request_appointments_touch_updated_at
  before update on public.service_request_appointments
  for each row execute function public.touch_updated_at();

alter table public.service_request_appointments enable row level security;

drop policy if exists "Appointments: connected parties read"    on public.service_request_appointments;
drop policy if exists "Appointments: contractor create"         on public.service_request_appointments;
drop policy if exists "Appointments: connected parties update"  on public.service_request_appointments;

create policy "Appointments: connected parties read"
  on public.service_request_appointments for select to authenticated
  using (public.current_user_can_access_service_request(request_id));

create policy "Appointments: contractor create"
  on public.service_request_appointments for insert to authenticated
  with check (
    public.current_user_owns_contractor(contractor_id)
    and public.current_user_can_access_service_request(request_id)
  );

create policy "Appointments: connected parties update"
  on public.service_request_appointments for update to authenticated
  using  (public.current_user_can_access_service_request(request_id))
  with check (public.current_user_can_access_service_request(request_id));

-- Contractor proposes (or re-proposes) an appointment
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
    (request_id, contractor_id, proposed_at, notes, status)
  values
    (v_request.id, v_contractor_id, p_proposed_at,
     coalesce(nullif(trim(p_notes), ''), ''), 'proposed')
  on conflict (request_id) do update
     set proposed_at = excluded.proposed_at,
         notes       = excluded.notes,
         status      = 'proposed';

  return jsonb_build_object('request_id', v_request.id, 'status', 'proposed');
end;
$$;

-- Homeowner confirms or declines the proposed appointment
create or replace function public.servsync_homeowner_respond_to_appointment(
  p_request_id uuid,
  p_action     text   -- 'confirm' or 'decline'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt public.service_request_appointments;
begin
  if p_action not in ('confirm', 'decline') then
    raise exception 'Action must be confirm or decline.';
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

  update public.service_request_appointments
     set status = case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
   where id = v_appt.id;

  return jsonb_build_object(
    'appointment_id', v_appt.id,
    'status', case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
  );
end;
$$;

-- Contractor marks appointment as completed
create or replace function public.servsync_contractor_complete_appointment(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_appt          public.service_request_appointments;
begin
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

  if v_appt.status <> 'confirmed' then
    raise exception 'Only confirmed appointments can be marked complete.';
  end if;

  update public.service_request_appointments
     set status = 'completed'
   where id = v_appt.id;

  return jsonb_build_object('appointment_id', v_appt.id, 'status', 'completed');
end;
$$;

-- Rebuild fetch RPCs to include appointment column.
drop function if exists public.servsync_homeowner_service_requests();

create function public.servsync_homeowner_service_requests()
returns table (
  id                uuid,
  connection_id     uuid,
  contractor_id     uuid,
  contractor_name   text,
  homeowner_user_id uuid,
  homeowner_name    text,
  homeowner_city    text,
  category          text,
  title             text,
  description       text,
  urgency           text,
  status            text,
  messages          jsonb,
  quote             jsonb,
  appointment       jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    sr.id,
    sr.connection_id,
    sr.contractor_id,
    cp.business_name                        as contractor_name,
    sr.homeowner_user_id,
    coalesce(hp.display_name, 'Homeowner')  as homeowner_name,
    coalesce(hp.city, '')                   as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id',            m.id,
           'actor_user_id', m.actor_user_id,
           'actor_role',    m.actor_role,
           'message_type',  m.message_type,
           'body',          m.body,
           'created_at',    m.created_at
         ) order by m.created_at asc
       )
       from public.service_request_messages m
       where m.request_id = sr.id),
      '[]'::jsonb
    )                                       as messages,
    (select jsonb_build_object(
       'id',            q.id,
       'request_id',    q.request_id,
       'contractor_id', q.contractor_id,
       'amount_cents',  q.amount_cents,
       'scope',         q.scope,
       'status',        q.status,
       'created_at',    q.created_at,
       'updated_at',    q.updated_at
     )
     from public.service_request_quotes q
     where q.request_id = sr.id
     limit 1)                               as quote,
    (select jsonb_build_object(
       'id',            a.id,
       'request_id',    a.request_id,
       'contractor_id', a.contractor_id,
       'proposed_at',   a.proposed_at,
       'notes',         a.notes,
       'status',        a.status,
       'created_at',    a.created_at,
       'updated_at',    a.updated_at
     )
     from public.service_request_appointments a
     where a.request_id = sr.id
     limit 1)                               as appointment,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where sr.homeowner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

drop function if exists public.servsync_contractor_service_requests();

create function public.servsync_contractor_service_requests()
returns table (
  id                uuid,
  connection_id     uuid,
  contractor_id     uuid,
  contractor_name   text,
  homeowner_user_id uuid,
  homeowner_name    text,
  homeowner_city    text,
  category          text,
  title             text,
  description       text,
  urgency           text,
  status            text,
  messages          jsonb,
  quote             jsonb,
  appointment       jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    sr.id,
    sr.connection_id,
    sr.contractor_id,
    cp.business_name                                                         as contractor_name,
    sr.homeowner_user_id,
    case when coalesce(perm.share_contact, false)
         then coalesce(hp.display_name, 'Homeowner')
         else 'Homeowner' end                                                as homeowner_name,
    case when coalesce(perm.share_contact, false)
         then coalesce(hp.city, '')
         else '' end                                                         as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id',            m.id,
           'actor_user_id', m.actor_user_id,
           'actor_role',    m.actor_role,
           'message_type',  m.message_type,
           'body',          m.body,
           'created_at',    m.created_at
         ) order by m.created_at asc
       )
       from public.service_request_messages m
       where m.request_id = sr.id),
      '[]'::jsonb
    )                                                                        as messages,
    (select jsonb_build_object(
       'id',            q.id,
       'request_id',    q.request_id,
       'contractor_id', q.contractor_id,
       'amount_cents',  q.amount_cents,
       'scope',         q.scope,
       'status',        q.status,
       'created_at',    q.created_at,
       'updated_at',    q.updated_at
     )
     from public.service_request_quotes q
     where q.request_id = sr.id
     limit 1)                                                                as quote,
    (select jsonb_build_object(
       'id',            a.id,
       'request_id',    a.request_id,
       'contractor_id', a.contractor_id,
       'proposed_at',   a.proposed_at,
       'notes',         a.notes,
       'status',        a.status,
       'created_at',    a.created_at,
       'updated_at',    a.updated_at
     )
     from public.service_request_appointments a
     where a.request_id = sr.id
     limit 1)                                                                as appointment,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  join public.homeowner_contractor_connections c on c.id = sr.connection_id
  left join public.connection_permissions perm on perm.connection_id = c.id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where cp.owner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

grant select, insert, update on public.service_request_appointments to authenticated;

grant execute on function public.servsync_contractor_propose_appointment(uuid, timestamptz, text) to authenticated;
grant execute on function public.servsync_homeowner_respond_to_appointment(uuid, text) to authenticated;
grant execute on function public.servsync_contractor_complete_appointment(uuid) to authenticated;
grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
