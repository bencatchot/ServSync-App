-- ServSync public contractor directory with reviews.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-maintenance-log.sql.

begin;

-- ── Add optional reviewer identity to reviews ────────────────────────────────

alter table public.service_request_reviews
  add column if not exists reviewer_display_name text not null default '',
  add column if not exists reviewer_location      text not null default '';

-- ── Update submit review RPC to accept identity fields ──────────────────────

create or replace function public.servsync_homeowner_submit_review(
  p_request_id           uuid,
  p_rating               smallint,
  p_body                 text    default '',
  p_kudos                text[]  default '{}',
  p_reviewer_display_name text   default '',
  p_reviewer_location     text   default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests;
begin
  select * into v_request
    from public.service_requests
   where id = p_request_id
     and homeowner_user_id = auth.uid()
     and status = 'closed'
   limit 1;

  if v_request.id is null then
    raise exception 'Service request not found or is not closed.';
  end if;

  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  insert into public.service_request_reviews
    (request_id, homeowner_user_id, contractor_id, rating, body, kudos,
     reviewer_display_name, reviewer_location)
  values
    (v_request.id, auth.uid(), v_request.contractor_id,
     p_rating,
     coalesce(nullif(trim(p_body), ''), ''),
     coalesce(p_kudos, '{}'),
     coalesce(nullif(trim(p_reviewer_display_name), ''), ''),
     coalesce(nullif(trim(p_reviewer_location), ''), ''))
  on conflict (request_id) do update
     set rating                 = excluded.rating,
         body                   = excluded.body,
         kudos                  = excluded.kudos,
         reviewer_display_name  = excluded.reviewer_display_name,
         reviewer_location      = excluded.reviewer_location;

  return jsonb_build_object('request_id', v_request.id, 'rating', p_rating);
end;
$$;

grant execute on function public.servsync_homeowner_submit_review(uuid, smallint, text, text[], text, text) to authenticated;

-- ── Public contractor directory RPC ─────────────────────────────────────────
-- Returns contractors with reviews, accessible to anon + authenticated.

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
language sql security definer set search_path = public stable
as $$
  select
    cp.id                    as contractor_id,
    cp.business_name,
    cp.slug,
    cp.city,
    cp.state,
    cp.service_categories    as categories,
    cp.business_summary,
    round(avg(r.rating)::numeric, 1) as avg_rating,
    count(r.id)              as review_count,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating',                  rv.rating,
        'body',                    rv.body,
        'kudos',                   rv.kudos,
        'reviewer_display_name',   rv.reviewer_display_name,
        'reviewer_location',       rv.reviewer_location,
        'created_at',              rv.created_at
      ) order by rv.created_at desc)
      from (
        select * from public.service_request_reviews rv2
         where rv2.contractor_id = cp.id
         order by rv2.created_at desc
         limit 10
      ) rv
    ), '[]'::jsonb) as reviews
  from public.contractor_profiles cp
  join public.service_request_reviews r on r.contractor_id = cp.id
  where cp.public_profile_enabled = true
    and cp.account_status = 'active'
    and (p_category is null or p_category = '' or p_category = any(cp.service_categories))
    and (
      p_location is null or p_location = ''
      or lower(cp.city)     like '%' || lower(p_location) || '%'
      or lower(cp.state)    like '%' || lower(p_location) || '%'
      or cp.zip_code        like p_location || '%'
    )
  group by cp.id, cp.business_name, cp.slug, cp.city, cp.state,
           cp.service_categories, cp.business_summary
  order by avg(r.rating) desc, count(r.id) desc;
$$;

grant execute on function public.servsync_public_contractor_directory(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
