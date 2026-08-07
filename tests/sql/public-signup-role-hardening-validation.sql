\set ON_ERROR_STOP on

do $$
declare
  v_owner name;
  v_security_definer boolean;
  v_search_path text[];
  v_guard_owner name;
  v_guard_security_definer boolean;
  v_guard_search_path text[];
begin
  select pg_get_userbyid(proowner), prosecdef, proconfig
    into v_owner, v_security_definer, v_search_path
    from pg_proc
   where oid = 'public.handle_new_user()'::regprocedure;

  if v_owner <> 'postgres' or not v_security_definer or v_search_path <> array['search_path=public'] then
    raise exception 'Unexpected handle_new_user security configuration: owner=%, definer=%, config=%',
      v_owner, v_security_definer, v_search_path;
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'handle_new_user') <> 1 then
    raise exception 'handle_new_user overload mismatch';
  end if;

  if has_function_privilege('public', 'public.handle_new_user()', 'execute')
     or has_function_privilege('anon', 'public.handle_new_user()', 'execute')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
     or has_function_privilege('service_role', 'public.handle_new_user()', 'execute')
     or not has_function_privilege('postgres', 'public.handle_new_user()', 'execute') then
    raise exception 'Unexpected handle_new_user execution grants';
  end if;

  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where p.oid = 'public.handle_new_user()'::regprocedure
       and acl.privilege_type = 'EXECUTE'
       and acl.grantee <> p.proowner
  ) then
    raise exception 'handle_new_user has an unexpected non-owner execution grant';
  end if;

  select pg_get_userbyid(proowner), prosecdef, proconfig
    into v_guard_owner, v_guard_security_definer, v_guard_search_path
    from pg_proc
   where oid = 'public.servsync_guard_self_service_profile_role()'::regprocedure;

  if v_guard_owner <> 'postgres' or v_guard_security_definer or v_guard_search_path <> array['search_path=public'] then
    raise exception 'Unexpected profile guard security configuration: owner=%, definer=%, config=%',
      v_guard_owner, v_guard_security_definer, v_guard_search_path;
  end if;

  if has_function_privilege('public', 'public.servsync_guard_self_service_profile_role()', 'execute')
     or has_function_privilege('anon', 'public.servsync_guard_self_service_profile_role()', 'execute')
     or has_function_privilege('authenticated', 'public.servsync_guard_self_service_profile_role()', 'execute')
     or has_function_privilege('service_role', 'public.servsync_guard_self_service_profile_role()', 'execute') then
    raise exception 'Unexpected profile guard execution grants';
  end if;

  if (select count(*) from pg_trigger
       where tgrelid = 'auth.users'::regclass
         and tgname = 'on_auth_user_created'
         and not tgisinternal) <> 1 then
    raise exception 'Auth trigger binding mismatch';
  end if;

  if (select count(*) from pg_trigger
       where tgrelid = 'public.profiles'::regclass
         and tgname = 'servsync_profiles_self_service_role_guard'
         and not tgisinternal) <> 1 then
    raise exception 'Profile role guard binding mismatch';
  end if;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'homeowner@example.test', '{"full_name":"Home Owner","role":"homeowner"}'),
  ('10000000-0000-0000-0000-000000000002', 'contractor@example.test', '{"full_name":"Contractor","role":"contractor"}'),
  ('10000000-0000-0000-0000-000000000003', 'platform@example.test', '{"role":"platform_admin"}'),
  ('10000000-0000-0000-0000-000000000004', 'admin@example.test', '{"role":"Admin"}'),
  ('10000000-0000-0000-0000-000000000005', 'office@example.test', '{"role":"Office"}'),
  ('10000000-0000-0000-0000-000000000006', 'field@example.test', '{"role":"Field Technician"}'),
  ('10000000-0000-0000-0000-000000000007', 'viewer@example.test', '{"role":"Viewer"}'),
  ('10000000-0000-0000-0000-000000000008', 'unknown@example.test', '{"role":"root"}'),
  ('10000000-0000-0000-0000-000000000009', 'malformed@example.test', '{"role":{"nested":true}}'),
  ('10000000-0000-0000-0000-000000000010', 'default@example.test', '{}');

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values (
  '10000000-0000-0000-0000-000000000011',
  'appmeta@example.test',
  '{"role":"homeowner"}',
  '{"role":"platform_admin"}'
);

