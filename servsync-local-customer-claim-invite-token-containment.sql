-- ServSync local customer claim invite token containment.
-- Apply only after:
--   1. servsync-local-customer-claim-invites.sql has installed the token-free
--      list RPC and guarded prepare-delivery RPC, and
--   2. the deployed app has stopped reading claim invites directly from the
--      table and uses servsync_list_local_customer_claim_invites(...) instead.
--
-- This final containment step removes broad browser table reads so raw
-- invite_token values can only be returned by the guarded prepare-delivery RPC.

begin;

revoke select on public.contractor_local_customer_claim_invites from public;
revoke select on public.contractor_local_customer_claim_invites from anon;
revoke select on public.contractor_local_customer_claim_invites from authenticated;

notify pgrst, 'reload schema';

commit;
