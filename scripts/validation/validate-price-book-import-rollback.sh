#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL="${PSQL:-$PG16_BIN/psql}"
POSTGRES="${POSTGRES:-$PG16_BIN/postgres}"
INITDB="${INITDB:-$PG16_BIN/initdb}"
TMP="$(mktemp -d "/tmp/servsync-price-book-rollback.XXXXXX")"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55469}"

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

run --file "$ROOT/tests/sql/price-book-import-rollback-foundation.sql" >/dev/null
run --file "$ROOT/servsync-price-book-repeat-import-reconciliation.sql" >/dev/null
run --file "$ROOT/servsync-price-book-import-batch-rollback.sql" >/dev/null
run --file "$ROOT/tests/sql/price-book-import-rollback-validation.sql" >/dev/null

run --command "
insert into public.contractor_price_book_items (id, contractor_id, title, line_type)
values ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Concurrent after', 'other');
insert into public.contractor_price_book_import_batches (
  id, contractor_id, import_source_id, idempotency_key, request_hash, status,
  original_filename, file_sha256, file_size_bytes, row_count, update_count, created_by
) select '40000000-0000-0000-0000-000000000010', contractor_id, id,
         '40000000-0000-0000-0000-000000000011', repeat('e',64), 'building',
         'concurrent.csv', repeat('f',64), 80, 0, 0, '10000000-0000-0000-0000-000000000001'
    from public.contractor_price_book_import_sources where display_name = 'Primary CSV';
insert into public.contractor_price_book_import_batch_rows (
  batch_id, contractor_id, row_number, row_fingerprint, requested_action, applied_action,
  match_type, match_confidence, target_price_book_item_id, mapped_fields,
  before_patch, after_patch, outcome
) values (
  '40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 2,
  repeat('1',64), 'update', 'update', 'external_id', 'high',
  '30000000-0000-0000-0000-000000000004', array['title'],
  '{\"title\":\"Concurrent before\"}', '{\"title\":\"Concurrent after\"}', 'updated'
);
update public.contractor_price_book_import_batches
   set status = 'completed', completed_at = now(), row_count = 1, update_count = 1,
       result_summary = '{\"status\":\"completed\"}'
 where id = '40000000-0000-0000-0000-000000000010';
" >/dev/null

AUTH_SQL="set role authenticated; set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';"
"$PSQL" "$URL" --set=ON_ERROR_STOP=1 --command "$AUTH_SQL select public.servsync_execute_price_book_import_rollback('40000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000010');" >"$TMP/concurrent-a.log" 2>&1 &
PID_A=$!
"$PSQL" "$URL" --set=ON_ERROR_STOP=1 --command "$AUTH_SQL select public.servsync_execute_price_book_import_rollback('40000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000011');" >"$TMP/concurrent-b.log" 2>&1 &
PID_B=$!
wait "$PID_A"
wait "$PID_B"
if [[ "$(run --tuples-only --no-align --command "select count(*) || ':' || (select count(*) from public.contractor_price_book_import_rollback_rows where rollback_batch_id = batch.id) from public.contractor_price_book_import_rollback_batches batch where import_batch_id = '40000000-0000-0000-0000-000000000010' group by batch.id")" != '1:1' ]]; then
  echo 'Concurrent rollback created duplicate batch or row audit.' >&2
  exit 1
fi
if [[ "$(run --tuples-only --no-align --command "select title from public.contractor_price_book_items where id = '30000000-0000-0000-0000-000000000004'")" != 'Concurrent before' ]]; then
  echo 'Concurrent rollback did not restore the expected value once.' >&2
  exit 1
fi

if run --file "$ROOT/servsync-price-book-import-batch-rollback.sql" >"$TMP/reapply.log" 2>&1; then
  echo 'Expected repeated rollback migration application to fail closed.' >&2
  exit 1
fi

if ! grep -q 'already installed' "$TMP/reapply.log"; then
  echo 'Repeated migration failed for an unexpected reason.' >&2
  exit 1
fi

echo 'Price Book import batch rollback PostgreSQL validation passed.'
