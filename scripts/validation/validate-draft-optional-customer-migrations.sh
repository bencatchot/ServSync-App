#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PG16_BIN=${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}
INITDB=${INITDB:-$([[ -x "$PG16_BIN/initdb" ]] && printf '%s' "$PG16_BIN/initdb" || command -v initdb || true)}
PG_CTL=${PG_CTL:-$([[ -x "$PG16_BIN/pg_ctl" ]] && printf '%s' "$PG16_BIN/pg_ctl" || command -v pg_ctl || true)}
PSQL=${PSQL:-$([[ -x "$PG16_BIN/psql" ]] && printf '%s' "$PG16_BIN/psql" || command -v psql || true)}
CREATEDB=${CREATEDB:-$([[ -x "$PG16_BIN/createdb" ]] && printf '%s' "$PG16_BIN/createdb" || command -v createdb || true)}

if [[ -z "$INITDB" || -z "$PG_CTL" || -z "$PSQL" || -z "$CREATEDB" ]]; then
  echo 'PostgreSQL 16 client/server tools are required.' >&2
  exit 2
fi

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/servsync-draft-optional.XXXXXX")
DATA_DIR="$TMP_ROOT/data"
SOCKET_DIR="$TMP_ROOT/socket"
mkdir -p "$SOCKET_DIR"

