-- ServSync FB-025 Slice 1
-- Job-centered communication and activity foundation.
--
-- Adds workflow-scoped human messages, append-only activity events, and
-- thread read tracking for service request and inspection-backed job contexts.
-- This patch does not remove or migrate existing service_request_messages.
--
-- Sandbox-review patch. Do NOT apply to production without explicit approval.

begin;

create extension if not exists pgcrypto;

-- Contractor roles allowed to send homeowner-visible workflow messages in v1.
-- Field technicians and viewers remain read-only for this slice.
create or replace function public.current_user_can_send_contractor_workflow_messages(
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

revoke all on function public.current_user_can_send_contractor_workflow_messages(uuid)
  from public, anon, authenticated;
grant execute on function public.current_user_can_send_contractor_workflow_messages(uuid)
  to authenticated;

create table if not exists public.workflow_messages (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('service_request', 'job')),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid not null references auth.users(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('homeowner', 'contractor', 'platform_admin')),
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workflow_messages_context_shape check (
    (
      context_type = 'service_request'
      and service_request_id is not null
      and inspection_id is null
    )
    or (
      context_type = 'job'
      and inspection_id is not null
      and service_request_id is null
    )
  ),
  constraint workflow_messages_body_not_blank check (length(trim(body)) > 0),
  constraint workflow_messages_body_length check (char_length(body) <= 4000)
);

create index if not exists workflow_messages_service_request_created_idx
  on public.workflow_messages(service_request_id, created_at asc)
  where context_type = 'service_request' and deleted_at is null;

create index if not exists workflow_messages_inspection_created_idx
  on public.workflow_messages(inspection_id, created_at asc)
  where context_type = 'job' and deleted_at is null;

create index if not exists workflow_messages_recipient_unread_idx
  on public.workflow_messages(homeowner_user_id, contractor_id, created_at desc)
  where deleted_at is null;

create table if not exists public.workflow_activity_events (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (
    context_type in ('service_request', 'job', 'estimate', 'invoice', 'appointment', 'report', 'photo')
  ),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  appointment_id uuid references public.service_request_appointments(id) on delete set null,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'service_request_submitted',
      'homeowner_message_sent',
      'contractor_message_sent',
      'appointment_proposed',
      'appointment_confirmed',
      'estimate_sent',
      'estimate_approved',
      'estimate_declined',
      'job_created',
      'job_completed',
      'invoice_sent',
      'invoice_paid',
      'invoice_voided',
      'report_shared',
      'photo_shared'
    )
  ),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workflow_activity_events_context_present check (
    service_request_id is not null
    or inspection_id is not null
    or estimate_id is not null
    or invoice_id is not null
    or appointment_id is not null
  )
);

create index if not exists workflow_activity_events_service_request_created_idx
  on public.workflow_activity_events(service_request_id, created_at desc)
  where service_request_id is not null;

create index if not exists workflow_activity_events_inspection_created_idx
  on public.workflow_activity_events(inspection_id, created_at desc)
  where inspection_id is not null;

create index if not exists workflow_activity_events_estimate_created_idx
  on public.workflow_activity_events(estimate_id, created_at desc)
  where estimate_id is not null;

create index if not exists workflow_activity_events_invoice_created_idx
  on public.workflow_activity_events(invoice_id, created_at desc)
  where invoice_id is not null;

create table if not exists public.workflow_thread_reads (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('service_request', 'job')),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_thread_reads_context_shape check (
    (
      context_type = 'service_request'
      and service_request_id is not null
      and inspection_id is null
    )
    or (
      context_type = 'job'
      and inspection_id is not null
      and service_request_id is null
    )
  )
);

create unique index if not exists workflow_thread_reads_service_request_user_uidx
  on public.workflow_thread_reads(service_request_id, user_id)
  where context_type = 'service_request';

create unique index if not exists workflow_thread_reads_inspection_user_uidx
  on public.workflow_thread_reads(inspection_id, user_id)
  where context_type = 'job';

create index if not exists workflow_thread_reads_user_updated_idx
  on public.workflow_thread_reads(user_id, updated_at desc);

drop trigger if exists workflow_thread_reads_touch_updated_at on public.workflow_thread_reads;
create trigger workflow_thread_reads_touch_updated_at
  before update on public.workflow_thread_reads
  for each row execute function public.touch_updated_at();

alter table public.workflow_messages enable row level security;
alter table public.workflow_activity_events enable row level security;
alter table public.workflow_thread_reads enable row level security;

drop policy if exists "Workflow messages: eligible parties read" on public.workflow_messages;
create policy "Workflow messages: eligible parties read"
  on public.workflow_messages for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    or public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Workflow activity events: eligible parties read" on public.workflow_activity_events;
create policy "Workflow activity events: eligible parties read"
  on public.workflow_activity_events for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    or public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

