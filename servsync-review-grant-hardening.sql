-- ServSync review grant hardening.
-- Run after:
--   - servsync-review-eligibility.sql
--   - servsync-public-reviews.sql
--   - servsync-external-review-links.sql
--
-- This patch tightens direct browser-role access to service_request_reviews.
-- Review writes should flow through servsync_homeowner_submit_review(...).

begin;

alter table public.service_request_reviews enable row level security;

-- Keep review rows RPC mediated. Public profile, Discover, and request-card
-- readers use security-definer functions rather than direct table access.
revoke all privileges on table public.service_request_reviews from public;
revoke all privileges on table public.service_request_reviews from anon;
revoke all privileges on table public.service_request_reviews from authenticated;

-- Tighten browser-callable eligibility probing so authenticated callers can
-- only check their own homeowner review eligibility, while platform admins may
-- still inspect eligibility during future internal support work.
create or replace function public.servsync_homeowner_can_review_service_request(
  p_request_id uuid,
  p_homeowner_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (
    p_homeowner_user_id = auth.uid()
    or public.current_user_is_platform_admin()
  )
  and exists (
    select 1
      from public.service_requests sr
     where sr.id = p_request_id
       and sr.homeowner_user_id = p_homeowner_user_id
       and sr.status = 'closed'
       and public.servsync_service_request_has_completed_work(
         sr.id,
         sr.contractor_id,
         sr.homeowner_user_id
       )
  );
$$;

-- Remove inherited PUBLIC/anon execute from review write/helper functions.
do $$
declare
  review_function regprocedure;
begin
  for review_function in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'servsync_homeowner_submit_review',
         'servsync_homeowner_can_review_service_request',
         'servsync_service_request_has_completed_work'
       )
  loop
    execute format('revoke all privileges on function %s from public', review_function);
    execute format('revoke all privileges on function %s from anon', review_function);
    execute format('revoke all privileges on function %s from authenticated', review_function);
  end loop;
end;
$$;

grant execute on function public.servsync_homeowner_submit_review(uuid, smallint, text, text[], text, text)
  to authenticated;

grant execute on function public.servsync_homeowner_can_review_service_request(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
