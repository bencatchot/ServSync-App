with application_relations as (
  select
    n.nspname || '.' || c.relname as key,
    n.nspname || '.' || c.relname as scope,
    n.nspname as schema_name,
    c.relname as relation_name,
    c.relkind::text as relation_kind,
    pg_get_userbyid(c.relowner) as owner,
    c.relpersistence::text as persistence,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
application_columns as (
  select
    n.nspname || '.' || c.relname || '.' || a.attname as key,
    n.nspname || '.' || c.relname as scope,
    n.nspname as schema_name,
    c.relname as relation_name,
    a.attname as column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
    not a.attnotnull as nullable,
    pg_get_expr(ad.adbin, ad.adrelid, true) as column_default,
    a.attidentity::text as identity_kind,
    a.attgenerated::text as generated_kind,
    case when a.attcollation = 0 then null else coll.collname end as collation
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  left join pg_collation coll on coll.oid = a.attcollation
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and a.attnum > 0
    and not a.attisdropped
),
application_constraints as (
  select
    n.nspname || '.' || c.relname || '.' || con.conname as key,
    n.nspname || '.' || c.relname as scope,
    n.nspname as schema_name,
    c.relname as relation_name,
    con.conname as constraint_name,
    con.contype::text as constraint_type,
    pg_get_constraintdef(con.oid, true) as definition,
    con.convalidated as validated,
    con.condeferrable as deferrable,
    con.condeferred as initially_deferred
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
application_indexes as (
  select
    ni.nspname || '.' || ci.relname as key,
    nt.nspname || '.' || ct.relname as scope,
    ni.nspname as schema_name,
    ci.relname as index_name,
    nt.nspname as table_schema,
    ct.relname as relation_name,
    pg_get_indexdef(i.indexrelid, 0, true) as definition,
    i.indisunique as is_unique,
    i.indisprimary as is_primary,
    i.indisvalid as is_valid,
    i.indisready as is_ready
  from pg_index i
  join pg_class ci on ci.oid = i.indexrelid
  join pg_namespace ni on ni.oid = ci.relnamespace
  join pg_class ct on ct.oid = i.indrelid
  join pg_namespace nt on nt.oid = ct.relnamespace
  where nt.nspname = 'public'
),
application_triggers as (
  select
    n.nspname || '.' || c.relname || '.' || t.tgname as key,
    n.nspname || '.' || c.relname as scope,
    n.nspname as schema_name,
    c.relname as relation_name,
    t.tgname as trigger_name,
    pg_get_triggerdef(t.oid, true) as definition,
    t.tgenabled::text as enabled_state
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
),
application_policies as (
  select
    n.nspname || '.' || c.relname || '.' || pol.polname as key,
    n.nspname || '.' || c.relname as scope,
    n.nspname as schema_name,
    c.relname as relation_name,
    pol.polname as policy_name,
    pol.polpermissive as permissive,
    pol.polcmd::text as command,
    coalesce((
      select jsonb_agg(case when role_oid = 0 then 'PUBLIC' else pg_get_userbyid(role_oid) end order by case when role_oid = 0 then 'PUBLIC' else pg_get_userbyid(role_oid) end)
      from unnest(pol.polroles) role_oid
    ), '[]'::jsonb) as roles,
    pg_get_expr(pol.polqual, pol.polrelid, true) as using_expression,
    pg_get_expr(pol.polwithcheck, pol.polrelid, true) as check_expression
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage')
),
application_functions as (
  select
    n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as key,
    n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as scope,
    n.nspname as schema_name,
    p.proname as function_name,
    pg_catalog.oidvectortypes(p.proargtypes) as identity_argument_types,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    l.lanname as language,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    p.prokind::text as function_kind,
    p.provolatile::text as volatility,
    p.proisstrict as strict,
    coalesce((select jsonb_agg(setting order by setting) from unnest(p.proconfig) setting), '[]'::jsonb) as configuration,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
),
application_function_grants as (
  select
    f.key || '|' || case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end || '|' || acl.privilege_type as key,
    f.key as scope,
    f.key as function_key,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  cross join lateral (
    select n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as key
  ) f
  where n.nspname = 'public'
),
application_table_grants as (
  select
    n.nspname || '.' || c.relname || '|' || case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end || '|' || acl.privilege_type as key,
    n.nspname || '.' || c.relname as scope,
    n.nspname || '.' || c.relname as relation_key,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end, c.relowner))) acl
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
application_column_grants as (
  select
    n.nspname || '.' || c.relname || '.' || a.attname || '|' || case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end || '|' || acl.privilege_type as key,
    n.nspname || '.' || c.relname as scope,
    n.nspname || '.' || c.relname || '.' || a.attname as column_key,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(a.attacl) acl
  where n.nspname = 'public'
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
),
application_default_acls as (
  select
    pg_get_userbyid(d.defaclrole) || '|' || coalesce(n.nspname, '*') || '|' || d.defaclobjtype::text || '|' || case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end || '|' || acl.privilege_type as key,
    coalesce(n.nspname, '*') as scope,
    pg_get_userbyid(d.defaclrole) as owner,
    coalesce(n.nspname, '*') as schema_name,
    d.defaclobjtype::text as object_type,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) acl
  where n.nspname = 'public' or d.defaclnamespace = 0
)
select jsonb_build_object(
  'snapshotVersion', 1,
  'catalogSchema', 'public',
  'relations', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_relations x), '[]'::jsonb),
  'columns', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_columns x), '[]'::jsonb),
  'constraints', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_constraints x), '[]'::jsonb),
  'indexes', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_indexes x), '[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_triggers x), '[]'::jsonb),
  'policies', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_policies x), '[]'::jsonb),
  'functions', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_functions x), '[]'::jsonb),
  'functionGrants', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_function_grants x), '[]'::jsonb),
  'tableGrants', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_table_grants x), '[]'::jsonb),
  'columnGrants', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_column_grants x), '[]'::jsonb),
  'defaultAcls', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from application_default_acls x), '[]'::jsonb)
) as snapshot;
