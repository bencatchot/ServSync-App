-- Real PostgreSQL RLS checks, never a shared database.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
insert into public.homeowner_saved_contractors(contractor_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.homeowner_saved_contractors(contractor_id) values ('10000000-0000-4000-8000-000000000001') on conflict do nothing;
do $$ begin
  if (select count(*) from public.homeowner_saved_contractors) <> 1 then raise exception 'Own save/idempotency failed'; end if;
  begin insert into public.homeowner_saved_contractors values ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'); raise exception 'Cross-owner insert allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.homeowner_saved_contractors(contractor_id) values ('10000000-0000-4000-8000-000000000002'); raise exception 'Hidden contractor allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.homeowner_saved_contractors(contractor_id) values ('10000000-0000-4000-8000-000000000003'); raise exception 'Suspended contractor allowed'; exception when insufficient_privilege then null; end;
  begin update public.homeowner_saved_contractors set homeowner_user_id='00000000-0000-4000-8000-000000000002'; raise exception 'Ownership update allowed'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select from public.homeowner_saved_contractors) then raise exception 'Other owner can read'; end if;
  delete from public.homeowner_saved_contractors; if found then raise exception 'Other owner can delete'; end if;
end $$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
do $$ begin
  if exists(select from public.homeowner_saved_contractors) then raise exception 'Contractor can read'; end if;
  begin insert into public.homeowner_saved_contractors(contractor_id) values ('10000000-0000-4000-8000-000000000001'); raise exception 'Contractor can save'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform * from public.homeowner_saved_contractors; raise exception 'Anonymous can read'; exception when insufficient_privilege then null; end;
  begin insert into public.homeowner_saved_contractors(contractor_id) values ('10000000-0000-4000-8000-000000000001'); raise exception 'Anonymous can save'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.contractor_profiles set public_profile_enabled=false where id='10000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.homeowner_saved_contractors) <> 1 then raise exception 'Saved ID lost when profile hidden'; end if;
  delete from public.homeowner_saved_contractors; if not found then raise exception 'Cannot remove hidden contractor'; end if;
end $$;
reset role;
-- No write-through triggers; the only relation this migration owns is the shortlist.
do $$ begin
  if exists(select from pg_trigger where tgrelid='public.homeowner_saved_contractors'::regclass and not tgisinternal) then raise exception 'Unexpected shortlist side-effect trigger'; end if;
end $$;
select 'PASS: owner isolation, anonymous/contractor denial, eligibility, idempotency, hidden removal, no side effects' as result;
