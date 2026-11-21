select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare a record; b record; c record;
begin
  select * into strict a from public.servsync_contractor_service_requests() where home_id = '40000000-0000-0000-0000-000000000001';
  select * into strict b from public.servsync_contractor_service_requests() where home_id = '40000000-0000-0000-0000-000000000002';
  select * into strict c from public.servsync_contractor_service_requests() where home_id = '40000000-0000-0000-0000-000000000003';
  assert (a.home_label, a.home_address) is not distinct from ('Fixture A', '10 Example Lane, Fixtureville AL 00000');
  assert (b.home_label, b.home_address, b.title) is not distinct from ('', 'Sampleville AL', 'Fixture request');
  assert (c.home_label, c.home_address) is not distinct from ('', '');
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);
do $$
begin
  assert not exists (select 1 from public.servsync_contractor_service_requests());
end $$;
reset role;

update public.connection_shared_properties set share_address = true, share_home_overview = false
where home_id = '40000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare b record;
begin
  select * into strict b from public.servsync_contractor_service_requests() where home_id = '40000000-0000-0000-0000-000000000002';
  assert (b.home_label, b.home_address) is not distinct from ('', '20 Fixture Street, Unit 2, Sampleville AL 00001');
end $$;
reset role;

update public.homeowner_contractor_connections set status = 'revoked';
set role authenticated;
do $$
begin
  assert not exists (
    select 1 from public.servsync_contractor_service_requests()
    where home_label is distinct from '' or home_address is distinct from ''
  );
end $$;
reset role;
