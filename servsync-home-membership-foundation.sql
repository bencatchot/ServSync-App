-- ServSync FB-030 Slice 1A home membership foundation.
-- Adds home-level membership scaffolding for future shared homeowner access.
-- This patch does not broaden existing homeowner access to service records,
-- storage objects, documents, reminders, messages, estimates, invoices, or jobs.

begin;

create extension if not exists pgcrypto;

create table if not exists public.home_memberships (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_memberships_role_check
    check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint home_memberships_status_check
    check (status in ('invited', 'active', 'removed', 'declined')),
  constraint home_memberships_lifecycle_check
    check (
      (status = 'active' and removed_at is null)
      or (status = 'invited' and accepted_at is null and removed_at is null)
      or (status = 'removed' and removed_at is not null)
      or (status = 'declined' and removed_at is not null)
    )
);

comment on table public.home_memberships is
  'FB-030 home-level membership foundation. Existing homes remain owned by homes.homeowner_user_id; future slices must opt existing records into shared access table by table.';

comment on column public.home_memberships.role is
  'Home-level role for future shared homeowner access: owner, admin, member, viewer.';

comment on column public.home_memberships.status is
  'Membership lifecycle status. Only active rows qualify for normal access helpers.';

create index if not exists home_memberships_home_idx
  on public.home_memberships(home_id);

create index if not exists home_memberships_user_idx
  on public.home_memberships(user_id);

create index if not exists home_memberships_home_user_idx
  on public.home_memberships(home_id, user_id);

create index if not exists home_memberships_active_home_user_idx
  on public.home_memberships(home_id, user_id)
  where status = 'active';

create unique index if not exists home_memberships_home_user_open_unique
  on public.home_memberships(home_id, user_id)
  where status in ('invited', 'active');

drop trigger if exists home_memberships_touch_updated_at on public.home_memberships;
create trigger home_memberships_touch_updated_at
  before update on public.home_memberships
  for each row execute function public.touch_updated_at();

create or replace function public.home_memberships_protect_primary_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_primary_owner boolean;
begin
  if tg_op = 'INSERT' then
    select exists (
      select 1
        from public.homes h
       where h.id = new.home_id
         and h.homeowner_user_id = new.user_id
    ) into v_is_primary_owner;

    if v_is_primary_owner
       and (new.role <> 'owner' or new.status <> 'active' or new.removed_at is not null) then
      raise exception 'Primary homeowner membership must remain active owner.';
    end if;

    return new;
  end if;

  select exists (
    select 1
      from public.homes h
     where h.id = old.home_id
       and h.homeowner_user_id = old.user_id
  ) into v_is_primary_owner;

  if not v_is_primary_owner then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Primary homeowner membership cannot be deleted.';
  end if;

  if new.home_id <> old.home_id
     or new.user_id <> old.user_id
     or new.role <> 'owner'
     or new.status <> 'active'
     or new.removed_at is not null then
    raise exception 'Primary homeowner membership cannot be removed, reassigned, or demoted.';
  end if;

  return new;
end;
$$;

drop trigger if exists home_memberships_protect_primary_owner_trigger
  on public.home_memberships;
create trigger home_memberships_protect_primary_owner_trigger
  before insert or update or delete on public.home_memberships
  for each row execute function public.home_memberships_protect_primary_owner();

insert into public.home_memberships (
  home_id,
  user_id,
  role,
  status,
  accepted_at,
  created_at,
  updated_at
)
select
  h.id,
  h.homeowner_user_id,
  'owner',
  'active',
  now(),
  now(),
  now()
from public.homes h
where h.homeowner_user_id is not null
on conflict do nothing;

create or replace function public.current_user_home_role(p_home_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with actor as (
    select auth.uid() as user_id
  )
  select case
    when actor.user_id is null or p_home_id is null then null
    when exists (
      select 1
        from public.homes h
       where h.id = p_home_id
         and h.homeowner_user_id = actor.user_id
    ) then 'owner'
    else (
      select hm.role
        from public.home_memberships hm
       where hm.home_id = p_home_id
         and hm.user_id = actor.user_id
         and hm.status = 'active'
       order by case hm.role
         when 'owner' then 1
         when 'admin' then 2
         when 'member' then 3
         when 'viewer' then 4
         else 5
       end
       limit 1
    )
  end
  from actor;
$$;

comment on function public.current_user_home_role(uuid) is
  'Returns the active home-level role for auth.uid(), preserving homes.homeowner_user_id as owner for compatibility.';

create or replace function public.current_user_can_access_home(p_home_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_home_role(p_home_id) in ('owner', 'admin', 'member', 'viewer'), false);
$$;

create or replace function public.current_user_can_manage_home(p_home_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_home_role(p_home_id) in ('owner', 'admin'), false);
$$;

create or replace function public.current_user_can_approve_home_work(p_home_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_home_role(p_home_id) in ('owner', 'admin'), false);
$$;

create or replace function public.current_user_can_manage_home_connections(p_home_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_home_role(p_home_id) in ('owner', 'admin'), false);
$$;

revoke execute on function public.current_user_home_role(uuid) from public;
revoke execute on function public.current_user_home_role(uuid) from anon;
grant execute on function public.current_user_home_role(uuid) to authenticated;

revoke execute on function public.current_user_can_access_home(uuid) from public;
revoke execute on function public.current_user_can_access_home(uuid) from anon;
grant execute on function public.current_user_can_access_home(uuid) to authenticated;

revoke execute on function public.current_user_can_manage_home(uuid) from public;
revoke execute on function public.current_user_can_manage_home(uuid) from anon;
grant execute on function public.current_user_can_manage_home(uuid) to authenticated;

revoke execute on function public.current_user_can_approve_home_work(uuid) from public;
revoke execute on function public.current_user_can_approve_home_work(uuid) from anon;
grant execute on function public.current_user_can_approve_home_work(uuid) to authenticated;

revoke execute on function public.current_user_can_manage_home_connections(uuid) from public;
revoke execute on function public.current_user_can_manage_home_connections(uuid) from anon;
grant execute on function public.current_user_can_manage_home_connections(uuid) to authenticated;

alter table public.home_memberships enable row level security;

drop policy if exists "Home memberships: user reads own row" on public.home_memberships;
create policy "Home memberships: user reads own row"
  on public.home_memberships for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Home memberships: primary owner reads home rows" on public.home_memberships;
create policy "Home memberships: primary owner reads home rows"
  on public.home_memberships for select to authenticated
  using (
    exists (
      select 1
        from public.homes h
       where h.id = home_memberships.home_id
         and h.homeowner_user_id = auth.uid()
    )
  );

drop policy if exists "Home memberships: owner admin reads home rows" on public.home_memberships;
create policy "Home memberships: owner admin reads home rows"
  on public.home_memberships for select to authenticated
  using (public.current_user_can_manage_home(home_id));

drop policy if exists "Home memberships: platform admin reads" on public.home_memberships;
create policy "Home memberships: platform admin reads"
  on public.home_memberships for select to authenticated
  using (public.current_user_is_platform_admin());

revoke all on table public.home_memberships from public;
revoke all on table public.home_memberships from anon;
revoke all on table public.home_memberships from authenticated;
grant select on table public.home_memberships to authenticated;

notify pgrst, 'reload schema';

commit;