do $$
begin
  if (select role from public.profiles where id = '10000000-0000-0000-0000-000000000001') <> 'homeowner' then
    raise exception 'Homeowner signup failed';
  end if;
  if (select role from public.profiles where id = '10000000-0000-0000-0000-000000000002') <> 'contractor' then
    raise exception 'Contractor signup failed';
  end if;
  if (select role from public.profiles where id = '10000000-0000-0000-0000-000000000021') <> 'contractor' then
    raise exception 'Supabase Auth trigger execution failed';
  end if;
  if exists (
    select 1 from public.profiles
     where id in (
       '10000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000004',
       '10000000-0000-0000-0000-000000000005',
       '10000000-0000-0000-0000-000000000006',
       '10000000-0000-0000-0000-000000000007',
       '10000000-0000-0000-0000-000000000008',
       '10000000-0000-0000-0000-000000000009',
       '10000000-0000-0000-0000-000000000010',
       '10000000-0000-0000-0000-000000000011'
     ) and role <> 'homeowner'
  ) then
    raise exception 'Unapproved metadata role escaped the homeowner fallback';
  end if;

  if (select role from public.profiles where id = '00000000-0000-0000-0000-000000000001') <> 'platform_admin' then
    raise exception 'Existing platform administrator was changed';
  end if;
end;
$$;

do $$
declare
  v_code text;
  v_permanent_code text;
  v_contractor_id uuid;
begin
  select code into v_code
    from public.referral_codes
   where owner_user_id = '10000000-0000-0000-0000-000000000002';

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    '10000000-0000-0000-0000-000000000012',
    'referred@example.test',
    jsonb_build_object('role', 'homeowner', 'referral_code', v_code)
  );

  if not exists (
    select 1 from public.referrals
     where referrer_user_id = '10000000-0000-0000-0000-000000000002'
       and referred_user_id = '10000000-0000-0000-0000-000000000012'
       and referred_role = 'homeowner'
  ) then
    raise exception 'Universal referral attribution was not preserved';
  end if;

  insert into public.contractor_profiles (owner_user_id, slug, business_name)
  values ('10000000-0000-0000-0000-000000000002', 'signup-hardening-test', 'Signup Hardening Test')
  returning id, permanent_invite_code into v_contractor_id, v_permanent_code;

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    '10000000-0000-0000-0000-000000000013',
    'invite@example.test',
    jsonb_build_object('role', 'homeowner', 'referral_invite_code', v_permanent_code)
  );

  if not exists (
    select 1 from public.contractor_invites
     where used_by_homeowner_id = '10000000-0000-0000-0000-000000000013'
       and invite_type = 'permanent_qr'
       and status = 'used'
  ) then
    raise exception 'Permanent referral attribution was not preserved';
  end if;

  insert into public.contractor_invites (contractor_id, invite_code, status, created_by)
  values (v_contractor_id, 'ONETIME-SIGNUP-TEST', 'active', '10000000-0000-0000-0000-000000000002');

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    '10000000-0000-0000-0000-000000000014',
    'one-time-invite@example.test',
    '{"role":"homeowner","referral_invite_code":"ONETIME-SIGNUP-TEST"}'
  );

  if not exists (
    select 1 from public.contractor_invites
     where invite_code = 'ONETIME-SIGNUP-TEST'
       and used_by_homeowner_id = '10000000-0000-0000-0000-000000000014'
       and status = 'used'
  ) then
    raise exception 'One-time referral attribution was not preserved';
  end if;
end;
$$;
