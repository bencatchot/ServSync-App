-- ServSync request lifecycle: closing summary + reopen.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-appointment-counter-proposal.sql has been applied.
--
-- Adds closing_summary to service_requests.
-- Contractor can supply a summary when closing.
-- Either party can reopen a closed/declined request for follow-up.

begin;

-- Add closing_summary column
alter table public.service_requests
  add column if not exists closing_summary text not null default '';

-- Rebuild contractor update function to accept closing summary
drop function if exists public.servsync_contractor_update_service_request(uuid, text, text, int, text);

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
  v_contractor_id uuid;
  v_request       public.service_requests;
  v_next_status   text;
  v_body          text;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

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

  return jsonb_build_object('request_id', v_request.id, 'status', v_next_status);
end;
$$;

-- Homeowner reopens a closed/declined request
create or replace function public.servsync_homeowner_reopen_service_request(
  p_request_id uuid,
  p_body       text default ''
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
    raise exception 'Request not found.';
  end if;

  if v_request.status not in ('closed', 'declined') then
    raise exception 'Only closed or declined requests can be reopened.';
  end if;

  insert into public.service_request_messages (
    request_id, actor_user_id, actor_role, message_type, body
  ) values (
    v_request.id,
    auth.uid(),
    'homeowner',
    'homeowner_reopened',
    coalesce(nullif(trim(p_body), ''), 'Homeowner reopened this request for follow-up.')
  );

  update public.service_requests
     set status          = 'open',
         closing_summary = ''
   where id = v_request.id;

  return jsonb_build_object('request_id', v_request.id, 'status', 'open');
end;
$$;

-- Contractor reopens a closed/declined request
create or replace function public.servsync_contractor_reopen_service_request(
  p_request_id uuid,
  p_body       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request       public.service_requests;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  select * into v_request
    from public.service_requests
   where id = p_request_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  if v_request.status not in ('closed', 'declined') then
    raise exception 'Only closed or declined requests can be reopened.';
  end if;

  insert into public.service_request_messages (
    request_id, actor_user_id, actor_role, message_type, body
  ) values (
    v_request.id,
    auth.uid(),
    'contractor',
    'contractor_reopened',
    coalesce(nullif(trim(p_body), ''), 'Contractor reopened this request for follow-up.')
  );

  update public.service_requests
     set status          = 'open',
         closing_summary = ''
   where id = v_request.id;

  return jsonb_build_object('request_id', v_request.id, 'status', 'open');
end;
$$;

-- Rebuild both fetch RPCs to include closing_summary
drop function if exists public.servsync_homeowner_service_requests();

create function public.servsync_homeowner_service_requests()
returns table (
  id                uuid,
  connection_id     uuid,
  contractor_id     uuid,
  contractor_name   text,
  homeowner_user_id uuid,
  homeowner_name    text,
  homeowner_city    text,
  category          text,
  title             text,
  description       text,
  urgency           text,
  status            text,
  closing_summary   text,
  messages          jsonb,
  quote             jsonb,
  appointment       jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    sr.id,
    sr.connection_id,
    sr.contractor_id,
    cp.business_name                        as contractor_name,
    sr.homeowner_user_id,
    coalesce(hp.display_name, 'Homeowner')  as homeowner_name,
    coalesce(hp.city, '')                   as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    sr.closing_summary,
    coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id',            m.id,
           'actor_user_id', m.actor_user_id,
           'actor_role',    m.actor_role,
           'message_type',  m.message_type,
           'body',          m.body,
           'created_at',    m.created_at
         ) order by m.created_at asc
       )
       from public.service_request_messages m
       where m.request_id = sr.id),
      '[]'::jsonb
    )                                       as messages,
    (select jsonb_build_object(
       'id',            q.id,
       'request_id',    q.request_id,
       'contractor_id', q.contractor_id,
       'amount_cents',  q.amount_cents,
       'scope',         q.scope,
       'status',        q.status,
       'created_at',    q.created_at,
       'updated_at',    q.updated_at
     )
     from public.service_request_quotes q
     where q.request_id = sr.id
     limit 1)                               as quote,
    (select jsonb_build_object(
       'id',            a.id,
       'request_id',    a.request_id,
       'contractor_id', a.contractor_id,
       'proposed_at',   a.proposed_at,
       'notes',         a.notes,
       'status',        a.status,
       'proposed_by',   a.proposed_by,
       'created_at',    a.created_at,
       'updated_at',    a.updated_at
     )
     from public.service_request_appointments a
     where a.request_id = sr.id
     limit 1)                               as appointment,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where sr.homeowner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

drop function if exists public.servsync_contractor_service_requests();

create function public.servsync_contractor_service_requests()
returns table (
  id                uuid,
  connection_id     uuid,
  contractor_id     uuid,
  contractor_name   text,
  homeowner_user_id uuid,
  homeowner_name    text,
  homeowner_city    text,
  category          text,
  title             text,
  description       text,
  urgency           text,
  status            text,
  closing_summary   text,
  messages          jsonb,
  quote             jsonb,
  appointment       jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    sr.id,
    sr.connection_id,
    sr.contractor_id,
    cp.business_name                                                         as contractor_name,
    sr.homeowner_user_id,
    case when coalesce(perm.share_contact, false)
         then coalesce(hp.display_name, 'Homeowner')
         else 'Homeowner' end                                                as homeowner_name,
    case when coalesce(perm.share_contact, false)
         then coalesce(hp.city, '')
         else '' end                                                         as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    sr.closing_summary,
    coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id',            m.id,
           'actor_user_id', m.actor_user_id,
           'actor_role',    m.actor_role,
           'message_type',  m.message_type,
           'body',          m.body,
           'created_at',    m.created_at
         ) order by m.created_at asc
       )
       from public.service_request_messages m
       where m.request_id = sr.id),
      '[]'::jsonb
    )                                                                        as messages,
    (select jsonb_build_object(
       'id',            q.id,
       'request_id',    q.request_id,
       'contractor_id', q.contractor_id,
       'amount_cents',  q.amount_cents,
       'scope',         q.scope,
       'status',        q.status,
       'created_at',    q.created_at,
       'updated_at',    q.updated_at
     )
     from public.service_request_quotes q
     where q.request_id = sr.id
     limit 1)                                                                as quote,
    (select jsonb_build_object(
       'id',            a.id,
       'request_id',    a.request_id,
       'contractor_id', a.contractor_id,
       'proposed_at',   a.proposed_at,
       'notes',         a.notes,
       'status',        a.status,
       'proposed_by',   a.proposed_by,
       'created_at',    a.created_at,
       'updated_at',    a.updated_at
     )
     from public.service_request_appointments a
     where a.request_id = sr.id
     limit 1)                                                                as appointment,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  join public.homeowner_contractor_connections c on c.id = sr.connection_id
  left join public.connection_permissions perm on perm.connection_id = c.id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where cp.owner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

grant execute on function public.servsync_contractor_update_service_request(uuid, text, text, int, text, text) to authenticated;
grant execute on function public.servsync_homeowner_reopen_service_request(uuid, text) to authenticated;
grant execute on function public.servsync_contractor_reopen_service_request(uuid, text) to authenticated;
grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
