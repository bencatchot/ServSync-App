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
PGPORT="${PGPORT:-55441}"
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
    --set=ON_ERROR_STOP=1 \
    --file "$ROOT_DIR/$file" >/dev/null
}

for database in trade_pack_forward trade_pack_rollback trade_pack_preflight; do
  "$CREATEDB" --host "$PGSOCKET" --port "$PGPORT" --username postgres "$database"
  run_file "$database" tests/sql/trade-pack-domain-contracts-foundation.sql
done

run_file trade_pack_forward servsync-trade-pack-domain-contracts.sql
run_file trade_pack_forward tests/sql/trade-pack-domain-contracts-live-catalog.sql
run_file trade_pack_forward tests/sql/trade-pack-domain-contracts-validation.sql

if run_file trade_pack_forward servsync-trade-pack-domain-contracts.sql 2>/dev/null; then
  printf 'Expected repeated migration application to fail closed.\n' >&2
  exit 1
fi

run_file trade_pack_rollback servsync-trade-pack-domain-contracts.sql
run_file trade_pack_rollback tests/sql/trade-pack-domain-contracts-rollback.sql

"$PSQL" "postgresql://postgres@/trade_pack_preflight?host=$PGSOCKET&port=$PGPORT" \
  --set=ON_ERROR_STOP=1 \
  --command 'drop function public.current_user_can_access_contractor(uuid);' >/dev/null

if run_file trade_pack_preflight servsync-trade-pack-domain-contracts.sql 2>/dev/null; then
  printf 'Expected missing-prerequisite migration to fail.\n' >&2
  exit 1
fi

residue_count="$("$PSQL" "postgresql://postgres@/trade_pack_preflight?host=$PGSOCKET&port=$PGPORT" -Atqc \
  "select count(*) from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace where namespace.nspname = 'public' and relation.relname like '%trade_pack%';")"
if [[ "$residue_count" != "0" ]]; then
  printf 'Failed migration left %s Trade Pack relations.\n' "$residue_count" >&2
  exit 1
fi

printf 'Trade Pack Domain Contracts validation passed.\n'
