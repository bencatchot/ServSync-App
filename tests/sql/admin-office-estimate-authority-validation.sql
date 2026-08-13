\set ON_ERROR_STOP on

do $$
declare
  v_allowed boolean;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
  select public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') into v_allowed;
  if not v_allowed then raise exception 'Owner Estimate capability denied.'; end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
  select public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') into v_allowed;
  if not v_allowed then raise exception 'Admin Estimate capability denied.'; end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
  select public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') into v_allowed;
  if not v_allowed then raise exception 'Office Estimate capability denied.'; end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
  if public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') then raise exception 'Field Technician overgrant.'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
  if public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') then raise exception 'Viewer overgrant.'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
  if public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') then raise exception 'Inactive Admin overgrant.'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
  if public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') then raise exception 'Cross-tenant Admin overgrant.'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000008', true);
  if public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000001') then raise exception 'Unresolved platform-admin overgrant.'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
  if public.current_user_can_manage_contractor_estimates('20000000-0000-0000-0000-000000000003') then raise exception 'Inactive contractor Owner overgrant.'; end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into public.estimates (id, contractor_id, homeowner_user_id, title, status)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000009',
  'Owner-created estimate',
  'draft'
);
insert into public.estimate_line_items (estimate_id, description)
values ('30000000-0000-0000-0000-000000000001', 'Owner line');

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
update public.estimates
   set title = 'Office-edited estimate'
 where id = '30000000-0000-0000-0000-000000000001';
insert into public.estimate_payment_schedule_items (estimate_id, label)
values ('30000000-0000-0000-0000-000000000001', 'Deposit');

do $$
declare
  v_rows integer := 0;
begin
  begin
    update public.estimates set status = 'sent'
     where id = '30000000-0000-0000-0000-000000000001';
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'Direct Estimate status update unexpectedly changed a row.';
    end if;
  exception when insufficient_privilege then null;
  end;
  if (select status from public.estimates where id = '30000000-0000-0000-0000-000000000001') <> 'draft' then
    raise exception 'Direct Estimate status update changed authoritative state.';
  end if;
end;
$$;

do $$
declare
  v_result jsonb;
begin
  select public.servsync_send_estimate('30000000-0000-0000-0000-000000000001') into v_result;
  if v_result->>'status' <> 'sent' or (v_result->>'sent')::boolean is not true then
    raise exception 'Office send failed: %', v_result;
  end if;
  select public.servsync_send_estimate('30000000-0000-0000-0000-000000000001') into v_result;
  if (v_result->>'idempotent')::boolean is not true then
    raise exception 'Idempotent retry failed: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_audit jsonb;
begin
  select public.servsync_get_estimate_actor_audit('30000000-0000-0000-0000-000000000001') into v_audit;
  if v_audit->>'created_by_user_id' <> '10000000-0000-0000-0000-000000000001'
     or v_audit->>'last_edited_by_user_id' <> '10000000-0000-0000-0000-000000000003'
     or v_audit->>'sent_by_user_id' <> '10000000-0000-0000-0000-000000000003'
     or v_audit->>'created_at' is null
     or v_audit->>'last_edited_at' is null
     or v_audit->>'sent_at' is null then
    raise exception 'Estimate actor attribution incorrect: %', v_audit;
  end if;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
do $$
begin
  begin
    perform public.servsync_send_estimate('30000000-0000-0000-0000-000000000001');
    raise exception 'Field Technician send unexpectedly succeeded.';
  exception when raise_exception then
    if sqlerrm <> 'ESTIMATE_UNAVAILABLE' then raise; end if;
  end;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
do $$
begin
  begin
    insert into public.estimates (contractor_id, homeowner_user_id, title, status)
    values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000009', 'Viewer attempt', 'draft');
    raise exception 'Viewer insert unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
do $$
declare
  v_audit jsonb;
begin
  select public.servsync_get_estimate_actor_audit('30000000-0000-0000-0000-000000000099') into v_audit;
  if v_audit->>'created_by_user_id' is not null
     or v_audit->>'last_edited_by_user_id' is not null
     or v_audit->>'sent_by_user_id' is not null then
    raise exception 'Historical attribution was fabricated: %', v_audit;
  end if;
end;
$$;

do $$
begin
  begin
    perform 1 from public.estimate_actor_audit;
    raise exception 'Authenticated direct audit-table read unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.workflow_activity_events where estimate_id = '30000000-0000-0000-0000-000000000001' and event_type = 'estimate_sent') <> 1 then
    raise exception 'Estimate sent activity was not exactly-once for an idempotent retry.';
  end if;
  if has_table_privilege('authenticated', 'public.estimate_actor_audit', 'select') then
    raise exception 'Authenticated retained direct audit-table SELECT.';
  end if;
  if has_function_privilege('anon', 'public.servsync_send_estimate(uuid)', 'execute') then
    raise exception 'Anon can execute Estimate send.';
  end if;
  if not has_function_privilege('authenticated', 'public.servsync_send_estimate(uuid)', 'execute') then
    raise exception 'Authenticated cannot execute Estimate send.';
  end if;
end;
$$;
