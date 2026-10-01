do $$ begin
  if exists(select 1 from public.servsync_legal_acceptances) then raise exception 'Invented backfill'; end if;
  if public.servsync_current_legal_bundle() is not null then raise exception 'Premature activation'; end if;
end $$;
insert into public.servsync_legal_policy_bundles(bundle_id, policy_text)
select 'servsync-test-v1', (policy_text::jsonb || jsonb_build_object(
 'bundleId','servsync-test-v1','releaseReady',true,'effectiveDate','2000-01-01',
 'operator','Fictional Test Operator','privacyEmail','privacy@example.test'))::text
from public.servsync_legal_policy_bundles where bundle_id='servsync-2026-10-01-v1';
