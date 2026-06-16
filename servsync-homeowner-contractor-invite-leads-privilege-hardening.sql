-- ServSync homeowner contractor invite leads privilege hardening.
-- Run after servsync-homeowner-contractor-invite-leads.sql.

begin;

-- Some deployed Supabase projects can carry broad table ACLs from earlier
-- privilege/default-grant patterns. Reset this table to the intended surface.
revoke all privileges on table public.homeowner_contractor_invite_leads from anon;
revoke all privileges on table public.homeowner_contractor_invite_leads from authenticated;
revoke all privileges on table public.homeowner_contractor_invite_leads from public;

-- Homeowners and platform admins read through RLS policies.
grant select on table public.homeowner_contractor_invite_leads to authenticated;

-- Preserve the original homeowner-owned submission surface for direct inserts,
-- while preventing client writes to status, outreach, and admin fields.
grant insert (
  homeowner_user_id,
  business_name,
  location,
  trade_category,
  contact_name,
  phone,
  email,
  website_url,
  social_url,
  homeowner_note
) on table public.homeowner_contractor_invite_leads to authenticated;

-- Preserve the platform-admin review surface. RLS still limits who can update.
grant update (
  homeowner_status,
  admin_status,
  admin_notes,
  outreach_attempt_count,
  last_outreach_at,
  next_follow_up_at,
  matched_contractor_id
) on table public.homeowner_contractor_invite_leads to authenticated;

-- Functions are executable by PUBLIC by default in PostgreSQL. Restrict this
-- homeowner submission RPC to authenticated users; the function still enforces
-- auth.uid() and homeowner role checks internally.
revoke all on function public.servsync_submit_homeowner_contractor_invite_lead(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.servsync_submit_homeowner_contractor_invite_lead(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

notify pgrst, 'reload schema';

commit;
