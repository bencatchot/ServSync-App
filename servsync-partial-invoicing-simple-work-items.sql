-- ServSync partial invoicing Phase 2B-2: simple service task work-item sync.
-- Paste this into the Supabase SQL Editor only after explicit environment
-- approval.
--
-- Run after:
--   - servsync-partial-invoicing-data-foundation.sql
--   - servsync-partial-invoicing-estimate-work-items.sql
--
-- Adds source metadata for durable job work items and a guarded RPC that syncs
-- only the synthetic simple-service "Work Items" task room into
-- job_work_items. This patch does not backfill legacy jobs globally, convert
-- general inspection findings, add manual work-item editing, or change invoice
-- UI/PDF behavior.

begin;

alter table public.job_work_items
  add column if not exists source_type text,
  add column if not exists source_key text,
  add column if not exists source_room_id text,
  add column if not exists source_finding_id text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'job_work_items_source_type_check'
       and conrelid = 'public.job_work_items'::regclass
  ) then
    alter table public.job_work_items
      add constraint job_work_items_source_type_check
      check (
        source_type is null
        or source_type in ('estimate_line_item', 'simple_task', 'manual', 'inspection_finding')
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'job_work_items_source_key_not_blank'
       and conrelid = 'public.job_work_items'::regclass
  ) then
    alter table public.job_work_items
      add constraint job_work_items_source_key_not_blank
      check (source_key is null or length(trim(source_key)) > 0);
  end if;
end $$;

create unique index if not exists job_work_items_source_identity_uidx
  on public.job_work_items(inspection_id, source_type, source_key)
  where source_type is not null and source_key is not null;

create index if not exists job_work_items_source_identity_idx
  on public.job_work_items(contractor_id, source_type, source_key)
  where source_type is not null and source_key is not null;

comment on column public.job_work_items.source_type is
  'Optional source family for durable work-item origin, such as estimate_line_item, simple_task, manual, or future inspection_finding.';

comment on column public.job_work_items.source_key is
  'Stable source key used with inspection_id and source_type to prevent duplicate source-backed work items.';

comment on column public.job_work_items.source_room_id is
  'Optional source room/section identifier from rooms_with_findings JSON for synced simple tasks or future finding conversion.';

comment on column public.job_work_items.source_finding_id is
  'Optional source task/finding identifier from rooms_with_findings JSON for synced simple tasks or future finding conversion.';