cleanup() {
  "$PG_CTL" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

"$INITDB" -D "$DATA_DIR" -A trust -U runner >/dev/null
"$PG_CTL" -D "$DATA_DIR" -o "-k $SOCKET_DIR -p 55439" -w start >/dev/null

psql_case() {
  local database=$1
  shift
  "$PSQL" -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p 55439 -U runner -d "$database" "$@"
}

DATABASES=(
  draft_absent
  draft_complete
  draft_partial
  draft_incompatible
  drift_missing_column
  drift_column_type
  drift_nullability
  drift_default
  drift_check
  drift_weak_fk
  drift_wrong_reference
  drift_fk_action
  drift_unvalidated_fk
  drift_unexpected_overload
  drift_return_type
  drift_argument_type
  drift_rpc_body
  drift_public_rpc
  drift_anon_rpc
  drift_missing_authenticated_rpc
  drift_missing_authenticated_table
  drift_missing_service_rpc
  drift_missing_service_table
  drift_authenticated_rpc_grant_option
  drift_service_rpc_grant_option
  drift_service_table_grant_option
  drift_service_extra_table_privilege
  drift_service_column_acl
  drift_unexpected_acl_grantee
  drift_table_acl
  drift_table_grant_option
  drift_column_acl
  drift_column_grant_option
  drift_wrong_owner
  drift_security_invoker
  drift_search_path
  drift_rls
  drift_missing_policy
  drift_policy_command
  drift_policy_expression
  archive_drift
)

for database in "${DATABASES[@]}"; do
  "$CREATEDB" -h "$SOCKET_DIR" -p 55439 -U runner "$database"
  psql_case "$database" -f "$ROOT/tests/sql/draft-optional-customer-foundation.sql" >/dev/null
done

for database in "${DATABASES[@]}"; do
  psql_case "$database" -f "$ROOT/servsync-customer-management-edit-boundary.sql" >/dev/null
done

# Draft absent: both migrations install, omit Draft objects, and return stable zero/empty values.
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null
psql_case draft_absent -f "$ROOT/servsync-admin-office-customer-creation-parity.sql" >/dev/null
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-direct-table-privilege-cleanup.sql" >/dev/null
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-property-archive-restore-draft-optional.sql" >/dev/null
psql_case draft_absent <<'SQL' >/dev/null
do $$
declare
  v_impact jsonb;
  v_history jsonb;
  v_rows jsonb;
  v_detail jsonb;
  v_user_id uuid;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
  if public.servsync_private_customer_draft_foundation_available() then
    raise exception 'Draft foundation should be absent.';
  end if;
  if to_regclass('public.contractor_work_drafts') is not null then
    raise exception 'Draft table was unexpectedly created.';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'servsync_guard_local_draft_assignment' and not tgisinternal) then
    raise exception 'Draft trigger was unexpectedly created.';
  end if;

  v_impact := public.servsync_get_local_customer_archive_impact(
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001'
  );
  if v_impact->>'draft_count' <> '0' or v_impact->>'project_count' <> '0' then
    raise exception 'Stable empty impact contract failed: %', v_impact;
  end if;

  v_history := public.servsync_list_local_customer_historical_context();
  if v_history <> '[]'::jsonb then
    raise exception 'Draft/project-free historical context should be empty: %', v_history;
  end if;

  -- Owner/Admin/Office/Field see tenant summaries; Viewer sees exact work-linked rows.
  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid,
    '10000000-0000-0000-0000-000000000004'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    v_rows := public.servsync_list_local_customer_summaries();
    if jsonb_array_length(v_rows) <> 2
       or v_rows::text ~* '(private@example|private note|555-0002|claim|token|invitation)' then
      raise exception 'Draft-free manager/field directory role shape failed for %: %', v_user_id, v_rows;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
  v_rows := public.servsync_list_local_customer_summaries();
  if jsonb_array_length(v_rows) <> 1
     or v_rows->0->>'id' <> '30000000-0000-0000-0000-000000000001'
     or v_rows::text ~* '(private@example|private note|555-0002|claim|token|invitation)' then
    raise exception 'Draft-free Viewer directory scope/redaction failed: %', v_rows;
  end if;

  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000006'::uuid,
    '10000000-0000-0000-0000-000000000008'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    begin
      perform public.servsync_list_local_customer_summaries();
      raise exception 'Inactive/removed directory access was unexpectedly accepted for %.', v_user_id;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', false);
  v_rows := public.servsync_list_local_customer_summaries();
  if jsonb_array_length(v_rows) <> 1
     or v_rows->0->>'id' <> '30000000-0000-0000-0000-000000000003' then
    raise exception 'Cross-tenant directory isolation failed: %', v_rows;
  end if;

  -- Full management detail and profile mutation are manager-only.
  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    v_detail := public.servsync_get_local_customer_management_detail(
      '30000000-0000-0000-0000-000000000002'
    );
    if v_detail->>'id' <> '30000000-0000-0000-0000-000000000002'
       or not (v_detail ? 'email')
       or not (v_detail ? 'notes') then
      raise exception 'Manager detail failed for %: %', v_user_id, v_detail;
    end if;
    perform public.servsync_update_local_contact_profile(
      '30000000-0000-0000-0000-000000000002',
      'Managed Customer', '', '', 'manager-only note'
    );
  end loop;

  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000004'::uuid,
    '10000000-0000-0000-0000-000000000005'::uuid,
    '10000000-0000-0000-0000-000000000006'::uuid,
    '10000000-0000-0000-0000-000000000008'::uuid,
    '10000000-0000-0000-0000-000000000007'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    begin
      perform public.servsync_get_local_customer_management_detail(
        '30000000-0000-0000-0000-000000000002'
      );
      raise exception 'Unauthorized management detail was unexpectedly accepted for %.', v_user_id;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  -- Paired customer/property creation is available to each manager role.
  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    perform public.servsync_create_local_contact(
      'Created ' || right(v_user_id::text, 1), '', '', '',
      'Main', 'Created Address', '', '', '', '', '', '', '', ''
    );
  end loop;

  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000004'::uuid,
    '10000000-0000-0000-0000-000000000005'::uuid,
    '10000000-0000-0000-0000-000000000006'::uuid,
    '10000000-0000-0000-0000-000000000008'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    begin
      perform public.servsync_create_local_contact(
        'Denied', '', '', '', 'Main', 'Denied Address', '', '', '', '', '', '', '', ''
      );
      raise exception 'Unauthorized paired creation was unexpectedly accepted for %.', v_user_id;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  if (select count(*) from public.contractor_local_contacts) <> 6
     or (select count(*) from public.contractor_local_homes) <> 6 then
    raise exception 'Draft-free management or paired creation failed.';
  end if;

  if has_table_privilege('authenticated', 'public.contractor_local_contacts', 'SELECT')
     or has_table_privilege('authenticated', 'public.contractor_local_homes', 'UPDATE') then
    raise exception 'Direct-table privilege cleanup did not hold.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select public.servsync_archive_local_customer('30000000-0000-0000-0000-000000000001');

do $$
declare
  v_history jsonb;
  v_user_id uuid;
