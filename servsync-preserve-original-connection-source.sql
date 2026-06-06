-- ServSync preserve original connection source.
-- Run this in the ServSync Supabase SQL Editor.
--
-- Source should describe how the relationship originally began.
-- Revokes/reconnects are tracked in connection_audit_events instead.

update public.homeowner_contractor_connections c
   set source = case
     when c.invite_id is not null then 'contractor_invite'
     when exists (
       select 1
         from public.connection_audit_events a
        where a.connection_id = c.id
          and a.event_type = 'connection_requested'
     ) then 'homeowner_request'
     when exists (
       select 1
         from public.connection_audit_events a
        where a.connection_id = c.id
          and a.event_type = 'connection_approved'
     ) then 'contractor_invite'
     else 'homeowner_request'
   end
 where c.source = 'homeowner_reconnect';

notify pgrst, 'reload schema';
