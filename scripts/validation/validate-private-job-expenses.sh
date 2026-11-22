#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
temp="$(mktemp -d /tmp/servsync-private-expenses.XXXXXX)"
port="${PGPORT:-55483}"
trap '"$pg/pg_ctl" -D "$temp/data" -m fast stop >/dev/null 2>&1 || true' EXIT
mkdir "$temp/socket"
"$pg/initdb" -D "$temp/data" -U postgres --auth=trust --no-locale >/dev/null
"$pg/pg_ctl" -D "$temp/data" -l "$temp/pg.log" -o "-c listen_addresses='' -k $temp/socket -p $port" -w start >/dev/null
"$pg/psql" -X -h "$temp/socket" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$root/tests/sql/private-job-expenses-foundation.sql" \
  -f "$root/docs/migration-review/servsync-private-job-expenses.sql" \
  -f "$root/tests/sql/private-job-expenses-validation.sql" >/dev/null
echo "Private expense PostgreSQL checks passed. Isolated database stopped at exit: $temp"
