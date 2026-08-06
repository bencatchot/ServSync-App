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

for database in draft_absent draft_complete draft_partial draft_incompatible; do
  "$CREATEDB" -h "$SOCKET_DIR" -p 55439 -U runner "$database"
  psql_case "$database" -f "$ROOT/tests/sql/draft-optional-customer-foundation.sql" >/dev/null
done

for database in draft_absent draft_complete draft_partial draft_incompatible; do
  psql_case "$database" -f "$ROOT/servsync-customer-management-edit-boundary.sql" >/dev/null
done

# Draft absent: both migrations install, omit Draft objects, and return stable zero/empty values.
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null
psql_case draft_absent -f "$ROOT/servsync-admin-office-customer-creation-parity.sql" >/dev/null
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-direct-table-privilege-cleanup.sql" >/dev/null
psql_case draft_absent -f "$ROOT/servsync-contractor-local-customer-property-archive-restore-draft-optional.sql" >/dev/null
psql_case draft_absent <<'SQL' >/dev/null
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare
  v_impact jsonb;
  v_history jsonb;
begin
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

  perform public.servsync_update_local_contact_profile(
    '30000000-0000-0000-0000-000000000001',
    'Compatibility Customer Updated', '', '', 'private manager note'
  );
  perform public.servsync_create_local_contact(
    'Created Without Draft', '', '', '', 'Main', '2 Compatibility Way', '', '', '', '', '', '', '', ''
  );

  if (select count(*) from public.contractor_local_contacts) <> 2
     or (select count(*) from public.contractor_local_homes) <> 2 then
    raise exception 'Draft-free management or paired creation failed.';
  end if;

  if has_table_privilege('authenticated', 'public.contractor_local_contacts', 'SELECT')
     or has_table_privilege('authenticated', 'public.contractor_local_homes', 'UPDATE') then
    raise exception 'Direct-table privilege cleanup did not hold.';
  end if;
end;
$$;

select public.servsync_archive_local_customer('30000000-0000-0000-0000-000000000001');

do $$
begin
  if (select status from public.contractor_local_customer_claim_invites where id = '60000000-0000-0000-0000-000000000001') <> 'revoked' then
    raise exception 'Pending invitation was not revoked transactionally.';
  end if;
end;
$$;

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
SQL

# Complete Draft: Draft visibility, count, history, and assignment guard remain active.
psql_case draft_complete -f "$ROOT/tests/sql/draft-optional-complete-foundation.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-admin-office-customer-creation-parity.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-direct-table-privilege-cleanup.sql" >/dev/null
psql_case draft_complete -f "$ROOT/servsync-contractor-local-customer-property-archive-restore-draft-optional.sql" >/dev/null
psql_case draft_complete <<'SQL' >/dev/null
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

insert into public.contractor_work_drafts(id, contractor_id, local_contact_id, local_home_id)
values (
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
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
    insert into public.contractor_work_drafts(contractor_id, local_contact_id, local_home_id)
    values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    );
    raise exception 'Archived Draft assignment was unexpectedly accepted.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
SQL

# Partial Draft fails before either compatibility helper or archive metadata can be installed.
psql_case draft_partial -c 'create table public.contractor_work_drafts(id uuid primary key);' >/dev/null
if psql_case draft_partial -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null 2>&1; then
  echo 'Partial Draft foundation unexpectedly passed.' >&2
  exit 1
fi
psql_case draft_partial <<'SQL' >/dev/null
do $$
begin
  if to_regprocedure('public.servsync_private_customer_draft_foundation_available()') is not null
     or exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'contractor_local_contacts' and column_name = 'archived_at'
     ) then
    raise exception 'Partial Draft failure left customer lifecycle DDL behind.';
  end if;
end;
$$;
SQL

# Three relations with an incompatible shape also fail closed before customer DDL.
psql_case draft_incompatible -f "$ROOT/tests/sql/draft-optional-complete-foundation.sql" >/dev/null
psql_case draft_incompatible -c 'alter table public.contractor_work_drafts alter column status drop not null;' >/dev/null
if psql_case draft_incompatible -f "$ROOT/servsync-contractor-local-customer-read-list-parity-draft-optional.sql" >/dev/null 2>&1; then
  echo 'Incompatible Draft foundation unexpectedly passed.' >&2
  exit 1
fi
psql_case draft_incompatible <<'SQL' >/dev/null
do $$
begin
  if to_regprocedure('public.servsync_private_customer_draft_foundation_available()') is not null
     or exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'contractor_local_contacts' and column_name = 'archived_at'
     ) then
    raise exception 'Incompatible Draft failure left customer lifecycle DDL behind.';
  end if;
end;
$$;
SQL

echo 'Draft-optional compatibility: absent PASS; complete PASS; partial PASS; incompatible PASS.'
