#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL="${PSQL:-$PG16_BIN/psql}"
POSTGRES="${POSTGRES:-$PG16_BIN/postgres}"
INITDB="${INITDB:-$PG16_BIN/initdb}"
TMP="$(mktemp -d "/tmp/servsync-connection-context.XXXXXX")"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55472}"

cleanup() {
  if [[ -f "$PGDATA/postmaster.pid" ]]; then
    "$PG16_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

mkdir -p "$PGSOCKET"
"$INITDB" -D "$PGDATA" -U postgres --auth=trust --no-locale >/dev/null
"$POSTGRES" -D "$PGDATA" -k "$PGSOCKET" -p "$PGPORT" >"$TMP/postgres.log" 2>&1 &
for _ in {1..50}; do
  [[ -S "$PGSOCKET/.s.PGSQL.$PGPORT" ]] && break
  sleep 0.1
done

URL="postgresql://postgres@/postgres?host=$PGSOCKET&port=$PGPORT"
run() { "$PSQL" "$URL" --set=ON_ERROR_STOP=1 "$@"; }

run --file "$ROOT/tests/sql/accepted-connection-request-context-foundation.sql" >/dev/null
run --file "$ROOT/servsync-contextual-connection-pending-review-rpc.sql" >/dev/null
run --file "$ROOT/servsync-accepted-connection-request-context-visibility.sql" >/dev/null
run --file "$ROOT/tests/sql/accepted-connection-request-context-validation.sql" >/dev/null

echo 'Accepted connection-request context PostgreSQL validation passed.'
