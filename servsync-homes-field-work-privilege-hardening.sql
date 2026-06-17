-- Narrow privilege hardening for homeowner homes and legacy field-work RPC access.
-- This patch intentionally leaves public.homes RLS policies unchanged.

begin;

revoke all on table public.homes from public;
revoke all on table public.homes from anon;
revoke all on table public.homes from authenticated;

grant select, insert, update on table public.homes to authenticated;

-- Production previously retained an older 7-argument overload that predates
-- explicit shared-property checks. Revoke client access if that overload exists.
do $$
begin
  if to_regprocedure('public.servsync_create_field_work(uuid, uuid, uuid, uuid, text, jsonb, uuid)') is not null then
    revoke execute on function public.servsync_create_field_work(
      uuid, uuid, uuid, uuid, text, jsonb, uuid
    ) from public;

    revoke execute on function public.servsync_create_field_work(
      uuid, uuid, uuid, uuid, text, jsonb, uuid
    ) from anon;

    revoke execute on function public.servsync_create_field_work(
      uuid, uuid, uuid, uuid, text, jsonb, uuid
    ) from authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