drop policy if exists "Workflow thread reads: own eligible contexts read" on public.workflow_thread_reads;
create policy "Workflow thread reads: own eligible contexts read"
  on public.workflow_thread_reads for select to authenticated
  using (
    user_id = auth.uid()
    and (
      exists (
        select 1
          from public.service_requests sr
         where sr.id = workflow_thread_reads.service_request_id
           and (
             sr.homeowner_user_id = auth.uid()
             or public.current_user_can_access_contractor(sr.contractor_id)
             or public.current_user_is_platform_admin()
           )
      )
      or exists (
        select 1
          from public.inspections i
         where i.id = workflow_thread_reads.inspection_id
           and (
             i.homeowner_user_id = auth.uid()
             or public.current_user_can_access_contractor(i.contractor_id)
             or public.current_user_is_platform_admin()
           )
      )
    )
  );

revoke all privileges on table public.workflow_messages from public, anon, authenticated;
revoke all privileges on table public.workflow_activity_events from public, anon, authenticated;
revoke all privileges on table public.workflow_thread_reads from public, anon, authenticated;
grant select on table public.workflow_messages to authenticated;
grant select on table public.workflow_activity_events to authenticated;
grant select on table public.workflow_thread_reads to authenticated;

create or replace function public.servsync_send_workflow_message(
  p_context_type text,
  p_body text,
  p_service_request_id uuid default null,
  p_inspection_id uuid default null
)
returns public.workflow_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context_type text := lower(trim(coalesce(p_context_type, '')));
  v_body text := trim(coalesce(p_body, ''));
  v_request public.service_requests;
  v_job public.inspections;
  v_contractor_id uuid;
  v_homeowner_user_id uuid;
  v_sender_role text;
  v_message public.workflow_messages;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_context_type not in ('service_request', 'job') then
    raise exception 'Unsupported workflow message context.';
  end if;

  if length(v_body) = 0 then
    raise exception 'Message body is required.';
  end if;

  if char_length(v_body) > 4000 then
    raise exception 'Message body is too long.';
  end if;

  if v_context_type = 'service_request' then
    if p_service_request_id is null or p_inspection_id is not null then
      raise exception 'A service request message requires only service_request_id.';
    end if;

    select *
      into v_request
      from public.service_requests
     where id = p_service_request_id
     limit 1;

    if v_request.id is null then
      raise exception 'Service request not found.';
    end if;

    v_contractor_id := v_request.contractor_id;
    v_homeowner_user_id := v_request.homeowner_user_id;
  else
    if p_inspection_id is null or p_service_request_id is not null then
      raise exception 'A job message requires only inspection_id.';
    end if;

    select *
      into v_job
      from public.inspections
     where id = p_inspection_id
     limit 1;

    if v_job.id is null then
      raise exception 'Job not found.';
    end if;

    v_contractor_id := v_job.contractor_id;
    v_homeowner_user_id := v_job.homeowner_user_id;
  end if;

  if v_homeowner_user_id = auth.uid() then
    v_sender_role := 'homeowner';
  elsif public.current_user_can_send_contractor_workflow_messages(v_contractor_id) then
    v_sender_role := case
      when public.current_user_is_platform_admin() then 'platform_admin'
      else 'contractor'
    end;
  else
    raise exception 'You do not have permission to send messages in this workflow.';
  end if;

  insert into public.workflow_messages (
    context_type,
    service_request_id,
    inspection_id,
    contractor_id,
    homeowner_user_id,
    sender_user_id,
    sender_role,
    body
  ) values (
    v_context_type,
    case when v_context_type = 'service_request' then p_service_request_id else null end,
    case when v_context_type = 'job' then p_inspection_id else null end,
    v_contractor_id,
    v_homeowner_user_id,
    auth.uid(),
    v_sender_role,
    v_body
  )
  returning * into v_message;

  insert into public.workflow_activity_events (
    context_type,
    service_request_id,
    inspection_id,
    contractor_id,
    homeowner_user_id,
    event_type,
    actor_user_id,
    metadata
  ) values (
    v_context_type,
    v_message.service_request_id,
    v_message.inspection_id,
    v_message.contractor_id,
    v_message.homeowner_user_id,
    case when v_sender_role = 'homeowner' then 'homeowner_message_sent' else 'contractor_message_sent' end,
    auth.uid(),
    jsonb_build_object('workflow_message_id', v_message.id)
  );

  return v_message;
end;
$$;

