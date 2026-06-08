-- ServSync connection request UX improvements.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Adds:
--   1) A dismissed connection status so homeowners can hide declined/revoked
--      contractor cards without deleting history.
--   2) In-app notifications for contractor connection requests and responses.

begin;

-- Allow homeowners to hide an inactive contractor card from My Contractors.
do $$
declare
  v_constraint_name text;
begin
  select conname
    into v_constraint_name
    from pg_constraint
   where conrelid = 'public.homeowner_contractor_connections'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%'
     and pg_get_constraintdef(oid) ilike '%pending%'
   limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.homeowner_contractor_connections drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.homeowner_contractor_connections
  add constraint homeowner_contractor_connections_status_check
  check (status in ('pending', 'active', 'declined', 'revoked', 'dismissed'));

create or replace function public.servsync_notify_on_connection_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_owner uuid;
  v_contractor_name text;
begin
  select owner_user_id, business_name
    into v_contractor_owner, v_contractor_name
    from public.contractor_profiles
   where id = new.contractor_id
   limit 1;

  if TG_OP = 'INSERT' and new.status = 'pending' and v_contractor_owner is not null then
    insert into public.notifications (user_id, type, title, body)
    values (
      v_contractor_owner,
      'connection_request_pending',
      'New homeowner connection request',
      'A homeowner requested to connect with your contractor profile.'
    );
    return new;
  end if;

  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'pending' and v_contractor_owner is not null then
      insert into public.notifications (user_id, type, title, body)
      values (
        v_contractor_owner,
        'connection_request_pending',
        'Homeowner requested connection again',
        'A homeowner sent another connection request to your contractor profile.'
      );
    elsif new.status = 'active' then
      insert into public.notifications (user_id, type, title, body)
      values (
        new.homeowner_user_id,
        'connection_request_accepted',
        'Connection approved',
        coalesce(v_contractor_name, 'A contractor') || ' accepted your connection request.'
      );
    elsif new.status = 'declined' then
      insert into public.notifications (user_id, type, title, body)
      values (
        new.homeowner_user_id,
        'connection_request_declined',
        'Connection declined',
        coalesce(v_contractor_name, 'A contractor') || ' declined your connection request. You can request again or hide them from My Contractors.'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_servsync_notify_on_connection_change on public.homeowner_contractor_connections;
create trigger trg_servsync_notify_on_connection_change
  after insert or update of status on public.homeowner_contractor_connections
  for each row execute function public.servsync_notify_on_connection_change();

notify pgrst, 'reload schema';

commit;
