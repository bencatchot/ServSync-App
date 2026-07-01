-- FB-026 Slice 3B-1: review moderation SQL/RPC foundation.
-- Run after:
--   - servsync-review-eligibility.sql
--   - servsync-review-grant-hardening.sql
--   - servsync-review-public-display-pause.sql
--
-- This patch adds moderation state and guarded platform-admin RPCs while keeping
-- public ServSync review display paused. It does not approve existing reviews,
-- create an admin UI, or re-enable public review aggregates/snippets.

begin;

alter table public.service_request_reviews
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists moderated_at timestamptz null,
  add column if not exists moderated_by uuid null references public.profiles(id),
  add column if not exists moderation_note text not null default '',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'service_request_reviews_moderation_status_check'
       and conrelid = 'public.service_request_reviews'::regclass
  ) then
    alter table public.service_request_reviews
      add constraint service_request_reviews_moderation_status_check
      check (moderation_status in ('pending', 'approved', 'hidden', 'rejected'));
  end if;
end;
$$;

create index if not exists reviews_moderation_status_idx
  on public.service_request_reviews(moderation_status, created_at desc);

create or replace function public.servsync_homeowner_submit_review(
  p_request_id uuid,
  p_rating smallint,
  p_body text default '',
  p_kudos text[] default '{}',
  p_reviewer_display_name text default '',
  p_reviewer_location text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
begin
  select *
    into v_request
    from public.service_requests sr
   where sr.id = p_request_id
     and sr.homeowner_user_id = auth.uid()
     and sr.status = 'closed'
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found or is not closed.';
  end if;

  if not public.servsync_service_request_has_completed_work(
    v_request.id,
    v_request.contractor_id,
    v_request.homeowner_user_id
  ) then
    raise exception 'Reviews are only available after completed ServSync work.';
  end if;

  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  insert into public.service_request_reviews (
    request_id,
    homeowner_user_id,
    contractor_id,
    rating,
    body,
    kudos,
    reviewer_display_name,
    reviewer_location,
    moderation_status,
    moderated_at,
    moderated_by,
    moderation_note,
    updated_at
  )
  values (
    v_request.id,
    auth.uid(),
    v_request.contractor_id,
    p_rating,
    coalesce(nullif(trim(p_body), ''), ''),
    coalesce(p_kudos, '{}'),
    coalesce(nullif(trim(p_reviewer_display_name), ''), ''),
    coalesce(nullif(trim(p_reviewer_location), ''), ''),
    'pending',
    null,
    null,
    '',
    now()
  )
  on conflict (request_id) do update
     set rating = excluded.rating,
         body = excluded.body,
         kudos = excluded.kudos,
         reviewer_display_name = excluded.reviewer_display_name,
         reviewer_location = excluded.reviewer_location,
         moderation_status = 'pending',
         moderated_at = null,
         moderated_by = null,
         moderation_note = '',
         updated_at = now();

  return jsonb_build_object('request_id', v_request.id, 'rating', p_rating);
end;
$$;

create or replace function public.servsync_admin_review_moderation_queue(
  p_status text default 'pending'
)
returns table (
  review_id uuid,
  request_id uuid,
  request_title text,
  request_category text,
  contractor_id uuid,
  contractor_name text,
  homeowner_user_id uuid,
  homeowner_name text,
  rating smallint,
  body text,
  kudos text[],
  reviewer_display_name text,
  reviewer_location text,
  moderation_status text,
  moderation_note text,
  created_at timestamptz,
  updated_at timestamptz,
  moderated_at timestamptz,
  moderated_by uuid
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_status is not null and p_status <> 'all'
     and p_status not in ('pending', 'approved', 'hidden', 'rejected') then
    raise exception 'Invalid moderation status';
  end if;

  return query
  select
    rv.id,
    rv.request_id,
    sr.title,
    sr.category,
    rv.contractor_id,
    cp.business_name,
    rv.homeowner_user_id,
    coalesce(hp.display_name, p.full_name, 'Homeowner'),
    rv.rating,
    rv.body,
    rv.kudos,
    rv.reviewer_display_name,
    rv.reviewer_location,
    rv.moderation_status,
    rv.moderation_note,
    rv.created_at,
    rv.updated_at,
    rv.moderated_at,
    rv.moderated_by
  from public.service_request_reviews rv
  join public.service_requests sr on sr.id = rv.request_id
  join public.contractor_profiles cp on cp.id = rv.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = rv.homeowner_user_id
  left join public.profiles p on p.id = rv.homeowner_user_id
  where p_status is null
     or p_status = 'all'
     or rv.moderation_status = p_status
  order by
    case rv.moderation_status
      when 'pending' then 1
      when 'hidden' then 2
      when 'rejected' then 3
      else 4
    end,
    rv.created_at desc;
end;
$$;

create or replace function public.servsync_admin_update_review_moderation(
  p_review_id uuid,
  p_status text,
  p_moderation_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.service_request_reviews;
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_status not in ('pending', 'approved', 'hidden', 'rejected') then
    raise exception 'Invalid moderation status';
  end if;

  update public.service_request_reviews
     set moderation_status = p_status,
         moderation_note = coalesce(nullif(trim(p_moderation_note), ''), ''),
         moderated_at = case when p_status = 'pending' then null else now() end,
         moderated_by = case when p_status = 'pending' then null else auth.uid() end,
         updated_at = now()
   where id = p_review_id
   returning * into v_review;

  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  return jsonb_build_object(
    'review_id', v_review.id,
    'request_id', v_review.request_id,
    'moderation_status', v_review.moderation_status,
    'moderated_at', v_review.moderated_at
  );
end;
$$;

-- Preserve the Slice 2 RPC-mediated posture for reviews.
revoke all privileges on table public.service_request_reviews from public;
revoke all privileges on table public.service_request_reviews from anon;
revoke all privileges on table public.service_request_reviews from authenticated;

do $$
declare
  review_function regprocedure;
begin
  for review_function in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'servsync_homeowner_submit_review',
         'servsync_homeowner_can_review_service_request',
         'servsync_service_request_has_completed_work',
         'servsync_admin_review_moderation_queue',
         'servsync_admin_update_review_moderation'
       )
  loop
    execute format('revoke all privileges on function %s from public', review_function);
    execute format('revoke all privileges on function %s from anon', review_function);
    execute format('revoke all privileges on function %s from authenticated', review_function);
  end loop;
end;
$$;

grant execute on function public.servsync_homeowner_submit_review(uuid, smallint, text, text[], text, text)
  to authenticated;

grant execute on function public.servsync_homeowner_can_review_service_request(uuid, uuid)
  to authenticated;

grant execute on function public.servsync_admin_review_moderation_queue(text)
  to authenticated;

grant execute on function public.servsync_admin_update_review_moderation(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
