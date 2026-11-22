create function public.assert(v boolean, msg text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'Assertion failed: %',msg; end if; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub',uid(1)::text,false);
-- No job assignment needed for a solo owner, on an estimate or standalone job.
select servsync_job_expense_submit('estimate',uid(110),uid(901),18450,'2026-11-22','Materials','Fictional store','image/png',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/xp8AAAAASUVORK5CYII=');
select servsync_job_expense_submit('job',uid(210),uid(905),3000,'2026-11-22','Permits','');
select assert(servsync_job_expense_view('estimate',uid(110))->>'projected_gross_cents'='131550','accepted pre-tax projection');
select assert(servsync_job_expense_view('estimate',uid(120))->'projected_gross_cents'='null','draft has no projected profit');
select assert(servsync_job_expense_view('job',uid(210))->>'costs_cents'='3000','solo owner on unassigned job');
select set_config('fixture.receipt_expense',servsync_job_expense_view('estimate',uid(110))#>>'{entries,0,id}',false);
select assert(not (servsync_job_expense_view('estimate',uid(110))#>'{entries,0}') ? 'base64','summary never includes bytes');
select assert(servsync_job_expense_receipt('estimate',uid(110),current_setting('fixture.receipt_expense')::uuid)->>'media_type'='image/png','tenant manager receipt fetch');
do $$ begin
  begin perform servsync_job_expense_receipt('estimate',uid(120),current_setting('fixture.receipt_expense')::uuid);
    raise exception 'wrong expense scope returned receipt'; exception when insufficient_privilege then null; end;
  begin perform servsync_set_job_expense_tech(uid(200),uid(35),true);
    raise exception 'cross-tenant assignment accepted'; exception when insufficient_privilege then null; end;
end $$;
select servsync_set_job_expense_tech(uid(200),uid(31),true);
select assert(servsync_job_expense_techs(uid(200))@>'[{"name":"A Tech","assigned":true}]','assignment manager readback');

reset role;
-- One-sided lineage is intentionally ignored until both links agree.
update public.inspections set estimate_id=uid(110) where id=uid(200);
set role authenticated;
select assert(servsync_job_expense_view('job',uid(200))->>'costs_cents'='0','one-sided lineage must not pull expenses');
reset role;
update public.estimates set inspection_id=uid(200) where id=uid(110);

set role authenticated;
select set_config('request.jwt.claim.sub',uid(2)::text,false);
select assert(servsync_job_expense_view('job',uid(200))='{"kind":"capture"}','assigned tech sees no costs or profit');
select assert(servsync_job_expense_view('estimate',uid(110))='{"kind":"unavailable"}','tech has no estimate list/receipt');
select assert(servsync_job_expense_view('job',uid(210))='{"kind":"unavailable"}','tech cannot use another company job without assignment');
select servsync_job_expense_submit('job',uid(200),uid(902),1550,'2026-11-22','Materials','Fixture shop','image/png',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/xp8AAAAASUVORK5CYII=');
select servsync_job_expense_submit('job',uid(200),uid(902),1550,'2026-11-22','Materials','Fixture shop','image/png',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/xp8AAAAASUVORK5CYII=');
do $$ begin
  begin perform servsync_job_expense_submit('job',uid(200),uid(902),1551,'2026-11-22','Materials','Different amount');
    raise exception 'a different payload silently confirmed'; exception when invalid_parameter_value then null; end;
  begin perform servsync_job_expense_submit('job',uid(210),uid(903),100,'2026-11-22','Materials','');
    raise exception 'other job accepted'; exception when insufficient_privilege then null; end;
  begin perform servsync_job_expense_submit('estimate',uid(110),uid(903),100,'2026-11-22','Materials','');
    raise exception 'estimate submit accepted'; exception when insufficient_privilege then null; end;
  begin perform servsync_job_expense_receipt('job',uid(200),current_setting('fixture.receipt_expense')::uuid);
    raise exception 'tech read manager receipt'; exception when insufficient_privilege then null; end;
  begin perform servsync_job_expense_void('job',uid(200),current_setting('fixture.receipt_expense')::uuid);
    raise exception 'tech voided manager expense'; exception when insufficient_privilege then null; end;
  begin perform servsync_set_job_expense_tech(uid(210),uid(31),true);
    raise exception 'tech assigned self'; exception when insufficient_privilege then null; end;
  begin perform servsync_job_expense_submit('job',uid(200),uid(904),100,'2026-11-22','Materials','','image/png','AA==');
    raise exception 'wrong receipt image signature accepted'; exception when invalid_parameter_value then null; end;
  begin perform servsync_job_expense_submit('job',uid(200),uid(904),100,'2026-11-22','Materials','','image/jpeg','not base64');
    raise exception 'malformed photo accepted'; exception when invalid_parameter_value then null; end;
  begin perform servsync_job_expense_submit('job',uid(200),uid(904),100,'2026-11-22','Materials','','image/png',repeat('A',4194305));
    raise exception 'oversized base64 accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub',uid(4)::text,false);
select assert(servsync_job_expense_view('job',uid(200))->>'costs_cents'='20000','estimate-origin cost and job cost counted exactly once');
select assert(servsync_job_expense_view('job',uid(200))=servsync_job_expense_view('estimate',uid(110)),'same ledger on mutually linked estimate and job');
select set_config('fixture.tech_expense',(select r->>'id' from jsonb_array_elements(servsync_job_expense_view('job',uid(200))->'entries') r where r->>'vendor'='Fixture shop'),false);
select assert(servsync_job_expense_receipt('estimate',uid(110),current_setting('fixture.tech_expense')::uuid)->>'media_type'='image/png','actual tech upload is readable by office from the linked estimate');
select assert(servsync_job_expense_receipt('job',uid(200),current_setting('fixture.receipt_expense')::uuid)->>'media_type'='image/png','office reads receipt from linked job');
select servsync_set_job_expense_tech(uid(200),uid(31),false);
select set_config('request.jwt.claim.sub',uid(2)::text,false);
select assert(servsync_job_expense_view('job',uid(200))='{"kind":"unavailable"}','revoked tech');
do $$ begin
  begin perform servsync_job_expense_submit('job',uid(200),uid(904),100,'2026-11-22','Materials','');
    raise exception 'revoked tech submitted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',uid(8)::text,false);
select servsync_set_job_expense_tech(uid(200),uid(31),true);
select servsync_job_expense_void('job',uid(200),current_setting('fixture.receipt_expense')::uuid);
select assert(servsync_job_expense_view('estimate',uid(110))->>'costs_cents'='1550','manager correction retains only non-void costs');
do $$ begin
  begin perform servsync_job_expense_receipt('job',uid(200),current_setting('fixture.receipt_expense')::uuid);
    raise exception 'voided receipt accessible'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.contractor_team_members set status='disabled' where id=uid(31);
set role authenticated;
select set_config('request.jwt.claim.sub',uid(2)::text,false);
select assert(servsync_job_expense_view('job',uid(200))='{"kind":"unavailable"}','disabled member denied even with assignment');
do $$ declare actor int; begin
  foreach actor in array array[3,5,6,7,9,99] loop
    perform set_config('request.jwt.claim.sub',uid(actor)::text,false);
    perform assert(servsync_job_expense_view('job',uid(200))='{"kind":"unavailable"}','unassigned, viewer, cross-contractor or customer denied');
    begin perform servsync_job_expense_submit('job',uid(200),uid(904),100,'2026-11-22','Materials','');
      raise exception 'denied actor submitted'; exception when insufficient_privilege then null; end;
  end loop;
  begin perform * from servsync_expense_private.entries;
    raise exception 'direct entries visible'; exception when insufficient_privilege then null; end;
  begin perform * from servsync_expense_private.receipts;
    raise exception 'direct receipts visible'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',uid(1)::text,false);
select set_config('request.jwt.claims','{"is_anonymous":true}',false);
select assert(servsync_job_expense_view('job',uid(200))='{"kind":"unavailable"}','anonymous auth session denied even with mapped subject');
reset role;
set role anon;
do $$ begin
  begin perform servsync_job_expense_view('job',uid(200)); raise exception 'anonymous rpc visible';
    exception when insufficient_privilege then null; end;
end $$;
