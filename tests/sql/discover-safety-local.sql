-- Run ONLY in a newly initialized ephemeral PostgreSQL database:
-- psql -X -v ON_ERROR_STOP=1 -f tests/sql/discover-safety-local.sql
-- Uses a small synthetic implementation of core Supabase roles/storage only.
\set ON_ERROR_STOP on
do $$
begin
  if to_regnamespace('auth') is not null or to_regnamespace('storage') is not null then
    raise exception 'Run this fixture only in a clean local ephemeral database.';
  end if;
end $$;
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage to anon,authenticated;
create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects (bucket_id text not null references storage.buckets(id),name text not null,primary key(bucket_id,name));
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;
create policy fixture_generic_storage on storage.objects for all to anon,authenticated using (true) with check (true);
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
create table public.profiles (id uuid primary key,role text);
-- The real signup-hardening migration is a prerequisite; the synthetic harness
-- mirrors just its profile-role trigger (without signup/referral fixture tables).
create function public.fixture_guard_profile_role()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op = 'INSERT' and new.role not in ('homeowner','contractor'))
    or (tg_op = 'UPDATE' and new.role is distinct from old.role)) then
    raise exception 'No self-assigned privileged roles.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger servsync_profiles_self_service_role_guard
  before insert or update of role on public.profiles
  for each row execute function public.fixture_guard_profile_role();
grant select,update on public.profiles to authenticated;

create function public.current_user_role() returns text language sql stable security definer set search_path=''
as $$select p.role from public.profiles p where p.id = auth.uid()$$;
create function public.current_user_is_platform_admin() returns boolean language sql stable
as $$select coalesce(public.current_user_role() = 'platform_admin',false)$$;
create table public.contractor_profiles (
  id uuid primary key,owner_user_id uuid,public_profile_enabled boolean,account_status text,
  slug text,business_name text,contact_name text,city text,state text,zip_code text,
  website_url text,logo_url text,service_categories text[],service_zip_codes text[],
  business_summary text,external_review_links jsonb,license_number text,
  insurance_status text,bonded_status text
);
grant select on public.contractor_profiles to authenticated;

create table public.contractor_service_areas (
  contractor_id uuid,label text,location_text text,zip_code text,city text,state text,
  radius_miles numeric,sort_order integer,created_at timestamptz,latitude numeric,
  longitude numeric,geocode_status text
);
create function public.servsync_distance_miles(numeric,numeric,numeric,numeric) returns numeric
language sql immutable as $$select 0::numeric$$;
create table public.service_request_reviews (rating numeric,contractor_id uuid,body text,kudos text[],reviewer_display_name text,reviewer_location text,created_at timestamptz);
create table public.homeowner_contractor_connections (
  id uuid primary key default gen_random_uuid(),homeowner_user_id uuid not null,contractor_id uuid not null,status text not null
);
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),homeowner_user_id uuid not null,contractor_id uuid not null,status text not null
);
grant select,insert,update on public.homeowner_contractor_connections,public.service_requests to authenticated;

create table auth.users (id uuid primary key);
create table public.inspections (id uuid primary key, homeowner_user_id uuid, contractor_id uuid);
create table public.estimates (id uuid primary key, homeowner_user_id uuid, contractor_id uuid);
create table public.invoices (id uuid primary key, homeowner_user_id uuid, contractor_id uuid);
create table public.service_request_appointments (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique, contractor_id uuid,
  notes text not null default '', proposed_at timestamptz, status text, proposed_by text, updated_at timestamptz
);
create table public.contractor_visit_events (id uuid primary key, inspection_id uuid, share_with_homeowner boolean, notes text);
create table public.service_request_messages (
  id uuid primary key default gen_random_uuid(),request_id uuid not null,actor_user_id uuid,
  actor_role text,message_type text,body text not null,created_at timestamptz default now()
);
create table public.service_request_quotes (
  request_id uuid primary key,contractor_id uuid,amount_cents integer,scope text,status text
);
alter table public.service_requests add column title text default '', add column description text default '',
  add column closing_summary text default '', add column updated_at timestamptz default now();