create or replace function public.servsync_sync_simple_job_work_items(p_inspection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.inspections;
  v_synced_count integer := 0;
  v_removed_count integer := 0;
  v_skipped_missing_source_key_count integer := 0;
begin
  if p_inspection_id is null then
    raise exception 'Job is required.';
  end if;

  perform pg_advisory_xact_lock(hashtext('servsync-simple-job-work-items-' || p_inspection_id::text));

  select *
    into v_job
    from public.inspections
   where id = p_inspection_id
   for update;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_job.contractor_id) then
    raise exception 'You do not have permission to sync work items for this job.';
  end if;

  if coalesce(v_job.job_type, '') not in ('service_visit', 'repair', 'install', 'estimate_visit') then
    raise exception 'Only simple service jobs can sync simple work items.';
  end if;

  with simple_rooms as (
    select
      room.value as room_json,
      room.ordinality::integer as room_index,
      coalesce(nullif(trim(room.value->>'room_id'), ''), nullif(trim(room.value->>'room'), ''), 'work-items') as room_id
    from jsonb_array_elements(coalesce(v_job.rooms_with_findings::jsonb, '[]'::jsonb)) with ordinality as room(value, ordinality)
    where lower(trim(coalesce(room.value->>'room', room.value->>'display_name', ''))) = lower('Work Items')
       or lower(trim(coalesce(room.value->>'display_name', room.value->>'room', ''))) = lower('Work Items')
  ),
  task_rows as (
    select
      simple_rooms.room_id,
      simple_rooms.room_index,
      task.value as task_json,
      task.ordinality::integer as task_index,
      nullif(trim(coalesce(task.value->>'source_key', task.value->>'source_finding_id', '')), '') as source_key,
      coalesce(nullif(trim(task.value->>'source_finding_id'), ''), nullif(trim(task.value->>'source_key'), '')) as source_finding_id,
      nullif(trim(task.value->>'title'), '') as title,
      coalesce(nullif(trim(task.value->>'status'), ''), 'Monitor') as finding_status,
      coalesce(trim(task.value->>'action'), '') as action_text,
      coalesce(trim(task.value->>'notes'), '') as notes_text
    from simple_rooms
    cross join lateral jsonb_array_elements(coalesce(simple_rooms.room_json->'findings', '[]'::jsonb)) with ordinality as task(value, ordinality)
  ),
  valid_tasks as (
    select *
      from task_rows
     where source_key is not null
       and title is not null
  ),
  upserted as (
    insert into public.job_work_items (
      inspection_id,
      contractor_id,
      source_type,
      source_key,
      source_room_id,
      source_finding_id,
      title,
      description,
      customer_description,
      internal_notes,
      line_type,
      quantity,
      unit,
      unit_price_cents,
      labor_hours,
      billable,
      completion_status,
      billing_status,
      completed_at,
      completed_by,
      sort_order
    )
    select
      v_job.id,
      v_job.contractor_id,
      'simple_task',
      vt.source_key,
      vt.room_id,
      coalesce(vt.source_finding_id, vt.source_key),
      vt.title,
      '',
      vt.action_text,
      vt.notes_text,
      'other',
      1,
      'each',
      null,
      null,
      true,
      case when vt.finding_status = 'Fixed On Site' then 'completed' else 'open' end,
      'unbilled',
      case when vt.finding_status = 'Fixed On Site' then now() else null end,
      case when vt.finding_status = 'Fixed On Site' then auth.uid() else null end,
      (vt.room_index * 1000) + vt.task_index
    from valid_tasks vt
    on conflict (inspection_id, source_type, source_key)
      where source_type is not null and source_key is not null
    do update set
      source_room_id = excluded.source_room_id,
      source_finding_id = excluded.source_finding_id,
      title = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.title
        else excluded.title
      end,
      customer_description = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.customer_description
        else excluded.customer_description
      end,
      internal_notes = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.internal_notes
        else excluded.internal_notes
      end,
      billable = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.billable
        else true
      end,
      completion_status = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.completion_status
        else excluded.completion_status
      end,
      billing_status = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.billing_status
        else 'unbilled'
      end,
      reserved_invoice_id = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.reserved_invoice_id
        else null
      end,
      invoiced_invoice_id = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.invoiced_invoice_id
        else null
      end,
      completed_at = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.completed_at
        when excluded.completion_status = 'completed' then coalesce(job_work_items.completed_at, excluded.completed_at, now())
        else null
      end,
      completed_by = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.completed_by
        when excluded.completion_status = 'completed' then coalesce(job_work_items.completed_by, auth.uid())
        else null
      end,
      sort_order = case
        when job_work_items.billing_status in ('drafted', 'invoiced') then job_work_items.sort_order
        else excluded.sort_order
      end,
      updated_at = now()
    returning id
  )
  select count(*) into v_synced_count from upserted;

  select count(*)
    into v_skipped_missing_source_key_count
    from (
      select 1
        from jsonb_array_elements(coalesce(v_job.rooms_with_findings::jsonb, '[]'::jsonb)) room(value)
        cross join lateral jsonb_array_elements(coalesce(room.value->'findings', '[]'::jsonb)) task(value)
       where (
          lower(trim(coalesce(room.value->>'room', room.value->>'display_name', ''))) = lower('Work Items')
          or lower(trim(coalesce(room.value->>'display_name', room.value->>'room', ''))) = lower('Work Items')
       )
         and nullif(trim(coalesce(task.value->>'source_key', task.value->>'source_finding_id', '')), '') is null
         and nullif(trim(task.value->>'title'), '') is not null
    ) skipped;

  with current_source_keys as (
    select nullif(trim(coalesce(task.value->>'source_key', task.value->>'source_finding_id', '')), '') as source_key
      from jsonb_array_elements(coalesce(v_job.rooms_with_findings::jsonb, '[]'::jsonb)) room(value)
      cross join lateral jsonb_array_elements(coalesce(room.value->'findings', '[]'::jsonb)) task(value)
     where (
        lower(trim(coalesce(room.value->>'room', room.value->>'display_name', ''))) = lower('Work Items')
        or lower(trim(coalesce(room.value->>'display_name', room.value->>'room', ''))) = lower('Work Items')
     )
  ),
  removed as (
    update public.job_work_items jwi
       set completion_status = 'removed',
           billing_status = 'not_billable',
           billable = false,
           reserved_invoice_id = null,
           invoiced_invoice_id = null,
           updated_at = now()
     where jwi.inspection_id = v_job.id
       and jwi.contractor_id = v_job.contractor_id
       and jwi.source_type = 'simple_task'
       and jwi.source_key is not null
       and jwi.billing_status in ('unbilled', 'not_billable')
       and not exists (
         select 1
           from current_source_keys current_keys
          where current_keys.source_key = jwi.source_key
       )
     returning id
  )
  select count(*) into v_removed_count from removed;

  return jsonb_build_object(
    'inspection_id', v_job.id,
    'synced_count', v_synced_count,
    'removed_count', v_removed_count,
    'skipped_missing_source_key_count', v_skipped_missing_source_key_count
  );
end;
$$;

revoke execute on function public.servsync_sync_simple_job_work_items(uuid) from public;
revoke execute on function public.servsync_sync_simple_job_work_items(uuid) from anon;
grant execute on function public.servsync_sync_simple_job_work_items(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
