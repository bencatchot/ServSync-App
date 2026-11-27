-- CANDIDATE: run only with the matching application on an isolated Preview database.
-- Apply after servsync-review-public-display-pause.sql, Discover media patches,
-- connection/service-request and workflow message foundations, appointment windows,
-- unified visits, service-request media, and the public-signup role hardening.
-- No backfill publishes an existing post.
-- Existing rows stay intact and pending. Legacy URL photos require withdrawal and
-- resubmission using fresh private keys; do not re-publish or sign those old URLs.
-- Remove/purge historical public objects and caches separately with authorization;
-- migrating bucket privacy cannot undo prior copies or cached public responses.
-- Release checklist: inventory discover-media objects and private report/audit
-- evidence with the account/file-deletion operator. Auth deletion cascades to
-- profiles, dropping blocks and de-linking the reporter; it does not remove
-- physical storage objects. Report evidence and decision retention/deletion
-- must follow the account-closure policy, not an indefinite keep-by-default rule.
-- Never purge evidence, deploy these triggers, or apply hosting settings as
-- part of reviewing this candidate script.
begin;

-- The operator gate must not depend on a role that clients can self-assign.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'servsync_profiles_self_service_role_guard'
      and t.tgenabled in ('O','A')
  ) then
    raise exception 'Apply the public signup role-hardening prerequisite before Discover safety.';
  end if;
end;
$$;

create schema if not exists discover_safety_private;
revoke all on schema discover_safety_private from public, anon, authenticated;

alter table public.contractor_posts
  add column moderation_status text not null default 'pending'
  check (moderation_status in ('pending','approved','rejected','removed'));
create index discover_posts_state_idx
  on public.contractor_posts (moderation_status, created_at);
create index discover_posts_media_idx on public.contractor_posts using gin (photos);

create table discover_safety_private.blocks (
  homeowner_id uuid not null references public.profiles(id) on delete cascade,
  contractor_owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (homeowner_id, contractor_owner_id),
  check (homeowner_id <> contractor_owner_id)
);
create index discover_blocks_reverse_idx
  on discover_safety_private.blocks (contractor_owner_id, homeowner_id);

create table discover_safety_private.reports (
  id uuid primary key default gen_random_uuid(),
  -- Keep evidence even when the author deletes the post.
  post_id uuid not null,
  reporter_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null,
  photos text[] not null,
  reason text not null check (reason in ('spam','inappropriate','harassment','privacy','other')),
  status text not null default 'pending' check (status in ('pending','dismissed','removed')),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);
create index discover_reports_queue_idx
  on discover_safety_private.reports (status, created_at);
create index discover_reports_photos_idx on discover_safety_private.reports using gin (photos);

create table discover_safety_private.audit (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  post_id uuid not null,
  kind text not null,
  decision text not null,
  reason text not null,
  operator_id uuid not null,
  created_at timestamptz not null default now()
);
alter table discover_safety_private.blocks enable row level security;
alter table discover_safety_private.reports enable row level security;
alter table discover_safety_private.audit enable row level security;
revoke all on all tables in schema discover_safety_private from public, anon, authenticated, service_role;

create function discover_safety_private.is_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from discover_safety_private.blocks b
    where (b.homeowner_id = p_a and b.contractor_owner_id = p_b)
       or (b.homeowner_id = p_b and b.contractor_owner_id = p_a));
$$;

create function discover_safety_private.post_is_public(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.contractor_posts p
    join public.contractor_profiles cp on cp.id = p.contractor_id
    where p.id = p_id and p.moderation_status = 'approved'
      and cp.public_profile_enabled and cp.account_status = 'active'
      and not discover_safety_private.is_blocked(auth.uid(), cp.owner_user_id));
$$;

create function discover_safety_private.key_is_valid(p_name text, p_owner uuid)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(p_name ~ ('^' || p_owner::text ||
    '/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'), false);
$$;

create function discover_safety_private.lock_pair(p_a uuid,p_b uuid)
returns void language sql volatile set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'servsync-discover:' || least(p_a,p_b)::text || ':' || greatest(p_a,p_b)::text,0));
$$;

create function discover_safety_private.can_read_post(p_id uuid, p_contractor uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.contractor_profiles cp
      where cp.id = p_contractor and cp.owner_user_id = auth.uid())
    or discover_safety_private.post_is_public(p_id));
$$;

revoke all on all functions in schema discover_safety_private from public, anon, authenticated, service_role;
-- Function OIDs are bound by RLS at DDL time; no private schema USAGE granted.
grant execute on function discover_safety_private.can_read_post(uuid,uuid) to authenticated;

revoke all on public.contractor_posts from public, anon, authenticated;
-- Owner visibility is allowed, but direct client mutations are never allowed.
grant select on public.contractor_posts to authenticated;
drop policy if exists posts_select_authenticated on public.contractor_posts;
drop policy if exists posts_insert_own_contractor on public.contractor_posts;
drop policy if exists posts_delete_own_contractor on public.contractor_posts;
create policy discover_post_safety_read_guard on public.contractor_posts
  as restrictive for select to authenticated using (discover_safety_private.can_read_post(id, contractor_id));