grant select,insert on public.service_request_messages to authenticated;
alter table public.service_request_messages enable row level security;
create policy fixture_request_message_select on public.service_request_messages for select to authenticated using (true);
create policy fixture_request_message_insert on public.service_request_messages for insert to authenticated with check (actor_user_id=auth.uid());
create table public.contractor_team_members (contractor_id uuid,user_id uuid,status text,role text);
create function public.current_user_can_access_contractor(uuid) returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.contractor_profiles cp where cp.id=$1 and cp.owner_user_id=auth.uid())
  or exists(select 1 from public.contractor_team_members tm where tm.contractor_id=$1 and tm.user_id=auth.uid() and tm.status='active')$$;
create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
set check_function_bodies = off;
\ir ../../servsync-media-attachments.sql
\ir ../../servsync-contractor-media.sql
set check_function_bodies = on;
\ir ../../servsync-fb025-workflow-communication-foundation.sql
\ir ../../servsync-fb021-scheduling-foundation.sql

\ir ../../servsync-discover.sql
\ir ../../servsync-discover-analytics.sql
\ir ../../servsync-review-public-display-pause.sql

insert into public.profiles values
 ('10000000-0000-0000-0000-000000000001','contractor'),
 ('10000000-0000-0000-0000-000000000002','homeowner'),
 ('10000000-0000-0000-0000-000000000003','homeowner'),
 ('10000000-0000-0000-0000-000000000004','platform_admin'),
 ('10000000-0000-0000-0000-000000000005','contractor');
insert into public.contractor_profiles(id,owner_user_id,public_profile_enabled,account_status,slug,business_name) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,'active','synthetic','Synthetic Example'),
 ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005',true,'active','synthetic-other','Synthetic Other');
insert into public.contractor_posts(id,contractor_id,title,photos) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Legacy sample',array['https://example.test/legacy.png']);
insert into public.homeowner_contractor_connections values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','active');
insert into public.service_requests values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','closed'),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','open'),
 ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','open');
insert into public.service_request_appointments(request_id,contractor_id,proposed_at,notes,status,proposed_by)
values ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','2040-01-01 12:00+00','Original meeting note','confirmed','contractor');
insert into public.service_request_messages(request_id,actor_role,message_type,body)
values ('50000000-0000-0000-0000-000000000002','homeowner','homeowner_reply','Prior request reply');
insert into public.contractor_visit_events values
 ('80000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',false,'Existing internal note');
insert into storage.buckets (id,name,public,file_size_limit) values ('other-test','other-test',false,100);
insert into storage.objects values ('other-test','independent.txt');
insert into storage.objects values ('service-request-media','10000000-0000-0000-0000-000000000002/50000000-0000-0000-0000-000000000002/prior.jpg');
insert into auth.users select id from public.profiles;
insert into public.inspections values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001');
insert into public.contractor_team_members values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','active','office');
insert into public.invoices values
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
\ir ../../servsync-discover-safety-candidate.sql

create function public.expect(ok boolean,msg text) returns void language plpgsql
as $$begin if ok is distinct from true then raise exception 'Failed: %',msg; end if; end$$;
select public.expect((select not public and file_size_limit=8388608 from storage.buckets where id='discover-media'), 'Discover bucket private with 8 MiB file cap');
select public.expect((select count(*) = 1 from pg_proc where proname='servsync_discover_feed' and pronamespace='public'::regnamespace), 'legacy feeds absent');

\set owner '10000000-0000-0000-0000-000000000001'
\set home '10000000-0000-0000-0000-000000000002'
\set other '10000000-0000-0000-0000-000000000003'
\set operator '10000000-0000-0000-0000-000000000004'
\set contractor '20000000-0000-0000-0000-000000000001'
\set media '10000000-0000-0000-0000-000000000001/posts/90000000-0000-0000-0000-000000000001.png'

