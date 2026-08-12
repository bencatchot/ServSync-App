#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG16_BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
TMP="$(mktemp -d '/tmp/servsync-saved-charge-consolidation.XXXXXX')"
PGDATA="$TMP/data"
PGSOCKET="$TMP/socket"
PGPORT="${PGPORT:-55479}"
cleanup() {
  if [[ -f "$PGDATA/postmaster.pid" ]]; then
    "$PG16_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

mkdir -p "$PGSOCKET"
"$PG16_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust --no-locale >/dev/null
"$PG16_BIN/postgres" -D "$PGDATA" -k "$PGSOCKET" -p "$PGPORT" >"$TMP/postgres.log" 2>&1 &
for _ in {1..50}; do
  [[ -S "$PGSOCKET/.s.PGSQL.$PGPORT" ]] && break
  sleep 0.1
done
URL="postgresql://postgres@/postgres?host=$PGSOCKET&port=$PGPORT"
run() { "$PG16_BIN/psql" "$URL" --set=ON_ERROR_STOP=1 "$@"; }

run -f "$ROOT_DIR/tests/sql/saved-charges-price-book-consolidation-foundation.sql" >/dev/null
run <<'SQL' >/dev/null
insert into public.contractor_profiles values
('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');
insert into public.contractor_price_book_items values
('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Existing item', '', '', '', '', null, 'material', 'each', 5000, true, null, null, 'manual', true, null, '2026-08-01', '2026-08-01');
insert into public.contractor_saved_estimate_charges
(id, contractor_id, name, description, line_type, charge_type, amount_cents, default_quantity, unit, active, sort_order, created_at, updated_at) values
('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Service visit', 'Private service note', 'other', 'flat', 8900, 1, 'each', true, 1, '2026-08-01', '2026-08-02'),
('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Hourly labor', 'Private labor note', 'labor', 'hourly', 12500, 1, null, true, 2, '2026-08-01', '2026-08-02'),
('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Inactive fee', '', 'fee', 'flat', 2500, 1, 'job', false, 3, '2026-08-01', '2026-08-02'),
('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Zero service', '', 'other', 'flat', 0, 1, 'each', true, 4, '2026-08-01', '2026-08-02');
SQL

run -f "$ROOT_DIR/servsync-saved-charges-price-book-consolidation.sql" >/dev/null
run -f "$ROOT_DIR/tests/sql/saved-charges-price-book-consolidation-validation.sql" >/dev/null

before_repeat="$(run -At -c "select count(*) || ':' || (select count(*) from public.contractor_saved_charge_price_book_lineage) from public.contractor_price_book_items")"
if run -f "$ROOT_DIR/servsync-saved-charges-price-book-consolidation.sql" >/dev/null 2>&1; then
  echo 'Repeated consolidation unexpectedly succeeded.' >&2
  exit 1
fi
after_repeat="$(run -At -c "select count(*) || ':' || (select count(*) from public.contractor_saved_charge_price_book_lineage) from public.contractor_price_book_items")"
test "$before_repeat" = "$after_repeat"

run -c "update public.contractor_price_book_items set title = 'Contractor edit' where source = 'legacy_saved_charge' and title = 'Service visit'" >/dev/null
if run -f "$ROOT_DIR/servsync-saved-charges-price-book-consolidation-rollback.sql" >/dev/null 2>&1; then
  echo 'Guarded rollback unexpectedly destroyed a post-migration edit.' >&2
  exit 1
fi
run -c "update public.contractor_price_book_items set title = 'Service visit' where source = 'legacy_saved_charge' and title = 'Contractor edit'" >/dev/null

run -f "$ROOT_DIR/servsync-saved-charges-price-book-consolidation-rollback.sql" >/dev/null
test "$(run -At -c 'select count(*) from public.contractor_price_book_items')" = "1"
test "$(run -At -c 'select count(*) from public.contractor_saved_estimate_charges')" = "4"
test "$(run -At -c "select has_table_privilege('authenticated', 'public.contractor_saved_estimate_charges', 'select')")" = "t"

run -c "update public.contractor_saved_estimate_charges set default_quantity = 2 where id = '40000000-0000-4000-8000-000000000001'" >/dev/null
if run -f "$ROOT_DIR/servsync-saved-charges-price-book-consolidation.sql" >/dev/null 2>&1; then
  echo 'Unsupported quantity unexpectedly migrated.' >&2
  exit 1
fi
test "$(run -At -c 'select count(*) from public.contractor_price_book_items')" = "1"

run -c "update public.contractor_saved_estimate_charges set default_quantity = 1 where id = '40000000-0000-4000-8000-000000000001'" >/dev/null
run -c "insert into public.contractor_price_book_items values ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Service visit', '', '', '', '', null, 'other', 'each', 8900, true, null, null, 'manual', true, null, '2026-08-01', '2026-08-01')" >/dev/null
if run -f "$ROOT_DIR/servsync-saved-charges-price-book-consolidation.sql" >/dev/null 2>&1; then
  echo 'Conflicting Price Book item unexpectedly migrated.' >&2
  exit 1
fi
test "$(run -At -c 'select count(*) from public.contractor_price_book_items')" = "2"

echo 'Saved Charges -> Price Book consolidation validation passed.'
