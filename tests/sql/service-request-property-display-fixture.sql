-- Run after accepted-connection-request-context-foundation.sql in a disposable database.
alter table public.contractor_profiles add column business_name text;
create table public.service_requests (
  id uuid, connection_id uuid, contractor_id uuid, homeowner_user_id uuid, home_id uuid,
  category text, title text, description text, urgency text, status text, closing_summary text,
  created_at timestamptz, updated_at timestamptz
);
create table public.service_request_messages (
  id uuid, request_id uuid, actor_user_id uuid, actor_role text, message_type text, body text, created_at timestamptz
);
create table public.service_request_media (
  id uuid, request_id uuid, message_id uuid, storage_path text, file_name text, content_type text, created_at timestamptz
);
create table public.service_request_quotes (
  id uuid, request_id uuid, contractor_id uuid, amount_cents integer, scope text, status text,
  created_at timestamptz, updated_at timestamptz
);
create table public.service_request_appointments (
  id uuid, request_id uuid, contractor_id uuid, proposed_at timestamptz, notes text, status text,
  proposed_by uuid, created_at timestamptz, updated_at timestamptz
);
create table public.service_request_reviews (
  id uuid, request_id uuid, rating integer, body text, kudos jsonb,
  reviewer_display_name text, reviewer_location text, created_at timestamptz
);
create function public.servsync_service_request_has_completed_work(uuid, uuid, uuid)
returns boolean language sql as $$ select false $$;

insert into public.profiles (id, role) values
  ('10000000-0000-0000-0000-000000000001', 'homeowner'),
  ('10000000-0000-0000-0000-000000000002', 'contractor'),
  ('10000000-0000-0000-0000-000000000003', 'contractor');
insert into public.contractor_profiles (id, owner_user_id, business_name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Fixture contractor');
insert into public.homeowner_contractor_connections (id, homeowner_user_id, contractor_id, status) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active');
insert into public.connection_permissions (connection_id, share_home_overview, share_address) values
  ('30000000-0000-0000-0000-000000000001', true, true);
insert into public.homes (id, homeowner_user_id, nickname, address_line1, address_line2, city, state, zip_code) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Fixture A', '10 Example Lane', '', 'Fixtureville', 'AL', '00000'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '', '20 Fixture Street', 'Unit 2', 'Sampleville', 'AL', '00001'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Unshared', '30 Unshared Road', '', 'Exampleville', 'AL', '00002');
insert into public.connection_shared_properties (id, connection_id, home_id, share_home_overview, share_address) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', true, true),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', true, false);
insert into public.service_requests (id, connection_id, contractor_id, homeowner_user_id, home_id, title, status)
select home.id, '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  home.homeowner_user_id, home.id, 'Fixture request', 'open'
from public.homes home;
