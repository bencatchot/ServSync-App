-- ServSync admin contractor management fields.
-- Paste this into Supabase SQL Editor after the clean foundation reset.

alter table public.contractor_profiles
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
  add column if not exists monthly_price_cents integer not null default 0,
  add column if not exists subscription_notes text not null default '',
  add column if not exists admin_notes text not null default '';

grant select, insert, update, delete on public.contractor_profiles to authenticated;

notify pgrst, 'reload schema';

select
  'admin contractor management fields ready' as status,
  count(*) as contractor_count
from public.contractor_profiles;
