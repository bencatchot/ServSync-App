begin;

do $$
begin
  if to_regclass('public.servsync_core_authoring_operations') is null
     or to_regprocedure('public.servsync_prepare_service_request_creation(uuid,jsonb)') is null then
    raise exception 'FB-039E1 core-authoring durable idempotency must be installed before Request preparation renewal.';
  end if;
  if coalesce(
    obj_description(
      'public.servsync_prepare_service_request_creation(uuid,jsonb)'::regprocedure,
      'pg_proc'
    ),
    ''
  ) = 'servsync-core-authoring-request-preparation-renewal-v1' then
    raise exception 'FB-039E1 Request preparation renewal is already installed.';
  end if;
end;
$$;

create or replace function public.servsync_prepare_service_request_creation(
  p_operation_key uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_connection public.homeowner_contractor_connections;
  v_home public.homes;
  v_media jsonb := '[]'::jsonb;
  v_canonical jsonb;
  v_hash text;
  v_existing public.servsync_core_authoring_operations;
  v_item jsonb;
  v_ordinal integer;
  v_extension text;
  v_sha text;
  v_size bigint;
  v_type text;
  v_name text;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_operation_key is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'This request could not be prepared. Review the details and try again.' using errcode = '22023';
  end if;
  if public.current_user_role() <> 'homeowner' then
    raise exception 'Only homeowners can create service requests.' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_payload->>'title', '')), '') is null
     or nullif(trim(coalesce(p_payload->>'description', '')), '') is null then
    raise exception 'Add a request title and description before sending.' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_payload->'media'), 'array') <> 'array'
     or jsonb_array_length(coalesce(p_payload->'media', '[]'::jsonb)) > 10 then
    raise exception 'Attach no more than 10 supported files to one request.' using errcode = '22023';
  end if;

  for v_item, v_ordinal in
    select value, ordinality::integer - 1
      from jsonb_array_elements(coalesce(p_payload->'media', '[]'::jsonb)) with ordinality
  loop
    v_extension := lower(trim(coalesce(v_item->>'extension', '')));
    v_sha := lower(trim(coalesce(v_item->>'sha256', '')));
    v_size := nullif(v_item->>'file_size_bytes', '')::bigint;
    v_type := lower(trim(coalesce(v_item->>'content_type', '')));
    v_name := trim(coalesce(v_item->>'file_name', ''));
    if v_extension not in ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'mp4', 'mov', 'webm')
       or v_sha !~ '^[0-9a-f]{64}$'
       or v_size is null or v_size < 1 or v_size > 20971520
       or v_name = '' or length(v_name) > 255
       or v_type = '' or length(v_type) > 150 then
      raise exception 'One attached file is unsupported or exceeds the 20 MB limit.' using errcode = '22023';
    end if;
    v_media := v_media || jsonb_build_array(jsonb_build_object(
      'ordinal', v_ordinal,
      'file_name', v_name,
      'content_type', v_type,
      'file_size_bytes', v_size,
      'sha256', v_sha,
      'extension', v_extension,
      'storage_path', v_actor::text || '/operations/' || p_operation_key::text || '/' || lpad(v_ordinal::text, 3, '0') || '-' || v_sha || '.' || v_extension
    ));
  end loop;

  v_canonical := jsonb_build_object(
    'connection_id', nullif(p_payload->>'connection_id', '')::uuid,
    'home_id', nullif(p_payload->>'home_id', '')::uuid,
    'category', coalesce(nullif(trim(p_payload->>'category'), ''), 'General Maintenance'),
    'urgency', case when p_payload->>'urgency' in ('low', 'normal', 'urgent') then p_payload->>'urgency' else 'normal' end,
    'title', trim(p_payload->>'title'),
    'description', trim(p_payload->>'description'),
    'media', v_media
  );
  v_hash := public.servsync_private_core_authoring_payload_hash(v_canonical);

  perform public.servsync_private_core_authoring_operation_lock(v_actor, 'service_request_create', p_operation_key);
  select operation.*
    into v_existing
    from public.servsync_core_authoring_operations operation
   where operation.actor_user_id = v_actor
     and operation.operation_type = 'service_request_create'
     and operation.operation_key = p_operation_key
   for update;

  if v_existing.id is not null then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'This request attempt belongs to different details. Start a new request attempt and try again.' using errcode = '22023';
    end if;
    if v_existing.status = 'succeeded' then
      return v_existing.result_payload || jsonb_build_object('idempotent', true);
    end if;
    if v_existing.status <> 'prepared' then
      raise exception 'This request attempt cannot be resumed. Start a new request attempt and try again.' using errcode = '22023';
    end if;
    if v_existing.expires_at > now() then
      return v_existing.result_payload || jsonb_build_object('idempotent', true);
    end if;

    select connection.*
      into v_connection
      from public.homeowner_contractor_connections connection
     where connection.id = (v_canonical->>'connection_id')::uuid
       and connection.homeowner_user_id = v_actor
       and connection.contractor_id = v_existing.contractor_id
       and connection.status = 'active'
     for key share;
    if v_connection.id is null then
      raise exception 'Choose an active contractor connection before creating a request.' using errcode = '42501';
    end if;

    select home.*
      into v_home
      from public.homes home
     where home.id = (v_canonical->>'home_id')::uuid
       and home.homeowner_user_id = v_actor
     for key share;
    if v_home.id is null then
      raise exception 'Choose a property from your account before creating a request.' using errcode = '42501';
    end if;

    update public.servsync_core_authoring_operations
       set expires_at = now() + interval '30 days',
           updated_at = now()
     where id = v_existing.id
     returning * into v_existing;

    return v_existing.result_payload || jsonb_build_object('idempotent', true, 'renewed', true);
  end if;

  select connection.*
    into v_connection
    from public.homeowner_contractor_connections connection
   where connection.id = (v_canonical->>'connection_id')::uuid
     and connection.homeowner_user_id = v_actor
     and connection.status = 'active'
   for key share;
  if v_connection.id is null then
    raise exception 'Choose an active contractor connection before creating a request.' using errcode = '42501';
  end if;

  select home.*
    into v_home
    from public.homes home
   where home.id = (v_canonical->>'home_id')::uuid
     and home.homeowner_user_id = v_actor
   for key share;
  if v_home.id is null then
    raise exception 'Choose a property from your account before creating a request.' using errcode = '42501';
  end if;

  insert into public.servsync_core_authoring_operations (
    operation_type, operation_key, actor_user_id, contractor_id,
    payload_sha256, status, request_media_manifest, result_payload, expires_at
  ) values (
    'service_request_create', p_operation_key, v_actor, v_connection.contractor_id,
    v_hash, 'prepared', v_media,
    jsonb_build_object('status', 'prepared', 'operation_key', p_operation_key, 'media_manifest', v_media),
    now() + interval '30 days'
  );

  return jsonb_build_object(
    'status', 'prepared',
    'operation_key', p_operation_key,
    'media_manifest', v_media,
    'idempotent', false
  );
end;
$$;

comment on function public.servsync_prepare_service_request_creation(uuid,jsonb)
  is 'servsync-core-authoring-request-preparation-renewal-v1';
alter function public.servsync_prepare_service_request_creation(uuid,jsonb) owner to postgres;
revoke all on function public.servsync_prepare_service_request_creation(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.servsync_prepare_service_request_creation(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
