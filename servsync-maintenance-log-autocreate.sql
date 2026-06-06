-- ServSync maintenance log auto-creation.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-maintenance-log.sql.
--
-- When a contractor closes a service request, a maintenance log entry is
-- automatically created for the homeowner, pre-filled with:
--   • category + title from the request
--   • closing summary as description (falls back to original description)
--   • contractor business name
--   • cost from the accepted quote (or any pending quote)
--   • date from the confirmed/completed appointment (falls back to today)
--
-- The entry is linked via service_request_id so the homeowner's log shows
-- "From service request" and the entry stays editable.

begin;

-- Partial unique index prevents duplicate auto-entries for the same request.
create unique index if not exists maintenance_log_unique_request_idx
  on public.home_maintenance_log(service_request_id)
  where service_request_id is not null;

-- Replace the contractor update RPC with auto-log support.
drop function if exists public.servsync_contractor_update_service_request(uuid, text, text, int, text, text);

create function public.servsync_contractor_update_service_request(
  p_request_id         uuid,
  p_body               text,
  p_new_status         text    default 'contractor_responded',
  p_quote_amount_cents int     default null,
  p_quote_scope        text    default null,
  p_closing_summary    text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id     uuid;
  v_contractor_name   text;
  v_request           public.service_requests;
  v_next_status       text;
  v_body              text;
  v_cost_cents        int;
  v_performed_at      date;
  v_description       text;
begin
  -- Resolve calling contractor
  select id, business_name
    into v_contractor_id, v_contractor_name
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  -- Load and validate the service request
  select * into v_request
    from public.service_requests
   where id = p_request_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'This service request is already closed.';
  end if;

  if p_new_status not in ('contractor_responded', 'declined', 'closed') then
    raise exception 'Unsupported service request status.';
  end if;

  v_next_status := p_new_status;
  v_body        := coalesce(nullif(trim(p_body), ''), 'Contractor updated this request.');

  -- Record the message
  insert into public.service_request_messages (
    request_id, actor_user_id, actor_role, message_type, body
  ) values (
    v_request.id,
    auth.uid(),
    'contractor',
    case
      when v_next_status = 'declined' then 'contractor_declined'
      when v_next_status = 'closed'   then 'contractor_closed'
      else 'contractor_response'
    end,
    v_body
  );

  -- Update request status and closing summary
  update public.service_requests
     set status          = v_next_status,
         closing_summary = case
           when v_next_status = 'closed' and p_closing_summary is not null
           then coalesce(nullif(trim(p_closing_summary), ''), '')
           else closing_summary
         end
   where id = v_request.id;

  -- Attach or refresh quote when amount is provided
  if p_quote_amount_cents is not null and p_quote_amount_cents >= 0 then
    insert into public.service_request_quotes
      (request_id, contractor_id, amount_cents, scope, status)
    values
      (v_request.id, v_contractor_id, p_quote_amount_cents,
       coalesce(nullif(trim(p_quote_scope), ''), ''), 'pending')
    on conflict (request_id) do update
       set amount_cents = excluded.amount_cents,
           scope        = excluded.scope,
           status       = 'pending';
  end if;

  -- ── Auto-create maintenance log entry on close ───────────────────────────
  if v_next_status = 'closed' then

    -- Best available cost: accepted quote → any quote → null
    select amount_cents into v_cost_cents
      from public.service_request_quotes
     where request_id = v_request.id
     order by (status = 'accepted') desc, created_at desc
     limit 1;

    -- Best available date: confirmed/completed appointment → today
    select (proposed_at at time zone 'UTC')::date into v_performed_at
      from public.service_request_appointments
     where request_id = v_request.id
       and status in ('confirmed', 'completed')
     order by (status = 'completed') desc, proposed_at desc
     limit 1;

    if v_performed_at is null then
      v_performed_at := now()::date;
    end if;

    -- Description: closing summary if provided, else original description
    v_description := coalesce(
      nullif(trim(coalesce(p_closing_summary, '')), ''),
      nullif(trim(v_request.description), ''),
      'Service completed.'
    );

    -- Insert — skip silently if a log entry already exists for this request
    insert into public.home_maintenance_log (
      homeowner_user_id,
      service_request_id,
      category,
      title,
      description,
      performed_at,
      contractor_name,
      cost_cents,
      notes
    ) values (
      v_request.homeowner_user_id,
      v_request.id,
      v_request.category,
      v_request.title,
      v_description,
      v_performed_at,
      coalesce(nullif(trim(v_contractor_name), ''), 'Contractor'),
      v_cost_cents,
      'Auto-created when service request was closed.'
    )
    on conflict (service_request_id) where service_request_id is not null
    do nothing;

    -- Notify homeowner that the log was updated
    insert into public.notifications (user_id, type, title, body, request_id)
    values (
      v_request.homeowner_user_id,
      'maintenance_log_created',
      'Maintenance log updated',
      v_contractor_name || ' closed your service request. A maintenance log entry has been added to your home record.',
      v_request.id
    );

  end if;

  return jsonb_build_object('request_id', v_request.id, 'status', v_next_status);
end;
$$;

grant execute on function public.servsync_contractor_update_service_request(uuid, text, text, int, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
