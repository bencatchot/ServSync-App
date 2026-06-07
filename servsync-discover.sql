-- ServSync Discover feed — contractor job showcases.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-public-reviews.sql.

begin;

-- ── Public Discover feed media ──────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('discover-media', 'discover-media', true, 20971520)
on conflict (id) do update
set public = true,
    file_size_limit = 20971520;

drop policy if exists "discover_media_upload_contractor" on storage.objects;
drop policy if exists "discover_media_update_own_folder" on storage.objects;
drop policy if exists "discover_media_delete_own_folder" on storage.objects;

create policy "discover_media_upload_contractor"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
        from public.contractor_profiles cp
       where cp.owner_user_id = auth.uid()
         and cp.account_status = 'active'
    )
  );

create policy "discover_media_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "discover_media_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'discover-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Contractor posts table ───────────────────────────────────────────────────

create table if not exists public.contractor_posts (
  id            uuid        primary key default gen_random_uuid(),
  contractor_id uuid        not null references public.contractor_profiles(id) on delete cascade,
  category      text        not null default '',
  title         text        not null,
  description   text        not null default '',
  photos        text[]      not null default '{}',
  city          text        not null default '',
  state         text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists contractor_posts_contractor_idx
  on public.contractor_posts(contractor_id, created_at desc);

alter table public.contractor_posts enable row level security;

drop policy if exists "posts_select_authenticated" on public.contractor_posts;
create policy "posts_select_authenticated"
  on public.contractor_posts for select to authenticated
  using (
    exists (
      select 1 from public.contractor_profiles cp
       where cp.id = contractor_id
         and cp.public_profile_enabled = true
         and cp.account_status = 'active'
    )
  );

drop policy if exists "posts_insert_own_contractor" on public.contractor_posts;
create policy "posts_insert_own_contractor"
  on public.contractor_posts for insert to authenticated
  with check (
    exists (
      select 1 from public.contractor_profiles cp
       where cp.id = contractor_id and cp.owner_user_id = auth.uid()
    )
  );

drop policy if exists "posts_delete_own_contractor" on public.contractor_posts;
create policy "posts_delete_own_contractor"
  on public.contractor_posts for delete to authenticated
  using (
    exists (
      select 1 from public.contractor_profiles cp
       where cp.id = contractor_id and cp.owner_user_id = auth.uid()
    )
  );

grant select, insert, delete on public.contractor_posts to authenticated;

-- ── RPC: create contractor post ──────────────────────────────────────────────

create or replace function public.servsync_create_contractor_post(
  p_category    text,
  p_title       text,
  p_description text    default '',
  p_photos      text[]  default '{}',
  p_city        text    default '',
  p_state       text    default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_post_id       uuid;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  if v_contractor_id is null then
    raise exception 'Contractor profile not found.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Post title is required.';
  end if;

  insert into public.contractor_posts
    (contractor_id, category, title, description, photos, city, state)
  values
    (v_contractor_id,
     coalesce(nullif(trim(p_category), ''), ''),
     trim(p_title),
     coalesce(nullif(trim(p_description), ''), ''),
     coalesce(p_photos, '{}'),
     coalesce(nullif(trim(p_city), ''), ''),
     coalesce(nullif(trim(p_state), ''), ''))
  returning id into v_post_id;

  return jsonb_build_object('post_id', v_post_id);
end;
$$;

grant execute on function public.servsync_create_contractor_post(text, text, text, text[], text, text) to authenticated;

-- ── RPC: delete contractor post ──────────────────────────────────────────────

create or replace function public.servsync_delete_contractor_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
begin
  select id into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  if v_contractor_id is null then return; end if;

  delete from public.contractor_posts
   where id = p_post_id and contractor_id = v_contractor_id;
end;
$$;

grant execute on function public.servsync_delete_contractor_post(uuid) to authenticated;

-- ── RPC: discover feed ───────────────────────────────────────────────────────

create or replace function public.servsync_discover_feed(
  p_category text default null,
  p_location text default null
)
returns table (
  post_id          uuid,
  contractor_id    uuid,
  business_name    text,
  contractor_city  text,
  contractor_state text,
  categories       text[],
  business_summary text,
  avg_rating       numeric,
  review_count     bigint,
  post_category    text,
  title            text,
  description      text,
  photos           text[],
  reviews          jsonb,
  created_at       timestamptz
)
language sql security definer set search_path = public stable
as $$
  select
    p.id                      as post_id,
    cp.id                     as contractor_id,
    cp.business_name,
    cp.city                   as contractor_city,
    cp.state                  as contractor_state,
    cp.service_categories     as categories,
    cp.business_summary,
    (select round(avg(r.rating)::numeric, 1)
       from public.service_request_reviews r
      where r.contractor_id = cp.id)  as avg_rating,
    (select count(*)
       from public.service_request_reviews r
      where r.contractor_id = cp.id)  as review_count,
    p.category                as post_category,
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
    ), '[]'::jsonb)            as reviews,
    p.created_at
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

notify pgrst, 'reload schema';

commit;
