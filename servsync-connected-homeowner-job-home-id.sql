-- Allow contractor-created jobs for connected homeowners to persist the selected homeowner property.
-- This is intentionally narrow: it adds inspections.home_id and updates job creation only.

begin;

alter table public.inspections
  add column if not exists home_id uuid references public.homes(id) on delete set null;

create index if not exists inspections_homeowner_home_updated_idx
  on public.inspections(homeowner_user_id, home_id, updated_at desc);

drop function if exists public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, text, jsonb, uuid
);

create or replace function public.servsync_create_field_work(
  p_homeowner_user_id    uuid  default null,
  p_home_id              uuid  default null,
  p_local_contact_id     uuid  default null,
  p_local_home_id        uuid  default null,
  p_service_request_id   uuid  default null,
  p_name                 text  default '',
  p_rooms_with_findings  jsonb default '[]'::jsonb,
  p_template_id          uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request public.service_requests;
  v_home public.homes;
  v_local_home public.contractor_local_homes;
  v_new_id uuid;
begin
  select id into v_contractor_id
    from public.servsync_current_contractor_profile()
   limit 1;

  if v_contractor_id is null or not public.current_user_can_write_contractor_jobs(v_contractor_id) then
    raise exception 'Contractor profile not found.';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Job name is required.';
  end if;

  if p_service_request_id is not null then
    select * into v_request
      from public.service_requests
     where id = p_service_request_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_request.id is null then
      raise exception 'Service request not found for this contractor.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_request.homeowner_user_id;
    elsif p_homeowner_user_id <> v_request.homeowner_user_id then
      raise exception 'Job homeowner does not match the service request.';
    end if;
  end if;

  if p_home_id is not null then
    select * into v_home
      from public.homes
     where id = p_home_id
     limit 1;

    if v_home.id is null then
      raise exception 'Selected property was not found.';
    end if;

    if p_homeowner_user_id is null then
      p_homeowner_user_id := v_home.homeowner_user_id;
    elsif p_homeowner_user_id <> v_home.homeowner_user_id then
      raise exception 'Selected property does not belong to this homeowner.';
    end if;
  end if;

  if p_local_home_id is not null then
    select * into v_local_home
      from public.contractor_local_homes
     where id = p_local_home_id
       and contractor_id = v_contractor_id
     limit 1;

    if v_local_home.id is null then
      raise exception 'Local home not found for this contractor.';
    end if;

    if p_local_contact_id is null then
      p_local_contact_id := v_local_home.local_contact_id;
    elsif p_local_contact_id <> v_local_home.local_contact_id then
      raise exception 'Local customer does not match the selected local home.';
    end if;
  end if;

  if p_homeowner_user_id is null and p_local_contact_id is null then
    raise exception 'Choose a homeowner or new customer before starting a job.';
  end if;

  if p_homeowner_user_id is not null and not exists (
    select 1
      from public.homeowner_contractor_connections
     where contractor_id = v_contractor_id
       and homeowner_user_id = p_homeowner_user_id
       and status = 'active'
  ) then
    raise exception 'Homeowner is not connected to this contractor.';
  end if;

  if p_local_contact_id is not null and not exists (
    select 1
      from public.contractor_local_contacts
     where id = p_local_contact_id
       and contractor_id = v_contractor_id
  ) then
    raise exception 'New customer not found for this contractor.';
  end if;

  insert into public.inspections (
    contractor_id,
    homeowner_user_id,
    home_id,
    local_contact_id,
    local_home_id,
    service_request_id,
    template_id,
    name,
    rooms_with_findings
  ) values (
    v_contractor_id,
    p_homeowner_user_id,
    case when p_homeowner_user_id is not null then p_home_id else null end,
    p_local_contact_id,
    p_local_home_id,
    p_service_request_id,
    p_template_id,
    trim(p_name),
    coalesce(p_rooms_with_findings, '[]'::jsonb)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, uuid
) to authenticated;

commit;
