-- ServSync FB-025 Slice 3B
-- Durable workflow activity event writers for trusted lifecycle RPCs.
--
-- Adds narrowly scoped workflow_activity_events appends to selected trusted
-- lifecycle RPCs. This patch does not change the Activity UI reader, backfill
-- historical events, add unread badges, add notification delivery, or migrate
-- legacy request messages.
--
-- Sandbox-review patch. Do NOT apply to production without explicit approval.

begin;

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
    raise notice 'Function % already has FB-025 activity writer.', p_label;
    return;
  end if;

  if position(p_anchor in v_definition) = 0 then
    raise exception 'Function % does not contain expected insertion anchor.', p_label;
  end if;

  execute replace(v_definition, p_anchor, p_insert || E'\n' || p_anchor);
end;
$$;

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_propose_service_request_appointment_windows(uuid, jsonb, text)'::regprocedure,
  E'  return jsonb_build_object(\n    ''request_id'', v_request.id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''appointment_proposed''\n       and wae.service_request_id = v_request.id\n       and wae.metadata @> jsonb_build_object(''proposal_batch_id'', v_batch_id)\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''appointment'',\n      p_event_type => ''appointment_proposed'',\n      p_service_request_id => v_request.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_propose_service_request_appointment_windows'',\n        ''proposal_batch_id'', v_batch_id,\n        ''window_count'', v_window_count\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_propose_service_request_appointment_windows''',
  'servsync_propose_service_request_appointment_windows(uuid, jsonb, text)'
);

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_accept_service_request_appointment_window(uuid)'::regprocedure,
  E'  return jsonb_build_object(\n    ''request_id'', v_window.request_id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''appointment_confirmed''\n       and wae.appointment_id = v_appointment.id\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''appointment'',\n      p_event_type => ''appointment_confirmed'',\n      p_service_request_id => v_window.request_id,\n      p_appointment_id => v_appointment.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_accept_service_request_appointment_window''\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_accept_service_request_appointment_window''',
  'servsync_accept_service_request_appointment_window(uuid)'
);

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_homeowner_respond_to_estimate(uuid, text)'::regprocedure,
  E'  return jsonb_build_object(\n    ''estimate_id'', v_estimate.id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = case when v_next_status = ''accepted'' then ''estimate_approved'' else ''estimate_declined'' end\n       and wae.estimate_id = v_estimate.id\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''estimate'',\n      p_event_type => case when v_next_status = ''accepted'' then ''estimate_approved'' else ''estimate_declined'' end,\n      p_service_request_id => v_estimate.service_request_id,\n      p_inspection_id => v_estimate.inspection_id,\n      p_estimate_id => v_estimate.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_homeowner_respond_to_estimate''\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_homeowner_respond_to_estimate''',
  'servsync_homeowner_respond_to_estimate(uuid, text)'
);

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_create_job_from_estimate(uuid)'::regprocedure,
  E'  return jsonb_build_object(\n    ''estimate_id'', v_estimate.id,\n    ''job_id'', v_job_id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''job_created''\n       and wae.inspection_id = v_job_id\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''job'',\n      p_event_type => ''job_created'',\n      p_service_request_id => v_estimate.service_request_id,\n      p_inspection_id => v_job_id,\n      p_estimate_id => v_estimate.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_create_job_from_estimate''\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_create_job_from_estimate''',
  'servsync_create_job_from_estimate(uuid)'
);

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_send_invoice(uuid)'::regprocedure,
  E'  return jsonb_build_object(\n    ''invoice_id'', v_invoice.id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''invoice_sent''\n       and wae.invoice_id = v_invoice.id\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''invoice'',\n      p_event_type => ''invoice_sent'',\n      p_service_request_id => v_invoice.service_request_id,\n      p_inspection_id => v_invoice.job_id,\n      p_estimate_id => v_invoice.estimate_id,\n      p_invoice_id => v_invoice.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_send_invoice''\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_send_invoice''',
  'servsync_send_invoice(uuid)'
);

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_mark_invoice_paid(uuid)'::regprocedure,
  E'  return jsonb_build_object(\n    ''invoice_id'', v_invoice.id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''invoice_paid''\n       and wae.invoice_id = v_invoice.id\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''invoice'',\n      p_event_type => ''invoice_paid'',\n      p_service_request_id => v_invoice.service_request_id,\n      p_inspection_id => v_invoice.job_id,\n      p_estimate_id => v_invoice.estimate_id,\n      p_invoice_id => v_invoice.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_mark_invoice_paid''\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_mark_invoice_paid''',
  'servsync_mark_invoice_paid(uuid)'
);

select pg_temp.servsync_insert_activity_writer(
  'public.servsync_void_invoice(uuid)'::regprocedure,
  E'  return jsonb_build_object(\n    ''invoice_id'', v_invoice.id,',
  E'  if not exists (\n    select 1\n      from public.workflow_activity_events wae\n     where wae.event_type = ''invoice_voided''\n       and wae.invoice_id = v_invoice.id\n  ) then\n    perform public.servsync_append_workflow_activity_event(\n      p_context_type => ''invoice'',\n      p_event_type => ''invoice_voided'',\n      p_service_request_id => v_invoice.service_request_id,\n      p_inspection_id => v_invoice.job_id,\n      p_estimate_id => v_invoice.estimate_id,\n      p_invoice_id => v_invoice.id,\n      p_actor_user_id => auth.uid(),\n      p_metadata => jsonb_build_object(\n        ''source_rpc'', ''servsync_void_invoice''\n      )\n    );\n  end if;\n',
  E'''source_rpc'', ''servsync_void_invoice''',
  'servsync_void_invoice(uuid)'
);

revoke all on function public.servsync_append_workflow_activity_event(text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
