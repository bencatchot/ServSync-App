-- ServSync create job from standalone calendar event (v1).
-- Adds a contractor-only link from a standalone calendar event occurrence to
-- the job/visit created from it.
--
-- Run after:
--   - servsync-standalone-calendar-events.sql
--   - servsync-recurring-calendar-events.sql
--   - servsync-unified-visit-events.sql
--   - servsync-service-request-home-id.sql
--
-- Sandbox-review patch. Do NOT apply to production without explicit approval.

begin;

create table if not exists public.contractor_calendar_event_job_links (
  id                    uuid primary key default gen_random_uuid(),
  contractor_id         uuid not null references public.contractor_profiles(id) on delete cascade,
  calendar_event_id     uuid not null references public.contractor_calendar_events(id) on delete cascade,
  occurrence_starts_at  timestamptz not null,
  inspection_id         uuid not null references public.inspections(id) on delete cascade,
  visit_event_id        uuid references public.contractor_visit_events(id) on delete set null,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (calendar_event_id, occurrence_starts_at),
  unique (inspection_id)
);

create index if not exists contractor_calendar_event_job_links_contractor_idx
  on public.contractor_calendar_event_job_links(contractor_id, occurrence_starts_at desc);

create index if not exists contractor_calendar_event_job_links_event_idx
  on public.contractor_calendar_event_job_links(calendar_event_id, occurrence_starts_at);

alter table public.contractor_calendar_event_job_links enable row level security;

drop policy if exists "Calendar event job links: team read" on public.contractor_calendar_event_job_links;
drop policy if exists "Calendar event job links: team insert" on public.contractor_calendar_event_job_links;
drop policy if exists "Calendar event job links: team update" on public.contractor_calendar_event_job_links;
drop policy if exists "Calendar event job links: team delete" on public.contractor_calendar_event_job_links;

create policy "Calendar event job links: team read"
  on public.contractor_calendar_event_job_links for select to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar event job links: team insert"
  on public.contractor_calendar_event_job_links for insert to authenticated
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar event job links: team update"
  on public.contractor_calendar_event_job_links for update to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id))
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar event job links: team delete"
  on public.contractor_calendar_event_job_links for delete to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id));

grant select, insert, update, delete on public.contractor_calendar_event_job_links to authenticated;

drop function if exists public.servsync_create_job_from_calendar_event(uuid, timestamptz);

create or replace function public.servsync_create_job_from_calendar_event(
  p_calendar_event_id uuid,
  p_occurrence_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.contractor_calendar_events;
  v_existing_link public.contractor_calendar_event_job_links;
  v_local_home_id uuid;
  v_job_id uuid;
  v_visit_result jsonb;
  v_visit_event_id uuid;
  v_summary text;
  v_job_type text;
begin
  if p_calendar_event_id is null then
    raise exception 'Calendar event is required.';
  end if;

  if p_occurrence_starts_at is null then
    raise exception 'Choose an event occurrence.';
  end if;

  select *
    into v_event
    from public.contractor_calendar_events
   where id = p_calendar_event_id
     and public.current_user_can_write_contractor_jobs(contractor_id)
   limit 1;

  if v_event.id is null then
    raise exception 'Calendar event not found.';
  end if;

  select *
    into v_existing_link
    from public.contractor_calendar_event_job_links
   where calendar_event_id = v_event.id
     and occurrence_starts_at = p_occurrence_starts_at
     and public.current_user_can_write_contractor_jobs(contractor_id)
   limit 1;

  if v_existing_link.id is not null then
    return jsonb_build_object(
      'job_id', v_existing_link.inspection_id,
      'visit_event_id', v_existing_link.visit_event_id,
      'created', false
    );
  end if;

  if p_occurrence_starts_at <= now() then
    raise exception 'Choose a future event occurrence before creating a job.';
  end if;

  if v_event.homeowner_user_id is null and v_event.local_contact_id is null then
    raise exception 'Select a customer on the calendar event before creating a job.';
  end if;

  if v_event.local_contact_id is not null then
    select id
      into v_local_home_id
      from public.contractor_local_homes
     where contractor_id = v_event.contractor_id
       and local_contact_id = v_event.local_contact_id
     order by created_at asc
     limit 1;
  end if;

  v_summary := trim(both from concat_ws(E'\n\n',
    nullif(trim(coalesce(v_event.notes, '')), ''),
    'Created from calendar event: ' || coalesce(nullif(trim(v_event.event_type), ''), 'other')
  ));

  v_job_type := case
    when v_event.event_type = 'routine_inspection' then 'maintenance_visit'
    else 'service_visit'
  end;

  select public.servsync_create_field_work(
    v_event.homeowner_user_id,
    null,
    v_event.local_contact_id,
    v_local_home_id,
    null,
    v_event.title,
    '[]'::jsonb,
    null
  )
  into v_job_id;

  update public.inspections
     set job_type = v_job_type,
         job_status = 'scheduled',
         summary = v_summary,
         updated_at = now()
   where id = v_job_id
     and public.current_user_can_write_contractor_jobs(contractor_id);

  select public.servsync_schedule_visit_event(
    v_job_id,
    p_occurrence_starts_at,
    coalesce(nullif(trim(v_event.notes), ''), ''),
    false
  )
  into v_visit_result;

  v_visit_event_id := nullif(v_visit_result->>'visit_event_id', '')::uuid;

  insert into public.contractor_calendar_event_job_links (
    contractor_id,
    calendar_event_id,
    occurrence_starts_at,
    inspection_id,
    visit_event_id,
    created_by
  ) values (
    v_event.contractor_id,
    v_event.id,
    p_occurrence_starts_at,
    v_job_id,
    v_visit_event_id,
    auth.uid()
  );

  return jsonb_build_object(
    'job_id', v_job_id,
    'visit_event_id', v_visit_event_id,
    'created', true
  );
end;
$$;

grant execute on function public.servsync_create_job_from_calendar_event(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;
