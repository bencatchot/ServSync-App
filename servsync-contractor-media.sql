-- ServSync contractor media attachments.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-media-attachments.sql.
-- Allows contractors to upload photos/videos on service requests they own.

begin;

-- Storage: contractors upload to a folder named after their own user ID
drop policy if exists "contractor_upload_media" on storage.objects;
create policy "contractor_upload_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow contractors to insert media rows for their own requests
drop policy if exists "media_insert_contractor" on public.service_request_media;
create policy "media_insert_contractor"
  on public.service_request_media for insert to authenticated
  with check (
    uploader_user_id = auth.uid()
    and exists (
      select 1
        from public.service_requests sr
        join public.contractor_profiles cp on cp.id = sr.contractor_id
       where sr.id = request_id
         and cp.owner_user_id = auth.uid()
    )
  );

-- Update contractor update RPC to return message_id so media can be linked
create or replace function public.servsync_contractor_update_service_request(
  p_request_id         uuid,
  p_body               text,
  p_new_status         text    default 'contractor_responded',
  p_quote_amount_cents int     default null,
  p_quote_scope        text    default null,
  p_closing_summary    text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_request       public.service_requests;
  v_next_status   text;
  v_body          text;
  v_message_id    uuid;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  select * into v_request
    from public.service_requests
   where id = p_request_id
     and contractor_id = v_contractor_id
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found.';
  end if;

  if v_request.status in ('declined', 'closed') then
    raise exception 'This service request is already closed.';
  end if;

  if p_new_status not in ('contractor_responded', 'declined', 'closed') then
    raise exception 'Unsupported service request status.';
  end if;

  v_next_status := p_new_status;
  v_body        := coalesce(nullif(trim(p_body), ''), 'Contractor updated this request.');

  insert into public.service_request_messages (
    request_id, actor_user_id, actor_role, message_type, body
  ) values (
    v_request.id,
    auth.uid(),
    'contractor',
    case
      when v_next_status = 'declined' then 'contractor_declined'
      when v_next_status = 'closed'   then 'contractor_closed'
      else 'contractor_response'
    end,
    v_body
  )
  returning id into v_message_id;

  update public.service_requests
     set status          = v_next_status,
         closing_summary = case
           when v_next_status = 'closed' and p_closing_summary is not null
           then coalesce(nullif(trim(p_closing_summary), ''), '')
           else closing_summary
         end
   where id = v_request.id;

  -- Attach or refresh quote when amount is provided
  if p_quote_amount_cents is not null and p_quote_amount_cents >= 0 then
    insert into public.service_request_quotes
      (request_id, contractor_id, amount_cents, scope, status)
    values
      (v_request.id, v_contractor_id, p_quote_amount_cents,
       coalesce(nullif(trim(p_quote_scope), ''), ''), 'pending')
    on conflict (request_id) do update
       set amount_cents = excluded.amount_cents,
           scope        = excluded.scope,
           status       = 'pending';
  end if;

  return jsonb_build_object('request_id', v_request.id, 'message_id', v_message_id, 'status', v_next_status);
end;
$$;

grant execute on function public.servsync_contractor_update_service_request(uuid, text, text, int, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
