\pset pager off

select
  'table: profiles' as check_name,
  to_regclass('public.profiles') is not null as ok;

select
  'table: contractor_profiles' as check_name,
  to_regclass('public.contractor_profiles') is not null as ok;

select
  'table: homeowner_profiles' as check_name,
  to_regclass('public.homeowner_profiles') is not null as ok;

select
  'table: contractor_connection_alerts' as check_name,
  to_regclass('public.contractor_connection_alerts') is not null as ok;

select
  'table: referrals' as check_name,
  to_regclass('public.referrals') is not null as ok;

select
  'table: support_inquiries' as check_name,
  to_regclass('public.support_inquiries') is not null as ok;

select
  'table: contractor_service_areas' as check_name,
  to_regclass('public.contractor_service_areas') is not null as ok;

select
  'table: geocoded_locations' as check_name,
  to_regclass('public.geocoded_locations') is not null as ok;

select
  'rpc: servsync_admin_contractor_adoption' as check_name,
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'servsync_admin_contractor_adoption'
  ) as ok;

select
  'rpc: servsync_finalize_field_work' as check_name,
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'servsync_finalize_field_work'
  ) as ok;

select
  'rpc: servsync_discover_feed' as check_name,
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'servsync_discover_feed'
  ) as ok;

select
  'bucket: contractor-assets' as check_name,
  exists (select 1 from storage.buckets where id = 'contractor-assets' and public = true) as ok;

select
  'bucket: discover-media' as check_name,
  exists (select 1 from storage.buckets where id = 'discover-media' and public = true) as ok;

select
  'bucket: home-documents' as check_name,
  exists (select 1 from storage.buckets where id = 'home-documents' and public = false) as ok;

select
  'bucket: service-request-media' as check_name,
  exists (select 1 from storage.buckets where id = 'service-request-media' and public = false) as ok;

select
  'bucket: inspection-media' as check_name,
  exists (select 1 from storage.buckets where id = 'inspection-media' and public = false) as ok;

select
  'bucket: support-attachments' as check_name,
  exists (select 1 from storage.buckets where id = 'support-attachments' and public = false) as ok;

select 'data: auth.users empty' as check_name, (select count(*) from auth.users) = 0 as ok, (select count(*) from auth.users) as row_count;
select 'data: profiles empty' as check_name, (select count(*) from public.profiles) = 0 as ok, (select count(*) from public.profiles) as row_count;
select 'data: contractor_profiles empty' as check_name, (select count(*) from public.contractor_profiles) = 0 as ok, (select count(*) from public.contractor_profiles) as row_count;
select 'data: homeowner_profiles empty' as check_name, (select count(*) from public.homeowner_profiles) = 0 as ok, (select count(*) from public.homeowner_profiles) as row_count;
select 'data: homes empty' as check_name, (select count(*) from public.homes) = 0 as ok, (select count(*) from public.homes) as row_count;
select 'data: inspections empty' as check_name, (select count(*) from public.inspections) = 0 as ok, (select count(*) from public.inspections) as row_count;
select 'data: estimates empty' as check_name, (select count(*) from public.estimates) = 0 as ok, (select count(*) from public.estimates) as row_count;
select 'data: invoices empty' as check_name, (select count(*) from public.invoices) = 0 as ok, (select count(*) from public.invoices) as row_count;
select 'data: contractor_posts empty' as check_name, (select count(*) from public.contractor_posts) = 0 as ok, (select count(*) from public.contractor_posts) as row_count;
select 'data: referrals empty' as check_name, (select count(*) from public.referrals) = 0 as ok, (select count(*) from public.referrals) as row_count;
select 'data: support_inquiries empty' as check_name, (select count(*) from public.support_inquiries) = 0 as ok, (select count(*) from public.support_inquiries) as row_count;
select 'data: contractor_connection_alerts empty' as check_name, (select count(*) from public.contractor_connection_alerts) = 0 as ok, (select count(*) from public.contractor_connection_alerts) as row_count;