begin
  if (select status from public.contractor_local_customer_claim_invites where id = '60000000-0000-0000-0000-000000000001') <> 'revoked' then
    raise exception 'Pending invitation was not revoked transactionally.';
  end if;

  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid,
    '10000000-0000-0000-0000-000000000004'::uuid,
    '10000000-0000-0000-0000-000000000005'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    v_history := public.servsync_list_local_customer_historical_context();
    if jsonb_array_length(v_history) <> 1
       or v_history->0->>'id' <> '30000000-0000-0000-0000-000000000001'
       or v_history::text ~* '(phone|email|notes|claim|token|invitation|actor)' then
      raise exception 'Historical role/redaction contract failed for %: %', v_user_id, v_history;
    end if;
  end loop;

  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000006'::uuid,
    '10000000-0000-0000-0000-000000000008'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    begin
      perform public.servsync_list_local_customer_historical_context();
      raise exception 'Inactive/removed historical access was unexpectedly accepted for %.', v_user_id;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', false);
  if public.servsync_list_local_customer_historical_context() <> '[]'::jsonb then
    raise exception 'Cross-tenant historical context leaked archived work.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
do $$
begin
  begin
    insert into public.inspection_templates(contractor_id, local_contact_id, local_home_id)
    values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    );
    raise exception 'Archived assignment was unexpectedly accepted.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select public.servsync_restore_local_customer('30000000-0000-0000-0000-000000000001');

do $$
declare
  v_user_id uuid;
begin
  -- Admin and Office retain archive/restore authority.
  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    perform public.servsync_archive_local_customer('30000000-0000-0000-0000-000000000001');
    perform public.servsync_restore_local_customer('30000000-0000-0000-0000-000000000001');
  end loop;

  foreach v_user_id in array array[
    '10000000-0000-0000-0000-000000000004'::uuid,
    '10000000-0000-0000-0000-000000000005'::uuid,
    '10000000-0000-0000-0000-000000000006'::uuid,
    '10000000-0000-0000-0000-000000000008'::uuid,
    '10000000-0000-0000-0000-000000000007'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, false);
    begin
      perform public.servsync_archive_local_customer('30000000-0000-0000-0000-000000000001');
      raise exception 'Unauthorized archive was unexpectedly accepted for %.', v_user_id;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  if (select archived_at from public.contractor_local_contacts where id = '30000000-0000-0000-0000-000000000001') is not null then
    raise exception 'Denied archive changed customer state.';
  end if;
end;
$$;
SQL

# Complete Draft: Draft visibility, count, history, and assignment guard remain active.
psql_case draft_complete -f "$ROOT/tests/sql/draft-optional-complete-foundation.sql" >/dev/null
psql_case draft_complete <<'SQL' >/dev/null
do $$
declare
  v_table regclass;
  v_function regprocedure;
begin
  foreach v_table in array array[
    'public.contractor_work_drafts'::regclass,
    'public.contractor_work_draft_items'::regclass,
    'public.contractor_work_draft_launches'::regclass
  ] loop
    if not has_table_privilege('authenticated', v_table, 'SELECT')
       or has_table_privilege('authenticated', v_table, 'INSERT')
       or has_table_privilege('authenticated', v_table, 'UPDATE')
       or has_table_privilege('authenticated', v_table, 'DELETE')
       or not has_table_privilege('service_role', v_table, 'SELECT')
       or not has_table_privilege('service_role', v_table, 'INSERT')
       or not has_table_privilege('service_role', v_table, 'UPDATE')
       or not has_table_privilege('service_role', v_table, 'DELETE')
       or has_table_privilege('service_role', v_table, 'TRUNCATE')
       or has_table_privilege('service_role', v_table, 'REFERENCES')
       or has_table_privilege('service_role', v_table, 'TRIGGER')
       or has_table_privilege('public', v_table, 'SELECT')
       or has_table_privilege('anon', v_table, 'SELECT') then
      raise exception 'Canonical Supabase Draft table ACL fixture is incorrect for %.', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.servsync_get_work_draft(uuid)'::regprocedure,
    'public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)'::regprocedure,
    'public.servsync_launch_work_draft(uuid,text,uuid)'::regprocedure
  ] loop
    if not has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE')
       or has_function_privilege('public', v_function, 'EXECUTE')
       or has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'Canonical Supabase Draft RPC ACL fixture is incorrect for %.', v_function;
    end if;
  end loop;

  if exists (
    select 1
      from pg_class relation
      cross join lateral aclexplode(coalesce(
        relation.relacl,
        acldefault('r', relation.relowner)
      )) acl
     where relation.oid in (
       'public.contractor_work_drafts'::regclass,
       'public.contractor_work_draft_items'::regclass,
       'public.contractor_work_draft_launches'::regclass
     )
       and acl.grantee <> relation.relowner
       and acl.is_grantable
  ) or exists (
    select 1
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl,
        acldefault('f', procedure_row.proowner)
      )) acl
     where procedure_row.oid in (
       'public.servsync_get_work_draft(uuid)'::regprocedure,
       'public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)'::regprocedure,
       'public.servsync_launch_work_draft(uuid,text,uuid)'::regprocedure
     )
       and acl.grantee <> procedure_row.proowner
       and acl.is_grantable
  ) then
    raise exception 'Canonical Supabase Draft ACL fixture contains a non-owner grant option.';
  end if;
