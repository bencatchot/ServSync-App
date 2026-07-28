-- ServSync local customer profile edit foundation.
-- Adds a contractor-scoped RPC for editing unclaimed contractor-created local customer profiles.
-- Run after:
--   - servsync-contractor-team-access.sql
--   - servsync-local-field-work.sql
--   - servsync-local-customer-claim-invites.sql

begin;

create or replace function public.servsync_update_local_contact_profile(
  p_local_contact_id uuid,
  p_display_name text default '',
  p_phone text default '',
  p_email text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contractor_local_contacts;
  v_has_claimed_home boolean := false;
  v_next_display_name text;
  v_next_phone text;
  v_next_email text;
  v_next_notes text;
  v_public_claim_fields_changed boolean := false;
  v_revoked_invite_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into v_contact
    from public.contractor_local_contacts
   where id = p_local_contact_id
   for update;

  if v_contact.id is null then
    raise exception 'Local customer not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_contact.contractor_id)
     and not public.current_user_is_platform_admin() then
    raise exception 'You do not have permission to edit this customer.';
  end if;

  select exists (
    select 1
      from public.contractor_local_homes home
     where home.local_contact_id = v_contact.id
       and home.contractor_id = v_contact.contractor_id
       and (home.home_id is not null or home.claimed_at is not null)
  )
    into v_has_claimed_home;

  if v_contact.homeowner_user_id is not null
     or v_contact.claimed_at is not null
     or v_has_claimed_home then
    raise exception 'This customer is linked to a homeowner profile. Customer details are homeowner-controlled after claim.';
  end if;

  v_next_display_name := trim(coalesce(p_display_name, ''));
  if length(v_next_display_name) = 0 then
    raise exception 'Enter a customer name.';
  end if;

  v_next_phone := trim(coalesce(p_phone, ''));
  v_next_email := trim(coalesce(p_email, ''));
  v_next_notes := coalesce(p_notes, '');

  v_public_claim_fields_changed :=
    v_next_display_name is distinct from coalesce(v_contact.display_name, '')
    or v_next_phone is distinct from coalesce(v_contact.phone, '')
    or v_next_email is distinct from coalesce(v_contact.email, '');

  update public.contractor_local_contacts
     set display_name = v_next_display_name,
         phone = v_next_phone,
         email = v_next_email,
         notes = v_next_notes,
         updated_at = now()
   where id = v_contact.id
   returning * into v_contact;

  if v_public_claim_fields_changed then
    update public.contractor_local_customer_claim_invites
       set status = 'revoked',
           revoked_at = coalesce(revoked_at, now()),
           updated_at = now()
     where contractor_id = v_contact.contractor_id
       and local_contact_id = v_contact.id
       and status = 'pending';

    get diagnostics v_revoked_invite_count = row_count;
  end if;

  return to_jsonb(v_contact)
    || jsonb_build_object('revoked_pending_claim_invite_count', v_revoked_invite_count);
end;
$$;

revoke execute on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from public;
revoke execute on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) from anon;
grant execute on function public.servsync_update_local_contact_profile(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
