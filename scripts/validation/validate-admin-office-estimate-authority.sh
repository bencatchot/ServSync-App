#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL="${PSQL:-$PG16_BIN/psql}"
POSTGRES="${POSTGRES:-$PG16_BIN/postgres}"
INITDB="${INITDB:-$PG16_BIN/initdb}"
CREATEDB="${CREATEDB:-$PG16_BIN/createdb}"
TMP="$(mktemp -d "/tmp/servsync-estimate-authority.XXXXXX")"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55464}"

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

run --file "$ROOT/tests/sql/admin-office-estimate-authority-foundation.sql" >/dev/null
run --file "$ROOT/servsync-admin-office-estimate-authority.sql" >/dev/null
run --file "$ROOT/tests/sql/admin-office-estimate-authority-validation.sql" >/dev/null

"$CREATEDB" --maintenance-db "$URL" estimate_authority_preflight
PREFLIGHT_URL="postgresql://postgres@/estimate_authority_preflight?host=$PGSOCKET&port=$PGPORT"
if "$PSQL" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT/servsync-admin-office-estimate-authority.sql" >/dev/null 2>&1; then
  echo 'Expected missing-prerequisite failure.' >&2
  exit 1
fi
if [[ "$("$PSQL" "$PREFLIGHT_URL" --tuples-only --no-align --command "select to_regprocedure('public.servsync_send_estimate(uuid)') is null")" != 't' ]]; then
  echo 'Missing-prerequisite failure unexpectedly created the send RPC.' >&2
  exit 1
fi

echo 'Admin/Office Estimate authority PostgreSQL validation passed.'
