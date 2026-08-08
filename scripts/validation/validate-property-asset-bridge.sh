#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL="${PSQL:-$PG16_BIN/psql}"
POSTGRES="${POSTGRES:-$PG16_BIN/postgres}"
INITDB="${INITDB:-$PG16_BIN/initdb}"
CREATEDB="${CREATEDB:-$PG16_BIN/createdb}"

for binary in "$PSQL" "$POSTGRES" "$INITDB" "$CREATEDB"; do
  if [[ ! -x "$binary" ]]; then
    printf 'Missing required PostgreSQL 16 binary: %s\n' "$binary" >&2
    exit 1
  fi
done

TMP="$(mktemp -d)"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55446}"
mkdir -p "$PGSOCKET"

cleanup() {
  if [[ -n "${POSTGRES_PID:-}" ]]; then
    kill "$POSTGRES_PID" >/dev/null 2>&1 || true
    wait "$POSTGRES_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

"$INITDB" -D "$PGDATA" -U postgres --auth=trust --no-locale >/dev/null
"$POSTGRES" -D "$PGDATA" -k "$PGSOCKET" -p "$PGPORT" >"$TMP/postgres.log" 2>&1 &
POSTGRES_PID=$!

for _ in {1..50}; do
  if "$PSQL" "postgresql://postgres@/postgres?host=$PGSOCKET&port=$PGPORT" -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

run_file() {
  local database="$1"
  local file="$2"
  "$PSQL" "postgresql://postgres@/$database?host=$PGSOCKET&port=$PGPORT" \
    --set=ON_ERROR_STOP=1 --file "$ROOT_DIR/$file" >/dev/null
}

install_current_foundation() {
  local database="$1"
  run_file "$database" tests/sql/property-asset-bridge-foundation.sql
  run_file "$database" servsync-home-assets-foundation.sql
  run_file "$database" tests/sql/property-asset-bridge-seed.sql
}

for database in property_asset_forward property_asset_rollback property_asset_preflight; do
  "$CREATEDB" --host "$PGSOCKET" --port "$PGPORT" --username postgres "$database"
  install_current_foundation "$database"
done

run_file property_asset_forward servsync-property-asset-bridge.sql
run_file property_asset_forward tests/sql/property-asset-bridge-validation.sql

if run_file property_asset_forward servsync-property-asset-bridge.sql 2>/dev/null; then
  printf 'Expected repeated Property Asset Bridge application to fail closed.\n' >&2
  exit 1
fi

if run_file property_asset_forward tests/sql/property-asset-bridge-rollback.sql 2>/dev/null; then
  printf 'Expected guarded rollback to refuse durable Property Asset history.\n' >&2
  exit 1
fi

if "$PSQL" "postgresql://postgres@/property_asset_forward?host=$PGSOCKET&port=$PGPORT" \
  --set=ON_ERROR_STOP=1 \
  --command "set role authenticated; select count(*) from public.home_assets;" >/dev/null 2>&1; then
  printf 'Expected authenticated direct home_assets read to fail.\n' >&2
  exit 1
fi

if "$PSQL" "postgresql://postgres@/property_asset_forward?host=$PGSOCKET&port=$PGPORT" \
  --set=ON_ERROR_STOP=1 \
  --command "set role service_role; update public.home_asset_revisions set name = name;" >/dev/null 2>&1; then
  printf 'Expected service_role revision mutation to fail through the immutable trigger.\n' >&2
  exit 1
fi

if "$PSQL" "postgresql://postgres@/property_asset_forward?host=$PGSOCKET&port=$PGPORT" \
  --set=ON_ERROR_STOP=1 \
  --command "set role anon; select public.servsync_list_property_assets(null, null, null, false);" >/dev/null 2>&1; then
  printf 'Expected anon Property Asset RPC execution to fail.\n' >&2
  exit 1
fi

run_file property_asset_rollback servsync-property-asset-bridge.sql
run_file property_asset_rollback tests/sql/property-asset-bridge-rollback.sql

rollback_result="$("$PSQL" "postgresql://postgres@/property_asset_rollback?host=$PGSOCKET&port=$PGPORT" -Atqc "
  select concat_ws('|',
    to_regclass('public.home_asset_revisions') is null,
    not exists (select 1 from information_schema.columns where table_schema='public' and table_name='home_assets' and column_name='revision_number'),
    (select is_nullable='NO' from information_schema.columns where table_schema='public' and table_name='home_assets' and column_name='home_id'),
    (select confdeltype='c' from pg_constraint where conrelid='public.home_assets'::regclass and conname='home_assets_home_id_fkey'),
    (select count(*)=3 from pg_policy where polrelid='public.home_assets'::regclass),
    has_table_privilege('authenticated', 'public.home_assets', 'select'),
    has_table_privilege('authenticated', 'public.home_assets', 'insert'),
    has_table_privilege('authenticated', 'public.home_assets', 'update'),
    has_table_privilege('service_role', 'public.home_assets', 'delete'),
    (select notes='Homeowner private note' from public.home_assets where id='50000000-0000-0000-0000-000000000001')
  );")"
if [[ "$rollback_result" != "t|t|t|t|t|t|t|t|t|t" ]]; then
  printf 'Rollback did not restore the focused historical foundation: %s\n' "$rollback_result" >&2
  exit 1
fi

"$PSQL" "postgresql://postgres@/property_asset_preflight?host=$PGSOCKET&port=$PGPORT" \
  --set=ON_ERROR_STOP=1 \
  --command 'drop function public.current_user_can_manage_contractor_customers(uuid);' >/dev/null
if run_file property_asset_preflight servsync-property-asset-bridge.sql 2>/dev/null; then
  printf 'Expected missing-prerequisite migration to fail.\n' >&2
  exit 1
fi

preflight_residue="$("$PSQL" "postgresql://postgres@/property_asset_preflight?host=$PGSOCKET&port=$PGPORT" -Atqc "
  select count(*) from (
    select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public' and relation.relname='home_asset_revisions'
    union all
    select 1 from information_schema.columns
      where table_schema='public' and table_name='home_assets' and column_name='revision_number'
    union all
    select 1 from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public' and procedure.proname like 'servsync_%property_asset%'
  ) residue;")"
if [[ "$preflight_residue" != "0" ]]; then
  printf 'Failed preflight left %s Property Asset Bridge objects.\n' "$preflight_residue" >&2
  exit 1
fi

printf 'Property Asset Bridge validation passed.\n'