end;
$$;
SQL
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-admin-office-customer-creation-parity.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-direct-table-privilege-cleanup.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-property-archive-restore-draft-optional.sql" >/dev/null
psql_case draft_complete <<'SQL' >/dev/null
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

insert into public.contractor_work_drafts(
  id,
  contractor_id,
  local_contact_id,
  local_home_id,
  subject_type,
  subject_display_name_snapshot,
  property_display_snapshot,
  title
)
values (
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'local_contact',
  'Local Customer',
  '100 Main St',
  'Canonical Draft'
);

do $$
declare
  v_impact jsonb;
begin
  if not public.servsync_private_customer_draft_foundation_available() then
    raise exception 'Complete Draft foundation was not detected.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'servsync_guard_local_draft_assignment' and not tgisinternal) then
    raise exception 'Draft assignment trigger was not installed.';
  end if;
  v_impact := public.servsync_get_local_customer_archive_impact(
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001'
  );
  if v_impact->>'draft_count' <> '1' then
    raise exception 'Complete Draft impact contract failed: %', v_impact;
  end if;
  if jsonb_array_length(public.servsync_list_local_customer_historical_context()) <> 0 then
    raise exception 'Active Draft should not appear in archived historical context.';
  end if;
end;
$$;

select public.servsync_archive_local_customer('30000000-0000-0000-0000-000000000001');

do $$
begin
  if jsonb_array_length(public.servsync_list_local_customer_historical_context()) <> 1 then
    raise exception 'Draft-linked archived historical context was not preserved.';
  end if;
  begin
    insert into public.contractor_work_drafts(
      contractor_id,
      local_contact_id,
      local_home_id,
      subject_type,
      subject_display_name_snapshot,
      property_display_snapshot,
      title
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'local_contact',
      'Local Customer',
      '100 Main St',
      'Rejected Draft'
    );
    raise exception 'Archived Draft assignment was unexpectedly accepted.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
SQL

assert_no_compatibility_state() {
  local database=$1
  psql_case "$database" <<'SQL' >/dev/null
do $$
begin
  if to_regprocedure('public.servsync_private_assert_canonical_customer_draft_foundation()') is not null
     or to_regprocedure('public.servsync_private_customer_draft_foundation_available()') is not null
     or to_regprocedure('public.servsync_private_local_customer_has_readable_work(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.servsync_private_local_customer_read_context()') is not null
     or to_regprocedure('public.servsync_list_local_customer_summaries()') is not null
     or to_regprocedure('public.servsync_get_local_customer_management_detail(uuid)') is not null
     or to_regprocedure('public.servsync_archive_local_customer(uuid)') is not null
     or to_regclass('public.contractor_local_customer_lifecycle_events') is not null
     or exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name in ('contractor_local_contacts', 'contractor_local_homes')
          and column_name in ('archived_at', 'archived_by')
     )
     or exists (
       select 1 from pg_trigger
        where tgname like 'servsync_guard_local_%' and not tgisinternal
     )
     or exists (
       select 1 from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'contractor_local_contacts_active_contractor_idx',
            'contractor_local_contacts_archived_contractor_idx',
            'contractor_local_homes_active_contact_idx',
            'contractor_local_homes_archived_contact_idx',
            'contractor_local_customer_lifecycle_contact_idx',
            'contractor_local_customer_lifecycle_home_idx'
          )
     )
     or has_table_privilege('authenticated', 'public.contractor_local_contacts', 'SELECT')
     or has_table_privilege('authenticated', 'public.contractor_local_homes', 'UPDATE') then
    raise exception 'Rejected Draft foundation left compatibility or archive state behind.';
  end if;
end;
$$;
SQL
}

