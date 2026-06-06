-- ServSync quote attachment v1.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-service-requests-v1.sql has been applied.
--
-- Adds a single optional quote per service request.
-- Contractor attaches it with a response. Homeowner accepts or declines.

begin;

-- One quote per service request (each request has exactly one contractor)
create table if not exists public.service_request_quotes (
  id            uuid        primary key default gen_random_uuid(),
  request_id    uuid        not null unique references public.service_requests(id) on delete cascade,
  contractor_id uuid        not null references public.contractor_profiles(id) on delete cascade,
  amount_cents  int         not null default 0 check (amount_cents >= 0),
  scope         text        not null default '',
  status        text        not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists service_request_quotes_touch_updated_at on public.service_request_quotes;
create trigger service_request_quotes_touch_updated_at
  before update on public.service_request_quotes
  for each row execute function public.touch_updated_at();

alter table public.service_request_quotes enable row level security;

drop policy if exists "Quotes: connected parties read"        on public.service_request_quotes;
drop policy if exists "Quotes: contractor create"             on public.service_request_quotes;
drop policy if exists "Quotes: connected parties update"      on public.service_request_quotes;

create policy "Quotes: connected parties read"
  on public.service_request_quotes for select to authenticated
  using (public.current_user_can_access_service_request(request_id));

create policy "Quotes: contractor create"
  on public.service_request_quotes for insert to authenticated
  with check (
    public.current_user_owns_contractor(contractor_id)
    and public.current_user_can_access_service_request(request_id)
  );

create policy "Quotes: connected parties update"
  on public.service_request_quotes for update to authenticated
  using  (public.current_user_can_access_service_request(request_id))
  with check (public.current_user_can_access_service_request(request_id));

-- Replace contractor service request update with quote-aware version.
-- The old 3-param signature is dropped first so PostgREST resolves cleanly.
drop function if exists public.servsync_contractor_update_service_request(uuid, text, text);

create function public.servsync_contractor_update_service_request(
  p_request_id         uuid,
  p_body               text,
  p_new_status         text    default 'contractor_responded',
  p_quote_amount_cents int     default null,
  p_quote_scope        text    default null
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
     set status = v_next_status
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

-- Homeowner accept / decline a quote
create or replace function public.servsync_homeowner_respond_to_quote(
  p_request_id uuid,
  p_action     text   -- 'accept' or 'decline'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.service_request_quotes;
begin
  if p_action not in ('accept', 'decline') then
    raise exception 'Action must be accept or decline.';
  end if;

  -- Verify homeowner owns the request
  if not exists (
    select 1 from public.service_requests
     where id = p_request_id and homeowner_user_id = auth.uid()
  ) then
    raise exception 'Request not found.';
  end if;

  select * into v_quote
    from public.service_request_quotes
   where request_id = p_request_id
   limit 1;

  if v_quote.id is null then
    raise exception 'No quote found for this request.';
  end if;

  if v_quote.status <> 'pending' then
    raise exception 'This quote has already been responded to.';
  end if;

  update public.service_request_quotes
     set status = case when p_action = 'accept' then 'accepted' else 'declined' end
   where id = v_quote.id;

  return jsonb_build_object(
    'quote_id', v_quote.id,
    'status',   case when p_action = 'accept' then 'accepted' else 'declined' end
  );
end;
$$;

-- Rebuild both fetch RPCs to include the quote column.
-- DROP first because PostgreSQL cannot change a set-returning function's column list in-place.
drop function if exists public.servsync_homeowner_service_requests();

create function public.servsync_homeowner_service_requests()
returns table (
  id               uuid,
  connection_id    uuid,
  contractor_id    uuid,
  contractor_name  text,
  homeowner_user_id uuid,
  homeowner_name   text,
  homeowner_city   text,
  category         text,
  title            text,
  description      text,
  urgency          text,
  status           text,
  messages         jsonb,
  quote            jsonb,
  created_at       timestamptz,
  updated_at       timestamptz
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
    cp.business_name                         as contractor_name,
    sr.homeowner_user_id,
    coalesce(hp.display_name, 'Homeowner')   as homeowner_name,
    coalesce(hp.city, '')                    as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',           m.id,
            'actor_user_id', m.actor_user_id,
            'actor_role',   m.actor_role,
            'message_type', m.message_type,
            'body',         m.body,
            'created_at',   m.created_at
          ) order by m.created_at asc
        )
        from public.service_request_messages m
        where m.request_id = sr.id
      ),
      '[]'::jsonb
    )                                        as messages,
    (
      select jsonb_build_object(
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
      limit 1
    )                                        as quote,
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
  id               uuid,
  connection_id    uuid,
  contractor_id    uuid,
  contractor_name  text,
  homeowner_user_id uuid,
  homeowner_name   text,
  homeowner_city   text,
  category         text,
  title            text,
  description      text,
  urgency          text,
  status           text,
  messages         jsonb,
  quote            jsonb,
  created_at       timestamptz,
  updated_at       timestamptz
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
    cp.business_name                                                           as contractor_name,
    sr.homeowner_user_id,
    case when coalesce(perm.share_contact, false)
         then coalesce(hp.display_name, 'Homeowner')
         else 'Homeowner' end                                                  as homeowner_name,
    case when coalesce(perm.share_contact, false)
         then coalesce(hp.city, '')
         else '' end                                                           as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    coalesce(
      (
        select jsonb_agg(
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
        where m.request_id = sr.id
      ),
      '[]'::jsonb
    )                                                                          as messages,
    (
      select jsonb_build_object(
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
      limit 1
    )                                                                          as quote,
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

grant select, insert, update on public.service_request_quotes to authenticated;

grant execute on function public.servsync_contractor_update_service_request(uuid, text, text, int, text) to authenticated;
grant execute on function public.servsync_homeowner_respond_to_quote(uuid, text) to authenticated;
grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
