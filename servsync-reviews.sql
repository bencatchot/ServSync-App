-- ServSync homeowner reviews & kudos.
-- Paste this into the Supabase SQL Editor for the ServSync project.
-- Run after servsync-notifications.sql.

begin;

-- ── Reviews table ────────────────────────────────────────────────────────────

create table if not exists public.service_request_reviews (
  id                uuid        primary key default gen_random_uuid(),
  request_id        uuid        not null unique references public.service_requests(id) on delete cascade,
  homeowner_user_id uuid        not null references auth.users(id),
  contractor_id     uuid        not null references public.contractor_profiles(id),
  rating            smallint    not null check (rating between 1 and 5),
  body              text        not null default '',
  kudos             text[]      not null default '{}',
  created_at        timestamptz not null default now()
);

create index if not exists reviews_contractor_idx
  on public.service_request_reviews(contractor_id, created_at desc);

alter table public.service_request_reviews enable row level security;

drop policy if exists "review_insert_homeowner" on public.service_request_reviews;
create policy "review_insert_homeowner"
  on public.service_request_reviews for insert to authenticated
  with check (
    homeowner_user_id = auth.uid()
    and exists (
      select 1 from public.service_requests sr
       where sr.id = request_id
         and sr.homeowner_user_id = auth.uid()
         and sr.status = 'closed'
    )
  );

drop policy if exists "review_read_parties" on public.service_request_reviews;
create policy "review_read_parties"
  on public.service_request_reviews for select to authenticated
  using (
    homeowner_user_id = auth.uid()
    or exists (
      select 1 from public.contractor_profiles cp
       where cp.id = contractor_id and cp.owner_user_id = auth.uid()
    )
    or public.current_user_is_platform_admin()
  );

grant select, insert on public.service_request_reviews to authenticated;

-- ── RPC: submit review ───────────────────────────────────────────────────────

create or replace function public.servsync_homeowner_submit_review(
  p_request_id uuid,
  p_rating     smallint,
  p_body       text    default '',
  p_kudos      text[]  default '{}'
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
    (request_id, homeowner_user_id, contractor_id, rating, body, kudos)
  values
    (v_request.id, auth.uid(), v_request.contractor_id,
     p_rating,
     coalesce(nullif(trim(p_body), ''), ''),
     coalesce(p_kudos, '{}'))
  on conflict (request_id) do update
     set rating = excluded.rating,
         body   = excluded.body,
         kudos  = excluded.kudos;

  return jsonb_build_object('request_id', v_request.id, 'rating', p_rating);
end;
$$;

grant execute on function public.servsync_homeowner_submit_review(uuid, smallint, text, text[]) to authenticated;

-- ── Rebuild both fetch RPCs with review column ───────────────────────────────

drop function if exists public.servsync_homeowner_service_requests();
create function public.servsync_homeowner_service_requests()
returns table (
  id                uuid,
  connection_id     uuid,
  contractor_id     uuid,
  contractor_name   text,
  homeowner_user_id uuid,
  homeowner_name    text,
  homeowner_city    text,
  category          text,
  title             text,
  description       text,
  urgency           text,
  status            text,
  closing_summary   text,
  messages          jsonb,
  media             jsonb,
  quote             jsonb,
  appointment       jsonb,
  review            jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql security definer set search_path = public stable
as $$
  select
    sr.id, sr.connection_id, sr.contractor_id,
    cp.business_name                       as contractor_name,
    sr.homeowner_user_id,
    coalesce(hp.display_name, 'Homeowner') as homeowner_name,
    coalesce(hp.city, '')                  as homeowner_city,
    sr.category, sr.title, sr.description, sr.urgency, sr.status, sr.closing_summary,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'actor_user_id', m.actor_user_id,
        'actor_role', m.actor_role, 'message_type', m.message_type,
        'body', m.body, 'created_at', m.created_at
      ) order by m.created_at asc)
      from public.service_request_messages m where m.request_id = sr.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', med.id, 'message_id', med.message_id,
        'storage_path', med.storage_path, 'file_name', med.file_name,
        'content_type', med.content_type, 'created_at', med.created_at
      ) order by med.created_at asc)
      from public.service_request_media med where med.request_id = sr.id
    ), '[]'::jsonb) as media,
    (select jsonb_build_object(
       'id', q.id, 'request_id', q.request_id, 'contractor_id', q.contractor_id,
       'amount_cents', q.amount_cents, 'scope', q.scope, 'status', q.status,
       'created_at', q.created_at, 'updated_at', q.updated_at)
     from public.service_request_quotes q where q.request_id = sr.id limit 1) as quote,
    (select jsonb_build_object(
       'id', a.id, 'request_id', a.request_id, 'contractor_id', a.contractor_id,
       'proposed_at', a.proposed_at, 'notes', a.notes, 'status', a.status,
       'proposed_by', a.proposed_by, 'created_at', a.created_at, 'updated_at', a.updated_at)
     from public.service_request_appointments a where a.request_id = sr.id limit 1) as appointment,
    (select jsonb_build_object(
       'id', rv.id, 'request_id', rv.request_id,
       'rating', rv.rating, 'body', rv.body, 'kudos', rv.kudos,
       'created_at', rv.created_at)
     from public.service_request_reviews rv where rv.request_id = sr.id limit 1) as review,
    sr.created_at, sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where sr.homeowner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

