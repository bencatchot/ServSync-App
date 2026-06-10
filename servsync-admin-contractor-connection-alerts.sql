-- ServSync admin contractor connection-rate alerts.
-- Run in Supabase SQL Editor.
--
-- This creates an admin-only outreach work queue for contractors who have
-- enough customers to evaluate but a low homeowner connection rate.

begin;

create table if not exists public.contractor_connection_alerts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  contractor_owner_user_id uuid references public.profiles(id) on delete set null,
  alert_type text not null default 'low_connection_rate',
  connection_rate numeric not null default 0,
  total_customer_count integer not null default 0,
  connected_homeowner_count integer not null default 0,
  local_customer_count integer not null default 0,
  level text not null default 'green' check (level in ('green', 'yellow', 'red')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'contacted', 'dismissed', 'resolved')),
  last_triggered_at timestamptz,
  acknowledged_at timestamptz,
  contacted_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  next_follow_up_at timestamptz,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contractor_id, alert_type)
);

create index if not exists contractor_connection_alerts_status_idx
  on public.contractor_connection_alerts(status, level, last_triggered_at desc);

create index if not exists contractor_connection_alerts_contractor_idx
  on public.contractor_connection_alerts(contractor_id);

drop trigger if exists contractor_connection_alerts_touch_updated_at on public.contractor_connection_alerts;
create trigger contractor_connection_alerts_touch_updated_at
  before update on public.contractor_connection_alerts
  for each row execute function public.touch_updated_at();

alter table public.contractor_connection_alerts enable row level security;

drop policy if exists "contractor_connection_alerts_admin_only" on public.contractor_connection_alerts;
create policy "contractor_connection_alerts_admin_only"
  on public.contractor_connection_alerts for all to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

grant select, insert, update on public.contractor_connection_alerts to authenticated;

create or replace function public.servsync_connection_level(p_connection_rate numeric)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_connection_rate, 0) >= 0.8 then 'green'
    when coalesce(p_connection_rate, 0) >= 0.6 then 'yellow'
    else 'red'
  end;
$$;

