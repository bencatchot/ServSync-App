-- FB-039E1 Core-Authoring Durable Idempotency v1.
--
-- Adds purpose-bound durable operation receipts and transactional authoring
-- RPCs for homeowner Request creation, direct Estimate Draft saves, and direct
-- Invoice Draft saves. Existing table grants/policies and the legacy Request
-- RPC remain during the database-ahead-of-application rollout window.

begin;

do $$
declare
  v_missing text;
begin
  if to_regclass('public.servsync_core_authoring_operations') is not null then
    raise exception 'FB-039E1 core-authoring durable idempotency is already installed.';
  end if;

  select string_agg(name, ', ' order by name)
    into v_missing
    from (values
      ('public.service_requests', to_regclass('public.service_requests') is not null),
      ('public.service_request_messages', to_regclass('public.service_request_messages') is not null),
      ('public.service_request_media', to_regclass('public.service_request_media') is not null),
      ('public.estimates', to_regclass('public.estimates') is not null),
      ('public.estimate_line_items', to_regclass('public.estimate_line_items') is not null),
      ('public.estimate_payment_schedule_items', to_regclass('public.estimate_payment_schedule_items') is not null),
      ('public.invoices', to_regclass('public.invoices') is not null),
      ('public.invoice_line_items', to_regclass('public.invoice_line_items') is not null),
      ('public.invoice_backlog_items', to_regclass('public.invoice_backlog_items') is not null),
      ('storage.objects', to_regclass('storage.objects') is not null),
      ('extensions.digest(bytea,text)', to_regprocedure('extensions.digest(bytea,text)') is not null),
      ('public.current_user_can_manage_contractor_estimates(uuid)', to_regprocedure('public.current_user_can_manage_contractor_estimates(uuid)') is not null),
      ('public.current_user_can_manage_contractor_billing(uuid)', to_regprocedure('public.current_user_can_manage_contractor_billing(uuid)') is not null),
      ('public.servsync_current_contractor_profile()', to_regprocedure('public.servsync_current_contractor_profile()') is not null)
    ) required(name, present)
   where not present;

  if v_missing is not null then
    raise exception 'FB-039E1 prerequisites are missing: %', v_missing;
  end if;

  if exists (
    select 1
      from public.service_request_media
     group by request_id, storage_path
    having count(*) > 1
  ) then
    raise exception 'Duplicate Request media registrations must be resolved before FB-039E1 rollout.';
  end if;
end;
$$;

create table public.servsync_core_authoring_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null
    check (operation_type in ('service_request_create', 'estimate_draft_save', 'invoice_draft_save')),
  operation_key uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('prepared', 'succeeded')),
  result_kind text check (result_kind in ('service_request', 'estimate', 'invoice')),
  result_id uuid,
  request_media_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(request_media_manifest) = 'array'),
  result_payload jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (actor_user_id, operation_type, operation_key),
  check (
    (status = 'prepared' and result_id is null and result_payload is not null and expires_at is not null and completed_at is null)
    or
    (status = 'succeeded' and result_id is not null and result_payload is not null and completed_at is not null)
  )
);

comment on table public.servsync_core_authoring_operations is
  'Private purpose-bound receipts for replay-safe Request, Estimate Draft, and Invoice Draft authoring. No browser role has direct table access.';

create index servsync_core_authoring_operations_result_idx
  on public.servsync_core_authoring_operations(operation_type, result_id)
  where result_id is not null;

create unique index service_request_media_request_path_uidx
  on public.service_request_media(request_id, storage_path);

alter table public.servsync_core_authoring_operations owner to postgres;
alter table public.servsync_core_authoring_operations enable row level security;
alter table public.servsync_core_authoring_operations force row level security;
revoke all on table public.servsync_core_authoring_operations from public, anon, authenticated, service_role;

