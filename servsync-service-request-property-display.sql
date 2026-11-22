-- Keep contractor request property display consistent with the selected home’s sharing choices.
-- Forward-only replacement: preserves the existing signature and execution grants.

begin;

create or replace function public.servsync_contractor_service_requests()
returns table (
  id uuid,
  connection_id uuid,
  contractor_id uuid,
  contractor_name text,
  homeowner_user_id uuid,
  homeowner_name text,
  homeowner_city text,
  home_id uuid,
  home_label text,
  home_address text,
  category text,
  title text,
  description text,
  urgency text,
  status text,
  closing_summary text,
  messages jsonb,
  media jsonb,
  quote jsonb,
  appointment jsonb,
  review jsonb,
  review_eligible boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    sr.id,
    sr.connection_id,
    sr.contractor_id,
    cp.business_name as contractor_name,
    sr.homeowner_user_id,
    case
      when coalesce(perm.share_contact, false) then coalesce(hp.display_name, 'Homeowner')
      else 'Homeowner'
    end as homeowner_name,
    case
      when coalesce(perm.share_contact, false) then coalesce(hp.city, '')
      else ''
    end as homeowner_city,
    sr.home_id,
    case
      when shared.share_home_overview then coalesce(nullif(h.nickname, ''), '')
      else ''
    end as home_label,
    case
      when shared.share_address then concat_ws(', ',
        nullif(h.address_line1, ''),
        nullif(h.address_line2, ''),
        nullif(concat_ws(' ', nullif(h.city, ''), nullif(h.state, ''), nullif(h.zip_code, '')), '')
      )
      when shared.share_home_overview then concat_ws(' ', nullif(h.city, ''), nullif(h.state, ''))
      else ''
    end as home_address,
    sr.category,
    sr.title,
    sr.description,
    sr.urgency,
    sr.status,
    sr.closing_summary,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'actor_user_id', m.actor_user_id,
        'actor_role', m.actor_role,
        'message_type', m.message_type,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at asc)
        from public.service_request_messages m
       where m.request_id = sr.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', med.id,
        'message_id', med.message_id,
        'storage_path', med.storage_path,
        'file_name', med.file_name,
        'content_type', med.content_type,
        'created_at', med.created_at
      ) order by med.created_at asc)
        from public.service_request_media med
       where med.request_id = sr.id
    ), '[]'::jsonb) as media,
    (
      select jsonb_build_object(
        'id', q.id,
        'request_id', q.request_id,
        'contractor_id', q.contractor_id,
        'amount_cents', q.amount_cents,
        'scope', q.scope,
        'status', q.status,
        'created_at', q.created_at,
        'updated_at', q.updated_at
      )
        from public.service_request_quotes q
       where q.request_id = sr.id
       limit 1
    ) as quote,
    (
      select jsonb_build_object(
        'id', a.id,
        'request_id', a.request_id,
        'contractor_id', a.contractor_id,
        'proposed_at', a.proposed_at,
        'notes', a.notes,
        'status', a.status,
        'proposed_by', a.proposed_by,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
        from public.service_request_appointments a
       where a.request_id = sr.id
       limit 1
    ) as appointment,
    (
      select jsonb_build_object(
        'id', rv.id,
        'request_id', rv.request_id,
        'rating', rv.rating,
        'body', rv.body,
        'kudos', rv.kudos,
        'reviewer_display_name', rv.reviewer_display_name,
        'reviewer_location', rv.reviewer_location,
        'created_at', rv.created_at
      )
        from public.service_request_reviews rv
       where rv.request_id = sr.id
       limit 1
    ) as review,
    (
      sr.status = 'closed'
      and not exists (
        select 1
          from public.service_request_reviews rv
         where rv.request_id = sr.id
      )
      and public.servsync_service_request_has_completed_work(
        sr.id,
        sr.contractor_id,
        sr.homeowner_user_id
      )
    ) as review_eligible,
    sr.created_at,
    sr.updated_at
  from public.service_requests sr
  join public.contractor_profiles cp on cp.id = sr.contractor_id
  join public.homeowner_contractor_connections c on c.id = sr.connection_id
  left join public.connection_permissions perm on perm.connection_id = c.id
  left join public.homeowner_profiles hp on hp.user_id = sr.homeowner_user_id
  left join public.homes h on h.id = sr.home_id and h.homeowner_user_id = sr.homeowner_user_id
  left join public.connection_shared_properties shared
    on shared.connection_id = c.id and shared.home_id = h.id
    and c.status = 'active'
    and c.homeowner_user_id = sr.homeowner_user_id and c.contractor_id = sr.contractor_id
  where public.current_user_can_access_contractor(cp.id)
  order by sr.updated_at desc, sr.created_at desc;
$$;

commit;
