-- ServSync homeowner document upload room-registration foundation.
-- Do not apply to production without separate approval.
--
-- Scope:
--   - Allows the existing manual homeowner document upload reservation/register
--     flow to carry an optional home_rooms link into home_documents.
--   - Keeps existing home_documents RLS, grants, storage buckets, and storage
--     policies unchanged.
--   - Adds no UI, no document room picker/chips/filtering, no document edit
--     flow, no shared-home document expansion, no contractor visibility, no
--     photo/report/job media tagging, and no Home Map behavior.

begin;

alter table public.home_document_upload_reservations
  add column if not exists home_room_id uuid references public.home_rooms(id) on delete set null;

comment on column public.home_document_upload_reservations.home_room_id is
  'Optional room link carried from a pending manual homeowner document upload into home_documents.home_room_id. Room notes are not copied or exposed through upload registration.';

create index if not exists home_doc_upload_reservations_home_room_idx
  on public.home_document_upload_reservations(homeowner_user_id, home_id, home_room_id, created_at desc);

drop function if exists public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text);

create or replace function public.servsync_prepare_manual_home_document_upload(
  p_home_id uuid,
  p_file_name text,
  p_content_type text,
  p_file_size_bytes bigint,
  p_document_type text default 'other',
  p_notes text default '',
  p_home_room_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ext text;
  v_storage_path text;
  v_reservation public.home_document_upload_reservations;
  v_room_home_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in again before uploading documents.';
  end if;

  if coalesce(p_document_type, 'other') not in ('warranty','manual','inspection','insurance','permit','receipt','other') then
    raise exception 'Choose a valid document type before uploading.';
  end if;

  perform public.servsync_validate_manual_home_document_upload(
    v_user_id,
    p_home_id,
    p_file_name,
    p_content_type,
    p_file_size_bytes
  );

  if p_home_room_id is not null then
    if p_home_id is null then
      raise exception 'Choose a property before tagging this document to a room.';
    end if;

    select hr.home_id
      into v_room_home_id
      from public.home_rooms hr
     where hr.id = p_home_room_id;

    if v_room_home_id is null then
      raise exception 'Choose an existing room before uploading this document.';
    end if;

    if v_room_home_id is distinct from p_home_id then
      raise exception 'Document room must belong to the selected property.';
    end if;
  end if;

  v_ext := public.servsync_normalized_manual_home_document_extension(p_file_name);
  v_storage_path := v_user_id::text || '/manual-documents/' || gen_random_uuid()::text || '.' || v_ext;

  insert into public.home_document_upload_reservations (
    homeowner_user_id,
    home_id,
    home_room_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes,
    document_type,
    notes
  ) values (
    v_user_id,
    p_home_id,
    p_home_room_id,
    v_storage_path,
    left(coalesce(p_file_name, 'Document'), 255),
    lower(coalesce(p_content_type, '')),
    p_file_size_bytes,
    coalesce(p_document_type, 'other'),
    coalesce(p_notes, '')
  )
  returning * into v_reservation;

  return jsonb_build_object(
    'reservation_id', v_reservation.id,
    'storage_path', v_reservation.storage_path,
    'expires_at', v_reservation.expires_at
  );
end;
$$;

comment on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text, uuid) is
  'Prepares a manual homeowner document upload and optionally stores a same-home room link on the reservation for later registration into home_documents.home_room_id.';

revoke execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text, uuid) from public;
revoke execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text, uuid) from anon;
grant execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text, uuid) to authenticated;

create or replace function public.servsync_register_manual_home_document_upload(
  p_storage_path text
)
returns public.home_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.home_document_upload_reservations;
  v_document public.home_documents;
begin
  if v_user_id is null then
    raise exception 'Sign in again before uploading documents.';
  end if;

  select *
    into v_reservation
    from public.home_document_upload_reservations
   where storage_path = p_storage_path
     and homeowner_user_id = v_user_id
     and status = 'pending'
     and expires_at > now()
   limit 1
   for update;

  if v_reservation.id is null then
    raise exception 'This document upload was not prepared or has expired. Please choose the file again.';
  end if;

  perform public.servsync_validate_manual_home_document_upload(
    v_user_id,
    v_reservation.home_id,
    v_reservation.file_name,
    v_reservation.content_type,
    v_reservation.file_size_bytes
  );

  insert into public.home_documents (
    homeowner_user_id,
    home_id,
    home_room_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes,
    document_type,
    notes,
    upload_source
  ) values (
    v_user_id,
    v_reservation.home_id,
    v_reservation.home_room_id,
    v_reservation.storage_path,
    v_reservation.file_name,
    v_reservation.content_type,
    v_reservation.file_size_bytes::int,
    v_reservation.document_type,
    v_reservation.notes,
    'manual_documents_tab'
  )
  returning * into v_document;

  insert into public.home_document_upload_events (
    homeowner_user_id,
    home_id,
    home_document_id,
    storage_path,
    file_name,
    content_type,
    file_size_bytes
  ) values (
    v_user_id,
    v_reservation.home_id,
    v_document.id,
    v_reservation.storage_path,
    v_reservation.file_name,
    v_reservation.content_type,
    v_reservation.file_size_bytes
  );

  update public.home_document_upload_reservations
     set status = 'completed',
         completed_at = now()
   where id = v_reservation.id;

  return v_document;
end;
$$;

comment on function public.servsync_register_manual_home_document_upload(text) is
  'Registers a prepared manual homeowner document upload and carries the optional reservation room link into home_documents.home_room_id without changing storage visibility.';

revoke execute on function public.servsync_register_manual_home_document_upload(text) from public;
revoke execute on function public.servsync_register_manual_home_document_upload(text) from anon;
grant execute on function public.servsync_register_manual_home_document_upload(text) to authenticated;

notify pgrst, 'reload schema';

commit;
