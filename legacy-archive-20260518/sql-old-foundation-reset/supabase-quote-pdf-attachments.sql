-- ServSync quote PDF attachments for routed service requests.
-- Paste this into Supabase SQL Editor after service request routing/response SQL.
-- Safe to re-run.

alter table public.service_request_routes
  add column if not exists quote_pdf_path text not null default '',
  add column if not exists quote_file_name text not null default '',
  add column if not exists quote_status text not null default ''
    check (quote_status in ('', 'sent', 'accepted', 'changes_requested', 'declined', 'void')),
  add column if not exists quote_uploaded_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quotes', 'quotes', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Quote PDFs: contractors upload own organization" on storage.objects;
create policy "Quote PDFs: contractors upload own organization"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and public.current_user_can_manage_organization((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Quote PDFs: contractors and homeowners read routed quotes" on storage.objects;
create policy "Quote PDFs: contractors and homeowners read routed quotes"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'quotes'
    and (
      (
        (storage.foldername(name))[1] = public.current_user_organization_id()::text
        and public.current_user_can_manage_organization((storage.foldername(name))[1]::uuid)
      )
      or public.current_user_owns_property((storage.foldername(name))[2]::uuid)
    )
  );

create or replace function public.attach_quote_to_request_route(
  p_route_id uuid,
  p_quote_pdf_path text,
  p_quote_file_name text
)
returns public.service_request_routes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.service_request_routes;
begin
  update public.service_request_routes
     set quote_pdf_path = coalesce(trim(p_quote_pdf_path), ''),
         quote_file_name = coalesce(trim(p_quote_file_name), 'quote.pdf'),
         quote_status = 'sent',
         quote_uploaded_at = now(),
         updated_at = now()
   where id = p_route_id
     and organization_id = public.current_user_organization_id()
     and public.current_user_can_manage_organization(organization_id)
   returning * into v_route;

  if v_route.id is null then
    raise exception 'Request route not found.';
  end if;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    v_route.property_id,
    v_route.organization_id,
    'quote_pdf_attached',
    jsonb_build_object('request_id', v_route.request_id, 'route_id', v_route.id, 'quote_file_name', v_route.quote_file_name)
  );

  return v_route;
end;
$$;

grant execute on function public.attach_quote_to_request_route(uuid, text, text) to authenticated;

create or replace function public.update_my_request_quote_status(
  p_route_id uuid,
  p_quote_status text
)
returns public.service_request_routes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.service_request_routes;
  v_status text;
begin
  v_status := coalesce(trim(p_quote_status), '');

  if v_status not in ('accepted', 'changes_requested', 'declined') then
    raise exception 'Invalid quote status.';
  end if;

  update public.service_request_routes
     set quote_status = v_status,
         updated_at = now()
   where id = p_route_id
     and quote_pdf_path <> ''
     and public.current_user_owns_property(property_id)
   returning * into v_route;

  if v_route.id is null then
    raise exception 'Quote not found.';
  end if;

  insert into public.property_access_audit_events (
    actor_user_id,
    property_id,
    organization_id,
    event_type,
    metadata
  ) values (
    auth.uid(),
    v_route.property_id,
    v_route.organization_id,
    'quote_status_updated_by_homeowner',
    jsonb_build_object('request_id', v_route.request_id, 'route_id', v_route.id, 'quote_status', v_route.quote_status)
  );

  return v_route;
end;
$$;

grant execute on function public.update_my_request_quote_status(uuid, text) to authenticated;

create or replace function public.get_contractor_routed_requests()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_id', srr.id,
        'request_id', srr.request_id,
        'property_id', srr.property_id,
        'connection_id', srr.connection_id,
        'organization_id', srr.organization_id,
        'status', srr.status,
        'response_message', srr.response_message,
        'response_next_action', srr.response_next_action,
        'estimate_range', srr.estimate_range,
        'responded_at', srr.responded_at,
        'homeowner_action', srr.homeowner_action,
        'homeowner_action_at', srr.homeowner_action_at,
        'quote_pdf_path', srr.quote_pdf_path,
        'quote_file_name', srr.quote_file_name,
        'quote_status', srr.quote_status,
        'quote_uploaded_at', srr.quote_uploaded_at,
        'routed_at', srr.created_at,
        'updated_at', srr.updated_at,
        'request', jsonb_build_object(
          'customer_name', r.customer_name,
          'category', r.category,
          'room', r.room,
          'description', r.description,
          'priority', r.priority,
          'photo_url', coalesce(r.photo_url, ''),
          'request_status', r.status,
          'contractor_notes', r.contractor_notes,
          'created_at', r.created_at
        ),
        'property', jsonb_build_object(
          'name', p.name,
          'owner', case
            when coalesce((hcc.permissions->>'basic_profile')::boolean, false) then p.owner
            else ''
          end
        )
      )
      order by srr.created_at desc
    ),
    '[]'::jsonb
  )
  from public.service_request_routes srr
  join public.requests r on r.id = srr.request_id
  join public.properties p on p.id = srr.property_id
  join public.home_contractor_connections hcc on hcc.id = srr.connection_id
  where srr.organization_id = public.current_user_organization_id()
    and public.current_user_can_manage_organization(srr.organization_id)
    and hcc.status = 'active';
$$;

grant execute on function public.get_contractor_routed_requests() to authenticated;

create or replace function public.get_my_request_routes(p_property_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_id', srr.id,
        'request_id', srr.request_id,
        'status', srr.status,
        'response_message', srr.response_message,
        'response_next_action', srr.response_next_action,
        'estimate_range', srr.estimate_range,
        'responded_at', srr.responded_at,
        'homeowner_action', srr.homeowner_action,
        'homeowner_action_at', srr.homeowner_action_at,
        'quote_pdf_path', srr.quote_pdf_path,
        'quote_file_name', srr.quote_file_name,
        'quote_status', srr.quote_status,
        'quote_uploaded_at', srr.quote_uploaded_at,
        'created_at', srr.created_at,
        'updated_at', srr.updated_at,
        'contractor', jsonb_build_object(
          'name', o.name,
          'support_email', o.support_email,
          'support_phone', o.support_phone
        )
      )
      order by srr.created_at desc
    ),
    '[]'::jsonb
  )
  from public.service_request_routes srr
  join public.organizations o on o.id = srr.organization_id
  where srr.property_id = p_property_id
    and public.current_user_owns_property(p_property_id);
$$;

grant execute on function public.get_my_request_routes(uuid) to authenticated;

notify pgrst, 'reload schema';