drop function if exists public.servsync_contractor_service_requests();
create function public.servsync_contractor_service_requests()
returns table (
  id                uuid,
  connection_id     uuid,
  contractor_id     uuid,
  contractor_name   text,
  homeowner_user_id uuid,
  homeowner_name    text,
  homeowner_city    text,
  category          text,
  title             text,
  description       text,
  urgency           text,
  status            text,
  closing_summary   text,
  messages          jsonb,
  media             jsonb,
  quote             jsonb,
  appointment       jsonb,
  review            jsonb,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql security definer set search_path = public stable
as $$
  select
    sr.id, sr.connection_id, sr.contractor_id,
    cp.business_name as contractor_name,
    sr.homeowner_user_id,
    case when coalesce(perm.share_contact, false) then coalesce(hp.display_name, 'Homeowner') else 'Homeowner' end as homeowner_name,
    case when coalesce(perm.share_contact, false) then coalesce(hp.city, '') else '' end as homeowner_city,
    sr.category, sr.title, sr.description, sr.urgency, sr.status, sr.closing_summary,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'actor_user_id', m.actor_user_id,
        'actor_role', m.actor_role, 'message_type', m.message_type,
        'body', m.body, 'created_at', m.created_at
      ) order by m.created_at asc)
      from public.service_request_messages m where m.request_id = sr.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', med.id, 'message_id', med.message_id,
        'storage_path', med.storage_path, 'file_name', med.file_name,
        'content_type', med.content_type, 'created_at', med.created_at
      ) order by med.created_at asc)
      from public.service_request_media med where med.request_id = sr.id
    ), '[]'::jsonb) as media,
    (select jsonb_build_object(
       'id', q.id, 'request_id', q.request_id, 'contractor_id', q.contractor_id,
       'amount_cents', q.amount_cents, 'scope', q.scope, 'status', q.status,
       'created_at', q.created_at, 'updated_at', q.updated_at)
     from public.service_request_quotes q where q.request_id = sr.id limit 1) as quote,
    (select jsonb_build_object(
       'id', a.id, 'request_id', a.request_id, 'contractor_id', a.contractor_id,
       'proposed_at', a.proposed_at, 'notes', a.notes, 'status', a.status,
       'proposed_by', a.proposed_by, 'created_at', a.created_at, 'updated_at', a.updated_at)
     from public.service_request_appointments a where a.request_id = sr.id limit 1) as appointment,
    (select jsonb_build_object(
       'id', rv.id, 'request_id', rv.request_id,
       'rating', rv.rating, 'body', rv.body, 'kudos', rv.kudos,
       'created_at', rv.created_at)
     from public.service_request_reviews rv where rv.request_id = sr.id limit 1) as review,
    sr.created_at, sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  join public.homeowner_contractor_connections c on c.id = sr.connection_id
  left join public.connection_permissions perm on perm.connection_id = c.id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  where cp.owner_user_id = auth.uid()
  order by sr.updated_at desc, sr.created_at desc;
$$;

grant execute on function public.servsync_homeowner_service_requests() to authenticated;
grant execute on function public.servsync_contractor_service_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