create or replace function public.servsync_admin_refresh_connection_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_existing public.contractor_connection_alerts;
  v_updated_count integer := 0;
  v_recently_suppressed boolean;
  v_worsened_to_red boolean;
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  for r in
    with metrics as (
      select
        cp.id as contractor_id,
        cp.owner_user_id as contractor_owner_user_id,
        coalesce(local_counts.local_customer_count, 0)::int as local_customer_count,
        coalesce(connection_counts.connected_homeowner_count, 0)::int as connected_homeowner_count
      from public.contractor_profiles cp
      left join lateral (
        select count(*)::int as local_customer_count
          from public.contractor_local_contacts lc
         where lc.contractor_id = cp.id
           and lc.homeowner_user_id is null
      ) local_counts on true
      left join lateral (
        select count(distinct c.homeowner_user_id)::int as connected_homeowner_count
          from public.homeowner_contractor_connections c
         where c.contractor_id = cp.id
           and c.status = 'active'
      ) connection_counts on true
    )
    select
      m.*,
      (m.local_customer_count + m.connected_homeowner_count)::int as total_customer_count,
      case
        when (m.local_customer_count + m.connected_homeowner_count) > 0
          then round((m.connected_homeowner_count::numeric / (m.local_customer_count + m.connected_homeowner_count)::numeric), 4)
        else 0::numeric
      end as connection_rate,
      public.servsync_connection_level(
        case
          when (m.local_customer_count + m.connected_homeowner_count) > 0
            then m.connected_homeowner_count::numeric / (m.local_customer_count + m.connected_homeowner_count)::numeric
          else 0::numeric
        end
      ) as level
    from metrics m
  loop
    select * into v_existing
      from public.contractor_connection_alerts
     where contractor_id = r.contractor_id
       and alert_type = 'low_connection_rate'
     limit 1;

    if r.total_customer_count < 5 or r.level = 'green' then
      if v_existing.id is not null and v_existing.status <> 'resolved' then
        update public.contractor_connection_alerts
           set connection_rate = r.connection_rate,
               total_customer_count = r.total_customer_count,
               connected_homeowner_count = r.connected_homeowner_count,
               local_customer_count = r.local_customer_count,
               level = r.level,
               status = 'resolved',
               resolved_at = now()
         where id = v_existing.id;
        v_updated_count := v_updated_count + 1;
      end if;
      continue;
    end if;

    v_recently_suppressed := v_existing.id is not null
      and v_existing.status in ('acknowledged', 'contacted', 'dismissed')
      and greatest(
        coalesce(v_existing.acknowledged_at, '-infinity'::timestamptz),
        coalesce(v_existing.contacted_at, '-infinity'::timestamptz),
        coalesce(v_existing.dismissed_at, '-infinity'::timestamptz)
      ) > now() - interval '30 days';

    v_worsened_to_red := v_existing.id is not null
      and v_existing.level = 'yellow'
      and r.level = 'red';

    if v_existing.id is null then
      insert into public.contractor_connection_alerts (
        contractor_id,
        contractor_owner_user_id,
        connection_rate,
        total_customer_count,
        connected_homeowner_count,
        local_customer_count,
        level,
        status,
        last_triggered_at
      ) values (
        r.contractor_id,
        r.contractor_owner_user_id,
        r.connection_rate,
        r.total_customer_count,
        r.connected_homeowner_count,
        r.local_customer_count,
        r.level,
        'open',
        now()
      );
      v_updated_count := v_updated_count + 1;
    elsif v_recently_suppressed and not v_worsened_to_red then
      update public.contractor_connection_alerts
         set contractor_owner_user_id = r.contractor_owner_user_id,
             connection_rate = r.connection_rate,
             total_customer_count = r.total_customer_count,
             connected_homeowner_count = r.connected_homeowner_count,
             local_customer_count = r.local_customer_count,
             level = r.level
       where id = v_existing.id;
    else
      update public.contractor_connection_alerts
         set contractor_owner_user_id = r.contractor_owner_user_id,
             connection_rate = r.connection_rate,
             total_customer_count = r.total_customer_count,
             connected_homeowner_count = r.connected_homeowner_count,
             local_customer_count = r.local_customer_count,
             level = r.level,
             status = case
               when v_worsened_to_red or v_existing.status in ('acknowledged', 'contacted', 'dismissed', 'resolved') then 'open'
               else status
             end,
             last_triggered_at = case
               when v_worsened_to_red or v_existing.status in ('acknowledged', 'contacted', 'dismissed', 'resolved') then now()
               else coalesce(last_triggered_at, now())
             end,
             resolved_at = case
               when v_worsened_to_red or v_existing.status in ('acknowledged', 'contacted', 'dismissed', 'resolved') then null
               else resolved_at
             end
       where id = v_existing.id;
      v_updated_count := v_updated_count + 1;
    end if;
  end loop;

  return v_updated_count;
end;
$$;