create policy posts_select_authenticated on public.contractor_posts
  for select to authenticated using (true);

update storage.buckets
  set public = false, file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
  where id = 'discover-media';

create function discover_safety_private.may_manage_media(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select discover_safety_private.key_is_valid(p_name,auth.uid())
    and exists (select 1 from public.contractor_profiles cp
      where cp.owner_user_id = auth.uid() and cp.account_status = 'active');
$$;

create function discover_safety_private.can_read_media(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    discover_safety_private.may_manage_media(p_name)
    or exists (
      select 1 from public.contractor_posts p
      join public.contractor_profiles cp on cp.id = p.contractor_id
      where p.photos @> array[p_name]
        and discover_safety_private.key_is_valid(p_name,cp.owner_user_id)
        and (discover_safety_private.post_is_public(p.id) or public.current_user_is_platform_admin())
    )
    or (
      public.current_user_is_platform_admin() and exists (
        select 1 from discover_safety_private.reports r where r.photos @> array[p_name]
      )
    )
  );
$$;

create function discover_safety_private.media_is_unreferenced(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.contractor_posts p where p.photos @> array[p_name])
    and not exists (select 1 from discover_safety_private.reports r where r.photos @> array[p_name]);
$$;

revoke all on function discover_safety_private.may_manage_media(text),discover_safety_private.can_read_media(text),
  discover_safety_private.media_is_unreferenced(text) from public, anon, authenticated, service_role;
grant execute on function discover_safety_private.may_manage_media(text),discover_safety_private.can_read_media(text),
  discover_safety_private.media_is_unreferenced(text) to authenticated;

drop policy if exists discover_media_upload_contractor on storage.objects;
drop policy if exists discover_media_update_own_folder on storage.objects;
drop policy if exists discover_media_delete_own_folder on storage.objects;
-- Restrictive guards stop any existing/later generic storage policy from granting
-- access to this bucket. They leave unrelated bucket policies untouched.
create policy discover_media_safety_anon_read_guard on storage.objects
  as restrictive for select to anon using (bucket_id <> 'discover-media');
create policy discover_media_safety_read_guard on storage.objects
  as restrictive for select to authenticated using (
    bucket_id <> 'discover-media' or discover_safety_private.can_read_media(name));
create policy discover_media_safety_read on storage.objects
  for select to authenticated using (
    bucket_id = 'discover-media' and discover_safety_private.can_read_media(name));
create policy discover_media_safety_insert_guard on storage.objects
  as restrictive for insert to authenticated with check (
    bucket_id <> 'discover-media' or (discover_safety_private.may_manage_media(name)
      and discover_safety_private.media_is_unreferenced(name)));
create policy discover_media_upload_contractor on storage.objects
  for insert to authenticated with check (
    bucket_id = 'discover-media' and discover_safety_private.may_manage_media(name)
      and discover_safety_private.media_is_unreferenced(name));
create policy discover_media_safety_update_guard on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id <> 'discover-media') with check (bucket_id <> 'discover-media');
create policy discover_media_safety_anon_insert_guard on storage.objects
  as restrictive for insert to anon with check (bucket_id <> 'discover-media');
create policy discover_media_safety_anon_delete_guard on storage.objects
  as restrictive for delete to anon using (bucket_id <> 'discover-media');
create policy discover_media_safety_delete_guard on storage.objects
  as restrictive for delete to authenticated using (
    bucket_id <> 'discover-media' or (discover_safety_private.may_manage_media(name)
      and discover_safety_private.media_is_unreferenced(name)));
create policy discover_media_delete_own_folder on storage.objects
  for delete to authenticated using (
    bucket_id = 'discover-media' and discover_safety_private.may_manage_media(name)
      and discover_safety_private.media_is_unreferenced(name));

create function discover_safety_private.valid_post_media(p_photos text[], p_owner uuid)
returns boolean language sql stable set search_path = ''
as $$
  select cardinality(p_photos) <= 6
     and not exists (select 1 from unnest(p_photos) as x(name)
       where not discover_safety_private.key_is_valid(x.name,p_owner)
       or not exists (select 1 from storage.objects o
         where o.bucket_id = 'discover-media' and o.name = x.name));
$$;

