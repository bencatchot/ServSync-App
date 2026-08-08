with feature_tables as (
  select
    class.relname,
    pg_get_userbyid(class.relowner) as owner,
    class.relrowsecurity as rls,
    class.relforcerowsecurity as forced_rls,
    (select count(*) from pg_policy policy where policy.polrelid = class.oid) as policy_count,
    (select count(*) from information_schema.role_table_grants grant_row
      where grant_row.table_schema = 'public' and grant_row.table_name = class.relname and grant_row.grantee <> 'postgres') as non_owner_table_grants,
    (select count(*) from information_schema.column_privileges grant_row
      where grant_row.table_schema = 'public' and grant_row.table_name = class.relname and grant_row.grantee <> 'postgres') as non_owner_column_grants
  from pg_class class
  where class.oid in (
    'public.contractor_stripe_payment_accounts'::regclass,
    'public.invoice_online_payment_attempts'::regclass,
    'public.stripe_connect_payment_events'::regclass
  )
), feature_functions as (
  select
    procedure.proname,
    pg_get_function_identity_arguments(procedure.oid) as arguments,
    pg_get_userbyid(procedure.proowner) as owner,
    procedure.prosecdef as security_definer,
    procedure.proconfig,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'role', role.rolname,
      'privilege', acl.privilege_type,
      'grantable', acl.is_grantable
    ) order by role.rolname, acl.privilege_type), '[]'::jsonb)
      from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
      join pg_roles role on role.oid = acl.grantee
      where role.rolname <> 'postgres') as non_owner_grants
  from pg_proc procedure
  where procedure.pronamespace = 'public'::regnamespace
    and (
      procedure.proname like 'servsync%stripe%'
      or procedure.proname in (
        'servsync_get_invoice_online_payment_state',
        'servsync_get_request_free_invoice_online_payment_state',
        'servsync_list_invoice_online_payments',
        'servsync_private_guard_invoice_online_payment_conflict',
        'servsync_private_guard_invoice_void_online_payment'
      )
    )
)
select
  (select count(*) from public.invoices) as invoice_count,
  (select count(*) from public.invoice_offline_payment_records) as offline_payment_count,
  (select md5(coalesce(string_agg(
    id::text || ':' || status || ':' || total_cents::text || ':' || amount_paid_cents::text,
    '|' order by id
  ), '')) from public.invoices) as invoice_financial_fingerprint,
  (select count(*) from public.contractor_stripe_payment_accounts) as stripe_account_rows,
  (select count(*) from public.invoice_online_payment_attempts) as online_attempt_rows,
  (select count(*) from public.stripe_connect_payment_events) as stripe_event_rows,
  (select jsonb_agg(to_jsonb(feature_tables) order by relname) from feature_tables) as tables,
  (select jsonb_agg(to_jsonb(feature_functions) order by proname, arguments) from feature_functions) as functions,
  (select count(*) from pg_trigger where not tgisinternal and tgname in (
    'invoice_offline_payment_records_online_conflict',
    'invoices_online_payment_void_guard'
  )) as trigger_count,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname like any(array[
    'contractor_stripe_payment_accounts%',
    'invoice_online_payment_attempts%',
    'stripe_connect_payment_events%'
  ])) as index_count;
