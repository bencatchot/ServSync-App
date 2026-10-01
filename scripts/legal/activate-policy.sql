-- Approval-gated activation. psql -v legal_bundle_id=<reviewed-version> -f ...
-- Run ONLY after exact policy bytes, public contact, effective date and rollout are approved.
\set ON_ERROR_STOP on
begin;
select set_config('servsync.reviewed_legal_bundle', :'legal_bundle_id', true);
do $$
declare v_policy jsonb;
begin
  select policy_text::jsonb into strict v_policy from public.servsync_legal_policy_bundles
    where bundle_id = current_setting('servsync.reviewed_legal_bundle');
  if (v_policy -> 'releaseReady') is distinct from 'true'::jsonb
    or nullif(v_policy ->> 'operator', '') is null
    or nullif(v_policy ->> 'privacyEmail', '') is null
    or nullif(v_policy ->> 'effectiveDate', '') is null
    or (v_policy ->> 'effectiveDate')::date > current_date then
    raise exception 'Policy is not approved/complete/effective for activation';
  end if;
end;
$$;
drop trigger if exists servsync_capture_signup_legal_acceptance on auth.users;
create trigger servsync_capture_signup_legal_acceptance after insert on auth.users
  for each row execute function public.servsync_capture_signup_legal_acceptance();
insert into public.servsync_legal_current_release (singleton, bundle_id)
  values (true, :'legal_bundle_id')
  on conflict (singleton) do update set bundle_id = excluded.bundle_id, activated_at = clock_timestamp();
notify pgrst, 'reload schema';
commit;