create or replace function public.servsync_admin_contractor_adoption()
returns table (
  contractor_id uuid,
  contractor_name text,
  contractor_owner_user_id uuid,
  owner_email text,
  total_customer_count integer,
  connected_homeowner_count integer,
  local_customer_count integer,
  connection_rate numeric,
  connection_level text,
  invites_sent_count integer,
  invites_used_count integer,
  last_customer_created_at timestamptz,
  last_invite_used_at timestamptz,
  alert_id uuid,
  alert_status text,
  alert_level text,
  last_triggered_at timestamptz,
  acknowledged_at timestamptz,
  contacted_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  next_follow_up_at timestamptz,
  admin_notes text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  perform public.servsync_admin_refresh_connection_alerts();

  return query
  with metrics as (
    select
      cp.id as contractor_id,
      cp.business_name as contractor_name,
      cp.owner_user_id as contractor_owner_user_id,
      p.email as owner_email,
      coalesce(local_counts.local_customer_count, 0)::int as local_customer_count,
      coalesce(connection_counts.connected_homeowner_count, 0)::int as connected_homeowner_count,
      coalesce(invite_counts.invites_sent_count, 0)::int as invites_sent_count,
      coalesce(invite_counts.invites_used_count, 0)::int as invites_used_count,
      greatest(local_counts.last_local_customer_created_at, connection_counts.last_connection_created_at) as last_customer_created_at,
      invite_counts.last_invite_used_at
    from public.contractor_profiles cp
    left join public.profiles p on p.id = cp.owner_user_id
    left join lateral (
      select
        count(*)::int as local_customer_count,
        max(created_at) as last_local_customer_created_at
      from public.contractor_local_contacts lc
      where lc.contractor_id = cp.id
        and lc.homeowner_user_id is null
    ) local_counts on true
    left join lateral (
      select
        count(distinct c.homeowner_user_id)::int as connected_homeowner_count,
        max(c.created_at) as last_connection_created_at
      from public.homeowner_contractor_connections c
      where c.contractor_id = cp.id
        and c.status = 'active'
    ) connection_counts on true
    left join lateral (
      select
        (
          (select count(*) from public.contractor_invites ci where ci.contractor_id = cp.id)
          +
          (select count(*) from public.contractor_local_customer_claim_invites lci where lci.contractor_id = cp.id)
        )::int as invites_sent_count,
        (
          (select count(*) from public.contractor_invites ci where ci.contractor_id = cp.id and (ci.status = 'used' or ci.used_by_homeowner_id is not null))
          +
          (select count(*) from public.contractor_local_customer_claim_invites lci where lci.contractor_id = cp.id and lci.status = 'claimed')
        )::int as invites_used_count,
        greatest(
          (select max(ci.used_at) from public.contractor_invites ci where ci.contractor_id = cp.id),
          (select max(lci.used_at) from public.contractor_local_customer_claim_invites lci where lci.contractor_id = cp.id)
        ) as last_invite_used_at
    ) invite_counts on true
  )
  select
    m.contractor_id,
    m.contractor_name,
    m.contractor_owner_user_id,
    m.owner_email,
    (m.local_customer_count + m.connected_homeowner_count)::int as total_customer_count,
    m.connected_homeowner_count,
    m.local_customer_count,
    case
      when (m.local_customer_count + m.connected_homeowner_count) > 0
        then round((m.connected_homeowner_count::numeric / (m.local_customer_count + m.connected_homeowner_count)::numeric), 4)
      else 0::numeric
    end as connection_rate,
    public.servsync_connection_level(
      case
        when (m.local_customer_count + m.connected_homeowner_count) > 0
          then m.connected_homeowner_count::numeric / (m.local_customer_count + m.connected_homeowner_count)::numeric
        else 0::numeric
      end
    ) as connection_level,
    m.invites_sent_count,
    m.invites_used_count,
    m.last_customer_created_at,
    m.last_invite_used_at,
    a.id as alert_id,
    a.status as alert_status,
    a.level as alert_level,
    a.last_triggered_at,
    a.acknowledged_at,
    a.contacted_at,
    a.dismissed_at,
    a.resolved_at,
    a.next_follow_up_at,
    a.admin_notes
  from metrics m
  left join public.contractor_connection_alerts a
    on a.contractor_id = m.contractor_id
   and a.alert_type = 'low_connection_rate'
  order by
    case public.servsync_connection_level(
      case
        when (m.local_customer_count + m.connected_homeowner_count) > 0
          then m.connected_homeowner_count::numeric / (m.local_customer_count + m.connected_homeowner_count)::numeric
        else 0::numeric
      end
    )
      when 'red' then 1
      when 'yellow' then 2
      else 3
    end,
    (m.local_customer_count + m.connected_homeowner_count) desc,
    m.contractor_name;
end;
$$;

create or replace function public.servsync_admin_connection_alerts()
returns setof public.contractor_connection_alerts
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  perform public.servsync_admin_refresh_connection_alerts();

  return query
  select *
    from public.contractor_connection_alerts
   where status in ('open', 'acknowledged', 'contacted')
   order by
     case level when 'red' then 1 when 'yellow' then 2 else 3 end,
     last_triggered_at desc nulls last;
end;
$$;

create or replace function public.servsync_admin_update_connection_alert(
  p_alert_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_next_follow_up_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_status not in ('open', 'acknowledged', 'contacted', 'dismissed', 'resolved') then
    raise exception 'Invalid alert status';
  end if;

  update public.contractor_connection_alerts
     set status = p_status,
         admin_notes = coalesce(p_admin_notes, admin_notes),
         next_follow_up_at = p_next_follow_up_at,
         acknowledged_at = case when p_status = 'acknowledged' then now() else acknowledged_at end,
         contacted_at = case when p_status = 'contacted' then now() else contacted_at end,
         dismissed_at = case when p_status = 'dismissed' then now() else dismissed_at end,
         resolved_at = case when p_status = 'resolved' then now() else resolved_at end
   where id = p_alert_id;
end;
$$;

grant execute on function public.servsync_admin_refresh_connection_alerts() to authenticated;
grant execute on function public.servsync_admin_contractor_adoption() to authenticated;
grant execute on function public.servsync_admin_connection_alerts() to authenticated;
grant execute on function public.servsync_admin_update_connection_alert(uuid, text, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;