expect_read_rejection() {
  local database=$1
  if psql_case "$database" -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null 2>&1; then
    echo "$database unexpectedly passed the complete-Draft classifier." >&2
    exit 1
  fi
  assert_no_compatibility_state "$database"
}

# Each complete-Draft drift case starts from the same catalog-faithful fixture.
for database in \
  drift_missing_column drift_column_type drift_nullability drift_default drift_check \
  drift_weak_fk drift_wrong_reference drift_fk_action drift_unvalidated_fk \
  drift_unexpected_overload drift_return_type drift_argument_type drift_rpc_body \
  drift_public_rpc drift_anon_rpc drift_missing_authenticated_rpc \
  drift_missing_authenticated_table drift_missing_service_rpc drift_missing_service_table \
  drift_authenticated_rpc_grant_option drift_service_rpc_grant_option \
  drift_service_table_grant_option drift_service_extra_table_privilege \
  drift_service_column_acl drift_unexpected_acl_grantee \
  drift_table_acl drift_table_grant_option drift_column_acl drift_column_grant_option \
  drift_wrong_owner drift_security_invoker drift_search_path drift_rls \
  drift_missing_policy drift_policy_command drift_policy_expression archive_drift; do
  psql_case "$database" -f "$ROOT/tests/sql/draft-optional-complete-foundation.sql" >/dev/null
done

# Required columns, types, nullability, defaults, and checks are exact.
psql_case drift_missing_column -c \
  'alter table public.contractor_work_drafts drop column private_notes;' >/dev/null
expect_read_rejection drift_missing_column

psql_case drift_column_type -c \
  'alter table public.contractor_work_drafts alter column private_notes type varchar(200);' >/dev/null
expect_read_rejection drift_column_type

psql_case drift_nullability -c \
  'alter table public.contractor_work_drafts alter column property_display_snapshot drop not null;' >/dev/null
expect_read_rejection drift_nullability

psql_case drift_default -c \
  'alter table public.contractor_work_drafts alter column title drop default;' >/dev/null
expect_read_rejection drift_default

psql_case drift_check -c \
  'alter table public.contractor_work_draft_items drop constraint contractor_work_draft_items_title_not_blank;' >/dev/null
expect_read_rejection drift_check

# Weakened tenant match: the same constraint name only protects draft_id.
psql_case drift_weak_fk <<'SQL' >/dev/null
alter table public.contractor_work_draft_items
  drop constraint contractor_work_draft_items_contractor_match_fk;
alter table public.contractor_work_draft_items
  add constraint contractor_work_draft_items_contractor_match_fk
  foreign key (draft_id) references public.contractor_work_drafts(id) on delete cascade;
SQL
expect_read_rejection drift_weak_fk

# Wrong referenced column: the FK still points at local homes but not its canonical id.
psql_case drift_wrong_reference <<'SQL' >/dev/null
alter table public.contractor_local_homes
  add column noncanonical_reference_id uuid not null default gen_random_uuid() unique;
alter table public.contractor_work_drafts
  drop constraint contractor_work_drafts_local_home_id_fkey;
alter table public.contractor_work_drafts
  add constraint contractor_work_drafts_local_home_id_fkey
  foreign key (local_home_id)
  references public.contractor_local_homes(noncanonical_reference_id)
  on delete set null;
SQL
expect_read_rejection drift_wrong_reference

# Canonical update/delete actions are part of the foreign-key contract.
psql_case drift_fk_action <<'SQL' >/dev/null
alter table public.contractor_work_drafts
  drop constraint contractor_work_drafts_local_home_id_fkey;
alter table public.contractor_work_drafts
  add constraint contractor_work_drafts_local_home_id_fkey
  foreign key (local_home_id)
  references public.contractor_local_homes(id)
  on update cascade
  on delete restrict;
SQL
expect_read_rejection drift_fk_action

# Structurally matching but unvalidated constraints are not canonical.
psql_case drift_unvalidated_fk <<'SQL' >/dev/null
alter table public.contractor_work_draft_items
  drop constraint contractor_work_draft_items_contractor_match_fk;
alter table public.contractor_work_draft_items
  add constraint contractor_work_draft_items_contractor_match_fk
  foreign key (draft_id, contractor_id)
  references public.contractor_work_drafts(id, contractor_id)
  on delete cascade not valid;
SQL
expect_read_rejection drift_unvalidated_fk