create or replace function public.servsync_create_contractor_post(
  p_category text, p_title text, p_description text default '', p_photos text[] default '{}',
  p_city text default '', p_state text default ''
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid := auth.uid();
  v_photos text[] := coalesce(p_photos,'{}');
  v_contractor uuid;
begin
  select cp.id into v_contractor from public.contractor_profiles cp
    where cp.owner_user_id = v_owner and cp.account_status = 'active'
    order by cp.id limit 1;
  if v_contractor is null then
    raise exception 'Active contractor profile not found.' using errcode = '42501';
  end if;
  if nullif(trim(p_title),'') is null or length(trim(p_title)) > 160
      or length(coalesce(p_description,'')) > 6000 then
    raise exception 'Check your title and description lengths.' using errcode = '22023';
  end if;
  if not discover_safety_private.valid_post_media(v_photos,v_owner) then
    raise exception 'Attach up to six private JPG, PNG or WebP Discover images.' using errcode = '22023';
  end if;
  insert into public.contractor_posts (contractor_id,category,title,description,photos,city,state)
    values (v_contractor, left(trim(coalesce(p_category,'')),160), trim(p_title),
      trim(coalesce(p_description,'')), v_photos, left(trim(coalesce(p_city,'')),160),
      left(trim(coalesce(p_state,'')),100))
    returning id into v_id;
  return jsonb_build_object('post_id',v_id,'moderation_status','pending');
end;
$$;

create or replace function public.servsync_delete_contractor_post(p_post_id uuid)
returns void language sql security definer set search_path = ''
as $$
  delete from public.contractor_posts p using public.contractor_profiles cp
    where p.id = p_post_id and cp.id = p.contractor_id and cp.owner_user_id = auth.uid();
$$;

create function public.servsync_my_discover_post_statuses()
returns table(post_id uuid,moderation_status text)
language sql stable security definer set search_path = ''
as $$
  select p.id,p.moderation_status from public.contractor_posts p
    join public.contractor_profiles cp on cp.id = p.contractor_id
    where cp.owner_user_id = auth.uid();
$$;

create function public.servsync_report_discover_post(p_post_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_reason text := lower(trim(p_reason));
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.profiles where id = v_actor) then
    raise exception 'Sign in to report this update.' using errcode = '42501';
  end if;
  if v_reason is null or v_reason not in ('spam','inappropriate','harassment','privacy','other') then
    raise exception 'Choose a report reason.' using errcode = '22023';
  end if;
  insert into discover_safety_private.reports (post_id,reporter_id,title,description,photos,reason)
  select p.id,v_actor,p.title,p.description,p.photos,v_reason
    from public.contractor_posts p
    join public.contractor_profiles cp on cp.id = p.contractor_id
    where p.id = p_post_id and cp.owner_user_id <> v_actor
      and discover_safety_private.post_is_public(p.id)
  on conflict (post_id,reporter_id) do nothing returning id into v_id;
  if v_id is null then
    select r.id into v_id from discover_safety_private.reports r
      where r.post_id = p_post_id and r.reporter_id = v_actor;
  end if;
  if v_id is null then
    raise exception 'This update is not available to report.' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

create function public.servsync_block_discover_contractor(p_contractor_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid;
begin
  if v_actor is null or public.current_user_role() is distinct from 'homeowner' then
    raise exception 'Use a homeowner account to block a contractor.' using errcode = '42501';
  end if;
  select cp.owner_user_id into v_target from public.contractor_profiles cp
    where cp.id = p_contractor_id and cp.account_status = 'active' and cp.public_profile_enabled;
  if v_target is null or v_target = v_actor then
    raise exception 'Contractor is not available.' using errcode = '42501';
  end if;
  perform discover_safety_private.lock_pair(v_actor,v_target);
  insert into discover_safety_private.blocks (homeowner_id,contractor_owner_id)
   values (v_actor,v_target) on conflict do nothing;
  return true;
end;
$$;

-- Existing relationships remain readable. This supplies the private, caller-only
-- exclusion list needed by Requests/Find Contractor's broad directory cache.
create function public.servsync_list_blocked_discover_contractor_ids()
returns uuid[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(cp.id order by cp.id),'{}'::uuid[])
    from discover_safety_private.blocks b
    join public.contractor_profiles cp on cp.owner_user_id = b.contractor_owner_id
    where b.homeowner_id = auth.uid()
      and public.current_user_role() = 'homeowner';
$$;

create function public.servsync_list_discover_safety_queue()
returns table(id uuid, kind text, post_id uuid, title text, description text,
  photos text[], reason text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_is_platform_admin(),false) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return query
  select q.* from (
    select p.id,'post'::text,p.id,p.title,p.description,
      array(select u.name from unnest(p.photos) as u(name)
        where discover_safety_private.key_is_valid(u.name,cp.owner_user_id)),
      case when discover_safety_private.valid_post_media(p.photos,cp.owner_user_id)
        then null::text else 'Private media missing or legacy URL; withdraw and resubmit'::text end,
      p.moderation_status,p.created_at
      from public.contractor_posts p join public.contractor_profiles cp on cp.id = p.contractor_id
      where p.moderation_status = 'pending'
    union all
    select r.id,'report'::text,r.post_id,r.title,r.description,r.photos,r.reason,r.status,r.created_at
      from discover_safety_private.reports r where r.status = 'pending'
  ) q order by q.created_at;
end;
$$;

create function public.servsync_decide_discover_safety_item(
  p_id uuid,p_kind text,p_decision text,p_reason text
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_post uuid;
  v_photos text[];
  v_owner uuid;
  v_status text;
  v_reason text := trim(p_reason);
begin
  if v_actor is null or not coalesce(public.current_user_is_platform_admin(),false) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) not between 1 and 1000 then
    raise exception 'A review reason is required.' using errcode = '22023';
  end if;
  if p_kind = 'post' and p_decision in ('approve','reject') then
    select p.id,p.moderation_status,p.photos,cp.owner_user_id into v_post,v_status,v_photos,v_owner
      from public.contractor_posts p join public.contractor_profiles cp on cp.id = p.contractor_id
      where p.id = p_id for update of p;
    if v_status is distinct from 'pending' then return false; end if;
    if p_decision = 'approve' and not discover_safety_private.valid_post_media(v_photos,v_owner) then
      raise exception 'Unavailable or legacy photo; a private resubmission is required.' using errcode = '22023';
    end if;
    update public.contractor_posts
      set moderation_status = case p_decision when 'approve' then 'approved' else 'rejected' end
      where id = v_post;
  elsif p_kind = 'report' and p_decision in ('dismiss','remove') then
    select r.post_id,r.status into v_post,v_status from discover_safety_private.reports r
      where r.id = p_id for update;
    if v_status is distinct from 'pending' then return false; end if;
    update discover_safety_private.reports set status = case p_decision when 'dismiss' then 'dismissed' else 'removed' end
      where id = p_id;
    if p_decision = 'remove' then
      update public.contractor_posts set moderation_status = 'removed' where id = v_post;
    end if;
  else
    raise exception 'Unsupported review decision.' using errcode = '22023';
  end if;
  insert into discover_safety_private.audit (item_id,post_id,kind,decision,reason,operator_id)
    values (p_id,v_post,p_kind,p_decision,v_reason,v_actor);
  return true;
end;
$$;

create function public.servsync_list_discover_safety_audit()
returns table(id uuid,item_id uuid,post_id uuid,kind text,decision text,reason text,operator_id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_is_platform_admin(),false) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return query select a.id,a.item_id,a.post_id,a.kind,a.decision,a.reason,a.operator_id,a.created_at
    from discover_safety_private.audit a order by a.created_at desc,a.id limit 500;
end;
$$;

-- Reject new requests at the underlying write boundaries, including direct
-- table writes. Existing relationships, job records and finance stay intact.
create function discover_safety_private.check_new_discover_contact()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    -- Only a changed participant or another pending/active request is a new attempt.
    if new.homeowner_user_id = old.homeowner_user_id and new.contractor_id = old.contractor_id
      and (new.status not in ('pending','active') or old.status = 'active') then
      return new;
    end if;
  end if;
  select cp.owner_user_id into v_owner from public.contractor_profiles cp where cp.id = new.contractor_id;
  if v_owner is not null then
    perform discover_safety_private.lock_pair(new.homeowner_user_id,v_owner);
    if discover_safety_private.is_blocked(new.homeowner_user_id,v_owner) then
      raise exception 'This contact is not available.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function discover_safety_private.valid_post_media(text[],uuid),
  discover_safety_private.check_new_discover_contact() from public, anon, authenticated, service_role;
create trigger discover_connection_contact_guard
  before insert or update of status,homeowner_user_id,contractor_id on public.homeowner_contractor_connections
  for each row execute function discover_safety_private.check_new_discover_contact();
create trigger discover_service_request_contact_guard
  before insert or update of homeowner_user_id,contractor_id on public.service_requests
  for each row execute function discover_safety_private.check_new_discover_contact();

-- The workflow table contains human-authored messages only. Do not gate
-- workflow_activity_events, read markers, or existing records.
create function discover_safety_private.guard_workflow_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_home uuid;
  v_owner uuid;
begin
  if new.context_type = 'job' then
    select j.homeowner_user_id, cp.owner_user_id into v_home,v_owner
      from public.inspections j join public.contractor_profiles cp on cp.id = j.contractor_id
      where j.id = new.inspection_id;
  elsif new.context_type = 'service_request' then
    select sr.homeowner_user_id, cp.owner_user_id into v_home,v_owner
      from public.service_requests sr join public.contractor_profiles cp on cp.id = sr.contractor_id
      where sr.id = new.service_request_id;
  end if;
  if v_home is not null and v_owner is not null then
    perform discover_safety_private.lock_pair(v_home,v_owner);
    if discover_safety_private.is_blocked(v_home,v_owner) then
      raise exception 'Job messaging is unavailable.' using errcode = 'PSS01';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function discover_safety_private.guard_workflow_message()
  from public,anon,authenticated,service_role;
create trigger discover_workflow_message_guard before insert on public.workflow_messages
  for each row execute function discover_safety_private.guard_workflow_message();

-- Only a party already authorized to view this job can see its messaging state.
-- Do not reveal who blocked whom, or expose account-wide block status.
create function public.servsync_workflow_job_messaging_paused(p_inspection_id uuid)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  v_home uuid;
  v_contractor uuid;
  v_owner uuid;
begin
  select j.homeowner_user_id,j.contractor_id,cp.owner_user_id into v_home,v_contractor,v_owner
    from public.inspections j left join public.contractor_profiles cp on cp.id = j.contractor_id
    where j.id = p_inspection_id;
  if auth.uid() is null or v_contractor is null or not (
    coalesce(v_home = auth.uid(),false)
    or coalesce(public.current_user_can_access_contractor(v_contractor),false)
    or coalesce(public.current_user_is_platform_admin(),false)
  ) then
    raise exception 'Job not available.' using errcode = '42501';
  end if;
  return discover_safety_private.is_blocked(v_home,v_owner);
end;
$$;
revoke all on function public.servsync_workflow_job_messaging_paused(uuid) from public,anon,authenticated,service_role;
grant execute on function public.servsync_workflow_job_messaging_paused(uuid) to authenticated;

-- Separate request replies, attachment publication and appointment notes
-- must respect the same block as the dedicated job message composer.
create function discover_safety_private.request_pair_blocked(p_request_id uuid)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare v_home uuid; v_owner uuid;
begin
  select r.homeowner_user_id,cp.owner_user_id into v_home,v_owner
    from public.service_requests r join public.contractor_profiles cp on cp.id=r.contractor_id
    where r.id=p_request_id;
  if v_home is null or v_owner is null then return false; end if;
  perform discover_safety_private.lock_pair(v_home,v_owner);
  return discover_safety_private.is_blocked(v_home,v_owner);
end;
$$;

create function discover_safety_private.guard_request_communication()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not discover_safety_private.request_pair_blocked(new.request_id) then return new; end if;
  case tg_table_name
    when 'service_request_messages' then
      if tg_op = 'UPDATE' then
        raise exception 'Request messaging is unavailable.' using errcode='PSS01';
      end if;
      -- Keep real transaction actions working. Never forward supplied text,
      -- even if an older client still attaches a note to the status change.
      new.body := case new.message_type
        when 'homeowner_closed' then 'Homeowner closed this request.'
        when 'contractor_closed' then 'Contractor closed this request.'
        when 'contractor_declined' then 'Contractor declined this request.'
        when 'appointment_update' then 'Appointment updated. Open the appointment for details.'
        else null
      end;
      if new.body is null then
        raise exception 'Request messaging is unavailable.' using errcode='PSS01';
      end if;
    when 'service_request_media' then
      raise exception 'Reply attachments are unavailable.' using errcode='PSS01';
    when 'service_request_appointments' then
      if tg_op = 'UPDATE' and new.request_id = old.request_id then
        new.notes := old.notes;
      else
        new.notes := '';
      end if;
    when 'service_request_appointment_windows' then
      if tg_op = 'UPDATE' and new.request_id = old.request_id then
        new.contractor_note := old.contractor_note;
        new.homeowner_response_note := old.homeowner_response_note;
      else
        new.contractor_note := '';
        new.homeowner_response_note := '';
      end if;
    when 'service_request_appointment_events' then
      new.event_note := '';
      -- Existing scheduling RPCs provide typed timestamps, IDs and counts in
      -- metadata; clients have no direct write grant on this event table.
    else
      raise exception 'Unsupported request communication table.';
  end case;
  return new;
end;
$$;

create function discover_safety_private.guard_request_summary()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if discover_safety_private.request_pair_blocked(old.id) then
    new.closing_summary := old.closing_summary;
    new.title := old.title;
    new.description := old.description;
  end if;
  return new;
end;
$$;

create function discover_safety_private.guard_shared_visit_note()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_home uuid; v_owner uuid;
begin
  if not new.share_with_homeowner then return new; end if;
  select i.homeowner_user_id,cp.owner_user_id into v_home,v_owner
    from public.inspections i join public.contractor_profiles cp on cp.id=i.contractor_id
    where i.id=new.inspection_id;
  if v_home is not null and v_owner is not null then
    perform discover_safety_private.lock_pair(v_home,v_owner);
    if discover_safety_private.is_blocked(v_home,v_owner) then
      if tg_op = 'UPDATE' and old.share_with_homeowner and old.inspection_id = new.inspection_id then
        new.notes := old.notes;
      else
        new.notes := '';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger discover_request_message_guard before insert or update on public.service_request_messages
  for each row execute function discover_safety_private.guard_request_communication();
create trigger discover_request_media_guard before insert or update on public.service_request_media
  for each row execute function discover_safety_private.guard_request_communication();
create trigger discover_request_appointment_note_guard before insert or update on public.service_request_appointments
  for each row execute function discover_safety_private.guard_request_communication();
create trigger discover_request_window_note_guard before insert or update on public.service_request_appointment_windows
  for each row execute function discover_safety_private.guard_request_communication();
create trigger discover_request_appointment_event_guard before insert or update on public.service_request_appointment_events
  for each row execute function discover_safety_private.guard_request_communication();
create trigger discover_request_summary_guard before update of closing_summary,title,description on public.service_requests
  for each row execute function discover_safety_private.guard_request_summary();
create trigger discover_shared_visit_note_guard before insert or update on public.contractor_visit_events
  for each row execute function discover_safety_private.guard_shared_visit_note();

create function discover_safety_private.request_media_upload_allowed(p_name text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare v_request text := pg_catalog.split_part(p_name,'/',2);
begin
  if v_request !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return not discover_safety_private.request_pair_blocked(v_request::uuid);
end;
$$;
revoke all on function discover_safety_private.request_pair_blocked(uuid),
  discover_safety_private.guard_request_communication(),discover_safety_private.guard_request_summary(),
  discover_safety_private.guard_shared_visit_note(),discover_safety_private.request_media_upload_allowed(text)
  from public,anon,authenticated,service_role;
grant execute on function discover_safety_private.request_media_upload_allowed(text) to authenticated;
-- Only the existing authorized RPCs may create automatic notices for a paused
-- request. A direct table insert cannot impersonate a lifecycle notice.
grant execute on function discover_safety_private.request_pair_blocked(uuid) to authenticated;
create policy discover_request_message_blocked_insert on public.service_request_messages as restrictive
  for insert to authenticated with check (not discover_safety_private.request_pair_blocked(request_id));

create policy discover_request_media_blocked_insert on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id <> 'service-request-media' or discover_safety_private.request_media_upload_allowed(name)
  );
create policy discover_request_media_blocked_update on storage.objects as restrictive
  for update to authenticated using (
    bucket_id <> 'service-request-media' or discover_safety_private.request_media_upload_allowed(name)
  ) with check (
    bucket_id <> 'service-request-media' or discover_safety_private.request_media_upload_allowed(name)
  );

-- Bulk query for already-authorized request cards. The reply never reveals
-- who enabled the pause and cannot enumerate another party's request IDs.
create function public.servsync_paused_request_messaging(p_request_ids uuid[])
returns uuid[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(r.id),'{}'::uuid[])
  from public.service_requests r join public.contractor_profiles cp on cp.id=r.contractor_id
  where auth.uid() is not null and r.id = any(p_request_ids)
    and (r.homeowner_user_id=auth.uid() or public.current_user_can_access_contractor(r.contractor_id))
    and discover_safety_private.is_blocked(r.homeowner_user_id,cp.owner_user_id);
$$;
revoke all on function public.servsync_paused_request_messaging(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.servsync_paused_request_messaging(uuid[]) to authenticated;

revoke all on function public.servsync_create_contractor_post(text,text,text,text[],text,text),
  public.servsync_delete_contractor_post(uuid),public.servsync_my_discover_post_statuses(),
  public.servsync_report_discover_post(uuid,text),public.servsync_block_discover_contractor(uuid),
  public.servsync_list_blocked_discover_contractor_ids(),
  public.servsync_list_discover_safety_queue(),public.servsync_decide_discover_safety_item(uuid,text,text,text),
  public.servsync_list_discover_safety_audit() from public,anon,authenticated;
grant execute on function public.servsync_create_contractor_post(text,text,text,text[],text,text),
  public.servsync_delete_contractor_post(uuid),public.servsync_my_discover_post_statuses(),
  public.servsync_report_discover_post(uuid,text),public.servsync_block_discover_contractor(uuid),
  public.servsync_list_blocked_discover_contractor_ids(),
  public.servsync_list_discover_safety_queue(),public.servsync_decide_discover_safety_item(uuid,text,text,text),
  public.servsync_list_discover_safety_audit() to authenticated;

-- There must be exactly one supported public feed signature. These deprecated
-- overloads predate the current geography and public-review suppression.
drop function if exists public.servsync_discover_feed(text,text);
drop function if exists public.servsync_discover_feed(text,text,integer);

-- Public projection definitions preserve public review suppression, radius
-- matching, service areas, and saved/analytics output columns.
create or replace function public.servsync_get_public_contractor_profile(p_slug text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'contractor_id',          cp.id,
    'business_name',          cp.business_name,
    'slug',                   cp.slug,
    'contact_name',           cp.contact_name,
    'city',                   cp.city,
    'state',                  cp.state,
    'zip_code',               cp.zip_code,
    'website_url',            cp.website_url,
    'logo_url',               coalesce(cp.logo_url, ''),
    'categories',             cp.service_categories,
    'business_summary',       cp.business_summary,
    'external_review_links',  coalesce(cp.external_review_links, '[]'::jsonb),
    'license_number',         cp.license_number,
    'insurance_status',       cp.insurance_status,
    'bonded_status',          cp.bonded_status,
    'avg_rating',             null::numeric,
    'review_count',           0::bigint,
    'reviews',                '[]'::jsonb
  )
  from public.contractor_profiles cp
  where cp.slug = p_slug
    and cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and not discover_safety_private.is_blocked(auth.uid(),cp.owner_user_id)
  limit 1;
$$;

create or replace function public.servsync_discover_feed(
  p_category text default null,
  p_location text default null,
  p_radius_miles integer default null,
  p_search_lat numeric default null,
  p_search_lng numeric default null
)
returns table (
  post_id uuid,
  contractor_id uuid,
  business_name text,
  contractor_city text,
  contractor_state text,
  categories text[],
  business_summary text,
  external_review_links jsonb,
  service_areas jsonb,
  avg_rating numeric,
  review_count bigint,
  post_category text,
  title text,
  description text,
  photos text[],
  reviews jsonb,
  created_at timestamptz,
  is_saved boolean,
  save_count bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with params as (
    select
      lower(trim(coalesce(p_location, ''))) as location_query,
      regexp_replace(trim(coalesce(p_location, '')), '[^0-9]', '', 'g') as zip_query,
      case
        when p_radius_miles in (10, 25, 50, 100, 200) then p_radius_miles
        else 25
      end::numeric as radius_query,
      p_search_lat as search_lat,
      p_search_lng as search_lng
  )
  select
    p.id as post_id,
    cp.id as contractor_id,
    cp.business_name,
    cp.city as contractor_city,
    cp.state as contractor_state,
    cp.service_categories as categories,
    cp.business_summary,
    coalesce(cp.external_review_links, '[]'::jsonb) as external_review_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label',         csa.label,
        'location_text', csa.location_text,
        'zip_code',      csa.zip_code,
        'city',          csa.city,
        'state',         csa.state,
        'radius_miles',  csa.radius_miles
      ) order by csa.sort_order, csa.created_at)
      from public.contractor_service_areas csa
      where csa.contractor_id = cp.id
    ), '[]'::jsonb) as service_areas,
    null::numeric as avg_rating,
    0::bigint as review_count,
    p.category as post_category,
    p.title,
    p.description,
    case when auth.uid() is null then '{}'::text[] else p.photos end as photos,
    '[]'::jsonb as reviews,
    p.created_at,
    exists (
      select 1
        from public.discover_post_saves s
       where s.post_id = p.id
         and s.homeowner_user_id = auth.uid()
    ) as is_saved,
    coalesce((
      select count(*)
        from public.discover_post_saves s
       where s.post_id = p.id
    ), 0)::bigint as save_count
  from public.contractor_posts p
  join public.contractor_profiles cp on cp.id = p.contractor_id
  cross join params q
  where cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and discover_safety_private.post_is_public(p.id)
    and (p_category is null or p_category = '' or p.category = p_category)
    and (
      q.location_query = ''
      or (
        q.search_lat is not null
        and q.search_lng is not null
        and exists (
          select 1
            from public.contractor_service_areas csa
           where csa.contractor_id = cp.id
             and csa.latitude is not null
             and csa.longitude is not null
             and csa.geocode_status = 'geocoded'
             and public.servsync_distance_miles(q.search_lat, q.search_lng, csa.latitude, csa.longitude)
               <= q.radius_query + csa.radius_miles
        )
      )
      or (
        (
          q.search_lat is null
          or q.search_lng is null
          or not exists (
            select 1
              from public.contractor_service_areas csa
             where csa.contractor_id = cp.id
               and csa.latitude is not null
               and csa.longitude is not null
               and csa.geocode_status = 'geocoded'
          )
        )
        and (
          lower(cp.city) like '%' || q.location_query || '%'
          or lower(cp.state) like '%' || q.location_query || '%'
          or (q.zip_query <> '' and cp.zip_code like q.zip_query || '%')
          or exists (
            select 1
              from unnest(coalesce(cp.service_zip_codes, '{}'::text[])) as legacy_zip(zip_code)
             where lower(legacy_zip.zip_code) like '%' || q.location_query || '%'
                or (q.zip_query <> '' and legacy_zip.zip_code like q.zip_query || '%')
          )
          or exists (
            select 1
              from public.contractor_service_areas csa
             where csa.contractor_id = cp.id
               and (
                 lower(csa.location_text) like '%' || q.location_query || '%'
                 or lower(csa.city) like '%' || q.location_query || '%'
                 or lower(csa.state) like '%' || q.location_query || '%'
                 or (q.zip_query <> '' and csa.zip_code like q.zip_query || '%')
               )
          )
          or lower(p.city) like '%' || q.location_query || '%'
          or lower(p.state) like '%' || q.location_query || '%'
        )
      )
    )
  order by p.created_at desc;
