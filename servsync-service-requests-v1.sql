-- ServSync service requests v1.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- This adds a clean homeowner-to-contractor request workflow.
-- It does not add scheduling, quotes, inspections, reports, or calendar behavior.

begin;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.homeowner_contractor_connections(id) on delete cascade,
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  category text not null default 'General Maintenance',
  title text not null default '',
  description text not null default '',
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'urgent')),
  status text not null default 'open' check (status in ('open', 'contractor_responded', 'homeowner_replied', 'declined', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('homeowner', 'contractor', 'platform_admin')),
  message_type text not null default 'message',
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists service_requests_connection_idx
  on public.service_requests(connection_id);

create index if not exists service_requests_homeowner_idx
  on public.service_requests(homeowner_user_id, created_at desc);

create index if not exists service_requests_contractor_idx
  on public.service_requests(contractor_id, created_at desc);

create index if not exists service_request_messages_request_idx
  on public.service_request_messages(request_id, created_at asc);

drop trigger if exists service_requests_touch_updated_at on public.service_requests;
create trigger service_requests_touch_updated_at
  before update on public.service_requests
  for each row execute function public.touch_updated_at();

create or replace function public.current_user_can_access_service_request(p_request_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.service_requests sr
      join public.contractor_profiles cp on cp.id = sr.contractor_id
     where sr.id = p_request_id
       and (
         sr.homeowner_user_id = auth.uid()
         or cp.owner_user_id = auth.uid()
         or public.current_user_is_platform_admin()
       )
  );
$$;

alter table public.service_requests enable row level security;
alter table public.service_request_messages enable row level security;

drop policy if exists "Service requests: connected parties read" on public.service_requests;
drop policy if exists "Service requests: homeowners create own active connection" on public.service_requests;
drop policy if exists "Service requests: connected parties update" on public.service_requests;
drop policy if exists "Service request messages: connected parties read" on public.service_request_messages;
drop policy if exists "Service request messages: connected parties create" on public.service_request_messages;

create policy "Service requests: connected parties read"
  on public.service_requests for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    or public.current_user_owns_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

create policy "Service requests: homeowners create own active connection"
  on public.service_requests for insert to authenticated
  with check (
    homeowner_user_id = auth.uid()
    and exists (
      select 1
        from public.homeowner_contractor_connections c
       where c.id = connection_id
         and c.homeowner_user_id = auth.uid()
         and c.contractor_id = contractor_id
         and c.status = 'active'
    )
  );

create policy "Service requests: connected parties update"
  on public.service_requests for update to authenticated
  using (
    homeowner_user_id = auth.uid()
    or public.current_user_owns_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  )
  with check (
    homeowner_user_id = auth.uid()
    or public.current_user_owns_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );

create policy "Service request messages: connected parties read"
  on public.service_request_messages for select to authenticated
  using (public.current_user_can_access_service_request(request_id));

create policy "Service request messages: connected parties create"
  on public.service_request_messages for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and public.current_user_can_access_service_request(request_id)
  );

