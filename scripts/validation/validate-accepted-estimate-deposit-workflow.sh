#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL="${PSQL:-$PG16_BIN/psql}"
POSTGRES="${POSTGRES:-$PG16_BIN/postgres}"
INITDB="${INITDB:-$PG16_BIN/initdb}"
CREATEDB="${CREATEDB:-$PG16_BIN/createdb}"
TMP="$(mktemp -d "/tmp/servsync-deposit.XXXXXX")"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55439}"

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

run --file "$ROOT/tests/sql/accepted-estimate-deposit-workflow-foundation.sql" >/dev/null
run --file "$ROOT/servsync-accepted-estimate-deposit-workflow.sql" >/dev/null
run --file "$ROOT/servsync-accepted-estimate-deposit-workflow.sql" >/dev/null
run --file "$ROOT/tests/sql/accepted-estimate-deposit-workflow-validation.sql" >/dev/null

parallel_call="set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001'; select public.servsync_create_invoice_from_estimate_schedule_item('40000000-0000-0000-0000-000000000006');"
run --command "$parallel_call" >"$TMP/parallel-1.log" &
pid_one=$!
run --command "$parallel_call" >"$TMP/parallel-2.log" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"
if [[ "$(run --tuples-only --no-align --command "select count(*) from public.invoices where estimate_id = '30000000-0000-0000-0000-000000000005' and invoice_type = 'deposit'")" != '1' ]]; then
  echo 'Concurrent Request deposit calls created duplicate Invoices.' >&2
  exit 1
fi

"$CREATEDB" --maintenance-db "$URL" deposit_preflight
PREFLIGHT_URL="postgresql://postgres@/deposit_preflight?host=$PGSOCKET&port=$PGPORT"
"$PSQL" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT/tests/sql/accepted-estimate-deposit-workflow-foundation.sql" >/dev/null
"$PSQL" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --command 'drop function public.servsync_void_invoice(uuid);' >/dev/null
if "$PSQL" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT/servsync-accepted-estimate-deposit-workflow.sql" >/dev/null 2>&1; then
  echo 'Expected missing-prerequisite migration failure.' >&2
  exit 1
fi
if [[ "$("$PSQL" "$PREFLIGHT_URL" --tuples-only --no-align --command "select to_regclass('public.invoice_offline_payment_records') is null")" != 't' ]]; then
  echo 'Missing-prerequisite failure left migration residue.' >&2
  exit 1
fi

echo 'Accepted Estimate Deposit Workflow PostgreSQL validation passed.'
