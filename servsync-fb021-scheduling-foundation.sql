-- ServSync FB-021 Phase 1
-- Scheduling + Appointment Confirmation Foundation.
--
-- Adds durable contractor-proposed appointment windows and append-only
-- appointment lifecycle events for service requests. Existing
-- service_request_appointments remains the single confirmed/shared appointment
-- summary for compatibility with current request cards and calendar display.

begin;

create extension if not exists pgcrypto;

create or replace function public.current_user_can_manage_contractor_schedule(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.contractor_profiles cp
     where cp.id = p_contractor_id
       and cp.owner_user_id = auth.uid()
  )
  or exists (
    select 1
      from public.contractor_team_members tm
     where tm.contractor_id = p_contractor_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
       and tm.role in ('admin', 'office')
  )
  or public.current_user_is_platform_admin();
$$;

revoke all on function public.current_user_can_manage_contractor_schedule(uuid)
  from public, anon, authenticated;
grant execute on function public.current_user_can_manage_contractor_schedule(uuid)
  to authenticated;

create table if not exists public.service_request_appointment_windows (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'declined', 'superseded', 'cancelled', 'expired')),
  proposal_batch_id uuid not null,
  contractor_note text not null default '',
  homeowner_response_note text not null default '',
  proposed_by_user_id uuid references auth.users(id) on delete set null,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_request_appointment_windows_time_order
    check (ends_at > starts_at)
);

