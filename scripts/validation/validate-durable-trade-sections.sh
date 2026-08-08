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
PGPORT="${PGPORT:-55447}"
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

install_prerequisites() {
  local database="$1"
  run_file "$database" tests/sql/property-asset-bridge-foundation.sql
  run_file "$database" servsync-home-assets-foundation.sql
  run_file "$database" tests/sql/property-asset-bridge-seed.sql
  run_file "$database" tests/sql/durable-trade-section-foundation.sql
  run_file "$database" servsync-trade-pack-domain-contracts.sql
  run_file "$database" servsync-property-asset-bridge.sql
}

for database in trade_section_forward trade_section_rollback trade_section_preflight; do
  "$CREATEDB" --host "$PGSOCKET" --port "$PGPORT" --username postgres "$database"
  install_prerequisites "$database"
done

run_file trade_section_forward servsync-durable-trade-section-instances.sql
run_file trade_section_forward tests/sql/durable-trade-section-seed.sql
run_file trade_section_forward tests/sql/durable-trade-section-validation.sql
run_file trade_section_forward tests/sql/durable-trade-section-service-role-validation.sql

if run_file trade_section_forward servsync-durable-trade-section-instances.sql 2>/dev/null; then
  printf 'Expected repeated Durable Trade Section application to fail closed.\n' >&2
  exit 1
fi
if run_file trade_section_forward tests/sql/durable-trade-section-rollback.sql 2>/dev/null; then
  printf 'Expected guarded rollback to refuse durable Trade Section history.\n' >&2
  exit 1
fi

run_file trade_section_rollback servsync-durable-trade-section-instances.sql
run_file trade_section_rollback tests/sql/durable-trade-section-rollback.sql

rollback_residue="$("$PSQL" "postgresql://postgres@/trade_section_rollback?host=$PGSOCKET&port=$PGPORT" -Atqc "
  select count(*) from (
    select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
     where namespace.nspname='public' and relation.relname like 'trade_section_%'
    union all
    select 1 from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
     where namespace.nspname='public' and procedure.proname like '%trade_section%'
    union all
    select 1 from pg_trigger trigger_row
     where not trigger_row.tgisinternal and trigger_row.tgname like '%trade_sections%'
  ) residue;")"
if [[ "$rollback_residue" != "0" ]]; then
  printf 'Guarded rollback left %s Durable Trade Section objects.\n' "$rollback_residue" >&2
  exit 1
fi

"$PSQL" "postgresql://postgres@/trade_section_preflight?host=$PGSOCKET&port=$PGPORT" \
  --set=ON_ERROR_STOP=1 --command 'drop function public.servsync_private_can_read_property_assets(uuid,uuid,uuid);' >/dev/null
if run_file trade_section_preflight servsync-durable-trade-section-instances.sql 2>/dev/null; then
  printf 'Expected missing-prerequisite migration to fail closed.\n' >&2
  exit 1
fi

preflight_residue="$("$PSQL" "postgresql://postgres@/trade_section_preflight?host=$PGSOCKET&port=$PGPORT" -Atqc "
  select count(*) from (
    select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
     where namespace.nspname='public' and relation.relname like 'trade_section_%'
    union all
    select 1 from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
     where namespace.nspname='public' and procedure.proname like '%trade_section%'
  ) residue;")"
if [[ "$preflight_residue" != "0" ]]; then
  printf 'Failed preflight left %s Durable Trade Section objects.\n' "$preflight_residue" >&2
  exit 1
fi

printf 'Durable Trade Section Instances validation passed.\n'