create function public.servsync_private_core_authoring_payload_hash(p_payload jsonb)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select encode(extensions.digest(convert_to(coalesce(p_payload, 'null'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
$$;

alter function public.servsync_private_core_authoring_payload_hash(jsonb) owner to postgres;
revoke all on function public.servsync_private_core_authoring_payload_hash(jsonb) from public, anon, authenticated, service_role;

create function public.servsync_private_core_authoring_operation_lock(
  p_actor_user_id uuid,
  p_operation_type text,
  p_operation_key uuid
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':' || p_operation_type || ':' || p_operation_key::text, 0));
$$;

alter function public.servsync_private_core_authoring_operation_lock(uuid, text, uuid) owner to postgres;
revoke all on function public.servsync_private_core_authoring_operation_lock(uuid, text, uuid) from public, anon, authenticated, service_role;

create function public.servsync_private_core_authoring_estimate_result(p_estimate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(estimate)
    || jsonb_build_object(
      'line_items', coalesce((
        select jsonb_agg(to_jsonb(line) order by line.sort_order, line.created_at, line.id)
          from public.estimate_line_items line
         where line.estimate_id = estimate.id
      ), '[]'::jsonb),
      'payment_schedule_items', coalesce((
        select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at, item.id)
          from public.estimate_payment_schedule_items item
         where item.estimate_id = estimate.id
      ), '[]'::jsonb)
    )
    from public.estimates estimate
   where estimate.id = p_estimate_id;
$$;

alter function public.servsync_private_core_authoring_estimate_result(uuid) owner to postgres;
revoke all on function public.servsync_private_core_authoring_estimate_result(uuid) from public, anon, authenticated, service_role;

create function public.servsync_private_core_authoring_invoice_result(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(invoice)
    || jsonb_build_object(
      'line_items', coalesce((
        select jsonb_agg(to_jsonb(line) order by line.sort_order, line.created_at, line.id)
          from public.invoice_line_items line
         where line.invoice_id = invoice.id
      ), '[]'::jsonb),
      'backlog_items', coalesce((
        select jsonb_agg(to_jsonb(item) order by item.created_at, item.id)
          from public.invoice_backlog_items item
         where item.invoice_id = invoice.id
      ), '[]'::jsonb)
    )
    from public.invoices invoice
   where invoice.id = p_invoice_id;
$$;

alter function public.servsync_private_core_authoring_invoice_result(uuid) owner to postgres;
revoke all on function public.servsync_private_core_authoring_invoice_result(uuid) from public, anon, authenticated, service_role;

create function public.servsync_prepare_service_request_creation(
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
     and operation.operation_key = p_operation_key;

  if v_existing.id is not null then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'This request attempt belongs to different details. Start a new request attempt and try again.' using errcode = '22023';
    end if;
    return v_existing.result_payload || jsonb_build_object('idempotent', true);
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

create function public.servsync_private_can_upload_prepared_request_media(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.servsync_core_authoring_operations operation
         cross join lateral jsonb_array_elements(operation.request_media_manifest) media
        where operation.actor_user_id = auth.uid()
          and operation.operation_type = 'service_request_create'
          and operation.status = 'prepared'
          and operation.expires_at > now()
          and media->>'storage_path' = p_storage_path
     );
$$;

create policy "homeowner_upload_prepared_request_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-request-media'
    and public.servsync_private_can_upload_prepared_request_media(name)
    and public.servsync_storage_extension_is_allowed(
      name,
      array['jpg','jpeg','png','webp','heic','heif','mp4','mov','webm']::text[]
    )
  );

create function public.servsync_commit_service_request_creation(
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
  v_prepared jsonb;
  v_operation public.servsync_core_authoring_operations;
  v_connection public.homeowner_contractor_connections;
  v_home public.homes;
  v_media jsonb;
  v_canonical jsonb;
  v_hash text;
  v_item jsonb;
  v_object storage.objects;
  v_request public.service_requests;
  v_message public.service_request_messages;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  perform public.servsync_private_core_authoring_operation_lock(v_actor, 'service_request_create', p_operation_key);
  select operation.*
    into v_operation
    from public.servsync_core_authoring_operations operation
   where operation.actor_user_id = v_actor
     and operation.operation_type = 'service_request_create'
     and operation.operation_key = p_operation_key
   for update;
  if v_operation.id is null then
    raise exception 'Prepare this request before submitting it.' using errcode = '22023';
  end if;

  -- Reuse preparation normalization so the server owns the canonical fingerprint.
  v_prepared := public.servsync_prepare_service_request_creation(p_operation_key, p_payload);
  select operation.* into v_operation
    from public.servsync_core_authoring_operations operation
   where operation.actor_user_id = v_actor
     and operation.operation_type = 'service_request_create'
     and operation.operation_key = p_operation_key
   for update;
  if v_operation.status = 'succeeded' then
    return v_operation.result_payload || jsonb_build_object('idempotent', true);
  end if;
  if v_operation.expires_at <= now() then
    raise exception 'This prepared request expired. Start a new request attempt.' using errcode = '22023';
  end if;

  select connection.* into v_connection
    from public.homeowner_contractor_connections connection
   where connection.id = nullif(p_payload->>'connection_id', '')::uuid
     and connection.homeowner_user_id = v_actor
     and connection.contractor_id = v_operation.contractor_id
     and connection.status = 'active'
   for key share;
  select home.* into v_home
    from public.homes home
   where home.id = nullif(p_payload->>'home_id', '')::uuid
     and home.homeowner_user_id = v_actor
   for key share;
  if v_connection.id is null or v_home.id is null then
    raise exception 'The contractor connection or property is no longer available.' using errcode = '42501';
  end if;

  v_media := v_operation.request_media_manifest;
  v_canonical := jsonb_build_object(
    'connection_id', v_connection.id,
    'home_id', v_home.id,
    'category', coalesce(nullif(trim(p_payload->>'category'), ''), 'General Maintenance'),
    'urgency', case when p_payload->>'urgency' in ('low', 'normal', 'urgent') then p_payload->>'urgency' else 'normal' end,
    'title', trim(p_payload->>'title'),
    'description', trim(p_payload->>'description'),
    'media', v_media
  );
  v_hash := public.servsync_private_core_authoring_payload_hash(v_canonical);
  if v_hash <> v_operation.payload_sha256 then
    raise exception 'This request attempt belongs to different details. Start a new request attempt and try again.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(v_media)
  loop
    select object.* into v_object
      from storage.objects object
     where object.bucket_id = 'service-request-media'
       and object.name = v_item->>'storage_path'
       and object.owner_id = v_actor::text
     for share;
    if v_object.id is null
       or coalesce((v_object.metadata->>'size')::bigint, (v_object.metadata->>'contentLength')::bigint, -1) <> (v_item->>'file_size_bytes')::bigint
       or lower(coalesce(v_object.metadata->>'mimetype', '')) <> lower(v_item->>'content_type')
       or lower(coalesce(v_object.user_metadata->>'servsync_sha256', '')) <> v_item->>'sha256'
       or coalesce(v_object.user_metadata->>'servsync_operation_key', '') <> p_operation_key::text then
      raise exception 'An attached file could not be verified. Retry the upload before submitting.' using errcode = '22023';
    end if;
  end loop;

  insert into public.service_requests (
    connection_id, homeowner_user_id, home_id, contractor_id,
    category, urgency, title, description, status
  ) values (
    v_connection.id, v_actor, v_home.id, v_connection.contractor_id,
    v_canonical->>'category', v_canonical->>'urgency',
    v_canonical->>'title', v_canonical->>'description', 'open'
  ) returning * into v_request;

  insert into public.service_request_messages (
    request_id, actor_user_id, actor_role, message_type, body
  ) values (
    v_request.id, v_actor, 'homeowner', 'homeowner_request', v_canonical->>'description'
  ) returning * into v_message;

  insert into public.service_request_media (
    request_id, uploader_user_id, message_id, storage_path,
    file_name, content_type, file_size_bytes
  )
  select v_request.id, v_actor, null, media->>'storage_path',
         media->>'file_name', media->>'content_type', (media->>'file_size_bytes')::bigint
    from jsonb_array_elements(v_media) media;

  v_result := jsonb_build_object(
    'status', 'succeeded',
    'request_id', v_request.id,
    'message_id', v_message.id,
    'home_id', v_request.home_id,
    'media_count', jsonb_array_length(v_media),
    'idempotent', false
  );
  update public.servsync_core_authoring_operations
     set status = 'succeeded', result_kind = 'service_request', result_id = v_request.id,
         result_payload = v_result, completed_at = now(), updated_at = now()
   where id = v_operation.id;
  return v_result;
end;
$$;

create function public.servsync_save_estimate_draft_idempotent(
  p_operation_key uuid,
  p_estimate_id uuid,
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
  v_contractor_id uuid;
  v_existing public.servsync_core_authoring_operations;
  v_estimate public.estimates;
  v_homeowner_id uuid := nullif(p_payload->>'homeowner_user_id', '')::uuid;
  v_local_contact_id uuid := nullif(p_payload->>'local_contact_id', '')::uuid;
  v_home_id uuid := nullif(p_payload->>'home_id', '')::uuid;
  v_local_home_id uuid := nullif(p_payload->>'local_home_id', '')::uuid;
  v_request_id uuid := nullif(p_payload->>'service_request_id', '')::uuid;
  v_job_id uuid := nullif(p_payload->>'inspection_id', '')::uuid;
  v_lines jsonb;
  v_schedule jsonb;
  v_canonical jsonb;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  if p_operation_key is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'This Estimate Draft could not be saved. Review the details and try again.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_payload->>'title', '')), '') is null then
    raise exception 'Add an Estimate title before saving.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_payload->'line_items'), '') <> 'array'
     or jsonb_array_length(p_payload->'line_items') < 1
     or jsonb_array_length(p_payload->'line_items') > 200 then
    raise exception 'Add between 1 and 200 Estimate line items.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_payload->'payment_schedule_items'), '') <> 'array'
     or jsonb_array_length(p_payload->'payment_schedule_items') > 50 then
    raise exception 'The Estimate payment schedule is invalid.' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object(
      'line_type', case when value->>'line_type' in ('labor','material','fee','other') then value->>'line_type' else 'other' end,
      'description', trim(coalesce(value->>'description','')),
      'line_title', nullif(trim(coalesce(value->>'line_title','')), ''),
      'customer_description', nullif(trim(coalesce(value->>'customer_description','')), ''),
      'model_spec', nullif(trim(coalesce(value->>'model_spec','')), ''),
      'supply_status', case when value->>'supply_status' in ('contractor_supplied','customer_supplied','to_be_confirmed') then value->>'supply_status' else null end,
      'quantity', coalesce(nullif(value->>'quantity','')::numeric, 1),
      'unit', coalesce(nullif(trim(value->>'unit'),''), 'each'),
      'unit_price_cents', nullif(value->>'unit_price_cents','')::integer,
      'labor_hours', nullif(value->>'labor_hours','')::numeric,
      'sort_order', ordinality::integer - 1
    ) order by ordinality)
    into v_lines
    from jsonb_array_elements(p_payload->'line_items') with ordinality;

  if exists (
    select 1 from jsonb_array_elements(v_lines) line
     where coalesce(line->>'description','') = ''
        or (line->>'quantity')::numeric <= 0
        or coalesce((line->>'unit_price_cents')::integer, 0) < 0
        or coalesce((line->>'labor_hours')::numeric, 0) < 0
  ) then
    raise exception 'One Estimate line item has invalid details.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'invoice_type', value->>'invoice_type',
      'label', trim(coalesce(value->>'label','')),
      'amount_type', value->>'amount_type',
      'amount_value', nullif(value->>'amount_value','')::numeric,
      'calculated_amount_cents', nullif(value->>'calculated_amount_cents','')::integer,
      'due_trigger', trim(coalesce(value->>'due_trigger','')),
      'sort_order', ordinality::integer - 1,
      'linked_invoice_id', null
    ) order by ordinality), '[]'::jsonb)
    into v_schedule
    from jsonb_array_elements(p_payload->'payment_schedule_items') with ordinality;

  if exists (
    select 1 from jsonb_array_elements(v_schedule) item
     where item->>'invoice_type' not in ('total','deposit','progress','final')
        or item->>'amount_type' not in ('fixed','percentage')
        or (item->>'amount_value')::numeric < 0
        or (item->>'calculated_amount_cents')::integer < 0
  ) then
    raise exception 'One Estimate payment schedule item is invalid.' using errcode = '22023';
  end if;

  v_canonical := jsonb_build_object(
    'estimate_id', p_estimate_id,
    'homeowner_user_id', v_homeowner_id,
    'local_contact_id', v_local_contact_id,
    'service_request_id', v_request_id,
    'inspection_id', v_job_id,
    'home_id', v_home_id,
    'local_home_id', v_local_home_id,
    'title', trim(p_payload->>'title'),
    'scope', trim(coalesce(p_payload->>'scope','')),
    'notes', trim(coalesce(p_payload->>'notes','')),
    'terms', trim(coalesce(p_payload->>'terms','')),
    'subtotal_cents', coalesce((p_payload->>'subtotal_cents')::integer, 0),
    'total_cents', coalesce((p_payload->>'total_cents')::integer, 0),
    'labor_mode', case when p_payload->>'labor_mode' in ('job_total','line_specific') then p_payload->>'labor_mode' else null end,
    'labor_rate_cents', nullif(p_payload->>'labor_rate_cents','')::integer,
    'job_labor_hours', nullif(p_payload->>'job_labor_hours','')::numeric,
    'material_total_cents', nullif(p_payload->>'material_total_cents','')::integer,
    'labor_total_cents', nullif(p_payload->>'labor_total_cents','')::integer,
    'fee_total_cents', nullif(p_payload->>'fee_total_cents','')::integer,
    'other_total_cents', nullif(p_payload->>'other_total_cents','')::integer,
    'tax_rate_percent', nullif(p_payload->>'tax_rate_percent','')::numeric,
    'tax_cents', nullif(p_payload->>'tax_cents','')::integer,
    'line_items', v_lines,
    'payment_schedule_items', v_schedule
  );
  if num_nonnulls(v_homeowner_id, v_local_contact_id) <> 1
     or coalesce((v_canonical->>'subtotal_cents')::integer, -1) < 0
     or coalesce((v_canonical->>'total_cents')::integer, -1) < 0 then
    raise exception 'Choose one valid Estimate customer and valid totals.' using errcode = '22023';
  end if;
  v_hash := public.servsync_private_core_authoring_payload_hash(v_canonical);

  perform public.servsync_private_core_authoring_operation_lock(v_actor, 'estimate_draft_save', p_operation_key);
  select operation.* into v_existing
    from public.servsync_core_authoring_operations operation
   where operation.actor_user_id = v_actor
     and operation.operation_type = 'estimate_draft_save'
     and operation.operation_key = p_operation_key;
  if v_existing.id is not null then
    if not public.current_user_can_manage_contractor_estimates(v_existing.contractor_id) then
      raise exception 'Your current access does not allow saving this Estimate Draft.' using errcode = '42501';
    end if;
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'This Estimate save attempt belongs to different changes. Start a new save attempt.' using errcode = '22023';
    end if;
    return v_existing.result_payload || jsonb_build_object('idempotent', true);
  end if;

  if p_estimate_id is not null then
    select estimate.* into v_estimate from public.estimates estimate where estimate.id = p_estimate_id for update;
    v_contractor_id := v_estimate.contractor_id;
    if v_estimate.id is null then raise exception 'Estimate Draft not found.' using errcode = 'P0002'; end if;
    if not public.current_user_can_manage_contractor_estimates(v_contractor_id) then
      raise exception 'Your current access does not allow saving Estimate Drafts.' using errcode = '42501';
    end if;
    if v_estimate.status <> 'draft' then raise exception 'Only Draft Estimates can be edited.' using errcode = '22023'; end if;
  else
    select profile.id into v_contractor_id from public.servsync_current_contractor_profile() profile limit 1;
  end if;
  if v_contractor_id is null or not public.current_user_can_manage_contractor_estimates(v_contractor_id) then
    raise exception 'Your current access does not allow saving Estimate Drafts.' using errcode = '42501';
  end if;

  if v_homeowner_id is not null and not exists (
    select 1 from public.homeowner_contractor_connections connection
     where connection.contractor_id = v_contractor_id and connection.homeowner_user_id = v_homeowner_id and connection.status = 'active'
  ) then raise exception 'The selected connected customer is no longer available.' using errcode = '42501'; end if;
  if v_local_contact_id is not null and not exists (
    select 1 from public.contractor_local_contacts contact
     where contact.id = v_local_contact_id and contact.contractor_id = v_contractor_id and contact.archived_at is null
  ) then raise exception 'The selected local customer is no longer available.' using errcode = '42501'; end if;
  if v_home_id is not null and (v_homeowner_id is null or not exists (
    select 1 from public.homes home where home.id = v_home_id and home.homeowner_user_id = v_homeowner_id
  )) then raise exception 'The selected property does not belong to this customer.' using errcode = '42501'; end if;
  if v_local_home_id is not null and (v_local_contact_id is null or not exists (
    select 1 from public.contractor_local_homes home where home.id = v_local_home_id and home.local_contact_id = v_local_contact_id and home.contractor_id = v_contractor_id
  )) then raise exception 'The selected local property does not belong to this customer.' using errcode = '42501'; end if;
  if v_request_id is not null and not exists (
    select 1 from public.service_requests request where request.id = v_request_id and request.contractor_id = v_contractor_id
      and request.homeowner_user_id = v_homeowner_id and request.home_id is not distinct from v_home_id
  ) then raise exception 'The source Request no longer matches this Estimate.' using errcode = '42501'; end if;
  if v_job_id is not null and not exists (
    select 1 from public.inspections job where job.id = v_job_id and job.contractor_id = v_contractor_id
      and job.homeowner_user_id is not distinct from v_homeowner_id and job.local_contact_id is not distinct from v_local_contact_id
      and job.home_id is not distinct from v_home_id and job.local_home_id is not distinct from v_local_home_id
  ) then raise exception 'The source Job no longer matches this Estimate.' using errcode = '42501'; end if;

  if p_estimate_id is null then
    insert into public.estimates (
      contractor_id, homeowner_user_id, local_contact_id, service_request_id, inspection_id,
      home_id, local_home_id, title, scope, notes, terms, status, subtotal_cents, total_cents,
      labor_mode, labor_rate_cents, job_labor_hours, material_total_cents, labor_total_cents,
      fee_total_cents, other_total_cents, tax_rate_percent, tax_cents
    ) values (
      v_contractor_id, v_homeowner_id, v_local_contact_id, v_request_id, v_job_id,
      v_home_id, v_local_home_id, v_canonical->>'title', v_canonical->>'scope', v_canonical->>'notes', v_canonical->>'terms', 'draft',
      (v_canonical->>'subtotal_cents')::integer, (v_canonical->>'total_cents')::integer,
      nullif(v_canonical->>'labor_mode',''), nullif(v_canonical->>'labor_rate_cents','')::integer,
      nullif(v_canonical->>'job_labor_hours','')::numeric, nullif(v_canonical->>'material_total_cents','')::integer,
      nullif(v_canonical->>'labor_total_cents','')::integer, nullif(v_canonical->>'fee_total_cents','')::integer,
      nullif(v_canonical->>'other_total_cents','')::integer, nullif(v_canonical->>'tax_rate_percent','')::numeric,
      nullif(v_canonical->>'tax_cents','')::integer
    ) returning * into v_estimate;
  else
    update public.estimates set
      homeowner_user_id=v_homeowner_id, local_contact_id=v_local_contact_id, service_request_id=v_request_id,
      inspection_id=v_job_id, home_id=v_home_id, local_home_id=v_local_home_id,
      title=v_canonical->>'title', scope=v_canonical->>'scope', notes=v_canonical->>'notes', terms=v_canonical->>'terms',
      subtotal_cents=(v_canonical->>'subtotal_cents')::integer, total_cents=(v_canonical->>'total_cents')::integer,
      labor_mode=nullif(v_canonical->>'labor_mode',''), labor_rate_cents=nullif(v_canonical->>'labor_rate_cents','')::integer,
      job_labor_hours=nullif(v_canonical->>'job_labor_hours','')::numeric,
      material_total_cents=nullif(v_canonical->>'material_total_cents','')::integer,
      labor_total_cents=nullif(v_canonical->>'labor_total_cents','')::integer,
      fee_total_cents=nullif(v_canonical->>'fee_total_cents','')::integer,
      other_total_cents=nullif(v_canonical->>'other_total_cents','')::integer,
      tax_rate_percent=nullif(v_canonical->>'tax_rate_percent','')::numeric,
      tax_cents=nullif(v_canonical->>'tax_cents','')::integer
    where id=p_estimate_id returning * into v_estimate;
    delete from public.estimate_line_items where estimate_id=v_estimate.id;
    delete from public.estimate_payment_schedule_items where estimate_id=v_estimate.id;
  end if;

  insert into public.estimate_line_items (
    estimate_id,line_type,description,line_title,customer_description,model_spec,supply_status,
    quantity,unit,unit_price_cents,labor_hours,sort_order
  ) select v_estimate.id, line->>'line_type', line->>'description', line->>'line_title', line->>'customer_description',
      line->>'model_spec', line->>'supply_status', (line->>'quantity')::numeric, line->>'unit',
      nullif(line->>'unit_price_cents','')::integer, nullif(line->>'labor_hours','')::numeric, (line->>'sort_order')::integer
    from jsonb_array_elements(v_lines) line;
  insert into public.estimate_payment_schedule_items (
    estimate_id,invoice_type,label,amount_type,amount_value,calculated_amount_cents,due_trigger,sort_order,linked_invoice_id
  ) select v_estimate.id,item->>'invoice_type',item->>'label',item->>'amount_type',(item->>'amount_value')::numeric,
      (item->>'calculated_amount_cents')::integer,item->>'due_trigger',(item->>'sort_order')::integer,null
    from jsonb_array_elements(v_schedule) item;

  v_result := jsonb_build_object('status','succeeded','estimate',public.servsync_private_core_authoring_estimate_result(v_estimate.id),'idempotent',false);
  insert into public.servsync_core_authoring_operations (
    operation_type,operation_key,actor_user_id,contractor_id,payload_sha256,status,result_kind,result_id,result_payload,completed_at
  ) values ('estimate_draft_save',p_operation_key,v_actor,v_contractor_id,v_hash,'succeeded','estimate',v_estimate.id,v_result,now());
  return v_result;
end;
$$;

create function public.servsync_save_invoice_draft_idempotent(
  p_operation_key uuid,
  p_invoice_id uuid,
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
  v_contractor_id uuid;
  v_existing public.servsync_core_authoring_operations;
  v_invoice public.invoices;
  v_homeowner_id uuid := nullif(p_payload->>'homeowner_user_id', '')::uuid;
  v_local_contact_id uuid := nullif(p_payload->>'local_contact_id', '')::uuid;
  v_home_id uuid := nullif(p_payload->>'home_id', '')::uuid;
  v_local_home_id uuid := nullif(p_payload->>'local_home_id', '')::uuid;
  v_request_id uuid := nullif(p_payload->>'service_request_id', '')::uuid;
  v_job_id uuid := nullif(p_payload->>'job_id', '')::uuid;
  v_estimate_id uuid := nullif(p_payload->>'estimate_id', '')::uuid;
  v_lines jsonb;
  v_canonical jsonb;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  if p_operation_key is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'This Invoice Draft could not be saved. Review the details and try again.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_payload->>'title','')), '') is null then
    raise exception 'Add an Invoice title before saving.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_payload->'line_items'), '') <> 'array'
     or jsonb_array_length(p_payload->'line_items') < 1
     or jsonb_array_length(p_payload->'line_items') > 200 then
    raise exception 'Add between 1 and 200 Invoice line items.' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object(
      'job_work_item_id', nullif(value->>'job_work_item_id','')::uuid,
      'line_type', case when value->>'line_type' in ('labor','material','fee','other') then value->>'line_type' else 'other' end,
      'description', trim(coalesce(value->>'description','')),
      'line_title', nullif(trim(coalesce(value->>'line_title','')), ''),
      'customer_description', nullif(trim(coalesce(value->>'customer_description','')), ''),
      'model_spec', nullif(trim(coalesce(value->>'model_spec','')), ''),
      'supply_status', case when value->>'supply_status' in ('contractor_supplied','customer_supplied','to_be_confirmed') then value->>'supply_status' else null end,
      'quantity', coalesce(nullif(value->>'quantity','')::numeric, 1),
      'unit', coalesce(nullif(trim(value->>'unit'),''), 'each'),
      'unit_price_cents', nullif(value->>'unit_price_cents','')::integer,
      'labor_hours', nullif(value->>'labor_hours','')::numeric,
      'sort_order', ordinality::integer - 1
    ) order by ordinality)
    into v_lines
    from jsonb_array_elements(p_payload->'line_items') with ordinality;
  if exists (
    select 1 from jsonb_array_elements(v_lines) line
     where coalesce(line->>'description','') = ''
        or (line->>'quantity')::numeric <= 0
        or coalesce((line->>'unit_price_cents')::integer,0) < 0
        or coalesce((line->>'labor_hours')::numeric,0) < 0
  ) then raise exception 'One Invoice line item has invalid details.' using errcode='22023'; end if;

  v_canonical := jsonb_build_object(
    'invoice_id',p_invoice_id,'homeowner_user_id',v_homeowner_id,'local_contact_id',v_local_contact_id,
    'service_request_id',v_request_id,'job_id',v_job_id,'estimate_id',v_estimate_id,
    'home_id',v_home_id,'local_home_id',v_local_home_id,
    'invoice_number',trim(coalesce(p_payload->>'invoice_number','')),
    'title',trim(p_payload->>'title'),'scope',trim(coalesce(p_payload->>'scope','')),
    'notes',trim(coalesce(p_payload->>'notes','')),'terms',trim(coalesce(p_payload->>'terms','')),
    'subtotal_cents',coalesce((p_payload->>'subtotal_cents')::integer,0),
    'labor_mode',case when p_payload->>'labor_mode' in ('job_total','line_specific') then p_payload->>'labor_mode' else null end,
    'labor_rate_cents',nullif(p_payload->>'labor_rate_cents','')::integer,
    'job_labor_hours',nullif(p_payload->>'job_labor_hours','')::numeric,
    'material_total_cents',nullif(p_payload->>'material_total_cents','')::integer,
    'labor_total_cents',nullif(p_payload->>'labor_total_cents','')::integer,
    'fee_total_cents',nullif(p_payload->>'fee_total_cents','')::integer,
    'other_total_cents',nullif(p_payload->>'other_total_cents','')::integer,
    'tax_cents',coalesce((p_payload->>'tax_cents')::integer,0),
    'tax_rate_percent',coalesce((p_payload->>'tax_rate_percent')::numeric,0),
    'discount_cents',coalesce((p_payload->>'discount_cents')::integer,0),
    'discount_type',case when p_payload->>'discount_type'='percentage' then 'percentage' else 'amount' end,
    'discount_value',coalesce((p_payload->>'discount_value')::numeric,0),
    'discount_reason',trim(coalesce(p_payload->>'discount_reason','')),
    'total_cents',coalesce((p_payload->>'total_cents')::integer,0),
    'due_at',nullif(p_payload->>'due_at','')::timestamptz,
    'line_items',v_lines
  );
  if num_nonnulls(v_homeowner_id,v_local_contact_id) <> 1
     or coalesce((v_canonical->>'subtotal_cents')::integer,-1) < 0
     or coalesce((v_canonical->>'total_cents')::integer,-1) < 0
     or coalesce((v_canonical->>'discount_cents')::integer,-1) < 0
     or coalesce((v_canonical->>'tax_cents')::integer,-1) < 0 then
    raise exception 'Choose one valid Invoice customer and valid totals.' using errcode='22023';
  end if;
  v_hash := public.servsync_private_core_authoring_payload_hash(v_canonical);

  perform public.servsync_private_core_authoring_operation_lock(v_actor,'invoice_draft_save',p_operation_key);
  select operation.* into v_existing from public.servsync_core_authoring_operations operation
   where operation.actor_user_id=v_actor and operation.operation_type='invoice_draft_save' and operation.operation_key=p_operation_key;
  if v_existing.id is not null then
    if not public.current_user_can_manage_contractor_billing(v_existing.contractor_id) then
      raise exception 'Your current access does not allow saving this Invoice Draft.' using errcode='42501';
    end if;
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'This Invoice save attempt belongs to different changes. Start a new save attempt.' using errcode='22023';
    end if;
    return v_existing.result_payload || jsonb_build_object('idempotent',true);
  end if;

  if p_invoice_id is not null then
    select invoice.* into v_invoice from public.invoices invoice where invoice.id=p_invoice_id for update;
    v_contractor_id := v_invoice.contractor_id;
    if v_invoice.id is null then raise exception 'Invoice Draft not found.' using errcode='P0002'; end if;
    if not public.current_user_can_manage_contractor_billing(v_contractor_id) then
      raise exception 'Your current access does not allow saving Invoice Drafts.' using errcode='42501';
    end if;
    if v_invoice.status <> 'draft' or v_invoice.amount_paid_cents <> 0 then
      raise exception 'Only unpaid Draft Invoices can be edited.' using errcode='22023';
    end if;
  else
    select profile.id into v_contractor_id from public.servsync_current_contractor_profile() profile limit 1;
  end if;
  if v_contractor_id is null or not public.current_user_can_manage_contractor_billing(v_contractor_id) then
    raise exception 'Your current access does not allow saving Invoice Drafts.' using errcode='42501';
  end if;

  if v_homeowner_id is not null and not exists (
    select 1 from public.homeowner_contractor_connections connection where connection.contractor_id=v_contractor_id and connection.homeowner_user_id=v_homeowner_id and connection.status='active'
  ) then raise exception 'The selected connected customer is no longer available.' using errcode='42501'; end if;
  if v_local_contact_id is not null and not exists (
    select 1 from public.contractor_local_contacts contact where contact.id=v_local_contact_id and contact.contractor_id=v_contractor_id and contact.archived_at is null
  ) then raise exception 'The selected local customer is no longer available.' using errcode='42501'; end if;
  if v_home_id is not null and (v_homeowner_id is null or not exists (
    select 1 from public.homes home where home.id=v_home_id and home.homeowner_user_id=v_homeowner_id
  )) then raise exception 'The selected property does not belong to this customer.' using errcode='42501'; end if;
  if v_local_home_id is not null and (v_local_contact_id is null or not exists (
    select 1 from public.contractor_local_homes home where home.id=v_local_home_id and home.local_contact_id=v_local_contact_id and home.contractor_id=v_contractor_id
  )) then raise exception 'The selected local property does not belong to this customer.' using errcode='42501'; end if;
  if v_request_id is not null and not exists (
    select 1 from public.service_requests request where request.id=v_request_id and request.contractor_id=v_contractor_id
      and request.homeowner_user_id=v_homeowner_id and request.home_id is not distinct from v_home_id
  ) then raise exception 'The source Request no longer matches this Invoice.' using errcode='42501'; end if;
  if v_job_id is not null and not exists (
    select 1 from public.inspections job where job.id=v_job_id and job.contractor_id=v_contractor_id
      and job.homeowner_user_id is not distinct from v_homeowner_id and job.local_contact_id is not distinct from v_local_contact_id
      and job.home_id is not distinct from v_home_id and job.local_home_id is not distinct from v_local_home_id
  ) then raise exception 'The source Job no longer matches this Invoice.' using errcode='42501'; end if;
  if v_estimate_id is not null and not exists (
    select 1 from public.estimates estimate where estimate.id=v_estimate_id and estimate.contractor_id=v_contractor_id
      and estimate.homeowner_user_id is not distinct from v_homeowner_id and estimate.local_contact_id is not distinct from v_local_contact_id
      and estimate.home_id is not distinct from v_home_id and estimate.local_home_id is not distinct from v_local_home_id
  ) then raise exception 'The source Estimate no longer matches this Invoice.' using errcode='42501'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_lines) line
     where nullif(line->>'job_work_item_id','') is not null
       and not exists (select 1 from public.job_work_items item where item.id=(line->>'job_work_item_id')::uuid and item.contractor_id=v_contractor_id and item.inspection_id=v_job_id)
  ) then raise exception 'One source work item no longer matches this Invoice.' using errcode='42501'; end if;

  if p_invoice_id is null then
    insert into public.invoices (
      contractor_id,homeowner_user_id,local_contact_id,service_request_id,job_id,estimate_id,home_id,local_home_id,
      invoice_number,title,scope,notes,terms,status,subtotal_cents,labor_mode,labor_rate_cents,job_labor_hours,
      material_total_cents,labor_total_cents,fee_total_cents,other_total_cents,tax_cents,tax_rate_percent,
      discount_cents,discount_type,discount_value,discount_reason,total_cents,amount_paid_cents,due_at
    ) values (
      v_contractor_id,v_homeowner_id,v_local_contact_id,v_request_id,v_job_id,v_estimate_id,v_home_id,v_local_home_id,
      v_canonical->>'invoice_number',v_canonical->>'title',v_canonical->>'scope',v_canonical->>'notes',v_canonical->>'terms','draft',
      (v_canonical->>'subtotal_cents')::integer,nullif(v_canonical->>'labor_mode',''),nullif(v_canonical->>'labor_rate_cents','')::integer,
      nullif(v_canonical->>'job_labor_hours','')::numeric,nullif(v_canonical->>'material_total_cents','')::integer,
      nullif(v_canonical->>'labor_total_cents','')::integer,nullif(v_canonical->>'fee_total_cents','')::integer,
      nullif(v_canonical->>'other_total_cents','')::integer,(v_canonical->>'tax_cents')::integer,
      (v_canonical->>'tax_rate_percent')::numeric,(v_canonical->>'discount_cents')::integer,v_canonical->>'discount_type',
      (v_canonical->>'discount_value')::numeric,v_canonical->>'discount_reason',(v_canonical->>'total_cents')::integer,0,
      nullif(v_canonical->>'due_at','')::timestamptz
    ) returning * into v_invoice;
  else
    update public.invoices set
      homeowner_user_id=v_homeowner_id,local_contact_id=v_local_contact_id,service_request_id=v_request_id,job_id=v_job_id,
      estimate_id=v_estimate_id,home_id=v_home_id,local_home_id=v_local_home_id,invoice_number=v_canonical->>'invoice_number',
      title=v_canonical->>'title',scope=v_canonical->>'scope',notes=v_canonical->>'notes',terms=v_canonical->>'terms',
      subtotal_cents=(v_canonical->>'subtotal_cents')::integer,labor_mode=nullif(v_canonical->>'labor_mode',''),
      labor_rate_cents=nullif(v_canonical->>'labor_rate_cents','')::integer,job_labor_hours=nullif(v_canonical->>'job_labor_hours','')::numeric,
      material_total_cents=nullif(v_canonical->>'material_total_cents','')::integer,labor_total_cents=nullif(v_canonical->>'labor_total_cents','')::integer,
      fee_total_cents=nullif(v_canonical->>'fee_total_cents','')::integer,other_total_cents=nullif(v_canonical->>'other_total_cents','')::integer,
      tax_cents=(v_canonical->>'tax_cents')::integer,tax_rate_percent=(v_canonical->>'tax_rate_percent')::numeric,
      discount_cents=(v_canonical->>'discount_cents')::integer,discount_type=v_canonical->>'discount_type',
      discount_value=(v_canonical->>'discount_value')::numeric,discount_reason=v_canonical->>'discount_reason',
      total_cents=(v_canonical->>'total_cents')::integer,due_at=nullif(v_canonical->>'due_at','')::timestamptz
    where id=p_invoice_id and status='draft' and amount_paid_cents=0 returning * into v_invoice;
    if v_invoice.id is null then raise exception 'Only unpaid Draft Invoices can be edited.' using errcode='22023'; end if;
    delete from public.invoice_line_items where invoice_id=v_invoice.id;
  end if;

  insert into public.invoice_line_items (
    invoice_id,job_work_item_id,line_type,description,line_title,customer_description,model_spec,supply_status,
    quantity,unit,unit_price_cents,labor_hours,sort_order
  ) select v_invoice.id,nullif(line->>'job_work_item_id','')::uuid,line->>'line_type',line->>'description',line->>'line_title',
      line->>'customer_description',line->>'model_spec',line->>'supply_status',(line->>'quantity')::numeric,line->>'unit',
      nullif(line->>'unit_price_cents','')::integer,nullif(line->>'labor_hours','')::numeric,(line->>'sort_order')::integer
    from jsonb_array_elements(v_lines) line;

  v_result := jsonb_build_object('status','succeeded','invoice',public.servsync_private_core_authoring_invoice_result(v_invoice.id),'idempotent',false);
  insert into public.servsync_core_authoring_operations (
    operation_type,operation_key,actor_user_id,contractor_id,payload_sha256,status,result_kind,result_id,result_payload,completed_at
  ) values ('invoice_draft_save',p_operation_key,v_actor,v_contractor_id,v_hash,'succeeded','invoice',v_invoice.id,v_result,now());
  return v_result;
