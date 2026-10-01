#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-legal.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_LEGAL_TEST_PORT:-55449}"

cleanup() {
  if [[ -f "$PGDATA/postmaster.pid" ]]; then
    "$PG_CTL_BIN" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$PGSOCKET"
"$INITDB_BIN" -D "$PGDATA" -U postgres --auth=trust --no-locale >/dev/null
"$PG_CTL_BIN" -D "$PGDATA" -o "-F -k $PGSOCKET -p $PGPORT" -w start >/dev/null

DATABASE_URL="postgresql://postgres@/postgres?host=$PGSOCKET&port=$PGPORT"
psql_run() {
  "$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 "$@"
}

psql_run >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_auth_admin nologin;
create schema auth authorization postgres;
create schema extensions authorization postgres;
create extension pgcrypto with schema extensions;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
grant usage on schema auth to supabase_auth_admin;
grant insert on auth.users to supabase_auth_admin;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
SQL

for migration in \
  servsync-clean-foundation.sql \
  servsync-admin-contractor-management.sql \
  servsync-email-prep.sql \
  servsync-permanent-referral.sql \
  servsync-referrals-v1.sql \
  servsync-referral-attribution.sql \
  servsync-public-signup-role-hardening.sql; do
  psql_run --file "$ROOT_DIR/$migration" >/dev/null
done

psql_run >/dev/null <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', 'historical@example.test', '{"role":"homeowner"}');
SQL
psql_run --file "$ROOT_DIR/servsync-versioned-legal-acceptance.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-legal-policy-archive.sql" >/dev/null
# Unapproved candidate must not activate. This is the isolated local cluster only.
if psql_run -v legal_bundle_id=servsync-2026-10-01-v1 --file "$ROOT_DIR/scripts/legal/activate-policy.sql" >"$TEST_ROOT/activation.log" 2>&1; then
  echo "Unapproved candidate activated unexpectedly" >&2; exit 1
fi
psql_run --file "$ROOT_DIR/tests/legal/prepare-fixtures.sql" >/dev/null
psql_run -v legal_bundle_id=servsync-test-v1 --file "$ROOT_DIR/scripts/legal/activate-policy.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/legal/acceptance-validation.sql"
echo "Legal acceptance database tests passed (isolated local PostgreSQL; no shared writes)."
