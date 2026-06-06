-- ServSync invite/referral reward tracking fields.
-- Paste this into Supabase SQL Editor after the clean foundation reset.

alter table public.contractor_invites
  add column if not exists reward_status text not null default 'not_eligible'
    check (reward_status in ('not_eligible', 'pending_review', 'approved', 'denied', 'paid')),
  add column if not exists reward_notes text not null default '';

grant select, insert, update, delete on public.contractor_invites to authenticated;

notify pgrst, 'reload schema';

select
  'invite reward tracking fields ready' as status,
  count(*) as invite_count
from public.contractor_invites;
