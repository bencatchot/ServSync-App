-- ServSync unified visit events.
-- Run after service request, appointment, and job lifecycle SQL has been applied.
--
-- Contractor visits/jobs remain backed by public.inspections.
-- Contractor calendar events are backed by public.contractor_visit_events.
-- Homeowner-facing shared invites continue to use public.service_request_appointments.

begin;

create table if not exists public.contractor_visit_events (
  id                         uuid primary key default gen_random_uuid(),
  contractor_id              uuid not null references public.contractor_profiles(id) on delete cascade,
  inspection_id              uuid not null references public.inspections(id) on delete cascade,
  service_request_id          uuid references public.service_requests(id) on delete set null,
  homeowner_user_id           uuid references auth.users(id) on delete set null,
  local_contact_id            uuid references public.contractor_local_contacts(id) on delete set null,
  scheduled_at                timestamptz not null,
  notes                       text not null default '',
  share_with_homeowner        boolean not null default false,
  status                      text not null default 'scheduled'
                              check (status in ('scheduled', 'completed', 'cancelled')),
  homeowner_response_status   text not null default 'not_shared'
                              check (homeowner_response_status in ('not_shared', 'shared_waiting', 'accepted', 'declined', 'countered')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.contractor_visit_events
  add column if not exists service_request_id uuid references public.service_requests(id) on delete set null,
  add column if not exists homeowner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists local_contact_id uuid references public.contractor_local_contacts(id) on delete set null,
  add column if not exists share_with_homeowner boolean not null default false,
  add column if not exists homeowner_response_status text not null default 'not_shared';

alter table public.service_request_appointments
  add column if not exists visit_event_id uuid references public.contractor_visit_events(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'contractor_visit_events_status_check'
       and conrelid = 'public.contractor_visit_events'::regclass
  ) then
    alter table public.contractor_visit_events
      add constraint contractor_visit_events_status_check
      check (status in ('scheduled', 'completed', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'contractor_visit_events_homeowner_response_status_check'
       and conrelid = 'public.contractor_visit_events'::regclass
  ) then
    alter table public.contractor_visit_events
      add constraint contractor_visit_events_homeowner_response_status_check
      check (homeowner_response_status in ('not_shared', 'shared_waiting', 'accepted', 'declined', 'countered'));
  end if;
end $$;

create unique index if not exists contractor_visit_events_inspection_idx
  on public.contractor_visit_events(inspection_id);

create unique index if not exists contractor_visit_events_active_request_idx
  on public.contractor_visit_events(service_request_id)
  where service_request_id is not null and status = 'scheduled';

create index if not exists contractor_visit_events_contractor_scheduled_idx
  on public.contractor_visit_events(contractor_id, scheduled_at desc);

create index if not exists contractor_visit_events_request_idx
  on public.contractor_visit_events(service_request_id)
  where service_request_id is not null;

create index if not exists service_request_appointments_visit_event_idx
  on public.service_request_appointments(visit_event_id)
  where visit_event_id is not null;

drop trigger if exists contractor_visit_events_touch_updated_at on public.contractor_visit_events;
create trigger contractor_visit_events_touch_updated_at
  before update on public.contractor_visit_events
  for each row execute function public.touch_updated_at();

alter table public.contractor_visit_events enable row level security;

drop policy if exists "Visit events: contractor team read" on public.contractor_visit_events;
drop policy if exists "Visit events: contractor team insert" on public.contractor_visit_events;
drop policy if exists "Visit events: contractor team update" on public.contractor_visit_events;
drop policy if exists "Visit events: contractor team delete" on public.contractor_visit_events;

create policy "Visit events: contractor team read"
  on public.contractor_visit_events for select to authenticated
  using (
    public.current_user_can_write_contractor_jobs(contractor_id)
    or homeowner_user_id = auth.uid()
  );

create policy "Visit events: contractor team insert"
  on public.contractor_visit_events for insert to authenticated
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Visit events: contractor team update"
  on public.contractor_visit_events for update to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id))
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Visit events: contractor team delete"
  on public.contractor_visit_events for delete to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id));

grant select, insert, update, delete on public.contractor_visit_events to authenticated;

