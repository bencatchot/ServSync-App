#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL="${PSQL:-$PG16_BIN/psql}"
POSTGRES="${POSTGRES:-$PG16_BIN/postgres}"
INITDB="${INITDB:-$PG16_BIN/initdb}"
CREATEDB="${CREATEDB:-$PG16_BIN/createdb}"
TMP="$(mktemp -d "/tmp/servsync-draft-paid.XXXXXX")"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55458}"

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
run --file "$ROOT/servsync-fb020-immutable-invoice-rls.sql" >/dev/null
run --file "$ROOT/servsync-accepted-estimate-deposit-workflow.sql" >/dev/null
run --file "$ROOT/tests/sql/stripe-connect-online-payments-test-extension.sql" >/dev/null
run --file "$ROOT/servsync-stripe-connect-online-payments-foundation.sql" >/dev/null
run --file "$ROOT/servsync-stripe-connect-provider-payment-id-compatibility.sql" >/dev/null
run --file "$ROOT/servsync-draft-invoice-mark-paid.sql" >/dev/null
run --file "$ROOT/servsync-draft-invoice-mark-paid.sql" >/dev/null
run --file "$ROOT/tests/sql/draft-invoice-mark-paid-validation.sql" >/dev/null

run --command "insert into public.invoices (id, contractor_id, invoice_number, title, status, subtotal_cents, total_cents, amount_paid_cents) values ('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 'INV-CONCURRENT', 'Concurrent Draft payment', 'draft', 65000, 65000, 0)" >/dev/null
CONCURRENT_SQL_PREFIX="set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';"
set +e
"$PSQL" "$URL" --set=ON_ERROR_STOP=1 --command "$CONCURRENT_SQL_PREFIX select public.servsync_record_offline_invoice_payment('30000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000010', 65000, current_date, 'cash', null, null);" >"$TMP/concurrent-a.log" 2>&1 &
PID_A=$!
"$PSQL" "$URL" --set=ON_ERROR_STOP=1 --command "$CONCURRENT_SQL_PREFIX select public.servsync_record_offline_invoice_payment('30000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000011', 65000, current_date, 'check', null, null);" >"$TMP/concurrent-b.log" 2>&1 &
PID_B=$!
wait "$PID_A"; STATUS_A=$?
wait "$PID_B"; STATUS_B=$?
set -e
if (( (STATUS_A == 0) + (STATUS_B == 0) != 1 )); then
  echo 'Concurrent Draft Mark Paid operations did not resolve to exactly one success.' >&2
  exit 1
fi
if [[ "$(run --tuples-only --no-align --command "select (status = 'paid' and amount_paid_cents = total_cents and (select count(*) from public.invoice_offline_payment_records p where p.invoice_id = invoices.id) = 1)::text from public.invoices where id = '30000000-0000-0000-0000-000000000010'")" != 'true' ]]; then
  echo 'Concurrent Draft Mark Paid left an invalid authoritative result.' >&2
  exit 1
fi

"$CREATEDB" --maintenance-db "$URL" draft_paid_preflight
PREFLIGHT_URL="postgresql://postgres@/draft_paid_preflight?host=$PGSOCKET&port=$PGPORT"
"$PSQL" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT/tests/sql/accepted-estimate-deposit-workflow-foundation.sql" >/dev/null
if "$PSQL" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT/servsync-draft-invoice-mark-paid.sql" >/dev/null 2>&1; then
  echo 'Expected missing offline-payment-ledger prerequisite failure.' >&2
  exit 1
fi
if [[ "$("$PSQL" "$PREFLIGHT_URL" --tuples-only --no-align --command "select to_regprocedure('public.servsync_record_offline_invoice_payment(uuid,uuid,integer,date,text,text,text)') is null")" != 't' ]]; then
  echo 'Missing-prerequisite failure unexpectedly created the payment RPC.' >&2
  exit 1
fi

echo 'Draft Invoice Mark Paid PostgreSQL validation passed.'
