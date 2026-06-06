-- ServSync support inquiries and feature/tweak request conversations.
-- Paste this into the Supabase SQL Editor for the ServSync project.

begin;

-- Notifications can optionally point directly to a support inquiry.
alter table public.notifications
  add column if not exists support_inquiry_id uuid;

-- ── Support inquiries ───────────────────────────────────────────────────────

create table if not exists public.support_inquiries (
  id                  uuid primary key default gen_random_uuid(),
  requester_user_id   uuid not null references auth.users(id) on delete cascade,
  requester_role      text not null check (requester_role in ('homeowner', 'contractor')),
  status              text not null default 'new' check (status in ('new', 'in_progress', 'waiting_on_user', 'waiting_on_admin', 'resolved', 'closed')),
  category            text not null default 'feature_request' check (category in ('feature_request', 'tweak', 'bug', 'question', 'billing', 'other')),
  title               text not null,
  last_admin_reply_at timestamptz,
  last_user_reply_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.support_inquiry_messages (
  id            uuid primary key default gen_random_uuid(),
  inquiry_id    uuid not null references public.support_inquiries(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role    text not null check (actor_role in ('homeowner', 'contractor', 'platform_admin')),
  message_type  text not null default 'user_message' check (message_type in ('user_message', 'admin_reply', 'status_update')),
  body          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists support_inquiries_requester_idx
  on public.support_inquiries(requester_user_id, updated_at desc);

create index if not exists support_inquiries_status_idx
  on public.support_inquiries(status, updated_at desc);

create index if not exists support_inquiry_messages_inquiry_idx
  on public.support_inquiry_messages(inquiry_id, created_at asc);

alter table public.support_inquiries replica identity full;
alter table public.support_inquiry_messages replica identity full;

alter table public.support_inquiries enable row level security;
alter table public.support_inquiry_messages enable row level security;

-- Users can see and create their own support inquiries.
drop policy if exists "support_inquiries_select_own_or_admin" on public.support_inquiries;
create policy "support_inquiries_select_own_or_admin"
  on public.support_inquiries for select to authenticated
  using (requester_user_id = auth.uid() or public.current_user_is_platform_admin());

drop policy if exists "support_inquiries_insert_own" on public.support_inquiries;
create policy "support_inquiries_insert_own"
  on public.support_inquiries for insert to authenticated
  with check (
    requester_user_id = auth.uid()
    and requester_role in ('homeowner', 'contractor')
  );

drop policy if exists "support_inquiries_update_own_or_admin" on public.support_inquiries;
drop policy if exists "support_inquiries_update_admin" on public.support_inquiries;
create policy "support_inquiries_update_admin"
  on public.support_inquiries for update to authenticated
  using (public.current_user_is_platform_admin())
  with check (public.current_user_is_platform_admin());

-- Messages are visible to the requester and platform admin.
drop policy if exists "support_messages_select_own_or_admin" on public.support_inquiry_messages;
create policy "support_messages_select_own_or_admin"
  on public.support_inquiry_messages for select to authenticated
  using (
    exists (
      select 1
        from public.support_inquiries si
       where si.id = support_inquiry_messages.inquiry_id
         and (si.requester_user_id = auth.uid() or public.current_user_is_platform_admin())
    )
  );

drop policy if exists "support_messages_insert_own_or_admin" on public.support_inquiry_messages;
create policy "support_messages_insert_own_or_admin"
  on public.support_inquiry_messages for insert to authenticated
  with check (
    (
      actor_user_id = auth.uid()
      and actor_role in ('homeowner', 'contractor')
      and exists (
        select 1
          from public.support_inquiries si
         where si.id = support_inquiry_messages.inquiry_id
           and si.requester_user_id = auth.uid()
      )
    )
    or (
      actor_user_id is null
      and actor_role = 'platform_admin'
      and public.current_user_is_platform_admin()
    )
  );

grant select, insert, update on public.support_inquiries to authenticated;
grant select, insert on public.support_inquiry_messages to authenticated;

-- ── Updated-at and notification helpers ─────────────────────────────────────

create or replace function public.touch_support_inquiry_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_inquiries
     set updated_at = now(),
         last_user_reply_at = case when new.actor_role in ('homeowner', 'contractor') then now() else last_user_reply_at end,
         last_admin_reply_at = case when new.actor_role = 'platform_admin' then now() else last_admin_reply_at end,
         status = case
           when new.actor_role in ('homeowner', 'contractor') and status not in ('new', 'closed', 'resolved') then 'waiting_on_admin'
           when new.actor_role = 'platform_admin' and status not in ('closed', 'resolved') then 'waiting_on_user'
           else status
         end
   where id = new.inquiry_id;

  return new;
end;
$$;

drop trigger if exists trg_touch_support_inquiry_from_message on public.support_inquiry_messages;
create trigger trg_touch_support_inquiry_from_message
  after insert on public.support_inquiry_messages
  for each row execute function public.touch_support_inquiry_from_message();

create or replace function public.touch_support_inquiry_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_support_inquiry_updated_at on public.support_inquiries;
create trigger trg_touch_support_inquiry_updated_at
  before update on public.support_inquiries
  for each row execute function public.touch_support_inquiry_updated_at();

create or replace function public.notify_on_support_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.support_inquiries;
begin
  select * into v_inquiry from public.support_inquiries where id = new.inquiry_id;
  if v_inquiry.id is null then
    return new;
  end if;

  if new.actor_role = 'platform_admin' and new.message_type = 'admin_reply' then
    insert into public.notifications (user_id, type, title, body, support_inquiry_id)
    values (
      v_inquiry.requester_user_id,
      'support_admin_reply',
      'ServSync replied',
      v_inquiry.title,
      v_inquiry.id
    );
  elsif new.actor_role in ('homeowner', 'contractor') then
    insert into public.notifications (user_id, type, title, body, support_inquiry_id)
    select p.id,
           'support_user_reply',
           'New support inquiry update',
           v_inquiry.title,
           v_inquiry.id
      from public.profiles p
     where p.role = 'platform_admin';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_support_message on public.support_inquiry_messages;
create trigger trg_notify_on_support_message
  after insert on public.support_inquiry_messages
  for each row execute function public.notify_on_support_message();

commit;
