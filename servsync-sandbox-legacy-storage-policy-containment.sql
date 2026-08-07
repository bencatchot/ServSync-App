-- ServSync Sandbox Legacy Storage Policy Containment v1.
--
-- This migration removes two exact, untracked legacy Sandbox policies. It is
-- intentionally fail-closed when the legacy policies are absent or differ.
-- It does not change bucket visibility, storage objects, ACLs, other policies,
-- or any public application schema.

begin;

do $$
declare
  v_owner text;
  v_relkind "char";
  v_rls_enabled boolean;
  v_policy_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'SANDBOX_STORAGE_POLICY_CONTAINMENT_REQUIRES_POSTGRES';
  end if;

  select pg_get_userbyid(c.relowner), c.relkind, c.relrowsecurity
    into v_owner, v_relkind, v_rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage'
     and c.relname = 'objects';

  if v_owner is distinct from 'supabase_storage_admin'
     or v_relkind is distinct from 'r'::"char"
     or not coalesce(v_rls_enabled, false) then
    raise exception 'SANDBOX_STORAGE_POLICY_CONTAINMENT_STORAGE_OBJECTS_MISMATCH';
  end if;

  if not exists (
    select 1
      from storage.buckets
     where id = 'photos'
       and name = 'photos'
       and public
  ) or not exists (
    select 1
      from storage.buckets
     where id = 'reports'
       and name = 'reports'
       and public
  ) then
    raise exception 'SANDBOX_STORAGE_POLICY_CONTAINMENT_BUCKET_MISMATCH';
  end if;

  select count(*)
    into v_policy_count
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname in (
       'Photos storage: authenticated manage',
       'Reports storage: authenticated manage'
     )
     and permissive = 'PERMISSIVE'
     and cmd = 'ALL'
     and roles::text[] = array['authenticated']::text[]
     and regexp_replace(coalesce(qual, ''), '\s', '', 'g') = case policyname
       when 'Photos storage: authenticated manage' then '(bucket_id=''photos''::text)'
       when 'Reports storage: authenticated manage' then '(bucket_id=''reports''::text)'
     end
     and regexp_replace(coalesce(with_check, ''), '\s', '', 'g') = case policyname
       when 'Photos storage: authenticated manage' then '(bucket_id=''photos''::text)'
       when 'Reports storage: authenticated manage' then '(bucket_id=''reports''::text)'
     end;

  if v_policy_count <> 2 then
    raise exception 'SANDBOX_STORAGE_POLICY_CONTAINMENT_POLICY_MISMATCH';
  end if;

  if (
    select count(*)
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname in (
         'Photos storage: authenticated manage',
         'Reports storage: authenticated manage'
       )
  ) <> 2 then
    raise exception 'SANDBOX_STORAGE_POLICY_CONTAINMENT_POLICY_OVERLOAD';
  end if;
end;
$$;

drop policy "Photos storage: authenticated manage" on storage.objects;
drop policy "Reports storage: authenticated manage" on storage.objects;

do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname in (
         'Photos storage: authenticated manage',
         'Reports storage: authenticated manage'
       )
  ) then
    raise exception 'SANDBOX_STORAGE_POLICY_CONTAINMENT_POSTCHECK_FAILED';
  end if;

  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage'
       and c.relname = 'objects'
       and c.relrowsecurity
  ) then
    raise exception 'SANDBOX_STORAGE_POLICY_CONTAINMENT_RLS_DISABLED';
  end if;
end;
$$;

commit;