psql_case drift_unexpected_overload <<'SQL' >/dev/null
create function public.servsync_get_work_draft(p_draft_id text)
returns jsonb language plpgsql security definer set search_path = public
as $$ begin return '{}'::jsonb; end $$;
alter function public.servsync_get_work_draft(text) owner to postgres;
revoke execute on function public.servsync_get_work_draft(text) from public, anon;
grant execute on function public.servsync_get_work_draft(text) to authenticated;
SQL
expect_read_rejection drift_unexpected_overload

psql_case drift_return_type <<'SQL' >/dev/null
alter function public.servsync_get_work_draft(uuid)
  rename to servsync_get_work_draft_canonical;
create function public.servsync_get_work_draft(p_draft_id uuid)
returns text language plpgsql security definer set search_path = public
as $$ begin return '{}'::text; end $$;
alter function public.servsync_get_work_draft(uuid) owner to postgres;
revoke execute on function public.servsync_get_work_draft(uuid) from public, anon;
grant execute on function public.servsync_get_work_draft(uuid) to authenticated;
SQL
expect_read_rejection drift_return_type

psql_case drift_argument_type <<'SQL' >/dev/null
alter function public.servsync_get_work_draft(uuid)
  rename to servsync_get_work_draft_canonical;
create function public.servsync_get_work_draft(p_draft_id text)
returns jsonb language plpgsql security definer set search_path = public
as $$ begin return '{}'::jsonb; end $$;
alter function public.servsync_get_work_draft(text) owner to postgres;
revoke execute on function public.servsync_get_work_draft(text) from public, anon;
grant execute on function public.servsync_get_work_draft(text) to authenticated;
SQL
expect_read_rejection drift_argument_type

psql_case drift_rpc_body <<'SQL' >/dev/null
create or replace function public.servsync_save_work_draft(
  p_draft_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_removed_item_ids jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$ begin return '{}'::jsonb; end $$;
alter function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) owner to postgres;
revoke execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated;
SQL
expect_read_rejection drift_rpc_body

psql_case drift_public_rpc -c \
  'grant execute on function public.servsync_get_work_draft(uuid) to public;' >/dev/null
expect_read_rejection drift_public_rpc

psql_case drift_anon_rpc -c \
  'grant execute on function public.servsync_get_work_draft(uuid) to anon;' >/dev/null
expect_read_rejection drift_anon_rpc

psql_case drift_missing_authenticated_rpc -c \
  'revoke execute on function public.servsync_get_work_draft(uuid) from authenticated;' >/dev/null
expect_read_rejection drift_missing_authenticated_rpc

psql_case drift_missing_authenticated_table -c \
  'revoke select on table public.contractor_work_drafts from authenticated;' >/dev/null
expect_read_rejection drift_missing_authenticated_table

psql_case drift_missing_service_rpc -c \
  'revoke execute on function public.servsync_get_work_draft(uuid) from service_role;' >/dev/null
expect_read_rejection drift_missing_service_rpc

psql_case drift_missing_service_table -c \
  'revoke delete on table public.contractor_work_drafts from service_role;' >/dev/null
expect_read_rejection drift_missing_service_table

psql_case drift_authenticated_rpc_grant_option -c \
  'grant execute on function public.servsync_get_work_draft(uuid) to authenticated with grant option;' >/dev/null
expect_read_rejection drift_authenticated_rpc_grant_option

psql_case drift_service_rpc_grant_option -c \
  'grant execute on function public.servsync_get_work_draft(uuid) to service_role with grant option;' >/dev/null
expect_read_rejection drift_service_rpc_grant_option

psql_case drift_service_table_grant_option -c \
  'grant select on table public.contractor_work_drafts to service_role with grant option;' >/dev/null
expect_read_rejection drift_service_table_grant_option

psql_case drift_service_extra_table_privilege -c \
  'grant truncate on table public.contractor_work_drafts to service_role;' >/dev/null
expect_read_rejection drift_service_extra_table_privilege

psql_case drift_service_column_acl -c \
  'grant update(title) on table public.contractor_work_drafts to service_role;' >/dev/null
expect_read_rejection drift_service_column_acl

psql_case drift_unexpected_acl_grantee <<'SQL' >/dev/null
create role unexpected_draft_reader;
grant select on table public.contractor_work_drafts to unexpected_draft_reader;
SQL
expect_read_rejection drift_unexpected_acl_grantee

psql_case drift_table_acl -c \
  'grant update on table public.contractor_work_drafts to authenticated;' >/dev/null
expect_read_rejection drift_table_acl