create table if not exists public.service_request_appointment_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  appointment_id uuid references public.service_request_appointments(id) on delete set null,
  window_id uuid references public.service_request_appointment_windows(id) on delete set null,
  contractor_id uuid references public.contractor_profiles(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null
    check (event_type in (
      'windows_proposed',
      'window_accepted',
      'window_declined',
      'appointment_cancelled',
      'reschedule_proposed',
      'appointment_completed',
      'windows_superseded'
    )),
  event_note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.service_request_appointments
  add column if not exists visit_event_id uuid references public.contractor_visit_events(id) on delete set null;

create unique index if not exists service_request_appointment_windows_one_accepted
  on public.service_request_appointment_windows(request_id)
  where status = 'accepted';

create index if not exists service_request_appointment_windows_request_status_idx
  on public.service_request_appointment_windows(request_id, status, starts_at);

create index if not exists service_request_appointment_windows_contractor_idx
  on public.service_request_appointment_windows(contractor_id, starts_at desc);

create index if not exists service_request_appointment_windows_batch_idx
  on public.service_request_appointment_windows(proposal_batch_id, starts_at);

create index if not exists service_request_appointment_events_request_idx
  on public.service_request_appointment_events(request_id, created_at desc);

create index if not exists service_request_appointment_events_window_idx
  on public.service_request_appointment_events(window_id);

drop trigger if exists service_request_appointment_windows_touch_updated_at
  on public.service_request_appointment_windows;
create trigger service_request_appointment_windows_touch_updated_at
  before update on public.service_request_appointment_windows
  for each row execute function public.touch_updated_at();

alter table public.service_request_appointment_windows enable row level security;
alter table public.service_request_appointment_events enable row level security;

drop policy if exists "Appointment windows: connected parties read"
  on public.service_request_appointment_windows;
create policy "Appointment windows: connected parties read"
  on public.service_request_appointment_windows for select to authenticated
  using (
    exists (
      select 1
        from public.service_requests sr
       where sr.id = request_id
         and sr.homeowner_user_id = auth.uid()
    )
    or public.current_user_can_access_contractor(contractor_id)
  );

drop policy if exists "Appointment events: connected parties read"
  on public.service_request_appointment_events;
create policy "Appointment events: connected parties read"
  on public.service_request_appointment_events for select to authenticated
  using (
    exists (
      select 1
        from public.service_requests sr
       where sr.id = request_id
         and sr.homeowner_user_id = auth.uid()
    )
    or (
      contractor_id is not null
      and public.current_user_can_access_contractor(contractor_id)
    )
  );

revoke all privileges on table public.service_request_appointment_windows
  from public, anon, authenticated;
revoke all privileges on table public.service_request_appointment_events
  from public, anon, authenticated;
grant select on table public.service_request_appointment_windows to authenticated;
grant select on table public.service_request_appointment_events to authenticated;

create or replace function public.servsync_propose_service_request_appointment_windows(
  p_request_id uuid,
  p_windows jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_batch_id uuid := gen_random_uuid();
  v_window jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_window_count integer;
  v_superseded_count integer := 0;
  v_window_ids uuid[] := '{}'::uuid[];
  v_window_id uuid;
begin
  select *
    into v_request
    from public.service_requests
   where id = p_request_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if not public.current_user_can_manage_contractor_schedule(v_request.contractor_id) then
    raise exception 'You do not have permission to schedule this request.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'Cannot propose appointment windows on a closed request.';
  end if;

  if coalesce(jsonb_typeof(p_windows), '') <> 'array' then
    raise exception 'Appointment windows must be an array.';
  end if;

  v_window_count := jsonb_array_length(p_windows);
  if v_window_count < 1 or v_window_count > 3 then
    raise exception 'Propose between 1 and 3 appointment windows.';
  end if;

  update public.service_request_appointment_windows
     set status = 'superseded',
         updated_at = now()
   where request_id = v_request.id
     and status = 'proposed';

  get diagnostics v_superseded_count = row_count;

  if v_superseded_count > 0 then
    insert into public.service_request_appointment_events (
      request_id,
      contractor_id,
      actor_user_id,
      event_type,
      event_note,
      metadata
    ) values (
      v_request.id,
      v_request.contractor_id,
      auth.uid(),
      'windows_superseded',
      '',
      jsonb_build_object('superseded_count', v_superseded_count)
    );
  end if;

  for v_window in select * from jsonb_array_elements(p_windows)
  loop
    begin
      v_starts_at := coalesce(v_window->>'starts_at', v_window->>'start_at')::timestamptz;
      v_ends_at := coalesce(v_window->>'ends_at', v_window->>'end_at')::timestamptz;
    exception when others then
      raise exception 'Each appointment window must include valid starts_at and ends_at values.';
    end;

    if v_starts_at <= now() then
      raise exception 'Appointment windows must start in the future.';
    end if;

    if v_ends_at <= v_starts_at then
      raise exception 'Appointment window end time must be after start time.';
    end if;

    insert into public.service_request_appointment_windows (
      request_id,
      contractor_id,
      starts_at,
      ends_at,
      status,
      proposal_batch_id,
      contractor_note,
      proposed_by_user_id
    ) values (
      v_request.id,
      v_request.contractor_id,
      v_starts_at,
      v_ends_at,
      'proposed',
      v_batch_id,
      coalesce(nullif(trim(coalesce(v_window->>'note', p_note, '')), ''), ''),
      auth.uid()
    )
    returning id into v_window_id;

    v_window_ids := array_append(v_window_ids, v_window_id);
  end loop;

  insert into public.service_request_appointment_events (
    request_id,
    contractor_id,
    actor_user_id,
    event_type,
    event_note,
    metadata
  ) values (
    v_request.id,
    v_request.contractor_id,
    auth.uid(),
    'windows_proposed',
    coalesce(nullif(trim(coalesce(p_note, '')), ''), ''),
    jsonb_build_object(
      'proposal_batch_id', v_batch_id,
      'window_count', v_window_count,
      'window_ids', to_jsonb(v_window_ids)
    )
  );

  return jsonb_build_object(
    'request_id', v_request.id,
    'contractor_id', v_request.contractor_id,
    'proposal_batch_id', v_batch_id,
    'window_ids', to_jsonb(v_window_ids),
    'status', 'proposed'
  );
end;
$$;

create or replace function public.servsync_reschedule_service_request_appointment(
  p_request_id uuid,
  p_windows jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_batch_id uuid := gen_random_uuid();
  v_window jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_window_count integer;
  v_superseded_count integer := 0;
  v_window_ids uuid[] := '{}'::uuid[];
  v_window_id uuid;
  v_existing_confirmed boolean := false;
begin
  select *
    into v_request
    from public.service_requests
   where id = p_request_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if not public.current_user_can_manage_contractor_schedule(v_request.contractor_id) then
    raise exception 'You do not have permission to reschedule this request.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'Cannot reschedule a closed request.';
  end if;

  if coalesce(jsonb_typeof(p_windows), '') <> 'array' then
    raise exception 'Appointment windows must be an array.';
  end if;

  v_window_count := jsonb_array_length(p_windows);
  if v_window_count < 1 or v_window_count > 3 then
    raise exception 'Propose between 1 and 3 appointment windows.';
  end if;

  select exists (
    select 1
      from public.service_request_appointments
     where request_id = v_request.id
       and status = 'confirmed'
  )
    into v_existing_confirmed;

  update public.service_request_appointment_windows
     set status = 'superseded',
         updated_at = now()
   where request_id = v_request.id
     and status = 'proposed';

  get diagnostics v_superseded_count = row_count;

  if v_superseded_count > 0 then
    insert into public.service_request_appointment_events (
      request_id,
      contractor_id,
      actor_user_id,
      event_type,
      event_note,
      metadata
    ) values (
      v_request.id,
      v_request.contractor_id,
      auth.uid(),
      'windows_superseded',
      '',
      jsonb_build_object('superseded_count', v_superseded_count, 'reschedule', true)
    );
  end if;

  for v_window in select * from jsonb_array_elements(p_windows)
  loop
    begin
      v_starts_at := coalesce(v_window->>'starts_at', v_window->>'start_at')::timestamptz;
      v_ends_at := coalesce(v_window->>'ends_at', v_window->>'end_at')::timestamptz;
    exception when others then
      raise exception 'Each appointment window must include valid starts_at and ends_at values.';
    end;

    if v_starts_at <= now() then
      raise exception 'Appointment windows must start in the future.';
    end if;

    if v_ends_at <= v_starts_at then
      raise exception 'Appointment window end time must be after start time.';
    end if;

    insert into public.service_request_appointment_windows (
      request_id,
      contractor_id,
      starts_at,
      ends_at,
      status,
      proposal_batch_id,
      contractor_note,
      proposed_by_user_id
    ) values (
      v_request.id,
      v_request.contractor_id,
      v_starts_at,
      v_ends_at,
      'proposed',
      v_batch_id,
      coalesce(nullif(trim(coalesce(v_window->>'note', p_reason, '')), ''), ''),
      auth.uid()
    )
    returning id into v_window_id;

    v_window_ids := array_append(v_window_ids, v_window_id);
  end loop;

  insert into public.service_request_appointment_events (
    request_id,
    contractor_id,
    actor_user_id,
    event_type,
    event_note,
    metadata
  ) values (
    v_request.id,
    v_request.contractor_id,
    auth.uid(),
    'reschedule_proposed',
    coalesce(nullif(trim(coalesce(p_reason, '')), ''), ''),
    jsonb_build_object(
      'proposal_batch_id', v_batch_id,
      'window_count', v_window_count,
      'window_ids', to_jsonb(v_window_ids),
      'existing_confirmed_appointment_preserved', v_existing_confirmed
    )
  );

  return jsonb_build_object(
    'request_id', v_request.id,
    'contractor_id', v_request.contractor_id,
    'proposal_batch_id', v_batch_id,
    'window_ids', to_jsonb(v_window_ids),
    'status', 'reschedule_proposed',
    'existing_confirmed_appointment_preserved', v_existing_confirmed
  );
end;
$$;

create or replace function public.servsync_accept_service_request_appointment_window(
  p_window_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window public.service_request_appointment_windows;
  v_request public.service_requests;
  v_appointment public.service_request_appointments;
  v_superseded_count integer := 0;
  v_prior_accepted_count integer := 0;
begin
  select *
    into v_window
    from public.service_request_appointment_windows
   where id = p_window_id
   limit 1;

  if v_window.id is null then
    raise exception 'Appointment window not found.';
  end if;

  if v_window.status <> 'proposed' then
    raise exception 'This appointment window can no longer be accepted.';
  end if;

  select *
    into v_request
    from public.service_requests
   where id = v_window.request_id
   limit 1;

  if v_request.id is null or v_request.homeowner_user_id <> auth.uid() then
    raise exception 'Appointment window not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'Cannot accept appointment windows on a closed request.';
  end if;

  update public.service_request_appointment_windows
     set status = 'superseded',
         updated_at = now()
   where request_id = v_window.request_id
     and id <> v_window.id
     and status = 'accepted';

  get diagnostics v_prior_accepted_count = row_count;

  update public.service_request_appointment_windows
     set status = 'accepted',
         accepted_by_user_id = auth.uid(),
         accepted_at = now(),
         updated_at = now()
   where id = v_window.id
     and status = 'proposed'
  returning * into v_window;

  if v_window.id is null then
    raise exception 'This appointment window can no longer be accepted.';
  end if;

  update public.service_request_appointment_windows
     set status = 'superseded',
         updated_at = now()
   where request_id = v_window.request_id
     and id <> v_window.id
     and status = 'proposed';

  get diagnostics v_superseded_count = row_count;

  insert into public.service_request_appointments (
    request_id,
    contractor_id,
    proposed_at,
    notes,
    status,
    proposed_by,
    visit_event_id
  ) values (
    v_window.request_id,
    v_window.contractor_id,
    v_window.starts_at,
    coalesce(v_window.contractor_note, ''),
    'confirmed',
    'contractor',
    null
  )
  on conflict (request_id) do update
     set contractor_id = excluded.contractor_id,
         proposed_at = excluded.proposed_at,
         notes = excluded.notes,
         status = 'confirmed',
         proposed_by = 'contractor',
         visit_event_id = null,
         updated_at = now()
  returning * into v_appointment;

  insert into public.service_request_appointment_events (
    request_id,
    appointment_id,
    window_id,
    contractor_id,
    actor_user_id,
    event_type,
    event_note,
    metadata
  ) values (
    v_window.request_id,
    v_appointment.id,
    v_window.id,
    v_window.contractor_id,
    auth.uid(),
    'window_accepted',
    '',
    jsonb_build_object(
      'proposal_batch_id', v_window.proposal_batch_id,
      'starts_at', v_window.starts_at,
      'ends_at', v_window.ends_at,
      'prior_accepted_superseded_count', v_prior_accepted_count,
      'superseded_count', v_superseded_count
    )
  );

  return jsonb_build_object(
    'request_id', v_window.request_id,
    'appointment_id', v_appointment.id,
    'window_id', v_window.id,
    'status', 'confirmed',
    'starts_at', v_window.starts_at,
    'ends_at', v_window.ends_at
  );
end;
$$;

create or replace function public.servsync_decline_service_request_appointment_window(
  p_window_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window public.service_request_appointment_windows;
  v_request public.service_requests;
begin
  select *
    into v_window
    from public.service_request_appointment_windows
   where id = p_window_id
   limit 1;

  if v_window.id is null then
    raise exception 'Appointment window not found.';
  end if;

  if v_window.status <> 'proposed' then
    raise exception 'This appointment window can no longer be declined.';
  end if;

  select *
    into v_request
    from public.service_requests
   where id = v_window.request_id
   limit 1;

  if v_request.id is null or v_request.homeowner_user_id <> auth.uid() then
    raise exception 'Appointment window not found.';
  end if;

  update public.service_request_appointment_windows
     set status = 'declined',
         homeowner_response_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), ''),
         updated_at = now()
   where id = v_window.id
     and status = 'proposed'
  returning * into v_window;

  if v_window.id is null then
    raise exception 'This appointment window can no longer be declined.';
  end if;

  insert into public.service_request_appointment_events (
    request_id,
    window_id,
    contractor_id,
    actor_user_id,
    event_type,
    event_note,
    metadata
  ) values (
    v_window.request_id,
    v_window.id,
    v_window.contractor_id,
    auth.uid(),
    'window_declined',
    coalesce(nullif(trim(coalesce(p_note, '')), ''), ''),
    jsonb_build_object('proposal_batch_id', v_window.proposal_batch_id)
  );

  return jsonb_build_object(
    'request_id', v_window.request_id,
    'window_id', v_window.id,
    'status', 'declined'
  );
end;
$$;

create or replace function public.servsync_cancel_service_request_appointment(
  p_request_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_appointment public.service_request_appointments;
  v_window_count integer := 0;
begin
  select *
    into v_request
    from public.service_requests
   where id = p_request_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if not public.current_user_can_manage_contractor_schedule(v_request.contractor_id) then
    raise exception 'You do not have permission to cancel this appointment.';
  end if;

  update public.service_request_appointments
     set status = 'cancelled',
         updated_at = now()
   where request_id = v_request.id
     and status <> 'completed'
  returning * into v_appointment;

  update public.service_request_appointment_windows
     set status = 'cancelled',
         cancelled_by_user_id = auth.uid(),
         cancelled_at = now(),
         updated_at = now()
   where request_id = v_request.id
     and status in ('proposed', 'accepted');

  get diagnostics v_window_count = row_count;

  insert into public.service_request_appointment_events (
    request_id,
    appointment_id,
    contractor_id,
    actor_user_id,
    event_type,
    event_note,
    metadata
  ) values (
    v_request.id,
    v_appointment.id,
    v_request.contractor_id,
    auth.uid(),
    'appointment_cancelled',
    coalesce(nullif(trim(coalesce(p_reason, '')), ''), ''),
    jsonb_build_object('cancelled_window_count', v_window_count)
  );

  return jsonb_build_object(
    'request_id', v_request.id,
    'appointment_id', v_appointment.id,
    'status', 'cancelled',
    'cancelled_window_count', v_window_count
  );
end;
$$;

revoke execute on function public.servsync_propose_service_request_appointment_windows(uuid, jsonb, text)
  from public;
revoke execute on function public.servsync_propose_service_request_appointment_windows(uuid, jsonb, text)
  from anon;
grant execute on function public.servsync_propose_service_request_appointment_windows(uuid, jsonb, text)
  to authenticated;

revoke execute on function public.servsync_accept_service_request_appointment_window(uuid)
  from public;
revoke execute on function public.servsync_accept_service_request_appointment_window(uuid)
  from anon;
grant execute on function public.servsync_accept_service_request_appointment_window(uuid)
  to authenticated;

revoke execute on function public.servsync_decline_service_request_appointment_window(uuid, text)
  from public;
revoke execute on function public.servsync_decline_service_request_appointment_window(uuid, text)
  from anon;
grant execute on function public.servsync_decline_service_request_appointment_window(uuid, text)
  to authenticated;

revoke execute on function public.servsync_cancel_service_request_appointment(uuid, text)
  from public;
revoke execute on function public.servsync_cancel_service_request_appointment(uuid, text)
  from anon;
grant execute on function public.servsync_cancel_service_request_appointment(uuid, text)
  to authenticated;

revoke execute on function public.servsync_reschedule_service_request_appointment(uuid, jsonb, text)
  from public;
revoke execute on function public.servsync_reschedule_service_request_appointment(uuid, jsonb, text)
  from anon;
grant execute on function public.servsync_reschedule_service_request_appointment(uuid, jsonb, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
