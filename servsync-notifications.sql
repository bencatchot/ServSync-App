-- ServSync in-app notifications.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-contractor-media.sql.

begin;

-- ── Notifications table ──────────────────────────────────────────────────────

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text        not null default '',
  request_id  uuid        references public.service_requests(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

-- Enable full replication so realtime row-level filtering works
alter table public.notifications replica identity full;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = auth.uid());

grant select, update on public.notifications to authenticated;

-- ── Helper: look up a contractor's owner_user_id ────────────────────────────

create or replace function public._notif_contractor_user(p_contractor_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select owner_user_id from public.contractor_profiles where id = p_contractor_id limit 1;
$$;

-- ── Trigger: notifications from service_request_messages ────────────────────

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request        public.service_requests;
  v_contractor_uid uuid;
  v_notify_uid     uuid;
  v_title          text;
  v_body           text;
begin
  select * into v_request from public.service_requests where id = new.request_id;
  if v_request.id is null then return new; end if;

  v_contractor_uid := public._notif_contractor_user(v_request.contractor_id);

  case new.message_type
    when 'homeowner_request' then
      v_notify_uid := v_contractor_uid;
      v_title      := 'New service request';
      v_body       := v_request.title;
    when 'contractor_response' then
      v_notify_uid := v_request.homeowner_user_id;
      v_title      := 'Contractor responded';
      v_body       := v_request.title;
    when 'contractor_declined' then
      v_notify_uid := v_request.homeowner_user_id;
      v_title      := 'Request declined';
      v_body       := v_request.title;
    when 'homeowner_reply' then
      v_notify_uid := v_contractor_uid;
      v_title      := 'Homeowner replied';
      v_body       := v_request.title;
    when 'homeowner_closed' then
      v_notify_uid := v_contractor_uid;
      v_title      := 'Request closed by homeowner';
      v_body       := v_request.title;
    when 'contractor_closed' then
      v_notify_uid := v_request.homeowner_user_id;
      v_title      := 'Request closed';
      v_body       := v_request.title;
    when 'reopened' then
      if new.actor_user_id = v_request.homeowner_user_id then
        v_notify_uid := v_contractor_uid;
        v_title      := 'Request reopened by homeowner';
      else
        v_notify_uid := v_request.homeowner_user_id;
        v_title      := 'Request reopened by contractor';
      end if;
      v_body := v_request.title;
    else
      return new;
  end case;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (v_notify_uid, new.message_type, v_title, v_body, new.request_id);

  return new;
end;
$$;

drop trigger if exists trg_notify_on_message on public.service_request_messages;
create trigger trg_notify_on_message
  after insert on public.service_request_messages
  for each row execute function public.notify_on_message();

-- ── Trigger: notifications from service_request_appointments ────────────────

create or replace function public.notify_on_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request        public.service_requests;
  v_contractor_uid uuid;
  v_notify_uid     uuid;
  v_title          text;
  v_body           text;
begin
  select * into v_request from public.service_requests where id = new.request_id;
  if v_request.id is null then return new; end if;

  v_contractor_uid := public._notif_contractor_user(v_request.contractor_id);

  -- Skip if nothing changed that we care about
  if TG_OP = 'UPDATE' and old.status = new.status and old.proposed_by is not distinct from new.proposed_by then
    return new;
  end if;

  if new.status = 'proposed' then
    if new.proposed_by = 'contractor' then
      v_notify_uid := v_request.homeowner_user_id;
      v_title      := 'Appointment proposed';
    else
      v_notify_uid := v_contractor_uid;
      v_title      := 'Homeowner proposed a new time';
    end if;
    v_body := v_request.title;
  elsif new.status = 'confirmed' then
    v_notify_uid := v_contractor_uid;
    v_title      := 'Appointment confirmed';
    v_body       := v_request.title;
  elsif new.status = 'completed' then
    v_notify_uid := v_request.homeowner_user_id;
    v_title      := 'Appointment marked complete';
    v_body       := v_request.title;
  elsif new.status = 'cancelled' then
    -- Notify whoever didn't cancel
    if TG_OP = 'INSERT' then return new; end if;
    v_notify_uid := case
      when old.proposed_by = 'contractor' then v_request.homeowner_user_id
      else v_contractor_uid
    end;
    v_title      := 'Appointment cancelled';
    v_body       := v_request.title;
  else
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (v_notify_uid, 'appointment_' || new.status, v_title, v_body, new.request_id);

  return new;
end;
$$;

drop trigger if exists trg_notify_on_appointment on public.service_request_appointments;
create trigger trg_notify_on_appointment
  after insert or update on public.service_request_appointments
  for each row execute function public.notify_on_appointment();

-- ── Trigger: notifications from service_request_quotes ──────────────────────

create or replace function public.notify_on_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request        public.service_requests;
  v_contractor_uid uuid;
  v_title          text;
  v_body           text;
begin
  select * into v_request from public.service_requests where id = new.request_id;
  if v_request.id is null then return new; end if;

  v_contractor_uid := public._notif_contractor_user(v_request.contractor_id);

  -- Only notify on quote status changes, not initial insert (that's covered by contractor_response message)
  if TG_OP = 'INSERT' then return new; end if;
  if old.status = new.status then return new; end if;

  if new.status = 'accepted' then
    insert into public.notifications (user_id, type, title, body, request_id)
    values (v_contractor_uid, 'quote_accepted', 'Quote accepted', v_request.title, new.request_id);
  elsif new.status = 'declined' then
    insert into public.notifications (user_id, type, title, body, request_id)
    values (v_contractor_uid, 'quote_declined', 'Quote declined', v_request.title, new.request_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_quote on public.service_request_quotes;
create trigger trg_notify_on_quote
  after insert or update on public.service_request_quotes
  for each row execute function public.notify_on_quote();

-- ── RPC: mark notifications read ────────────────────────────────────────────

create or replace function public.servsync_mark_notifications_read(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and id = any(p_ids)
     and read_at is null;
end;
$$;

grant execute on function public.servsync_mark_notifications_read(uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
