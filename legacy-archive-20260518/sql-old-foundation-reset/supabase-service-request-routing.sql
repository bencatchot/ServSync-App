-- ServSync homeowner service request routing.
-- Paste this into Supabase SQL Editor before testing targeted homeowner requests.
-- Safe to re-run.

create table if not exists public.service_request_routes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  connection_id uuid not null references public.home_contractor_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'sent' check (status in ('sent', 'viewed', 'responded', 'declined', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, organization_id)
);

create index if not exists service_request_routes_request_idx
  on public.service_request_routes(request_id);

create index if not exists service_request_routes_property_idx
  on public.service_request_routes(property_id);

create index if not exists service_request_routes_organization_idx
  on public.service_request_routes(organization_id);

alter table public.service_request_routes enable row level security;

drop policy if exists "Service request routes: homeowners read own" on public.service_request_routes;
create policy "Service request routes: homeowners read own"
  on public.service_request_routes
  for select
  to authenticated
  using (public.current_user_owns_property(property_id));

drop policy if exists "Service request routes: contractors read own" on public.service_request_routes;
create policy "Service request routes: contractors read own"
  on public.service_request_routes
  for select
  to authenticated
  using (
    organization_id = public.current_user_organization_id()
    and public.current_user_can_manage_organization(organization_id)
  );

create or replace function public.create_request_connection_routes(
  p_request_id uuid,
  p_connection_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_connection_id uuid;
  v_connection public.home_contractor_connections;
  v_created integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to route a request.';
  end if;

  select r.property_id
    into v_property_id
    from public.requests r
   where r.id = p_request_id;

  if v_property_id is null then
    raise exception 'Request not found.';
  end if;

  if not public.current_user_owns_property(v_property_id) then
    raise exception 'You can only route requests for a home you own.';
  end if;

  foreach v_connection_id in array coalesce(p_connection_ids, '{}'::uuid[]) loop
    select *
      into v_connection
      from public.home_contractor_connections hcc
     where hcc.id = v_connection_id
       and hcc.property_id = v_property_id
       and hcc.homeowner_user_id = auth.uid()
       and hcc.status = 'active';

    if v_connection.id is not null then
      insert into public.service_request_routes (
        request_id,
        property_id,
        connection_id,
        organization_id,
        status
      ) values (
        p_request_id,
        v_property_id,
        v_connection.id,
        v_connection.organization_id,
        'sent'
      )
      on conflict (request_id, organization_id) do update
      set connection_id = excluded.connection_id,
          status = 'sent',
          updated_at = now();

      v_created := v_created + 1;

      insert into public.property_access_audit_events (
        actor_user_id,
        property_id,
        organization_id,
        event_type,
        metadata
      ) values (
        auth.uid(),
        v_property_id,
        v_connection.organization_id,
        'service_request_routed',
        jsonb_build_object('request_id', p_request_id, 'connection_id', v_connection.id)
      );
    end if;
  end loop;

  return jsonb_build_object('created', v_created);
end;
$$;

grant execute on function public.create_request_connection_routes(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