$$;

create or replace function public.servsync_discover_saved_posts()
returns table (
  post_id uuid,
  contractor_id uuid,
  business_name text,
  contractor_city text,
  contractor_state text,
  categories text[],
  business_summary text,
  external_review_links jsonb,
  service_areas jsonb,
  avg_rating numeric,
  review_count bigint,
  post_category text,
  title text,
  description text,
  photos text[],
  reviews jsonb,
  created_at timestamptz,
  is_saved boolean,
  save_count bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    p.id as post_id,
    cp.id as contractor_id,
    cp.business_name,
    cp.city as contractor_city,
    cp.state as contractor_state,
    cp.service_categories as categories,
    cp.business_summary,
    coalesce(cp.external_review_links, '[]'::jsonb) as external_review_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label',         csa.label,
        'location_text', csa.location_text,
        'zip_code',      csa.zip_code,
        'city',          csa.city,
        'state',         csa.state,
        'radius_miles',  csa.radius_miles
      ) order by csa.sort_order, csa.created_at)
      from public.contractor_service_areas csa
      where csa.contractor_id = cp.id
    ), '[]'::jsonb) as service_areas,
    null::numeric as avg_rating,
    0::bigint as review_count,
    p.category as post_category,
    p.title,
    p.description,
    case when auth.uid() is null then '{}'::text[] else p.photos end as photos,
    '[]'::jsonb as reviews,
    p.created_at,
    true as is_saved,
    coalesce((
      select count(*)
        from public.discover_post_saves s2
       where s2.post_id = p.id
    ), 0)::bigint as save_count
  from public.discover_post_saves s
  join public.contractor_posts p on p.id = s.post_id
  join public.contractor_profiles cp on cp.id = p.contractor_id
  where s.homeowner_user_id = auth.uid()
    and cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and discover_safety_private.post_is_public(p.id)
  order by s.saved_at desc;
