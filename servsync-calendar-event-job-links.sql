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

-- Calendar event types describe the calendar visit only. They do not choose
-- the job workflow created later from the event.
alter table public.contractor_calendar_events
  drop constraint if exists contractor_calendar_events_event_type_check;

update public.contractor_calendar_events
   set event_type = case event_type
     when 'routine_inspection' then 'inspection_visit'
     when 'follow_up' then 'follow_up_visit'
     when 'reminder' then 'custom'
     when 'check_in' then 'service_visit'
     when 'other' then 'custom'
     else event_type
   end
 where event_type in ('routine_inspection', 'follow_up', 'reminder', 'check_in', 'other');

alter table public.contractor_calendar_events
  add constraint contractor_calendar_events_event_type_check
  check (event_type in ('service_visit', 'inspection_visit', 'estimate_visit', 'follow_up_visit', 'custom'));

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

create table if not exists public.contractor_calendar_event_occurrence_exclusions (
  id                    uuid primary key default gen_random_uuid(),
  contractor_id         uuid not null references public.contractor_profiles(id) on delete cascade,
  calendar_event_id     uuid not null references public.contractor_calendar_events(id) on delete cascade,
  occurrence_starts_at  timestamptz not null,
  reason                text not null default 'deleted'
                        check (reason in ('deleted', 'event_only_deleted', 'event_and_job_deleted')),
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (calendar_event_id, occurrence_starts_at)
);

create index if not exists contractor_calendar_event_occurrence_exclusions_contractor_idx
  on public.contractor_calendar_event_occurrence_exclusions(contractor_id, occurrence_starts_at desc);

alter table public.contractor_calendar_event_occurrence_exclusions enable row level security;

drop policy if exists "Calendar event occurrence exclusions: team read" on public.contractor_calendar_event_occurrence_exclusions;
drop policy if exists "Calendar event occurrence exclusions: team insert" on public.contractor_calendar_event_occurrence_exclusions;
drop policy if exists "Calendar event occurrence exclusions: team update" on public.contractor_calendar_event_occurrence_exclusions;
drop policy if exists "Calendar event occurrence exclusions: team delete" on public.contractor_calendar_event_occurrence_exclusions;

create policy "Calendar event occurrence exclusions: team read"
  on public.contractor_calendar_event_occurrence_exclusions for select to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar event occurrence exclusions: team insert"
  on public.contractor_calendar_event_occurrence_exclusions for insert to authenticated
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar event occurrence exclusions: team update"
  on public.contractor_calendar_event_occurrence_exclusions for update to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id))
  with check (public.current_user_can_write_contractor_jobs(contractor_id));

create policy "Calendar event occurrence exclusions: team delete"
  on public.contractor_calendar_event_occurrence_exclusions for delete to authenticated
  using (public.current_user_can_write_contractor_jobs(contractor_id));

grant select, insert, update, delete on public.contractor_calendar_event_occurrence_exclusions to authenticated;

drop function if exists public.servsync_create_job_from_calendar_event(uuid, timestamptz);
drop function if exists public.servsync_create_job_from_calendar_event(uuid, timestamptz, text);

create or replace function public.servsync_create_job_from_calendar_event(
  p_calendar_event_id uuid,
  p_occurrence_starts_at timestamptz,
  p_job_type text
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

  v_job_type := nullif(trim(coalesce(p_job_type, '')), '');
  if v_job_type is null then
    raise exception 'Choose the type of job to create.';
  end if;
  if v_job_type not in ('service_visit', 'repair', 'install', 'estimate_visit', 'inspection', 'maintenance_visit') then
    raise exception 'Unsupported job type.';
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

grant execute on function public.servsync_create_job_from_calendar_event(uuid, timestamptz, text) to authenticated;

create or replace function public.servsync_remove_calendar_event_job_link(
  p_calendar_event_id uuid,
  p_occurrence_starts_at timestamptz,
  p_delete_job boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.contractor_calendar_events;
  v_link public.contractor_calendar_event_job_links;
  v_job public.inspections;
  v_frequency text;
  v_exclusion_id uuid;
  v_calendar_event_deleted boolean := false;
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
    into v_link
    from public.contractor_calendar_event_job_links
   where calendar_event_id = v_event.id
     and occurrence_starts_at = p_occurrence_starts_at
     and public.current_user_can_write_contractor_jobs(contractor_id)
   limit 1;

  if v_link.id is null then
    raise exception 'This calendar event occurrence is not tied to a job.';
  end if;

  select *
    into v_job
    from public.inspections
   where id = v_link.inspection_id
     and public.current_user_can_write_contractor_jobs(contractor_id)
   limit 1;

  if v_job.id is null then
    raise exception 'The tied job was not found.';
  end if;

  v_frequency := coalesce(nullif(trim(v_event.recurrence_frequency), ''), 'none');

  if v_frequency <> 'none' then
    insert into public.contractor_calendar_event_occurrence_exclusions (
      contractor_id,
      calendar_event_id,
      occurrence_starts_at,
      reason,
      created_by
    ) values (
      v_event.contractor_id,
      v_event.id,
      p_occurrence_starts_at,
      case when p_delete_job then 'event_and_job_deleted' else 'event_only_deleted' end,
      auth.uid()
    )
    on conflict (calendar_event_id, occurrence_starts_at) do update
       set reason = excluded.reason
    returning id into v_exclusion_id;
  end if;

  if p_delete_job then
    if v_job.status <> 'draft' or coalesce(v_job.job_status, 'draft') not in ('draft', 'scheduled') then
      raise exception 'Only draft or scheduled jobs that have not started can be deleted from a calendar event.';
    end if;

    delete from public.inspections
     where id = v_job.id
       and public.current_user_can_write_contractor_jobs(contractor_id)
       and status = 'draft'
       and coalesce(job_status, 'draft') in ('draft', 'scheduled');

    if not found then
      raise exception 'Unable to delete the tied job.';
    end if;
  else
    if v_link.visit_event_id is not null then
      delete from public.contractor_visit_events
       where id = v_link.visit_event_id
         and public.current_user_can_write_contractor_jobs(contractor_id);
    end if;

    update public.inspections
       set job_status = case when coalesce(job_status, 'draft') = 'scheduled' then 'draft' else job_status end,
           updated_at = now()
     where id = v_job.id
       and public.current_user_can_write_contractor_jobs(contractor_id)
       and status = 'draft';

    update public.contractor_calendar_event_job_links
       set visit_event_id = null
     where id = v_link.id
       and public.current_user_can_write_contractor_jobs(contractor_id);
  end if;

  if v_frequency = 'none' then
    delete from public.contractor_calendar_events
     where id = v_event.id
       and public.current_user_can_write_contractor_jobs(contractor_id);
    v_calendar_event_deleted := true;
  end if;

  return jsonb_build_object(
    'calendar_event_id', v_event.id,
    'calendar_event_deleted', v_calendar_event_deleted,
    'occurrence_starts_at', p_occurrence_starts_at,
    'exclusion_id', v_exclusion_id,
    'job_id', v_job.id,
    'job_deleted', p_delete_job,
    'visit_event_id', v_link.visit_event_id
  );
end;
$$;

grant execute on function public.servsync_remove_calendar_event_job_link(uuid, timestamptz, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
