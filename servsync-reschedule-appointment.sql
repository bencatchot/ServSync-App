-- ServSync appointment rescheduling.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-request-lifecycle.sql has been applied.
--
-- Adds servsync_homeowner_propose_appointment so homeowners can
-- initiate a reschedule (mirroring the contractor propose function).
-- The contractor can already reschedule via the existing
-- servsync_contractor_propose_appointment upsert.

begin;

create or replace function public.servsync_homeowner_propose_appointment(
  p_request_id  uuid,
  p_proposed_at timestamptz,
  p_notes       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
begin
  select * into v_request
    from public.service_requests
   where id = p_request_id
     and homeowner_user_id = auth.uid()
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'Cannot schedule an appointment on a closed request.';
  end if;

  if p_proposed_at <= now() then
    raise exception 'Proposed date must be in the future.';
  end if;

  insert into public.service_request_appointments
    (request_id, contractor_id, proposed_at, notes, status, proposed_by)
  values
    (v_request.id, v_request.contractor_id, p_proposed_at,
     coalesce(nullif(trim(p_notes), ''), ''), 'proposed', 'homeowner')
  on conflict (request_id) do update
     set proposed_at  = excluded.proposed_at,
         notes        = excluded.notes,
         status       = 'proposed',
         proposed_by  = 'homeowner';

  return jsonb_build_object('request_id', v_request.id, 'status', 'proposed', 'proposed_by', 'homeowner');
end;
$$;

grant execute on function public.servsync_homeowner_propose_appointment(uuid, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';

commit;