end;
$$;

alter function public.servsync_prepare_service_request_creation(uuid,jsonb) owner to postgres;
alter function public.servsync_private_can_upload_prepared_request_media(text) owner to postgres;
alter function public.servsync_commit_service_request_creation(uuid,jsonb) owner to postgres;
alter function public.servsync_save_estimate_draft_idempotent(uuid,uuid,jsonb) owner to postgres;
alter function public.servsync_save_invoice_draft_idempotent(uuid,uuid,jsonb) owner to postgres;

revoke all on function public.servsync_prepare_service_request_creation(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.servsync_private_can_upload_prepared_request_media(text) from public,anon,authenticated,service_role;
revoke all on function public.servsync_commit_service_request_creation(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.servsync_save_estimate_draft_idempotent(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.servsync_save_invoice_draft_idempotent(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

grant execute on function public.servsync_prepare_service_request_creation(uuid,jsonb) to authenticated;
grant execute on function public.servsync_private_can_upload_prepared_request_media(text) to authenticated;
grant execute on function public.servsync_commit_service_request_creation(uuid,jsonb) to authenticated;
grant execute on function public.servsync_save_estimate_draft_idempotent(uuid,uuid,jsonb) to authenticated;
grant execute on function public.servsync_save_invoice_draft_idempotent(uuid,uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
