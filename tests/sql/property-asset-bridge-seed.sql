insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005'),
  ('00000000-0000-0000-0000-000000000006'),
  ('00000000-0000-0000-0000-000000000007'),
  ('00000000-0000-0000-0000-000000000008'),
  ('00000000-0000-0000-0000-000000000009'),
  ('00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000011');

insert into public.profiles (id, role, full_name)
select id, 'homeowner', 'Fixture ' || right(id::text, 2) from auth.users;

insert into public.homes (id, homeowner_user_id, nickname) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Home A'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Home B');
insert into public.home_memberships (home_id, user_id, role, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'member', 'active'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'viewer', 'active');
insert into public.home_rooms (id, home_id, name) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Utility'),
  ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Garage');

insert into public.contractor_profiles (id, owner_user_id, business_name, account_status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Contractor A', 'active'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'Contractor B', 'active');
insert into public.contractor_team_members (contractor_id, user_id, role, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'admin', 'active'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000007', 'office', 'active'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000008', 'field_tech', 'active'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000009', 'viewer', 'active'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'admin', 'disabled');

insert into public.homeowner_contractor_connections (id, homeowner_user_id, contractor_id, status) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'active');
insert into public.connection_shared_properties (id, connection_id, home_id, share_home_overview) values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', true),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', true);

insert into public.contractor_local_contacts (id, contractor_id, display_name) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Local Customer');
insert into public.contractor_local_homes (id, contractor_id, local_contact_id, nickname) values
  ('41000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Local Home');

-- Supabase's canonical service_role table ACL is present before the bridge.
grant all privileges on table public.home_assets to service_role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.home_assets (
  id, home_id, home_room_id, asset_category, asset_type, name, notes, created_by
) values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'HVAC', 'Furnace', 'Existing furnace', 'Homeowner private note',
  '00000000-0000-0000-0000-000000000001'
);
insert into public.home_assets (
  id, home_id, home_room_id, asset_category, asset_type, name, notes,
  archived_at, created_by, created_at, updated_at
) values (
  '50000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'Electrical', 'Panel', 'Archived electrical panel',
  'Archived homeowner private note',
  timestamptz '2024-04-05 16:00:00+00',
  '00000000-0000-0000-0000-000000000001',
  timestamptz '2020-01-02 15:00:00+00',
  timestamptz '2024-04-05 16:00:00+00'
);
reset request.jwt.claim.sub;
