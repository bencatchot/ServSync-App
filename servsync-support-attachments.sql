-- ServSync support attachments.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Lets homeowners and contractors attach screenshots/PDFs to support messages.
-- Files are stored privately and can only be opened by the requester or a
-- ServSync platform admin.

begin;

alter table public.support_inquiry_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ]::text[];

create or replace function public.servsync_can_access_support_attachment_path(p_storage_name text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_parts text[];
  v_inquiry_id uuid;
begin
  v_parts := string_to_array(coalesce(p_storage_name, ''), '/');

  if array_length(v_parts, 1) < 3 then
    return false;
  end if;

  begin
    v_inquiry_id := v_parts[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
      from public.support_inquiries si
     where si.id = v_inquiry_id
       and (
         si.requester_user_id = auth.uid()
         or public.current_user_is_platform_admin()
       )
  );
end;
$$;

grant execute on function public.servsync_can_access_support_attachment_path(text) to authenticated;

drop policy if exists "support_attachments_read_inquiry_participants" on storage.objects;
create policy "support_attachments_read_inquiry_participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and public.servsync_can_access_support_attachment_path(name)
  );

drop policy if exists "support_attachments_upload_inquiry_participants" on storage.objects;
create policy "support_attachments_upload_inquiry_participants"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and public.servsync_can_access_support_attachment_path(name)
    and lower(coalesce(storage.extension(name), '')) = any(array['jpg','jpeg','png','webp','pdf']::text[])
  );

notify pgrst, 'reload schema';

commit;