$$;

create or replace function public.servsync_public_contractor_directory(
  p_category text default null,
  p_location text default null
)
returns table (
  contractor_id    uuid,
  business_name    text,
  slug             text,
  city             text,
  state            text,
  categories       text[],
  business_summary text,
  avg_rating       numeric,
  review_count     bigint,
  reviews          jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    cp.id as contractor_id,
    cp.business_name,
    cp.slug,
    cp.city,
    cp.state,
    cp.service_categories as categories,
    cp.business_summary,
    null::numeric as avg_rating,
    0::bigint as review_count,
    '[]'::jsonb as reviews
  from public.contractor_profiles cp
  where cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and not discover_safety_private.is_blocked(auth.uid(),cp.owner_user_id)
    and (p_category is null or p_category = '' or p_category = any(cp.service_categories))
    and (
      p_location is null or p_location = ''
      or lower(cp.city) like '%' || lower(p_location) || '%'
      or lower(cp.state) like '%' || lower(p_location) || '%'
      or cp.zip_code like p_location || '%'
    )
  order by cp.business_name asc;
$$;

create or replace function public.servsync_record_discover_post_view(
  p_post_id uuid,
  p_source text default 'homeowner_discover'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
  v_contractor_owner_user_id uuid;
begin
  if v_viewer_id is null then
    return;
  end if;

  select role into v_viewer_role
    from public.profiles
   where id = v_viewer_id;

  if v_viewer_role is distinct from 'homeowner' then
    return;
  end if;

  select cp.owner_user_id into v_contractor_owner_user_id
    from public.contractor_posts p
    join public.contractor_profiles cp on cp.id = p.contractor_id
   where p.id = p_post_id
     and cp.public_profile_enabled = true
     and cp.account_status = 'active'
     and discover_safety_private.post_is_public(p.id)
   limit 1;

  if v_contractor_owner_user_id is null then
    return;
  end if;

  if v_contractor_owner_user_id = v_viewer_id then
    return;
  end if;

  insert into public.discover_post_views (
    post_id,
    contractor_user_id,
    viewer_user_id,
    viewer_role,
    source
  )
  values (
    p_post_id,
    v_contractor_owner_user_id,
    v_viewer_id,
    v_viewer_role,
    coalesce(nullif(trim(p_source), ''), 'homeowner_discover')
  )
  on conflict (post_id, viewer_user_id, viewed_on)
  where viewer_user_id is not null
  do nothing;
end;
$$;

create or replace function public.servsync_toggle_discover_post_save(
  p_post_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_homeowner_id uuid := auth.uid();
  v_homeowner_role text;
  v_contractor_owner_user_id uuid;
  v_existing_id uuid;
begin
  if v_homeowner_id is null then
    raise exception 'Sign in to save updates.';
  end if;

  select role into v_homeowner_role
    from public.profiles
   where id = v_homeowner_id;

  if v_homeowner_role is distinct from 'homeowner' then
    raise exception 'Only homeowner accounts can save Discover updates.';
  end if;

  select cp.owner_user_id into v_contractor_owner_user_id
    from public.contractor_posts p
    join public.contractor_profiles cp on cp.id = p.contractor_id
   where p.id = p_post_id
     and cp.public_profile_enabled = true
     and cp.account_status = 'active'
     and discover_safety_private.post_is_public(p.id)
   limit 1;

  if v_contractor_owner_user_id is null then
    raise exception 'This update is not available to save.';
  end if;

  if v_contractor_owner_user_id = v_homeowner_id then
    return false;
  end if;

  select id into v_existing_id
    from public.discover_post_saves
   where homeowner_user_id = v_homeowner_id
     and post_id = p_post_id
   limit 1;

  if v_existing_id is not null then
    delete from public.discover_post_saves
     where id = v_existing_id
       and homeowner_user_id = v_homeowner_id;
    return false;
  end if;

  insert into public.discover_post_saves (
    post_id,
    contractor_user_id,
    homeowner_user_id
  )
  values (
    p_post_id,
    v_contractor_owner_user_id,
    v_homeowner_id
  )
  on conflict (homeowner_user_id, post_id) do nothing;

  return true;
end;
$$;

revoke all on function public.servsync_get_public_contractor_profile(text),
  public.servsync_discover_feed(text,text,integer,numeric,numeric),
  public.servsync_discover_saved_posts(),public.servsync_my_discover_posts(),
  public.servsync_public_contractor_directory(text,text),
  public.servsync_record_discover_post_view(uuid,text),
  public.servsync_toggle_discover_post_save(uuid) from public,anon,authenticated;
grant execute on function public.servsync_get_public_contractor_profile(text),
  public.servsync_discover_feed(text,text,integer,numeric,numeric),
  public.servsync_public_contractor_directory(text,text) to anon,authenticated;
grant execute on function public.servsync_discover_saved_posts(),public.servsync_my_discover_posts(),
  public.servsync_record_discover_post_view(uuid,text),
  public.servsync_toggle_discover_post_save(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