create or replace function public.servsync_mark_workflow_thread_read(
  p_context_type text,
  p_service_request_id uuid default null,
  p_inspection_id uuid default null
)
returns public.workflow_thread_reads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context_type text := lower(trim(coalesce(p_context_type, '')));
  v_request public.service_requests;
  v_job public.inspections;
  v_read public.workflow_thread_reads;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_context_type = 'service_request' then
    if p_service_request_id is null or p_inspection_id is not null then
      raise exception 'A service request read marker requires only service_request_id.';
    end if;

    select *
      into v_request
      from public.service_requests
     where id = p_service_request_id
     limit 1;

    if v_request.id is null then
      raise exception 'Service request not found.';
    end if;

    if not (
      v_request.homeowner_user_id = auth.uid()
      or public.current_user_can_access_contractor(v_request.contractor_id)
      or public.current_user_is_platform_admin()
    ) then
      raise exception 'Workflow thread not found.';
    end if;

    perform pg_advisory_xact_lock(hashtext('workflow-thread-read-service-request-' || p_service_request_id::text || '-' || auth.uid()::text));

    update public.workflow_thread_reads
       set last_read_at = now()
     where context_type = 'service_request'
       and service_request_id = p_service_request_id
       and user_id = auth.uid()
    returning * into v_read;

    if v_read.id is null then
      insert into public.workflow_thread_reads (context_type, service_request_id, user_id)
      values ('service_request', p_service_request_id, auth.uid())
      returning * into v_read;
    end if;
  elsif v_context_type = 'job' then
    if p_inspection_id is null or p_service_request_id is not null then
      raise exception 'A job read marker requires only inspection_id.';
    end if;

    select *
      into v_job
      from public.inspections
     where id = p_inspection_id
     limit 1;

    if v_job.id is null then
      raise exception 'Job not found.';
    end if;

    if not (
      v_job.homeowner_user_id = auth.uid()
      or public.current_user_can_access_contractor(v_job.contractor_id)
      or public.current_user_is_platform_admin()
    ) then
      raise exception 'Workflow thread not found.';
    end if;

    perform pg_advisory_xact_lock(hashtext('workflow-thread-read-job-' || p_inspection_id::text || '-' || auth.uid()::text));

    update public.workflow_thread_reads
       set last_read_at = now()
     where context_type = 'job'
       and inspection_id = p_inspection_id
       and user_id = auth.uid()
    returning * into v_read;

    if v_read.id is null then
      insert into public.workflow_thread_reads (context_type, inspection_id, user_id)
      values ('job', p_inspection_id, auth.uid())
      returning * into v_read;
    end if;
  else
    raise exception 'Unsupported workflow thread context.';
  end if;

  return v_read;
end;
$$;

-- Internal append helper for future workflow lifecycle RPCs/triggers.
-- It is intentionally not granted to authenticated clients in this slice.
create or replace function public.servsync_append_workflow_activity_event(
  p_context_type text,
  p_event_type text,
  p_service_request_id uuid default null,
  p_inspection_id uuid default null,
  p_estimate_id uuid default null,
  p_invoice_id uuid default null,
  p_appointment_id uuid default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.workflow_activity_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context_type text := lower(trim(coalesce(p_context_type, '')));
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_contractor_id uuid;
  v_homeowner_user_id uuid;
  v_event public.workflow_activity_events;
begin
  if v_context_type = 'service_request' then
    select contractor_id, homeowner_user_id
      into v_contractor_id, v_homeowner_user_id
      from public.service_requests
     where id = p_service_request_id;
  elsif v_context_type = 'job' then
    select contractor_id, homeowner_user_id
      into v_contractor_id, v_homeowner_user_id
      from public.inspections
     where id = p_inspection_id;
  elsif v_context_type = 'estimate' then
    select contractor_id, homeowner_user_id
      into v_contractor_id, v_homeowner_user_id
      from public.estimates
     where id = p_estimate_id;
  elsif v_context_type = 'invoice' then
    select contractor_id, homeowner_user_id
      into v_contractor_id, v_homeowner_user_id
      from public.invoices
     where id = p_invoice_id;
  elsif v_context_type = 'appointment' then
    select contractor_id, homeowner_user_id
      into v_contractor_id, v_homeowner_user_id
      from public.service_requests
     where id = p_service_request_id;
  elsif v_context_type in ('report', 'photo') then
    select contractor_id, homeowner_user_id
      into v_contractor_id, v_homeowner_user_id
      from public.inspections
     where id = p_inspection_id;
  else
    raise exception 'Unsupported workflow activity context.';
  end if;

  if v_contractor_id is null then
    raise exception 'Workflow activity context not found.';
  end if;

  insert into public.workflow_activity_events (
    context_type,
    service_request_id,
    inspection_id,
    estimate_id,
    invoice_id,
    appointment_id,
    contractor_id,
    homeowner_user_id,
    event_type,
    actor_user_id,
    metadata
  ) values (
    v_context_type,
    p_service_request_id,
    p_inspection_id,
    p_estimate_id,
    p_invoice_id,
    p_appointment_id,
    v_contractor_id,
    v_homeowner_user_id,
    v_event_type,
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_event;

  return v_event;
end;
$$;

revoke execute on function public.servsync_send_workflow_message(text, text, uuid, uuid)
  from public;
revoke execute on function public.servsync_send_workflow_message(text, text, uuid, uuid)
  from anon;
grant execute on function public.servsync_send_workflow_message(text, text, uuid, uuid)
  to authenticated;

revoke execute on function public.servsync_mark_workflow_thread_read(text, uuid, uuid)
  from public;
revoke execute on function public.servsync_mark_workflow_thread_read(text, uuid, uuid)
  from anon;
grant execute on function public.servsync_mark_workflow_thread_read(text, uuid, uuid)
  to authenticated;

revoke all on function public.servsync_append_workflow_activity_event(text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