set role authenticated;
select set_config('request.jwt.claim.sub',:'owner',false);
insert into storage.objects values ('discover-media',:'media');
select (public.servsync_create_contractor_post('Plumbing','Fictional item','Example',array[:'media'])->>'post_id')::uuid as post_id \gset
select set_config('fixture.post_id', :'post_id',false);
select public.expect((select count(*)=2 from public.servsync_my_discover_post_statuses() where moderation_status='pending'),'author sees new and legacy pending');
select public.expect((select count(*)=0 from public.servsync_discover_feed()), 'owner does not see pending public feed');
do $$
begin
  begin
    insert into public.contractor_posts(contractor_id,title,moderation_status) values ('20000000-0000-0000-0000-000000000001','Bypass','approved');
    raise exception 'Direct approval insert accepted.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.servsync_create_contractor_post('','Foreign URL','',array['https://example.test/not-allowed.png']);
    raise exception 'External photo accepted.';
  exception when invalid_parameter_value then null; end;
end$$;
with changed as (update storage.objects set name = 'other.png' where bucket_id='discover-media' returning 1)
select public.expect(not exists(select from changed),'immutable media');
with deleted as (delete from storage.objects where bucket_id='discover-media' returning 1)
select public.expect(not exists(select from deleted),'no deleting referenced media');

select set_config('request.jwt.claim.sub',:'home',false);
select public.expect((select count(*)=0 from public.contractor_posts),'pending hidden from authenticated table');
select public.expect(not public.servsync_workflow_job_messaging_paused('60000000-0000-0000-0000-000000000001'), 'unblocked job composer enabled');
select public.expect((public.servsync_send_workflow_message('job','Prior job message',null,'60000000-0000-0000-0000-000000000001')).body = 'Prior job message','real send RPC works before blocking');
select public.expect((select count(*)=0 from storage.objects where bucket_id='discover-media'),'generic storage policy does not expose pending');
do $$
begin
  begin
    perform public.servsync_list_discover_safety_queue();
    raise exception 'Unauthorized moderation read.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.servsync_report_discover_post(current_setting('fixture.post_id')::uuid,'privacy');
    raise exception 'Guessed pending post accepted.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.servsync_decide_discover_safety_item(current_setting('fixture.post_id')::uuid,'post','approve','Rejected permission');
    raise exception 'Non-operator decision.';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set role='platform_admin' where id=auth.uid();
    raise exception 'Non-operator promoted through client profile update.';
  exception when insufficient_privilege then null; end;
end$$;

select set_config('request.jwt.claim.sub',:'operator',false);
select public.expect((select count(*)=2 from public.servsync_list_discover_safety_queue()),'human review queue');
select public.expect((select count(*)=1 from storage.objects where bucket_id='discover-media'),'operator can review pending media');
do $$
begin
  begin
    perform public.servsync_decide_discover_safety_item('30000000-0000-0000-0000-000000000001','post','approve','Legacy');
    raise exception 'Uncontrolled legacy photo was approved.';
  exception when invalid_parameter_value then null; end;
end$$;
select public.expect(public.servsync_decide_discover_safety_item(:'post_id','post','approve','Fictional fixture verified'),'operator approval');
select public.expect(not public.servsync_decide_discover_safety_item(:'post_id','post','reject','Double decision'),'review applied only once');

set role anon;
select set_config('request.jwt.claim.sub','',false);
select public.expect((select count(*)=1 from public.servsync_discover_feed() where cardinality(photos)=0),'signed-out feed has approved copy but no media keys');
select public.expect((select count(*)=0 from storage.objects where bucket_id='discover-media'),'signed-out storage remains private');
select public.expect((select count(*)=1 from storage.objects where bucket_id='other-test'),'unrelated storage still accessible under example policy');

