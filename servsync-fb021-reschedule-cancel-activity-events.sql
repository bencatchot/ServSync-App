-- ServSync FB-021 Closeout C
-- Durable workflow Activity rows for appointment reschedule/cancel actions.
--
-- Adds narrowly scoped workflow_activity_events appends to the trusted
-- appointment replacement-window and cancel RPCs only. This patch does not
-- add notification delivery, reminders, calendar sync, dispatch/routing/GPS,
-- homeowner-forced booking, or new appointment lifecycle statuses.
--
-- Forward-only note: this patch broadens the workflow_activity_events event
-- type constraint. A true rollback must first remove rows with the new event
-- types before restoring the prior check constraint.
--
-- Sandbox-review patch. Do NOT apply to production without explicit approval.

begin;

alter table public.workflow_activity_events
  drop constraint if exists workflow_activity_events_event_type_check;

alter table public.workflow_activity_events
  add constraint workflow_activity_events_event_type_check check (
    event_type in (
      'service_request_submitted',
      'homeowner_message_sent',
      'contractor_message_sent',
      'appointment_proposed',
      'appointment_confirmed',
      'appointment_reschedule_proposed',
      'appointment_cancelled',
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
  );

create or replace function pg_temp.servsync_insert_activity_writer(
  p_function regprocedure,
  p_anchor text,
  p_insert text,
  p_marker text,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p_function)
    into v_definition;

  if v_definition is null then
    raise exception 'Function % does not exist.', p_label;
  end if;

  if position(p_marker in v_definition) > 0 then
    raise notice 'Function % already has FB-021 Closeout C activity writer.', p_label;
    return;
  end if;

  if position(p_anchor in v_definition) = 0 then
    raise exception 'Function % does not contain expected insertion anchor.', p_label;
  end if;

  execute replace(v_definition, p_anchor, p_insert || E'\n' || p_anchor);
end;
$$;

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_reschedule_service_request_appointment(uuid, jsonb, text)'::regprocedure,
  E'  return jsonb_build_object(\n    ''request_id'', v_request.id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''appointment_reschedule_proposed''\n       and wae.service_request_id = v_request.id\n       and wae.metadata @> jsonb_build_object(''proposal_batch_id'', v_batch_id)\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''appointment'',\n      p_event_type => ''appointment_reschedule_proposed'',\n      p_service_request_id => v_request.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_reschedule_service_request_appointment'',\n        ''proposal_batch_id'', v_batch_id,\n        ''window_count'', v_window_count,\n        ''existing_confirmed_appointment_preserved'', v_existing_confirmed\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_reschedule_service_request_appointment''',
  'servsync_reschedule_service_request_appointment(uuid, jsonb, text)'
);

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_cancel_service_request_appointment(uuid, text)'::regprocedure,
  E'  return jsonb_build_object(\n    ''request_id'', v_request.id,',
  E'  if v_appointment.id is not null and not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''appointment_cancelled''\n       and wae.appointment_id = v_appointment.id\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''appointment'',\n      p_event_type => ''appointment_cancelled'',\n      p_service_request_id => v_request.id,\n      p_appointment_id => v_appointment.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_cancel_service_request_appointment'',\n        ''cancelled_window_count'', v_window_count\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_cancel_service_request_appointment''',
  'servsync_cancel_service_request_appointment(uuid, text)'
);

revoke all on function public.servsync_append_workflow_activity_event(text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
