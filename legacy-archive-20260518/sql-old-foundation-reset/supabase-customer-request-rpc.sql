-- Customer Portal Request Submission RPC
-- Run this in Supabase SQL Editor once. Safe to re-run.
-- It lets a signed-in customer create a request only for their own property,
-- without granting customers broad write access to the requests table.

create or replace function public.create_customer_request(
  p_id uuid,
  p_property_id uuid,
  p_customer_name text,
  p_category text,
  p_room text,
  p_description text,
  p_priority text,
  p_photo_url text default null,
  p_status text default 'Pending',
  p_contractor_notes text default '',
  p_read boolean default false
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_request public.requests;
begin
  select property_id
    into v_property_id
    from public.profiles
   where id = auth.uid();

  if v_property_id is null then
    raise exception 'No customer property is linked to this account.';
  end if;

  if p_property_id <> v_property_id then
    raise exception 'You can only submit requests for your own property.';
  end if;

  insert into public.requests (
    id,
    property_id,
    customer_name,
    category,
    room,
    description,
    priority,
    photo_url,
    status,
    contractor_notes,
    read
  ) values (
    p_id,
    p_property_id,
    coalesce(p_customer_name, ''),
    coalesce(p_category, 'Other'),
    coalesce(p_room, ''),
    coalesce(p_description, ''),
    coalesce(p_priority, 'Medium'),
    p_photo_url,
    coalesce(p_status, 'Pending'),
    coalesce(p_contractor_notes, ''),
    coalesce(p_read, false)
  )
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.create_customer_request(
  uuid, uuid, text, text, text, text, text, text, text, text, boolean
) to authenticated;


-- Allow signed-in customers to upload photos only into their own customer request folder:
-- photos/customer-requests/{property_id}/{request_id}/{file}
drop policy if exists "Customers can upload own request photos" on storage.objects;

create policy "Customers can upload own request photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'customer-requests'
    and (storage.foldername(name))[2] = public.current_user_property_id()::text
  );

drop policy if exists "Customers can read own request photos" on storage.objects;

create policy "Customers can read own request photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'customer-requests'
    and (storage.foldername(name))[2] = public.current_user_property_id()::text
  );