set role authenticated;
select set_config('request.jwt.claim.sub',:'home',false);
select public.expect((select count(*)=1 from storage.objects where bucket_id='discover-media'),'approved media visible to entitled viewer');
select public.expect(public.servsync_toggle_discover_post_save(:'post_id'),'approved post is saveable');
select public.expect((select count(*)=1 from public.servsync_discover_saved_posts()),'approved post appears in saved');
select public.servsync_record_discover_post_view(:'post_id');
select public.servsync_report_discover_post(:'post_id','privacy') as report_id \gset
select public.expect(public.servsync_report_discover_post(:'post_id','other')=:'report_id','one durable report per person/post');
select public.expect(cardinality(public.servsync_list_blocked_discover_contractor_ids())=0,'no exclusion before block');
select public.expect(public.servsync_block_discover_contractor(:'contractor'),'block created');
select public.expect(public.servsync_list_blocked_discover_contractor_ids()=array[:'contractor'::uuid],'caller-only blocked contractor IDs for Requests');
select public.expect(public.servsync_block_discover_contractor(:'contractor'),'block idempotent');
select public.expect((select count(*)=0 from public.servsync_discover_feed()),'blocked public feed');
select public.expect(public.servsync_get_public_contractor_profile('synthetic') is null,'blocked direct profile');
select public.expect((select count(*)=0 from public.servsync_public_contractor_directory(null,null) where slug='synthetic'),'blocked directory');
select public.expect((select count(*)=0 from public.servsync_discover_saved_posts()),'blocked saved row');
select public.expect((select count(*)=0 from public.contractor_posts),'blocked direct targeted row');
select public.expect((select count(*)=0 from storage.objects where bucket_id='discover-media'),'blocked media storage');
do $$
begin
  begin
    insert into public.homeowner_contractor_connections(homeowner_user_id,contractor_id,status)
      values(auth.uid(),'20000000-0000-0000-0000-000000000001','pending');
    raise exception 'Blocked connection accepted.';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.service_requests(homeowner_user_id,contractor_id,status)
      values(auth.uid(),'20000000-0000-0000-0000-000000000001','open');
    raise exception 'Blocked service request accepted.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.servsync_toggle_discover_post_save(current_setting('fixture.post_id')::uuid);
    raise exception 'Blocked post accepted by save.';
  exception when others then
    if sqlerrm <> 'This update is not available to save.' then raise; end if;
  end;
end$$;
select public.expect((select status='active' from public.homeowner_contractor_connections where id='40000000-0000-0000-0000-000000000001'),'existing connection unchanged');
select public.expect((select status='closed' from public.service_requests where id='50000000-0000-0000-0000-000000000001'),'existing request unchanged');

select set_config('request.jwt.claim.sub',:'other',false);
select public.expect(cardinality(public.servsync_list_blocked_discover_contractor_ids())=0,'unrelated homeowner cannot see another account’s block list');
select public.expect((select count(*)=1 from public.servsync_discover_feed()),'unrelated viewer still sees post');
select public.expect((select count(*)=1 from storage.objects where bucket_id='discover-media'),'unrelated viewer still sees approved media');

select set_config('request.jwt.claim.sub',:'operator',false);
select public.expect((select count(*)=1 from public.servsync_list_discover_safety_queue() where id=:'report_id' and kind='report' and reason='privacy'),'operator sees durable report evidence');
select public.expect(public.servsync_decide_discover_safety_item(:'report_id','report','remove','Synthetic removal'),'report removal reviewed');
select public.expect((select count(*)=2 from public.servsync_list_discover_safety_audit()),'decisions audited');

select set_config('request.jwt.claim.sub',:'other',false);
select public.expect((select count(*)=0 from public.servsync_discover_feed()),'removed hidden from all');
select public.expect((select count(*)=0 from storage.objects where bucket_id='discover-media'),'removed not signable');
select set_config('request.jwt.claim.sub',:'owner',false);
select public.servsync_delete_contractor_post(:'post_id');
select public.expect((select count(*)=1 from public.servsync_my_discover_post_statuses()),'withdrawal still works');
select set_config('request.jwt.claim.sub',:'operator',false);
select public.expect((select count(*)=1 from storage.objects where bucket_id='discover-media'),'only operators can still review the private evidence following withdrawal');
reset role;
select public.expect((select count(*)=1 from discover_safety_private.reports where id=:'report_id'),'evidence outlives withdrawal');
-- Exercise the real workflow send and read RPCs with both blocked parties.
set role authenticated;
select set_config('request.jwt.claim.sub',:'home',false);
select public.expect(public.servsync_workflow_job_messaging_paused('60000000-0000-0000-0000-000000000001'),'homeowner sees paused job');
select public.expect((select count(*)=1 from public.workflow_messages where body='Prior job message'),'homeowner retains prior job message');
select public.expect((public.servsync_mark_workflow_thread_read('job',null,'60000000-0000-0000-0000-000000000001')).id is not null,'homeowner read marker still works');
do $$
begin
  begin
    perform public.servsync_send_workflow_message('job','New fictional message',null,'60000000-0000-0000-0000-000000000001');
    raise exception 'Homeowner message must be denied';
  exception when sqlstate 'PSS01' then null; end;
  begin
    perform public.servsync_workflow_job_messaging_paused('60000000-0000-0000-0000-000000000002');
    raise exception 'Unrelated job state must not be disclosed';
  exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub',:'owner',false);
