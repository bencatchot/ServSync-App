#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POSTGRES_BIN_DIR="$(dirname "$(command -v postgres)")"
TEST_ROOT="$(mktemp -d /tmp/servsync-plan-visits.XXXXXX)"
cleanup() { "$POSTGRES_BIN_DIR/pg_ctl" -D "$TEST_ROOT/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$TEST_ROOT"; }
trap cleanup EXIT
mkdir -p "$TEST_ROOT/socket"
"$POSTGRES_BIN_DIR/initdb" -D "$TEST_ROOT/data" -U postgres --auth=trust --no-locale >/dev/null
"$POSTGRES_BIN_DIR/pg_ctl" -D "$TEST_ROOT/data" -o "-F -k $TEST_ROOT/socket -p 55461 -h ''" -w start >/dev/null
run_sql() { psql "postgresql://postgres@/postgres?host=$TEST_ROOT/socket&port=55461" -X --set=ON_ERROR_STOP=1 "$@"; }
run_sql -f "$ROOT_DIR/tests/sql/service-plan-visits-foundation.sql" >/dev/null
run_sql -f "$ROOT_DIR/servsync-service-agreements-foundation.sql" >/dev/null
run_sql -f "$ROOT_DIR/supabase/migrations/20261113223048_service_plan_visits.sql" >/dev/null
run_sql -f "$ROOT_DIR/tests/sql/service-plan-visits-validation.sql"
for attempt in 1 2; do
  run_sql -c "begin; set role authenticated; select set_config('request.jwt.claim.sub',test.id(2)::text,true); select public.servsync_setup_plan_visits(test.id(10002),test.id(80009)); select pg_sleep(0.1); commit;" >/dev/null &
  if [[ "$attempt" = 1 ]]; then FIRST_PID=$!; else SECOND_PID=$!; fi
done
wait "$FIRST_PID"
wait "$SECOND_PID"
run_sql -c "select test.assert((select count(*)=1 from public.service_plan_visits where id=test.id(80009)), 'concurrent duplicate action creates exactly one visit');"