psql_case drift_table_grant_option -c \
  'grant select on table public.contractor_work_drafts to authenticated with grant option;' >/dev/null
expect_read_rejection drift_table_grant_option

psql_case drift_column_acl -c \
  'grant update(title) on table public.contractor_work_drafts to authenticated;' >/dev/null
expect_read_rejection drift_column_acl

psql_case drift_column_grant_option -c \
  'grant select(title) on table public.contractor_work_drafts to authenticated with grant option;' >/dev/null
expect_read_rejection drift_column_grant_option

psql_case drift_wrong_owner -c \
  'alter table public.contractor_work_drafts owner to runner;' >/dev/null
expect_read_rejection drift_wrong_owner

psql_case drift_security_invoker -c \
  'alter function public.servsync_get_work_draft(uuid) security invoker;' >/dev/null
expect_read_rejection drift_security_invoker

psql_case drift_search_path -c \
  'alter function public.servsync_get_work_draft(uuid) set search_path = public, pg_temp;' >/dev/null
expect_read_rejection drift_search_path

psql_case drift_rls -c \
  'alter table public.contractor_work_draft_launches disable row level security;' >/dev/null
expect_read_rejection drift_rls

psql_case drift_missing_policy -c \
  'drop policy "Contractor work draft items: contractor team reads" on public.contractor_work_draft_items;' >/dev/null
expect_read_rejection drift_missing_policy

psql_case drift_policy_command <<'SQL' >/dev/null
drop policy "Contractor work drafts: contractor team reads" on public.contractor_work_drafts;
create policy "Contractor work drafts: contractor team reads"
  on public.contractor_work_drafts for update to authenticated
  using (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  )
  with check (
    public.current_user_can_access_contractor(contractor_id)
    or public.current_user_is_platform_admin()
  );
SQL
expect_read_rejection drift_policy_command

psql_case drift_policy_expression <<'SQL' >/dev/null
drop policy "Contractor work drafts: contractor team reads" on public.contractor_work_drafts;
create policy "Contractor work drafts: contractor team reads"
  on public.contractor_work_drafts for select to authenticated
  using (true);
SQL
expect_read_rejection drift_policy_expression

# Partial Draft fails before either compatibility helper or archive metadata can be installed.
psql_case draft_partial -c 'create table public.contractor_work_drafts(id uuid primary key);' >/dev/null
expect_read_rejection draft_partial

# Three relations with an incompatible shape also fail closed before customer DDL.
psql_case draft_incompatible -f "$ROOT/tests/sql/draft-optional-complete-foundation.sql" >/dev/null
psql_case draft_incompatible -c 'alter table public.contractor_work_drafts alter column status drop not null;' >/dev/null
expect_read_rejection draft_incompatible

# Archive compatibility revalidates the canonical foundation and fails before DDL
# if the Draft catalog drifts after the read boundary was installed.
psql_case archive_drift -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null
psql_case archive_drift -c \
  'grant execute on function public.servsync_get_work_draft(uuid) to public;' >/dev/null
if psql_case archive_drift -f "$ROOT/servsync-contractor-local-customer-property-archive-restore-draft-optional.sql" >/dev/null 2>&1; then
  echo 'Archive migration unexpectedly accepted post-read Draft drift.' >&2
  exit 1
fi
psql_case archive_drift <<'SQL' >/dev/null
do $$
begin
  if to_regprocedure('public.servsync_private_customer_draft_foundation_available()') is null
     or to_regprocedure('public.servsync_list_local_customer_summaries()') is null
     or to_regprocedure('public.servsync_archive_local_customer(uuid)') is not null
     or to_regclass('public.contractor_local_customer_lifecycle_events') is not null
     or exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name in ('contractor_local_contacts', 'contractor_local_homes')
          and column_name in ('archived_at', 'archived_by')
     )
     or exists (
       select 1 from pg_trigger
        where tgname like 'servsync_guard_local_%' and not tgisinternal
     ) then
    raise exception 'Archive rejection did not preserve the valid read install or left archive DDL behind.';
  end if;
end;
$$;
SQL

# Reapplication remains idempotent for both supported schema shapes.
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-property-archive-restore-draft-optional.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-property-archive-restore-draft-optional.sql" >/dev/null

echo 'Draft-optional compatibility: absent/canonical/reapply PASS; role/redaction PASS; 38 partial/structural/security/grant drift cases PASS.'