select public.expect(public.servsync_workflow_job_messaging_paused('60000000-0000-0000-0000-000000000001'),'contractor sees paused job');
select public.expect((select count(*)=1 from public.workflow_messages where body='Prior job message'),'contractor retains prior job message');
do $$
begin
  begin
    perform public.servsync_send_workflow_message('job','New fictional message',null,'60000000-0000-0000-0000-000000000001');
    raise exception 'Contractor message must be denied';
  exception when sqlstate 'PSS01' then null; end;
  begin
    perform public.servsync_send_workflow_message('service_request','New fictional message','50000000-0000-0000-0000-000000000001',null);
    raise exception 'Workflow service request message must be denied';
  exception when sqlstate 'PSS01' then null; end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',false);
do $$
begin
  begin
    perform public.servsync_send_workflow_message('job','New fictional office message',null,'60000000-0000-0000-0000-000000000001');
    raise exception 'Office sender must respect the contractor pause';
  exception when sqlstate 'PSS01' then null; end;
end$$;
select set_config('request.jwt.claim.sub',:'other',false);
select public.expect(not public.servsync_workflow_job_messaging_paused('60000000-0000-0000-0000-000000000002'),'unrelated job not paused');
select public.expect((public.servsync_send_workflow_message('job','Other job remains open',null,'60000000-0000-0000-0000-000000000002')).id is not null,'unrelated participant can still send');
reset role;
select public.expect((select count(*)=1 from public.invoices),'invoice record unchanged');
select public.expect((select count(*)=1 from public.workflow_activity_events where inspection_id='60000000-0000-0000-0000-000000000001'),'blocked attempts did not create notifications or activity');

select public.expect((public.servsync_append_workflow_activity_event(
  'invoice','invoice_sent',p_inspection_id=>'60000000-0000-0000-0000-000000000001',
  p_invoice_id=>'70000000-0000-0000-0000-000000000001')).event_type='invoice_sent',
  'a structured invoice event can still be recorded with no message body');
-- Real request and scheduling RPCs, including stale clients supplying text.
set role authenticated;
select set_config('request.jwt.claim.sub',:'home',false);
select public.expect(public.servsync_paused_request_messaging(array[
  '50000000-0000-0000-0000-000000000002'::uuid,'50000000-0000-0000-0000-000000000003'::uuid]) =
  array['50000000-0000-0000-0000-000000000002'::uuid], 'only accessible, blocked requests are returned');
do $$
begin
  begin
    perform public.servsync_homeowner_update_service_request('50000000-0000-0000-0000-000000000002','Fictional reply','reply');
    raise exception 'Homeowner request reply must be denied';
  exception when sqlstate 'PSS01' then null; end;
  begin
    insert into public.service_request_media(request_id,uploader_user_id,storage_path)
    values ('50000000-0000-0000-0000-000000000002',auth.uid(),'fictional.jpg');
    raise exception 'Reply attachment record must be denied';
  exception when sqlstate 'PSS01' then null; end;
  begin
    insert into public.service_request_messages(request_id,actor_user_id,actor_role,message_type,body)
    values ('50000000-0000-0000-0000-000000000002',auth.uid(),'contractor','contractor_closed','Not an actual close');
    raise exception 'Direct table writes cannot impersonate a lifecycle notice';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.service_request_messages(request_id,actor_user_id,actor_role,message_type,body)
    values ('50000000-0000-0000-0000-000000000002',auth.uid(),'homeowner','message','Fictional direct reply');
    raise exception 'Direct table writes cannot relay text';
  exception when sqlstate 'PSS01' then null; end;
  begin
    insert into storage.objects values
      ('service-request-media','10000000-0000-0000-0000-000000000002/50000000-0000-0000-0000-000000000002/new.jpg');
    raise exception 'Reply storage upload must be denied';
  exception when insufficient_privilege then null; end;
