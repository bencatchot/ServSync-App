-- Make homeowner service requests property-specific without adding global property filtering.

begin;

alter table public.service_requests
  add column if not exists home_id uuid references public.homes(id) on delete set null;

create index if not exists service_requests_homeowner_home_updated_idx
  on public.service_requests(homeowner_user_id, home_id, updated_at desc);

drop function if exists public.servsync_create_service_request(uuid, text, text, text, text);

create or replace function public.servsync_create_service_request(
  p_connection_id uuid,
  p_category text,
  p_urgency text,
  p_title text,
  p_description text,
  p_home_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.homeowner_contractor_connections;
  v_home public.homes;
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

  if p_home_id is not null then
    select *
      into v_home
      from public.homes
     where id = p_home_id
       and homeowner_user_id = auth.uid()
     limit 1;

    if v_home.id is null then
      raise exception 'Selected property was not found for your account.';
    end if;
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
    home_id,
    contractor_id,
    category,
    urgency,
    title,
    description,
    status
  ) values (
    v_connection.id,
    auth.uid(),
    p_home_id,
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

  return jsonb_build_object('request_id', v_request_id, 'status', 'open', 'home_id', p_home_id);
end;
$$;

grant execute on function public.servsync_create_service_request(
  uuid, text, text, text, text, uuid
) to authenticated;

drop function if exists public.servsync_homeowner_service_requests();
create function public.servsync_homeowner_service_requests()
returns table (
  id uuid,
  connection_id uuid,
  contractor_id uuid,
  contractor_name text,
  homeowner_user_id uuid,
  homeowner_name text,
  homeowner_city text,
  home_id uuid,
  home_label text,
  home_address text,
  category text,
  title text,
  description text,
  urgency text,
  status text,
  closing_summary text,
  messages jsonb,
  media jsonb,
  quote jsonb,
  appointment jsonb,
  review jsonb,
  review_eligible boolean,
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
    sr.home_id,
    coalesce(nullif(h.nickname, ''), nullif(h.address_line1, ''), '') as home_label,
    concat_ws(', ',
      nullif(concat_ws(', ', nullif(h.address_line1, ''), nullif(h.address_line2, '')), ''),
      nullif(concat_ws(' ', nullif(h.city, ''), nullif(h.state, ''), nullif(h.zip_code, '')), '')
    ) as home_address,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    sr.closing_summary,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'actor_user_id', m.actor_user_id,
        'actor_role', m.actor_role,
        'message_type', m.message_type,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at asc)
        from public.service_request_messages m
       where m.request_id = sr.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', med.id,
        'message_id', med.message_id,
        'storage_path', med.storage_path,
        'file_name', med.file_name,
        'content_type', med.content_type,
        'created_at', med.created_at
      ) order by med.created_at asc)
        from public.service_request_media med
       where med.request_id = sr.id
    ), '[]'::jsonb) as media,
    (
      select jsonb_build_object(
        'id', q.id,
        'request_id', q.request_id,
        'contractor_id', q.contractor_id,
        'amount_cents', q.amount_cents,
        'scope', q.scope,
        'status', q.status,
        'created_at', q.created_at,
        'updated_at', q.updated_at
      )
        from public.service_request_quotes q
       where q.request_id = sr.id
       limit 1
    ) as quote,
    (
      select jsonb_build_object(
        'id', a.id,
        'request_id', a.request_id,
        'contractor_id', a.contractor_id,
        'proposed_at', a.proposed_at,
        'notes', a.notes,
        'status', a.status,
        'proposed_by', a.proposed_by,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
        from public.service_request_appointments a
       where a.request_id = sr.id
       limit 1
    ) as appointment,
    (
      select jsonb_build_object(
        'id', rv.id,
        'request_id', rv.request_id,
        'rating', rv.rating,
        'body', rv.body,
        'kudos', rv.kudos,
        'reviewer_display_name', rv.reviewer_display_name,
        'reviewer_location', rv.reviewer_location,
        'created_at', rv.created_at
      )
        from public.service_request_reviews rv
       where rv.request_id = sr.id
       limit 1
    ) as review,
    (
      sr.status = 'closed'
      and not exists (
        select 1
          from public.service_request_reviews rv
         where rv.request_id = sr.id
      )
      and public.servsync_service_request_has_completed_work(
        sr.id,
        sr.contractor_id,
        sr.homeowner_user_id
      )
    ) as review_eligible,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  left join public.homes h on h.id = sr.home_id and h.homeowner_user_id = sr.homeowner_user_id
  where sr.homeowner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

drop function if exists public.servsync_contractor_service_requests();
create function public.servsync_contractor_service_requests()
returns table (
  id uuid,
  connection_id uuid,
  contractor_id uuid,
  contractor_name text,
  homeowner_user_id uuid,
  homeowner_name text,
  homeowner_city text,
  home_id uuid,
  home_label text,
  home_address text,
  category text,
  title text,
  description text,
  urgency text,
  status text,
  closing_summary text,
  messages jsonb,
  media jsonb,
  quote jsonb,
  appointment jsonb,
  review jsonb,
  review_eligible boolean,
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
    case
      when coalesce(perm.share_contact, false) then coalesce(hp.display_name, 'Homeowner')
      else 'Homeowner'
    end as homeowner_name,
    case
      when coalesce(perm.share_contact, false) then coalesce(hp.city, '')
      else ''
    end as homeowner_city,
    sr.home_id,
    case
      when coalesce(perm.share_home_overview, false) then coalesce(nullif(h.nickname, ''), nullif(h.address_line1, ''), '')
      else ''
    end as home_label,
    case
      when coalesce(perm.share_home_overview, false) then concat_ws(', ',
        nullif(concat_ws(', ',
          case when coalesce(perm.share_address, false) then nullif(h.address_line1, '') else null end,
          case when coalesce(perm.share_address, false) then nullif(h.address_line2, '') else null end
        ), ''),
        nullif(concat_ws(' ', nullif(h.city, ''), nullif(h.state, ''), nullif(h.zip_code, '')), '')
      )
      else ''
    end as home_address,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    sr.closing_summary,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'actor_user_id', m.actor_user_id,
        'actor_role', m.actor_role,
        'message_type', m.message_type,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at asc)
        from public.service_request_messages m
       where m.request_id = sr.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', med.id,
        'message_id', med.message_id,
        'storage_path', med.storage_path,
        'file_name', med.file_name,
        'content_type', med.content_type,
        'created_at', med.created_at
      ) order by med.created_at asc)
        from public.service_request_media med
       where med.request_id = sr.id
    ), '[]'::jsonb) as media,
    (
      select jsonb_build_object(
        'id', q.id,
        'request_id', q.request_id,
        'contractor_id', q.contractor_id,
        'amount_cents', q.amount_cents,
        'scope', q.scope,
        'status', q.status,
        'created_at', q.created_at,
        'updated_at', q.updated_at
      )
        from public.service_request_quotes q
       where q.request_id = sr.id
       limit 1
    ) as quote,
    (
      select jsonb_build_object(
        'id', a.id,
        'request_id', a.request_id,
        'contractor_id', a.contractor_id,
        'proposed_at', a.proposed_at,
        'notes', a.notes,
        'status', a.status,
        'proposed_by', a.proposed_by,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
        from public.service_request_appointments a
       where a.request_id = sr.id
       limit 1
    ) as appointment,
    (
      select jsonb_build_object(
        'id', rv.id,
        'request_id', rv.request_id,
        'rating', rv.rating,
        'body', rv.body,
        'kudos', rv.kudos,
        'reviewer_display_name', rv.reviewer_display_name,
        'reviewer_location', rv.reviewer_location,
        'created_at', rv.created_at
      )
        from public.service_request_reviews rv
       where rv.request_id = sr.id
       limit 1
    ) as review,
    (
      sr.status = 'closed'
      and not exists (
        select 1
          from public.service_request_reviews rv
         where rv.request_id = sr.id
      )
      and public.servsync_service_request_has_completed_work(
        sr.id,
        sr.contractor_id,
        sr.homeowner_user_id
      )
    ) as review_eligible,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  join public.homeowner_contractor_connections c on c.id = sr.connection_id
  left join public.connection_permissions perm on perm.connection_id = c.id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  left join public.homes h on h.id = sr.home_id and h.homeowner_user_id = sr.homeowner_user_id
  where public.current_user_can_access_contractor(cp.id)
  order by sr.updated_at desc, sr.created_at desc;
$$;

grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

drop function if exists public.servsync_create_field_work(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, uuid
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

    if p_home_id is null then
      p_home_id := v_request.home_id;
    elsif v_request.home_id is not null and p_home_id <> v_request.home_id then
      raise exception 'Job property does not match the service request.';
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
