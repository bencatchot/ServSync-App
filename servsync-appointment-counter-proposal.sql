-- ServSync appointment counter-proposal.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-appointment-scheduling.sql has been applied.
--
-- Adds a proposed_by column so either party can propose a date/time.
-- Flow: contractor proposes → homeowner can confirm, decline, or counter-propose
--       → contractor can confirm, decline, or counter-propose (repeat as needed)

begin;

-- Add proposed_by column to track which party made the current proposal
alter table public.service_request_appointments
  add column if not exists proposed_by text not null default 'contractor'
    check (proposed_by in ('contractor', 'homeowner'));

-- Re-create contractor propose function to always set proposed_by = 'contractor'
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
$$;

-- Drop old 2-param homeowner respond function and replace with counter-proposal support
drop function if exists public.servsync_homeowner_respond_to_appointment(uuid, text);

create function public.servsync_homeowner_respond_to_appointment(
  p_request_id  uuid,
  p_action      text,             -- 'confirm', 'decline', or 'counter'
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

  -- Homeowner must only respond when the contractor proposed (not when it's homeowner's own counter)
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

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', 'proposed',
      'proposed_by', 'homeowner'
    );
  else
    update public.service_request_appointments
       set status = case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
     where id = v_appt.id;

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
    );
  end if;
end;
$$;

-- New: contractor responds to homeowner counter-proposal (confirm, decline, or counter)
create or replace function public.servsync_contractor_respond_to_appointment(
  p_request_id  uuid,
  p_action      text,             -- 'confirm', 'decline', or 'counter'
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

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', 'proposed',
      'proposed_by', 'contractor'
    );
  else
    update public.service_request_appointments
       set status = case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
     where id = v_appt.id;

    return jsonb_build_object(
      'appointment_id', v_appt.id,
      'status', case when p_action = 'confirm' then 'confirmed' else 'cancelled' end
    );
  end if;
end;
$$;

-- Rebuild fetch RPCs to include proposed_by in appointment jsonb
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
       'proposed_by',   a.proposed_by,
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
       'proposed_by',   a.proposed_by,
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

grant execute on function public.servsync_homeowner_respond_to_appointment(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.servsync_contractor_respond_to_appointment(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.servsync_contractor_propose_appointment(uuid, timestamptz, text) to authenticated;
grant execute on function public.servsync_contractor_complete_appointment(uuid) to authenticated;
grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