end$$;
select public.expect((select count(*)=1 from storage.objects where name like '%/prior.jpg'),'prior upload remains readable');
select set_config('request.jwt.claim.sub',:'owner',false);
do $$
begin
  begin
    perform public.servsync_contractor_update_service_request('50000000-0000-0000-0000-000000000002','Fictional reply','contractor_responded');
    raise exception 'Contractor request reply must be denied';
  exception when sqlstate 'PSS01' then null; end;
end$$;
select public.expect((public.servsync_reschedule_service_request_appointment(
  '50000000-0000-0000-0000-000000000002',
  '[{"starts_at":"2099-01-05T12:00:00Z","ends_at":"2099-01-05T13:00:00Z","note":"Fictional replacement note"}]',
  'Fictional reschedule reason'))->>'status'='reschedule_proposed', 'contractor can offer a replacement visit');
select id as new_window from public.service_request_appointment_windows where request_id='50000000-0000-0000-0000-000000000002' and status='proposed' \gset
select set_config('request.jwt.claim.sub',:'home',false);
select public.expect((public.servsync_accept_service_request_appointment_window(:'new_window'))->>'status'='confirmed','homeowner can confirm replacement time');
select set_config('request.jwt.claim.sub',:'owner',false);
select public.expect((public.servsync_cancel_service_request_appointment(
  '50000000-0000-0000-0000-000000000002','Fictional cancel reason'))->>'status'='cancelled','contractor can cancel confirmed visit');
select public.expect((public.servsync_contractor_update_service_request(
  '50000000-0000-0000-0000-000000000002','Fictional close message','closed',null,null,'Fictional closing note'))->>'status'='closed','contractor can close the request');
reset role;
select public.expect((select count(*)=2 from public.service_request_messages where request_id='50000000-0000-0000-0000-000000000002' and body in ('Prior request reply','Contractor closed this request.')),'prior reply and fixed closure notice survive');
select public.expect((select count(*)=1 from public.service_requests where id='50000000-0000-0000-0000-000000000002' and status='closed' and closing_summary=''),'closing summary did not relay text');
select public.expect((select count(*)=1 from public.service_request_appointments where request_id='50000000-0000-0000-0000-000000000002' and status='cancelled' and notes='Original meeting note'),'prior meeting note survives appointment updates');
select public.expect(not exists(select 1 from public.service_request_appointment_windows where contractor_note <> '' or homeowner_response_note <> ''),'replacement notes not shared');
select public.expect(not exists(select 1 from public.service_request_appointment_events where event_note <> ''),'event notes are not relayed');
update public.contractor_visit_events set notes='Updated internal note';
select public.expect((select notes='Updated internal note' from public.contractor_visit_events),'private visit notes remain editable');
update public.contractor_visit_events set share_with_homeowner=true;
select public.expect((select notes='' and share_with_homeowner from public.contractor_visit_events),'a previously private note is not shared');
set role authenticated;
select set_config('request.jwt.claim.sub',:'other',false);
select public.expect((public.servsync_homeowner_update_service_request(
  '50000000-0000-0000-0000-000000000003','Unrelated reply continues to work','reply'))->>'status'='homeowner_replied','unblocked reply unaffected');
reset role;

