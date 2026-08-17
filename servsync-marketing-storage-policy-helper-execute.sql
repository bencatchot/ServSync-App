-- FB-037G-B authenticated Storage policy helper execution
-- Allows the authenticated Storage RLS policies to invoke their purpose-bound
-- authorization predicates. No table access or provider authority is added.

begin;

do $$
begin
  if to_regprocedure('public.servsync_private_can_access_marketing_storage_object(text,text)') is null
     or to_regprocedure('public.servsync_private_can_upload_marketing_storage_object(text)') is null then
    raise exception 'Marketing Storage policy helpers must exist before this migration.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'marketing_assets_workspace_read'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'marketing_assets_workspace_upload'
  ) then
    raise exception 'Marketing Storage workspace policies must exist before this migration.';
  end if;
end;
$$;

revoke all on function public.servsync_private_can_access_marketing_storage_object(text,text)
  from public, anon, service_role;
revoke all on function public.servsync_private_can_upload_marketing_storage_object(text)
  from public, anon, service_role;

grant execute on function public.servsync_private_can_access_marketing_storage_object(text,text)
  to authenticated;
grant execute on function public.servsync_private_can_upload_marketing_storage_object(text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