create or replace function public.servsync_schedule_visit_event(
  p_inspection_id        uuid,
  p_scheduled_at         timestamptz,
  p_notes                text default '',
  p_share_with_homeowner boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insp          public.inspections;
  v_existing      public.contractor_visit_events;
  v_event         public.contractor_visit_events;
  v_message_body  text;
begin
  select *
    into v_insp
    from public.inspections
   where id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(contractor_id)
   limit 1;

  if v_insp.id is null then
    raise exception 'Visit not found.';
  end if;

  if p_scheduled_at <= now() then
    raise exception 'Choose a future date and time.';
  end if;

  if p_share_with_homeowner and v_insp.service_request_id is null then
    raise exception 'Calendar invites can only be shared from connected homeowner requests.';
  end if;

  if p_share_with_homeowner and v_insp.homeowner_user_id is null then
    raise exception 'Calendar invites can only be shared with connected homeowners.';
  end if;

  if v_insp.service_request_id is not null then
    select *
      into v_existing
      from public.contractor_visit_events
     where service_request_id = v_insp.service_request_id
       and status = 'scheduled'
       and inspection_id <> v_insp.id
     limit 1;

    if v_existing.id is not null then
      raise exception 'This request already has an active scheduled visit.';
    end if;
  end if;

  insert into public.contractor_visit_events (
    contractor_id,
    inspection_id,
    service_request_id,
    homeowner_user_id,
    local_contact_id,
    scheduled_at,
    notes,
    share_with_homeowner,
    status,
    homeowner_response_status
  ) values (
    v_insp.contractor_id,
    v_insp.id,
    v_insp.service_request_id,
    v_insp.homeowner_user_id,
    v_insp.local_contact_id,
    p_scheduled_at,
    coalesce(nullif(trim(p_notes), ''), ''),
    p_share_with_homeowner,
    'scheduled',
    case when p_share_with_homeowner then 'shared_waiting' else 'not_shared' end
  )
  on conflict (inspection_id) do update
     set scheduled_at = excluded.scheduled_at,
         notes = excluded.notes,
         service_request_id = excluded.service_request_id,
         homeowner_user_id = excluded.homeowner_user_id,
         local_contact_id = excluded.local_contact_id,
         share_with_homeowner = excluded.share_with_homeowner,
         status = 'scheduled',
         homeowner_response_status = case
           when excluded.share_with_homeowner then 'shared_waiting'
           else 'not_shared'
         end
  returning * into v_event;

  update public.inspections
     set job_status = case
           when coalesce(job_status, 'draft') in ('completed', 'closed', 'cancelled') then job_status
           else 'scheduled'
         end,
         updated_at = now()
   where id = v_insp.id
     and public.current_user_can_write_contractor_jobs(contractor_id);

  if p_share_with_homeowner then
    insert into public.service_request_appointments (
      request_id,
      contractor_id,
      proposed_at,
      notes,
      status,
      proposed_by,
      visit_event_id
    ) values (
      v_insp.service_request_id,
      v_insp.contractor_id,
      p_scheduled_at,
      coalesce(nullif(trim(p_notes), ''), ''),
      'proposed',
      'contractor',
      v_event.id
    )
    on conflict (request_id) do update
       set proposed_at = excluded.proposed_at,
           notes = excluded.notes,
           status = 'proposed',
           proposed_by = 'contractor',
           visit_event_id = excluded.visit_event_id;

    update public.service_requests
       set status = 'contractor_responded',
           updated_at = now()
     where id = v_insp.service_request_id
       and status not in ('declined', 'closed');

    v_message_body := concat_ws(
      E'\n',
      'Calendar invite shared for ' || public.servsync_appointment_display_time(p_scheduled_at) || '.',
      nullif(trim(coalesce(p_notes, '')), '')
    );

    insert into public.service_request_messages (
      request_id,
      actor_user_id,
      actor_role,
      message_type,
      body
    ) values (
      v_insp.service_request_id,
      auth.uid(),
      'contractor',
      'appointment_update',
      v_message_body
    );
  else
    update public.service_request_appointments
       set status = 'cancelled'
     where visit_event_id = v_event.id
       and status <> 'completed';
  end if;

  return jsonb_build_object(
    'visit_event_id', v_event.id,
    'inspection_id', v_event.inspection_id,
    'status', v_event.status,
    'homeowner_response_status', v_event.homeowner_response_status,
    'shared', v_event.share_with_homeowner
  );
end;
$$;

create or replace function public.servsync_complete_visit_event_for_job(p_inspection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.contractor_visit_events;
begin
  select e.*
    into v_event
    from public.contractor_visit_events e
   where e.inspection_id = p_inspection_id
     and public.current_user_can_write_contractor_jobs(e.contractor_id)
   limit 1;

  if v_event.id is null then
    return;
  end if;

  update public.contractor_visit_events
     set status = 'completed',
         updated_at = now()
   where id = v_event.id;

  update public.service_request_appointments
     set status = 'completed',
         updated_at = now()
   where visit_event_id = v_event.id
     and status <> 'cancelled';
end;
$$;

create or replace function public.servsync_sync_visit_event_on_job_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    coalesce(new.job_status, '') in ('completed', 'closed')
    or new.status = 'finalized'
  ) and (
    coalesce(old.job_status, '') is distinct from coalesce(new.job_status, '')
    or old.status is distinct from new.status
  ) then
    update public.contractor_visit_events
       set status = 'completed',
           updated_at = now()
     where inspection_id = new.id
       and status = 'scheduled';

    update public.service_request_appointments a
       set status = 'completed',
           updated_at = now()
      from public.contractor_visit_events e
     where a.visit_event_id = e.id
       and e.inspection_id = new.id
       and a.status <> 'cancelled';
  end if;

  return new;
end;
$$;

drop trigger if exists inspections_sync_visit_event_on_completion on public.inspections;
create trigger inspections_sync_visit_event_on_completion
  after update of status, job_status on public.inspections
  for each row execute function public.servsync_sync_visit_event_on_job_completion();

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
$$;

grant execute on function public.servsync_schedule_visit_event(uuid, timestamptz, text, boolean) to authenticated;
grant execute on function public.servsync_complete_visit_event_for_job(uuid) to authenticated;
grant execute on function public.servsync_sync_visit_event_on_job_completion() to authenticated;
grant execute on function public.servsync_homeowner_respond_to_appointment(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.servsync_contractor_respond_to_appointment(uuid, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';

commit;
