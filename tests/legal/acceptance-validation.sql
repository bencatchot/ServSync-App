-- Local synthetic records only. Test through the real canonical Auth/profile triggers.
create function pg_temp.submission(role_name text, context_name text, version text default 'servsync-test-v1')
returns jsonb language sql as $$
 select jsonb_build_object('role',role_name,'legal_acceptance',jsonb_build_object(
 'bundle_id',version,'terms_agreed',true,'privacy_acknowledged',true,
 'acceptable_use_agreed',true,'contractor_agreed',role_name='contractor',
 'us_adult_confirmed',true,'context',context_name));
$$;
create function pg_temp.expect_signup_rejection(metadata jsonb)
returns void language plpgsql as $$
begin
  begin
    insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'rejected@example.test',metadata);
    raise exception 'Expected rejection but accepted: %',metadata;
  exception when check_violation then null;
  end;
end $$;
set role supabase_auth_admin;
select pg_temp.expect_signup_rejection('{}');
select pg_temp.expect_signup_rejection('{"role":"homeowner","legal_acceptance":null}');
select pg_temp.expect_signup_rejection(pg_temp.submission('homeowner','standard','old-version'));
select pg_temp.expect_signup_rejection(pg_temp.submission('homeowner','standard') #- '{legal_acceptance,privacy_acknowledged}');
select pg_temp.expect_signup_rejection(jsonb_set(pg_temp.submission('homeowner','standard'),'{legal_acceptance,terms_agreed}','false'));
select pg_temp.expect_signup_rejection(jsonb_set(pg_temp.submission('homeowner','standard'),'{legal_acceptance,terms_agreed}','"true"'));
select pg_temp.expect_signup_rejection(jsonb_set(pg_temp.submission('homeowner','standard'),'{legal_acceptance,accepted_at}','"2000-01-01"'));
select pg_temp.expect_signup_rejection(jsonb_set(pg_temp.submission('homeowner','standard'),'{legal_acceptance,marketing_consent}','true'));
select pg_temp.expect_signup_rejection(pg_temp.submission('contractor','local_customer_claim'));
select pg_temp.expect_signup_rejection(pg_temp.submission('homeowner','unknown'));
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','standard@example.test',pg_temp.submission('homeowner','standard')),
 ('10000000-0000-0000-0000-000000000002','invited@example.test',pg_temp.submission('homeowner','contractor_invitation')),
 ('10000000-0000-0000-0000-000000000003','claim@example.test',pg_temp.submission('homeowner','local_customer_claim')),
 ('10000000-0000-0000-0000-000000000004','contractor@example.test',pg_temp.submission('contractor','standard')),
 ('10000000-0000-0000-0000-000000000005','untrusted-role@example.test',pg_temp.submission('platform_admin','standard'));
reset role;
do $$ begin
 if (select count(*) from public.servsync_legal_acceptances) <> 5 then raise exception 'Missing signup evidence'; end if;
 if exists(select 1 from public.servsync_legal_acceptances where accepted_at < now()-interval '1 minute' or policy_sha256 !~ '^[0-9a-f]{64}$' or assent_text is null) then raise exception 'Invalid evidence'; end if;
 if (select role from public.profiles where id='10000000-0000-0000-0000-000000000005') <> 'homeowner' then raise exception 'Privilege escalation'; end if;
 if exists(select 1 from public.profiles where email='rejected@example.test') then raise exception 'Partial signup rollback failed'; end if;
 if exists(select 1 from public.servsync_legal_acceptances where actor_user_id='00000000-0000-0000-0000-000000000001') then raise exception 'Backfill'; end if;
end $$;
-- Mutable Auth metadata is not authoritative evidence.
update auth.users set raw_user_meta_data='{}' where id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ begin
 if (select count(*) from public.servsync_legal_acceptances) <> 1 then raise exception 'Cross-account read'; end if;
 begin update public.servsync_legal_acceptances set accepted_at=now(); raise exception 'Update allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.servsync_legal_acceptances; raise exception 'Delete allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.servsync_legal_acceptances default values; raise exception 'Insert allowed'; exception when insufficient_privilege then null; end;
 begin update public.servsync_legal_current_release set bundle_id='forged'; raise exception 'Activation allowed'; exception when insufficient_privilege then null; end;
 begin perform public.servsync_capture_signup_legal_acceptance(); raise exception 'Trigger RPC exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
 if public.servsync_current_legal_bundle()->>'bundle_id' <> 'servsync-test-v1' then raise exception 'No preflight'; end if;
 begin perform * from public.servsync_legal_acceptances; raise exception 'Anonymous read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
do $$ begin
 begin delete from public.servsync_legal_acceptances; raise exception 'Service deletion allowed'; exception when insufficient_privilege then null; end;
 begin update public.servsync_legal_policy_bundles set policy_text='{}'; raise exception 'Service rewrite allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Even privileged accidental DML cannot rewrite or truncate archived evidence.
do $$ begin
 begin update public.servsync_legal_acceptances set accepted_at=now(); raise exception 'Privileged update allowed'; exception when insufficient_privilege then null; end;
 begin truncate public.servsync_legal_acceptances; raise exception 'Truncate allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.servsync_legal_policy_bundles; raise exception 'Policy deletion allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','',false);
-- New release, old evidence preserved; no invented reacceptance for existing users.
insert into public.servsync_legal_policy_bundles(bundle_id,policy_text)
 select 'servsync-test-v2',(policy_text::jsonb || '{"bundleId":"servsync-test-v2"}')::text
 from public.servsync_legal_policy_bundles where bundle_id='servsync-test-v1';
update public.servsync_legal_current_release set bundle_id='servsync-test-v2';
select pg_temp.expect_signup_rejection(pg_temp.submission('homeowner','standard'));
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000006','new-version@example.test',pg_temp.submission('homeowner','standard','servsync-test-v2'));
delete from auth.users where id='10000000-0000-0000-0000-000000000001';
do $$ begin
 if (select count(*) from public.servsync_legal_acceptances where bundle_id='servsync-test-v1') <> 5 then raise exception 'Historical evidence lost'; end if;
 if (select count(*) from public.servsync_legal_acceptances where bundle_id='servsync-test-v2') <> 1 then raise exception 'New release failed'; end if;
 if (select count(*) from public.servsync_legal_acceptances) <> 6 then raise exception 'Unexpected reacceptance'; end if;
end $$;