create or replace function public.servsync_create_service_request(
  p_connection_id uuid,
  p_category text,
  p_urgency text,
  p_title text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if public.current_user_role() <> 'homeowner' then
    raise exception 'Only homeowners can create service requests.';
  end if;

  select *
    into v_connection
    from public.homeowner_contractor_connections
   where id = p_connection_id
     and homeowner_user_id = auth.uid()
     and status = 'active'
   limit 1;

  if v_connection.id is null then
    raise exception 'Choose an active contractor connection before creating a request.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'A request title is required.';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'A request description is required.';
  end if;

  insert into public.service_requests (
    connection_id,
    homeowner_user_id,
    contractor_id,
    category,
    urgency,
    title,
    description,
    status
  ) values (
    v_connection.id,
    auth.uid(),
    v_connection.contractor_id,
    coalesce(nullif(trim(p_category), ''), 'General Maintenance'),
    case when p_urgency in ('low', 'normal', 'urgent') then p_urgency else 'normal' end,
    trim(p_title),
    trim(p_description),
    'open'
  )
  returning id into v_request_id;

  insert into public.service_request_messages (
    request_id,
    actor_user_id,
    actor_role,
    message_type,
    body
  ) values (
    v_request_id,
    auth.uid(),
    'homeowner',
    'homeowner_request',
    trim(p_description)
  );

  return jsonb_build_object('request_id', v_request_id, 'status', 'open');
end;
$$;

create or replace function public.servsync_homeowner_update_service_request(
  p_request_id uuid,
  p_body text,
  p_action text default 'reply'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_next_status text;
  v_body text;
begin
  select *
    into v_request
    from public.service_requests
   where id = p_request_id
     and homeowner_user_id = auth.uid()
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'This service request is already closed.';
  end if;

  v_body := coalesce(nullif(trim(p_body), ''), 'Homeowner updated this request.');
  v_next_status := case when p_action = 'close' then 'closed' else 'homeowner_replied' end;

  insert into public.service_request_messages (
    request_id,
    actor_user_id,
    actor_role,
    message_type,
    body
  ) values (
    v_request.id,
    auth.uid(),
    'homeowner',
    case when p_action = 'close' then 'homeowner_closed' else 'homeowner_reply' end,
    v_body
  );

  update public.service_requests
     set status = v_next_status
   where id = v_request.id;

  return jsonb_build_object('request_id', v_request.id, 'status', v_next_status);
end;
$$;

create or replace function public.servsync_contractor_update_service_request(
  p_request_id uuid,
  p_body text,
  p_new_status text default 'contractor_responded'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
  v_next_status text;
  v_body text;
begin
  select sr.*
    into v_request
    from public.service_requests sr
    join public.contractor_profiles cp on cp.id = sr.contractor_id
   where sr.id = p_request_id
     and cp.owner_user_id = auth.uid()
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
  v_body := coalesce(nullif(trim(p_body), ''), 'Contractor updated this request.');

  insert into public.service_request_messages (
    request_id,
    actor_user_id,
    actor_role,
    message_type,
    body
  ) values (
    v_request.id,
    auth.uid(),
    'contractor',
    case
      when v_next_status = 'declined' then 'contractor_declined'
      when v_next_status = 'closed' then 'contractor_closed'
      else 'contractor_response'
    end,
    v_body
  );

  update public.service_requests
     set status = v_next_status
   where id = v_request.id;

  return jsonb_build_object('request_id', v_request.id, 'status', v_next_status);
end;
$$;

create or replace function public.servsync_homeowner_service_requests()
returns table (
  id uuid,
  connection_id uuid,
  contractor_id uuid,
  contractor_name text,
  homeowner_user_id uuid,
  homeowner_name text,
  homeowner_city text,
  category text,
  title text,
  description text,
  urgency text,
  status text,
  messages jsonb,
  created_at timestamptz,
  updated_at timestamptz
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
    cp.business_name as contractor_name,
    sr.homeowner_user_id,
    coalesce(hp.display_name, 'Homeowner') as homeowner_name,
    coalesce(hp.city, '') as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'actor_user_id', m.actor_user_id,
            'actor_role', m.actor_role,
            'message_type', m.message_type,
            'body', m.body,
            'created_at', m.created_at
          )
          order by m.created_at asc
        )
        from public.service_request_messages m
        where m.request_id = sr.id
      ),
      '[]'::jsonb
    ) as messages,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where sr.homeowner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

create or replace function public.servsync_contractor_service_requests()
returns table (
  id uuid,
  connection_id uuid,
  contractor_id uuid,
  contractor_name text,
  homeowner_user_id uuid,
  homeowner_name text,
  homeowner_city text,
  category text,
  title text,
  description text,
  urgency text,
  status text,
  messages jsonb,
  created_at timestamptz,
  updated_at timestamptz
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
    cp.business_name as contractor_name,
    sr.homeowner_user_id,
    case when coalesce(perm.share_contact, false) then coalesce(hp.display_name, 'Homeowner') else 'Homeowner' end as homeowner_name,
    case when coalesce(perm.share_contact, false) then coalesce(hp.city, '') else '' end as homeowner_city,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'actor_user_id', m.actor_user_id,
            'actor_role', m.actor_role,
            'message_type', m.message_type,
            'body', m.body,
            'created_at', m.created_at
          )
          order by m.created_at asc
        )
        from public.service_request_messages m
        where m.request_id = sr.id
      ),
      '[]'::jsonb
    ) as messages,
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

grant select, insert, update on public.service_requests to authenticated;
grant select, insert on public.service_request_messages to authenticated;

grant execute on function public.current_user_can_access_service_request(uuid) to authenticated;
grant execute on function public.servsync_create_service_request(uuid, text, text, text, text) to authenticated;
grant execute on function public.servsync_homeowner_update_service_request(uuid, text, text) to authenticated;
grant execute on function public.servsync_contractor_update_service_request(uuid, text, text) to authenticated;
grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
