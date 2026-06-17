-- ServSync contextual connection pending-request review RPC.
-- Run after contextual connection shared-property and privilege-hardening patches.

begin;

-- Read-only, masked review feed for pending contextual connection requests.
-- This intentionally does not broaden connection_shared_properties RLS or grant
-- contractors direct access to public.homes.
drop function if exists public.servsync_contractor_pending_connection_requests();
create function public.servsync_contractor_pending_connection_requests()
returns table (
  connection_id uuid,
  contractor_id uuid,
  status text,
  source text,
  share_contact boolean,
  contact_summary jsonb,
  request_context jsonb,
  shared_properties jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id as connection_id,
    c.contractor_id,
    c.status,
    c.source,
    coalesce(p.share_contact, false) as share_contact,
    case
      when coalesce(p.share_contact, false) then jsonb_build_object(
        'display_name', coalesce(nullif(trim(hp.display_name), ''), 'Homeowner'),
        'phone', coalesce(hp.phone, ''),
        'city', coalesce(hp.city, ''),
        'state', coalesce(hp.state, ''),
        'zip_code', coalesce(hp.zip_code, '')
      )
      else jsonb_build_object('display_name', 'Homeowner')
    end as contact_summary,
    case
      when ctx.connection_id is null then null
      else jsonb_build_object(
        'message', ctx.message,
        'created_at', ctx.created_at,
        'updated_at', ctx.updated_at
      )
    end as request_context,
    coalesce(shared_properties.properties, '[]'::jsonb) as shared_properties,
    c.created_at,
    c.updated_at
  from public.homeowner_contractor_connections c
  join public.contractor_profiles cp on cp.id = c.contractor_id
  left join public.connection_permissions p on p.connection_id = c.id
  left join public.homeowner_profiles hp on hp.user_id = c.homeowner_user_id
  left join public.connection_request_contexts ctx on ctx.connection_id = c.id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'home_id', csp.home_id,
        'label', case
          when csp.share_home_overview and nullif(trim(h.nickname), '') is not null then h.nickname
          when csp.share_address and nullif(trim(h.address_line1), '') is not null then h.address_line1
          else 'Shared property'
        end,
        'address_line1', case when csp.share_address then coalesce(h.address_line1, '') else '' end,
        'address_line2', case when csp.share_address then coalesce(h.address_line2, '') else '' end,
        'city', case when csp.share_address then coalesce(h.city, '') else '' end,
        'state', case when csp.share_address then coalesce(h.state, '') else '' end,
        'zip_code', case when csp.share_address then coalesce(h.zip_code, '') else '' end,
        'share_home_overview', csp.share_home_overview,
        'share_address', csp.share_address,
        'share_preferred_vendors', csp.share_preferred_vendors,
        'share_photos', false,
        'updated_at', csp.updated_at
      )
      order by h.created_at asc
    ) as properties
      from public.connection_shared_properties csp
      join public.homes h on h.id = csp.home_id
     where csp.connection_id = c.id
       and h.homeowner_user_id = c.homeowner_user_id
  ) shared_properties on true
  where auth.uid() is not null
    and c.status = 'pending'
    and public.current_user_can_manage_contractor_connections(c.contractor_id)
  order by c.created_at desc;
$$;

revoke execute on function public.servsync_contractor_pending_connection_requests() from public;
revoke execute on function public.servsync_contractor_pending_connection_requests() from anon;
grant execute on function public.servsync_contractor_pending_connection_requests() to authenticated;

notify pgrst, 'reload schema';

commit;
