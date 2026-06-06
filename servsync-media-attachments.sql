-- ServSync media attachments.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-request-lifecycle.sql.
-- Requires a Storage bucket named 'service-request-media' (already created in the dashboard).

begin;

-- Make bucket public so getPublicUrl() works without signed URLs
update storage.buckets set public = true where id = 'service-request-media';

-- Homeowners upload to a folder named after their own user ID
drop policy if exists "homeowner_upload_media" on storage.objects;
create policy "homeowner_upload_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Media table
create table if not exists public.service_request_media (
  id               uuid        primary key default gen_random_uuid(),
  request_id       uuid        not null references public.service_requests(id) on delete cascade,
  uploader_user_id uuid        not null references auth.users(id),
  message_id       uuid        references public.service_request_messages(id) on delete set null,
  storage_path     text        not null,
  file_name        text        not null default '',
  content_type     text        not null default '',
  file_size_bytes  bigint,
  created_at       timestamptz not null default now()
);

create index if not exists service_request_media_request_idx
  on public.service_request_media(request_id, created_at asc);

alter table public.service_request_media enable row level security;

drop policy if exists "media_insert_homeowner" on public.service_request_media;
create policy "media_insert_homeowner"
  on public.service_request_media for insert to authenticated
  with check (
    uploader_user_id = auth.uid()
    and exists (
      select 1 from public.service_requests sr
       where sr.id = request_id and sr.homeowner_user_id = auth.uid()
    )
  );

drop policy if exists "media_read_parties" on public.service_request_media;
create policy "media_read_parties"
  on public.service_request_media for select to authenticated
  using (
    exists (
      select 1
        from public.service_requests sr
        join public.contractor_profiles cp on cp.id = sr.contractor_id
       where sr.id = request_id
         and (
           sr.homeowner_user_id = auth.uid()
           or cp.owner_user_id = auth.uid()
           or public.current_user_is_platform_admin()
         )
    )
  );

grant select, insert on public.service_request_media to authenticated;

-- Update homeowner reply RPC to return message_id so the UI can link media
create or replace function public.servsync_homeowner_update_service_request(
  p_request_id uuid,
  p_body       text,
  p_action     text default 'reply'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request    public.service_requests;
  v_next_status text;
  v_body        text;
  v_message_id  uuid;
begin
  select * into v_request
    from public.service_requests
   where id = p_request_id and homeowner_user_id = auth.uid()
   limit 1;

  if v_request.id is null then raise exception 'Service request not found.'; end if;
  if v_request.status in ('declined', 'closed') then raise exception 'This service request is already closed.'; end if;

  v_body        := coalesce(nullif(trim(p_body), ''), 'Homeowner updated this request.');
  v_next_status := case when p_action = 'close' then 'closed' else 'homeowner_replied' end;

  insert into public.service_request_messages
    (request_id, actor_user_id, actor_role, message_type, body)
  values
    (v_request.id, auth.uid(), 'homeowner',
     case when p_action = 'close' then 'homeowner_closed' else 'homeowner_reply' end,
     v_body)
  returning id into v_message_id;

  update public.service_requests set status = v_next_status where id = v_request.id;

  return jsonb_build_object('request_id', v_request.id, 'message_id', v_message_id, 'status', v_next_status);
end;
$$;

grant execute on function public.servsync_homeowner_update_service_request(uuid, text, text) to authenticated;

-- Rebuild both fetch RPCs to include media column
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
  media             jsonb,
  quote             jsonb,
  appointment       jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql security definer set search_path = public stable
as $$
  select
    sr.id, sr.connection_id, sr.contractor_id,
    cp.business_name                       as contractor_name,
    sr.homeowner_user_id,
    coalesce(hp.display_name, 'Homeowner') as homeowner_name,
    coalesce(hp.city, '')                  as homeowner_city,
    sr.category, sr.title, sr.description, sr.urgency, sr.status, sr.closing_summary,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'actor_user_id', m.actor_user_id,
        'actor_role', m.actor_role, 'message_type', m.message_type,
        'body', m.body, 'created_at', m.created_at
      ) order by m.created_at asc)
      from public.service_request_messages m where m.request_id = sr.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', med.id, 'message_id', med.message_id,
        'storage_path', med.storage_path, 'file_name', med.file_name,
        'content_type', med.content_type, 'created_at', med.created_at
      ) order by med.created_at asc)
      from public.service_request_media med where med.request_id = sr.id
    ), '[]'::jsonb) as media,
    (select jsonb_build_object(
       'id', q.id, 'request_id', q.request_id, 'contractor_id', q.contractor_id,
       'amount_cents', q.amount_cents, 'scope', q.scope, 'status', q.status,
       'created_at', q.created_at, 'updated_at', q.updated_at)
     from public.service_request_quotes q where q.request_id = sr.id limit 1) as quote,
    (select jsonb_build_object(
       'id', a.id, 'request_id', a.request_id, 'contractor_id', a.contractor_id,
       'proposed_at', a.proposed_at, 'notes', a.notes, 'status', a.status,
       'proposed_by', a.proposed_by, 'created_at', a.created_at, 'updated_at', a.updated_at)
     from public.service_request_appointments a where a.request_id = sr.id limit 1) as appointment,
    sr.created_at, sr.updated_at
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
  media             jsonb,
  quote             jsonb,
  appointment       jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql security definer set search_path = public stable
as $$
  select
    sr.id, sr.connection_id, sr.contractor_id,
    cp.business_name as contractor_name,
    sr.homeowner_user_id,
    case when coalesce(perm.share_contact, false) then coalesce(hp.display_name, 'Homeowner') else 'Homeowner' end as homeowner_name,
    case when coalesce(perm.share_contact, false) then coalesce(hp.city, '') else '' end as homeowner_city,
    sr.category, sr.title, sr.description, sr.urgency, sr.status, sr.closing_summary,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'actor_user_id', m.actor_user_id,
        'actor_role', m.actor_role, 'message_type', m.message_type,
        'body', m.body, 'created_at', m.created_at
      ) order by m.created_at asc)
      from public.service_request_messages m where m.request_id = sr.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', med.id, 'message_id', med.message_id,
        'storage_path', med.storage_path, 'file_name', med.file_name,
        'content_type', med.content_type, 'created_at', med.created_at
      ) order by med.created_at asc)
      from public.service_request_media med where med.request_id = sr.id
    ), '[]'::jsonb) as media,
    (select jsonb_build_object(
       'id', q.id, 'request_id', q.request_id, 'contractor_id', q.contractor_id,
       'amount_cents', q.amount_cents, 'scope', q.scope, 'status', q.status,
       'created_at', q.created_at, 'updated_at', q.updated_at)
     from public.service_request_quotes q where q.request_id = sr.id limit 1) as quote,
    (select jsonb_build_object(
       'id', a.id, 'request_id', a.request_id, 'contractor_id', a.contractor_id,
       'proposed_at', a.proposed_at, 'notes', a.notes, 'status', a.status,
       'proposed_by', a.proposed_by, 'created_at', a.created_at, 'updated_at', a.updated_at)
     from public.service_request_appointments a where a.request_id = sr.id limit 1) as appointment,
    sr.created_at, sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  join public.homeowner_contractor_connections c on c.id = sr.connection_id
  left join public.connection_permissions perm on perm.connection_id = c.id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where cp.owner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
