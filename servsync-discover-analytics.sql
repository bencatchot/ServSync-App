-- ServSync Discover analytics v1.
-- Adds real, deduped post view/save tracking and aggregate counts for contractor-owned posts.
-- Run after servsync-discover.sql.

begin;

create table if not exists public.discover_post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.contractor_posts(id) on delete cascade,
  contractor_user_id uuid not null references public.profiles(id) on delete cascade,
  viewer_user_id uuid references public.profiles(id) on delete set null,
  viewer_role text,
  viewed_at timestamptz not null default now(),
  viewed_on date not null default current_date,
  source text
);

create index if not exists discover_post_views_post_idx
  on public.discover_post_views(post_id, viewed_at desc);

create index if not exists discover_post_views_contractor_user_idx
  on public.discover_post_views(contractor_user_id, viewed_at desc);

create unique index if not exists discover_post_views_viewer_day_idx
  on public.discover_post_views(post_id, viewer_user_id, viewed_on)
  where viewer_user_id is not null;

alter table public.discover_post_views enable row level security;

revoke all on public.discover_post_views from anon;
revoke all on public.discover_post_views from authenticated;

drop policy if exists "discover_post_views_no_direct_select" on public.discover_post_views;
drop policy if exists "discover_post_views_no_direct_insert" on public.discover_post_views;

create table if not exists public.discover_post_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.contractor_posts(id) on delete cascade,
  contractor_user_id uuid not null references public.profiles(id) on delete cascade,
  homeowner_user_id uuid not null references public.profiles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique(homeowner_user_id, post_id)
);

create index if not exists discover_post_saves_post_idx
  on public.discover_post_saves(post_id, saved_at desc);

create index if not exists discover_post_saves_contractor_user_idx
  on public.discover_post_saves(contractor_user_id, saved_at desc);

create index if not exists discover_post_saves_homeowner_user_idx
  on public.discover_post_saves(homeowner_user_id, saved_at desc);

alter table public.discover_post_saves enable row level security;

revoke all on public.discover_post_saves from anon;
revoke all on public.discover_post_saves from authenticated;

drop policy if exists "discover_post_saves_no_direct_select" on public.discover_post_saves;
drop policy if exists "discover_post_saves_no_direct_insert" on public.discover_post_saves;
drop policy if exists "discover_post_saves_no_direct_update" on public.discover_post_saves;
drop policy if exists "discover_post_saves_no_direct_delete" on public.discover_post_saves;

create or replace function public.servsync_record_discover_post_view(
  p_post_id uuid,
  p_source text default 'homeowner_discover'
)
returns void
language plpgsql
security definer
set search_path = public
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

  if v_viewer_role <> 'homeowner' then
    return;
  end if;

  select cp.owner_user_id into v_contractor_owner_user_id
    from public.contractor_posts p
    join public.contractor_profiles cp on cp.id = p.contractor_id
   where p.id = p_post_id
     and cp.public_profile_enabled = true
     and cp.account_status = 'active'
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

grant execute on function public.servsync_record_discover_post_view(uuid, text) to authenticated;

create or replace function public.servsync_toggle_discover_post_save(
  p_post_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
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

  if v_homeowner_role <> 'homeowner' then
    raise exception 'Only homeowner accounts can save Discover updates.';
  end if;

  select cp.owner_user_id into v_contractor_owner_user_id
    from public.contractor_posts p
    join public.contractor_profiles cp on cp.id = p.contractor_id
   where p.id = p_post_id
     and cp.public_profile_enabled = true
     and cp.account_status = 'active'
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

grant execute on function public.servsync_toggle_discover_post_save(uuid) to authenticated;

drop function if exists public.servsync_discover_feed(text, text);

create function public.servsync_discover_feed(
  p_category text default null,
  p_location text default null
)
returns table (
  post_id uuid,
  contractor_id uuid,
  business_name text,
  contractor_city text,
  contractor_state text,
  categories text[],
  business_summary text,
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
set search_path = public
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
    (select round(avg(r.rating)::numeric, 1)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as avg_rating,
    (select count(*)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as review_count,
    p.category as post_category,
    p.title,
    p.description,
    p.photos,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating',                rv.rating,
        'body',                  rv.body,
        'kudos',                 rv.kudos,
        'reviewer_display_name', rv.reviewer_display_name,
        'reviewer_location',     rv.reviewer_location,
        'created_at',            rv.created_at
      ) order by rv.created_at desc)
      from (
        select * from public.service_request_reviews rv2
         where rv2.contractor_id = cp.id
         order by rv2.created_at desc
         limit 5
      ) rv
    ), '[]'::jsonb) as reviews,
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
  where cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and (p_category is null or p_category = '' or p.category = p_category)
    and (
      p_location is null or p_location = ''
      or lower(cp.city)  like '%' || lower(p_location) || '%'
      or lower(cp.state) like '%' || lower(p_location) || '%'
    )
  order by p.created_at desc;
$$;

grant execute on function public.servsync_discover_feed(text, text) to authenticated;

drop function if exists public.servsync_my_discover_posts();

create or replace function public.servsync_my_discover_posts()
returns table (
  post_id uuid,
  contractor_id uuid,
  business_name text,
  contractor_city text,
  contractor_state text,
  categories text[],
  business_summary text,
  avg_rating numeric,
  review_count bigint,
  post_category text,
  title text,
  description text,
  photos text[],
  reviews jsonb,
  created_at timestamptz,
  view_count bigint,
  save_count bigint
)
language sql
security definer
set search_path = public
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
    (select round(avg(r.rating)::numeric, 1)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as avg_rating,
    (select count(*)
       from public.service_request_reviews r
      where r.contractor_id = cp.id) as review_count,
    p.category as post_category,
    p.title,
    p.description,
    p.photos,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating',                rv.rating,
        'body',                  rv.body,
        'kudos',                 rv.kudos,
        'reviewer_display_name', rv.reviewer_display_name,
        'reviewer_location',     rv.reviewer_location,
        'created_at',            rv.created_at
      ) order by rv.created_at desc)
      from (
        select * from public.service_request_reviews rv2
         where rv2.contractor_id = cp.id
         order by rv2.created_at desc
         limit 5
      ) rv
    ), '[]'::jsonb) as reviews,
    p.created_at,
    coalesce((
      select count(*)
        from public.discover_post_views v
       where v.post_id = p.id
    ), 0)::bigint as view_count,
    coalesce((
      select count(*)
        from public.discover_post_saves s
       where s.post_id = p.id
    ), 0)::bigint as save_count
  from public.contractor_posts p
  join public.contractor_profiles cp on cp.id = p.contractor_id
  where cp.owner_user_id = auth.uid()
  order by p.created_at desc;
$$;

grant execute on function public.servsync_my_discover_posts() to authenticated;

notify pgrst, 'reload schema';

commit;
