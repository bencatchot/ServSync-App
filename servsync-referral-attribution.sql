-- ServSync quiet referral attribution.
-- Run this in the ServSync Supabase SQL Editor.
--
-- What this does:
-- - When a homeowner creates a new account from a contractor referral link,
--   the contractor_invites row is marked used and moved to pending_review.
-- - It does NOT create a homeowner-contractor connection.
-- - It does NOT share homeowner data with the contractor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_referral_invite_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'homeowner');
  if v_role not in ('homeowner', 'contractor', 'platform_admin') then
    v_role := 'homeowner';
  end if;

  v_referral_invite_code := nullif(trim(coalesce(new.raw_user_meta_data->>'referral_invite_code', '')), '');

  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update
  set email = excluded.email,
      role = coalesce(public.profiles.role, excluded.role),
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);

  if v_role = 'homeowner' and v_referral_invite_code is not null then
    update public.contractor_invites
       set status = 'used',
           used_by_homeowner_id = new.id,
           used_at = now(),
           reward_status = 'pending_review',
           reward_notes = case
             when coalesce(reward_notes, '') = '' then 'Referral signup recorded automatically from contractor link.'
             else reward_notes
           end
     where invite_code = v_referral_invite_code
       and status = 'active'
       and used_by_homeowner_id is null
       and (expires_at is null or expires_at > now());
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

notify pgrst, 'reload schema';
