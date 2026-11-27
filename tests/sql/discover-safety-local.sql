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
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','closed');
insert into storage.buckets (id,name,public,file_size_limit) values ('other-test','other-test',false,100);
insert into storage.objects values ('other-test','independent.txt');
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
delete from public.profiles where id=:'home';
select public.expect((select count(*)=1 from discover_safety_private.reports where id=:'report_id' and reporter_id is null),'profile removal de-links the reporter without deleting private case evidence');
select 'Discover candidate SQL passed on synthetic local roles and storage.' as result;
