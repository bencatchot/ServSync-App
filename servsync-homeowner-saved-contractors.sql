-- Private homeowner bookmarks. This migration does not create connections,
-- notifications, requests, analytics, or property permissions.
begin;
create table if not exists public.homeowner_saved_contractors (
  homeowner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (homeowner_user_id, contractor_id)
);
alter table public.homeowner_saved_contractors enable row level security;
revoke all on public.homeowner_saved_contractors from public, anon, authenticated;
grant select, insert, delete on public.homeowner_saved_contractors to authenticated;
drop policy if exists homeowner_saved_contractors_read on public.homeowner_saved_contractors;
create policy homeowner_saved_contractors_read on public.homeowner_saved_contractors for select to authenticated
using (homeowner_user_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'homeowner'));
drop policy if exists homeowner_saved_contractors_add on public.homeowner_saved_contractors;
create policy homeowner_saved_contractors_add on public.homeowner_saved_contractors for insert to authenticated
with check (homeowner_user_id = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'homeowner')
  and exists (select 1 from public.contractor_profiles where id = contractor_id and public_profile_enabled and account_status = 'active'));
drop policy if exists homeowner_saved_contractors_remove on public.homeowner_saved_contractors;
create policy homeowner_saved_contractors_remove on public.homeowner_saved_contractors for delete to authenticated
using (homeowner_user_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'homeowner'));
comment on table public.homeowner_saved_contractors is 'Private homeowner shortlist; no contractor visibility or relationship/property access side effects.';
commit;
