-- ServSync contractor-local customer direct-table privilege cleanup v1.
-- Apply only after the controlled customer directory, creation, edit, property,
-- claim, and invitation RPC boundaries are installed and validated.

begin;

do $$
declare
  v_table_name text;
  v_owner text;
  v_rls_enabled boolean;
begin
  foreach v_table_name in array array['contractor_local_contacts', 'contractor_local_homes'] loop
    select pg_get_userbyid(c.relowner), c.relrowsecurity
      into v_owner, v_rls_enabled
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relname = v_table_name
       and c.relkind in ('r', 'p');

    if v_owner is null then
      raise exception 'Required contractor-local customer table is unavailable.';
    end if;

    if v_owner <> 'postgres' or not v_rls_enabled then
      raise exception 'Contractor-local customer table security precondition failed.';
    end if;

    if not has_table_privilege('service_role', format('public.%I', v_table_name), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', v_table_name), 'INSERT')
       or not has_table_privilege('service_role', format('public.%I', v_table_name), 'UPDATE')
       or not has_table_privilege('service_role', format('public.%I', v_table_name), 'DELETE') then
      raise exception 'Trusted operator table privilege precondition failed.';
    end if;
  end loop;

  if to_regprocedure('public.servsync_list_local_customer_summaries()') is null
     or to_regprocedure('public.servsync_get_local_customer_management_detail(uuid)') is null
     or to_regprocedure('public.servsync_create_local_contact(text,text,text,text,text,text,text,text,text,text,text,text,text,text)') is null
     or to_regprocedure('public.servsync_update_local_contact_profile(uuid,text,text,text,text)') is null
     or to_regprocedure('public.servsync_create_local_home(uuid,text,text,text,text,text,text,text)') is null
     or to_regprocedure('public.servsync_update_local_home(uuid,text,text,text,text,text,text,text)') is null
     or to_regprocedure('public.servsync_list_local_customer_claim_invites_v2(uuid)') is null
     or to_regprocedure('public.servsync_create_local_customer_claim_invite_v2(uuid,uuid[],integer)') is null
     or to_regprocedure('public.servsync_lookup_local_customer_claim(text)') is null
     or to_regprocedure('public.servsync_prepare_local_customer_claim_invite_delivery(uuid)') is null
     or to_regprocedure('public.servsync_accept_local_customer_claim_v2(text,jsonb,jsonb)') is null
     or to_regprocedure('public.servsync_decline_local_customer_claim(text)') is null
     or to_regprocedure('public.servsync_revoke_local_customer_claim_invite(uuid)') is null then
    raise exception 'Required contractor-local customer RPC boundary is unavailable.';
  end if;
end;
$$;

revoke all privileges on table public.contractor_local_contacts from public;
revoke all privileges on table public.contractor_local_contacts from anon;
revoke all privileges on table public.contractor_local_contacts from authenticated;
revoke all privileges on table public.contractor_local_contacts from service_role;

revoke all privileges on table public.contractor_local_homes from public;
revoke all privileges on table public.contractor_local_homes from anon;
revoke all privileges on table public.contractor_local_homes from authenticated;
revoke all privileges on table public.contractor_local_homes from service_role;

-- Table ACL revocation does not remove independently granted column ACLs.
do $$
declare
  v_table_name text;
  v_role_name text;
  v_columns text;
begin
  foreach v_table_name in array array['contractor_local_contacts', 'contractor_local_homes'] loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum)
      into v_columns
      from pg_attribute a
     where a.attrelid = format('public.%I', v_table_name)::regclass
       and a.attnum > 0
       and not a.attisdropped;

    if v_columns is null then
      raise exception 'Contractor-local customer column inventory is unavailable.';
    end if;

    foreach v_role_name in array array['PUBLIC', 'anon', 'authenticated', 'service_role'] loop
      execute format(
        'revoke all privileges (%s) on table public.%I from %s',
        v_columns,
        v_table_name,
        v_role_name
      );
    end loop;
  end loop;
end;
$$;

grant select, insert, update, delete on table public.contractor_local_contacts to service_role;
grant select, insert, update, delete on table public.contractor_local_homes to service_role;

do $$
declare
  v_table_name text;
  v_role_name text;
  v_privilege text;
  v_role_oid oid;
begin
  foreach v_table_name in array array['contractor_local_contacts', 'contractor_local_homes'] loop
    foreach v_role_name in array array['public', 'anon', 'authenticated'] loop
      foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(v_role_name, format('public.%I', v_table_name), v_privilege) then
          raise exception 'Browser-role table privilege cleanup failed.';
        end if;
      end loop;
    end loop;

    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', format('public.%I', v_table_name), v_privilege) then
        raise exception 'Trusted operator CRUD preservation failed.';
      end if;
    end loop;

    foreach v_privilege in array array['TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('service_role', format('public.%I', v_table_name), v_privilege) then
        raise exception 'Trusted operator privilege minimization failed.';
      end if;
    end loop;

    foreach v_role_name in array array['PUBLIC', 'anon', 'authenticated', 'service_role'] loop
      v_role_oid := case
        when v_role_name = 'PUBLIC' then 0
        else (select r.oid from pg_roles r where r.rolname = v_role_name)
      end;

      if v_role_oid is null or exists (
        select 1
          from pg_attribute a
          cross join lateral aclexplode(a.attacl) acl
         where a.attrelid = format('public.%I', v_table_name)::regclass
           and a.attnum > 0
           and not a.attisdropped
           and acl.grantee = v_role_oid
      ) then
        raise exception 'Contractor-local customer column privilege cleanup failed.';
      end if;
    end loop;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
