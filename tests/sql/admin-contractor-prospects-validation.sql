-- Disposable local fixtures only; no shared database authority.
create function public.prospect_test_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function public.prospect_test_denied(statement text, label text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlstate not in ('P0001','42501','23503','23505') then raise; end if;
    return;
  end;
  raise exception 'FAIL: accepted forbidden action: %', label;
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-4000-8000-000000000001','admin@example.test',now(),'{"role":"platform_admin"}'),
('00000000-0000-4000-8000-000000000002','owner@example.test',now(),'{"role":"contractor"}'),
('00000000-0000-4000-8000-000000000003','other@example.test',now(),'{"role":"contractor"}'),
('00000000-0000-4000-8000-000000000004','homeowner@example.test',now(),'{"role":"homeowner"}'),
('00000000-0000-4000-8000-000000000005','unverified@example.test',null,'{"role":"contractor"}');
update public.profiles set role='platform_admin' where id='00000000-0000-4000-8000-000000000001';
-- Test variables live outside browser-readable production tables.
create table public.prospect_test_state(k text primary key, v jsonb);
grant all on public.prospect_test_state to authenticated;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
insert into public.prospect_test_state values ('profile',public.servsync_admin_save_contractor_prospect(null,null,'test-plumbing','{"business_name":"Test Plumbing","email":"private@example.test","phone":"555-0101","website_url":"https://example.test","contact_name":"Private Name","city":"Fairhope","state":"AL","service_categories":["Plumbing"],"service_zip_codes":["36532"]}',true));
insert into public.prospect_test_state values ('invite',public.servsync_admin_issue_contractor_claim((select (v->>'id')::uuid from public.prospect_test_state where k='profile'),1,'Owner@Example.Test'));
select public.prospect_test_assert((select not v::text like '%token_hash%' from public.prospect_test_state where k='invite'),'token hash excluded from issuance');
select public.prospect_test_assert(not public.servsync_admin_contractor_prospects()::text like '%token%', 'ordinary admin reads are token-free');
select public.prospect_test_denied('select * from public.contractor_prospects','admin direct reads');
select public.prospect_test_denied('update public.contractor_prospects set published=false','admin direct mutation');
select public.prospect_test_denied($s$select public.servsync_admin_save_contractor_prospect(null,null,'bad-link','{"business_name":"X","logo_url":"javascript:alert(1)"}',true)$s$,'unsafe URL');
select public.prospect_test_denied($s$select public.servsync_admin_save_contractor_prospect(null,null,'test-plumbing','{"business_name":"Duplicate"}',true)$s$,'duplicate slug');
reset role;
select public.prospect_test_assert((select count(*)=0 from public.contractor_profiles),'no owned profile before claim');
select public.prospect_test_assert((select count(*)=0 from public.contractor_billing_accounts),'no billing before claim');
set role anon;
select public.prospect_test_denied('select public.servsync_admin_contractor_prospects()','anonymous admin RPC');
select public.prospect_test_denied('select * from public.contractor_prospects','anonymous private table');
select public.prospect_test_assert(jsonb_array_length(public.servsync_public_contractor_prospects())=1,'public unclaimed listing');
select public.prospect_test_assert(not (public.servsync_public_contractor_prospects()::text ~ 'private@|555-0101|Private Name|website_url|token_hash|invited_email'),'public contact and token redaction');
select public.prospect_test_assert(jsonb_array_length(public.servsync_public_contractor_prospects(null,'36532'))=1,'service ZIP search');
select public.prospect_test_assert(jsonb_array_length(public.servsync_public_contractor_prospects(null,'Roofing'))=0,'search no match');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
select public.prospect_test_denied('select public.servsync_admin_contractor_prospects()','non-admin list');
select public.prospect_test_denied($s$update public.profiles set role='platform_admin' where id=auth.uid()$s$,'self promotion cannot unlock admin creation');
select public.prospect_test_denied($s$select public.servsync_admin_save_contractor_prospect(null,null,'forged','{"business_name":"Forged"}',true)$s$,'non-admin create');
select public.prospect_test_denied($s$select public.servsync_review_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'))$s$,'wrong email review');
select public.prospect_test_denied($s$select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),2,'{"business_name":"Forged"}')$s$,'wrong email claim');
select public.prospect_test_denied($s$insert into public.contractor_profiles(owner_user_id,slug,business_name) values(auth.uid(),'test-plumbing','Hijack')$s$,'reserved slug spoofing');
select public.prospect_test_denied($s$insert into public.contractor_profiles(id,owner_user_id,slug,business_name) values((select (v->>'id')::uuid from public.prospect_test_state where k='profile'),auth.uid(),'different-slug','Hijack')$s$,'reserved UUID spoofing');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
select public.prospect_test_denied($s$select public.servsync_create_service_request((select (v->>'id')::uuid from public.prospect_test_state where k='profile'),'Plumbing','normal','Test request','Cannot send to unclaimed business')$s$,'service request cannot target unclaimed listing');
select public.prospect_test_denied($s$insert into public.homeowner_contractor_connections(homeowner_user_id,contractor_id,status) values(auth.uid(),(select (v->>'id')::uuid from public.prospect_test_state where k='profile'),'pending')$s$,'homeowner cannot contact an unclaimed target');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
select public.prospect_test_assert(public.servsync_review_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'))->'details'->>'email'='private@example.test','verified recipient can review private fields');
select public.prospect_test_denied($s$select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),1,'{"business_name":"Stale"}')$s$,'stale revision rejected');
-- A failed insert must roll back consumption and ownership together.
reset role;
create function public.prospect_test_fail_insert() returns trigger language plpgsql as $$begin raise exception 'Simulated failure'; end$$;
create trigger prospect_test_fail before insert on public.contractor_profiles for each row execute function public.prospect_test_fail_insert();
set role authenticated;
select public.prospect_test_denied($s$select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),2,'{"business_name":"Test Plumbing"}')$s$,'insert failure');
reset role;
drop trigger prospect_test_fail on public.contractor_profiles;
select public.prospect_test_assert((select claimed_at is null and token_hash is not null from public.contractor_prospects where slug='test-plumbing'),'failed insert preserves claim');
set role authenticated;
select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),2,'{"business_name":"Reviewed Plumbing","email":"owner@example.test","service_categories":["Plumbing"],"admin_notes":"injected","account_status":"paused"}');
select public.prospect_test_denied($s$select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),2,'{"business_name":"Replay"}')$s$,'replay');
reset role;
select public.prospect_test_assert((select count(*)=1 from public.contractor_profiles where slug='test-plumbing' and id=(select (v->>'id')::uuid from public.prospect_test_state where k='profile') and business_name='Reviewed Plumbing' and admin_notes='' and account_status='active'),'same identity and reviewed details without privileged injection');
select public.prospect_test_assert((select count(*)=1 from public.contractor_billing_accounts),'normal billing initialized exactly once');
select public.prospect_test_assert(public.servsync_public_contractor_prospects()->0->>'claim_status'='claimed','claimed business remains discoverable with current owner details');
-- Existing account collision; no merge or overwrite.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
insert into public.prospect_test_state values ('second',public.servsync_admin_save_contractor_prospect(null,null,'another-business','{"business_name":"Another Business"}',true));
update public.prospect_test_state set v=public.servsync_admin_issue_contractor_claim((select (v->>'id')::uuid from public.prospect_test_state where k='second'),1,'owner@example.test') where k='invite';
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
select public.prospect_test_denied($s$select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),2,'{"business_name":"Overwrite"}')$s$,'existing owned profile');
-- Revocation, rotation, edits, expiry and verified-email checks.
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
insert into public.prospect_test_state select 'old_token',v from public.prospect_test_state where k='invite';
update public.prospect_test_state set v=public.servsync_admin_issue_contractor_claim((select (v->>'id')::uuid from public.prospect_test_state where k='second'),2,'unverified@example.test') where k='invite';
select public.prospect_test_denied($s$select public.servsync_review_contractor_claim((select v->>'token' from public.prospect_test_state where k='old_token'))$s$,'rotation rejects previous token');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000005';
select public.prospect_test_denied($s$select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),3,'{"business_name":"Unverified"}')$s$,'unverified email');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select public.servsync_admin_save_contractor_prospect((select (v->>'id')::uuid from public.prospect_test_state where k='second'),3,'another-business','{"business_name":"Edited"}',false);
select public.prospect_test_denied($s$select public.servsync_review_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'))$s$,'editing invalidates copied invitation');
select public.prospect_test_assert(jsonb_array_length(public.servsync_public_contractor_prospects('another-business'))=0,'unpublished hidden');
update public.prospect_test_state set v=public.servsync_admin_issue_contractor_claim((select (v->>'id')::uuid from public.prospect_test_state where k='second'),4,'other@example.test') where k='invite';
select public.servsync_admin_revoke_contractor_claim((select (v->>'id')::uuid from public.prospect_test_state where k='second'),5);
select public.prospect_test_denied($s$select public.servsync_review_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'))$s$,'explicit revocation');
update public.prospect_test_state set v=public.servsync_admin_issue_contractor_claim((select (v->>'id')::uuid from public.prospect_test_state where k='second'),6,'other@example.test') where k='invite';
reset role;
update public.contractor_prospects set expires_at=now()-interval '1 second' where slug='another-business';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
select public.prospect_test_denied($s$select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='invite'),7,'{"business_name":"Expired"}')$s$,'expired invitation');
reset role;
select public.prospect_test_assert((select bool_and(prosecdef and proowner='postgres'::regrole and proconfig @> array['search_path=pg_catalog, public']) from pg_proc where proname in ('servsync_admin_save_contractor_prospect','servsync_accept_contractor_claim')),'security definer catalog');
select public.prospect_test_assert(not has_function_privilege('authenticated','public.servsync_private_prospect_admin(public.contractor_prospects)','execute'),'private helper grants');
select public.prospect_test_assert(not has_function_privilege('service_role','public.servsync_accept_contractor_claim(text,integer,jsonb)','execute'),'no service role claim');

-- Normal owner editing and homeowner contact activate after claim.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
update public.contractor_profiles set business_name='Owner Updated Plumbing',slug='owner-plumbing' where owner_user_id=auth.uid();
select public.prospect_test_assert(public.servsync_public_contractor_prospects()->0->'details'->>'business_name'='Owner Updated Plumbing','Discover reflects owner edits');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
insert into public.homeowner_contractor_connections(homeowner_user_id,contractor_id,status) values(auth.uid(),(select (v->>'id')::uuid from public.prospect_test_state where k='profile'),'pending');
reset role;
select public.prospect_test_assert((select count(*)=1 from public.homeowner_contractor_connections),'normal connection request allowed after claim');

update public.homeowner_contractor_connections set status='active' where contractor_id=(select (v->>'id')::uuid from public.prospect_test_state where k='profile');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
select public.servsync_create_service_request((select id from public.homeowner_contractor_connections where contractor_id=(select (v->>'id')::uuid from public.prospect_test_state where k='profile')),'Plumbing','normal','Eligible request','Claimed contractor can respond through their normal workspace');
reset role;
select public.prospect_test_assert((select count(*)=1 from public.service_requests),'service requests work after claim and accepted connection');
