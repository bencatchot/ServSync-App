#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL="${PSQL:-$PG16_BIN/psql}"
POSTGRES="${POSTGRES:-$PG16_BIN/postgres}"
INITDB="${INITDB:-$PG16_BIN/initdb}"
TMP="$(mktemp -d "/tmp/servsync-stripe-connect.XXXXXX")"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55449}"

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
run --file "$ROOT/tests/sql/stripe-connect-online-payments-test-extension.sql" >/dev/null
run --file "$ROOT/servsync-stripe-connect-online-payments-foundation.sql" >/dev/null
run --file "$ROOT/servsync-stripe-connect-provider-payment-id-compatibility.sql" >/dev/null
run --file "$ROOT/servsync-stripe-connect-provider-payment-id-compatibility.sql" >/dev/null
run --file "$ROOT/tests/sql/stripe-connect-online-payments-validation.sql" >/dev/null

if run >/dev/null 2>&1 <<SQL
begin;
alter table public.invoice_online_payment_attempts
  drop constraint invoice_online_payment_attempts_charge_check;
alter table public.invoice_online_payment_attempts
  add constraint invoice_online_payment_attempts_charge_check
  check (charge_id is null);
\i '$ROOT/servsync-stripe-connect-provider-payment-id-compatibility.sql'
rollback;
SQL
then
  echo 'Provider payment ID compatibility migration accepted a drifted prerequisite.' >&2
  exit 1
fi

echo 'Stripe Connect Online Payments Foundation PostgreSQL validation passed.'