-- Targeted two-role job safety checks, against the actual candidate RPCs.
\ir ../../servsync-job-thread-safety-candidate.sql
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner',false);
select public.expect((public.servsync_job_safety_permissions('60000000-0000-0000-0000-000000000002')->>'can_block')::boolean,'contractor owner can block');
select (public.servsync_send_workflow_message('job','Fictional contractor reply',null,'60000000-0000-0000-0000-000000000002')).id as contractor_note \gset
select set_config('fixture.contractor_note',:'contractor_note',false);
select id as homeowner_note from public.workflow_messages where inspection_id='60000000-0000-0000-0000-000000000002' and sender_role='homeowner' limit 1 \gset
select public.servsync_report_job_message('60000000-0000-0000-0000-000000000002',:'homeowner_note','harassment') as pro_report \gset
select public.expect(public.servsync_report_job_message('60000000-0000-0000-0000-000000000002',:'homeowner_note','other')=:'pro_report'::uuid,'second report returns the same receipt');
do $$
begin
 begin
   perform public.servsync_report_job_message('60000000-0000-0000-0000-000000000002',current_setting('fixture.contractor_note')::uuid,'spam');
   raise exception 'Own message incorrectly reportable.';
 exception when insufficient_privilege then null; end;
 begin
   perform public.servsync_list_job_message_reports();
   raise exception 'Contractor saw moderation evidence.';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',:'other',false);
select public.expect((public.servsync_job_safety_permissions('60000000-0000-0000-0000-000000000002')->>'can_block')::boolean,'homeowner can block');
select public.servsync_report_job_message('60000000-0000-0000-0000-000000000002',:'contractor_note','privacy') as home_report \gset
select set_config('request.jwt.claim.sub',:'home',false);
select public.expect(not (public.servsync_job_safety_permissions('60000000-0000-0000-0000-000000000002')->>'can_report')::boolean,'unrelated homeowner cannot report');
do $$
begin
 begin
   perform public.servsync_report_job_message('60000000-0000-0000-0000-000000000002',current_setting('fixture.contractor_note')::uuid,'privacy');
   raise exception 'Unrelated homeowner reported a private message.';
 exception when insufficient_privilege then null; end;
 begin
   perform public.servsync_block_job_counterparty('60000000-0000-0000-0000-000000000002');
   raise exception 'Unrelated homeowner blocked this job.';
 exception when insufficient_privilege then null; end;
end $$;
select public.expect(public.servsync_block_job_counterparty('60000000-0000-0000-0000-000000000001'),'homeowner block is idempotent');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',false);
select public.expect((public.servsync_job_safety_permissions('60000000-0000-0000-0000-000000000002')->>'can_report')::boolean,'office role can report');
select public.expect(not (public.servsync_job_safety_permissions('60000000-0000-0000-0000-000000000002')->>'can_block')::boolean,'office role cannot block on behalf of the business');
select set_config('request.jwt.claim.sub',:'owner',false);
select public.expect(public.servsync_block_job_counterparty('60000000-0000-0000-0000-000000000002'),'contractor can block existing job counterparty');
select set_config('request.jwt.claim.sub',:'other',false);
select public.expect(public.servsync_workflow_job_messaging_paused('60000000-0000-0000-0000-000000000002'),'new sends paused for the homeowner after contractor block');
select public.expect((select count(*)=2 from public.workflow_messages where inspection_id='60000000-0000-0000-0000-000000000002'),'both original messages preserved');
select set_config('request.jwt.claim.sub',:'operator',false);
select public.expect((select count(*)=2 from public.servsync_list_job_message_reports()),'operator sees reports from both roles');
select public.expect(public.servsync_review_job_message_report(:'home_report'),'operator closes one report');
select public.expect((select count(*)=1 from public.servsync_list_job_message_reports()),'closed report leaves queue');
reset role;
select public.expect((select evidence='' from discover_safety_private.job_message_reports where id=:'home_report'),'reviewed copy cleared');

delete from public.profiles where id=:'home';
select public.expect((select count(*)=1 from discover_safety_private.reports where id=:'report_id' and reporter_id is null),'profile removal de-links the reporter without deleting private case evidence');
select 'Discover candidate SQL passed on synthetic local roles and storage.' as result;
