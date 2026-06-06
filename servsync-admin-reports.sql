-- ServSync admin reporting RPCs.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-contractor-public-profile.sql.

begin;

-- ── Platform health summary ──────────────────────────────────────────────────

create or replace function public.servsync_admin_platform_health()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid() limit 1;
  if v_role <> 'platform_admin' then raise exception 'Unauthorized'; end if;

  return (
    select jsonb_build_object(
      'total_homeowners',       (select count(*) from public.profiles where role = 'homeowner'),
      'total_contractors',      (select count(*) from public.contractor_profiles),
      'active_contractors',     (select count(*) from public.contractor_profiles where account_status = 'active'),
      'total_connections',      (select count(*) from public.homeowner_contractor_connections),
      'active_connections',     (select count(*) from public.homeowner_contractor_connections where status = 'active'),
      'total_service_requests', (select count(*) from public.service_requests),
      'closed_service_requests',(select count(*) from public.service_requests where status = 'closed'),
      'declined_service_requests',(select count(*) from public.service_requests where status = 'declined'),
      'total_reviews',          (select count(*) from public.service_request_reviews),
      'platform_avg_rating',    (select round(avg(rating)::numeric, 2) from public.service_request_reviews),
      'total_posts',            (select count(*) from public.contractor_posts),
      'estimated_mrr_cents',    (
        select coalesce(sum(monthly_price_cents), 0)
          from public.contractor_profiles
         where account_status = 'active'
           and subscription_status in ('active', 'trialing')
      )
    )
  );
end;
$$;

-- ── Revenue breakdown by subscription status ─────────────────────────────────

create or replace function public.servsync_admin_revenue_breakdown()
returns table (
  subscription_status  text,
  account_status       text,
  contractor_count     bigint,
  total_monthly_cents  bigint
)
language plpgsql security definer set search_path = public
as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid() limit 1;
  if v_role <> 'platform_admin' then raise exception 'Unauthorized'; end if;

  return query
  select
    cp.subscription_status::text,
    cp.account_status::text,
    count(*)::bigint                           as contractor_count,
    coalesce(sum(cp.monthly_price_cents), 0)::bigint as total_monthly_cents
  from public.contractor_profiles cp
  group by cp.subscription_status, cp.account_status
  order by coalesce(sum(cp.monthly_price_cents), 0) desc;
end;
$$;

-- ── Platform growth — last 6 months ─────────────────────────────────────────

create or replace function public.servsync_admin_platform_growth()
returns table (
  month                text,
  new_homeowners       bigint,
  new_contractors      bigint,
  new_connections      bigint,
  new_service_requests bigint
)
language plpgsql security definer set search_path = public
as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid() limit 1;
  if v_role <> 'platform_admin' then raise exception 'Unauthorized'; end if;

  return query
  select
    to_char(m.month, 'Mon YYYY'),
    count(distinct case when p.role = 'homeowner'   then p.id  end)::bigint,
    count(distinct case when p.role = 'contractor'  then p.id  end)::bigint,
    count(distinct c.id)::bigint,
    count(distinct sr.id)::bigint
  from generate_series(
    date_trunc('month', now() - interval '5 months'),
    date_trunc('month', now()),
    interval '1 month'
  ) m(month)
  left join public.profiles p
    on date_trunc('month', p.created_at) = m.month
  left join public.homeowner_contractor_connections c
    on date_trunc('month', c.created_at) = m.month
  left join public.service_requests sr
    on date_trunc('month', sr.created_at) = m.month
  group by m.month
  order by m.month;
end;
$$;

-- ── Per-contractor activity ──────────────────────────────────────────────────

create or replace function public.servsync_admin_contractor_activity()
returns table (
  contractor_id         uuid,
  business_name         text,
  account_status        text,
  subscription_status   text,
  monthly_price_cents   int,
  connection_count      bigint,
  request_count         bigint,
  closed_request_count  bigint,
  review_count          bigint,
  avg_rating            numeric,
  post_count            bigint,
  joined_at             timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid() limit 1;
  if v_role <> 'platform_admin' then raise exception 'Unauthorized'; end if;

  return query
  select
    cp.id,
    cp.business_name,
    cp.account_status::text,
    cp.subscription_status::text,
    cp.monthly_price_cents,
    count(distinct hcc.id)::bigint,
    count(distinct sr.id)::bigint,
    count(distinct sr.id) filter (where sr.status = 'closed')::bigint,
    count(distinct rev.id)::bigint,
    round(avg(rev.rating)::numeric, 1),
    count(distinct posts.id)::bigint,
    cp.created_at
  from public.contractor_profiles cp
  left join public.homeowner_contractor_connections hcc on hcc.contractor_id = cp.id
  left join public.service_requests sr   on sr.contractor_id  = cp.id
  left join public.service_request_reviews rev on rev.contractor_id = cp.id
  left join public.contractor_posts posts on posts.contractor_id = cp.id
  group by cp.id, cp.business_name, cp.account_status, cp.subscription_status,
           cp.monthly_price_cents, cp.created_at
  order by count(distinct sr.id) desc, cp.business_name;
end;
$$;

grant execute on function public.servsync_admin_platform_health()      to authenticated;
grant execute on function public.servsync_admin_revenue_breakdown()     to authenticated;
grant execute on function public.servsync_admin_platform_growth()       to authenticated;
grant execute on function public.servsync_admin_contractor_activity()   to authenticated;

notify pgrst, 'reload schema';

commit;
