#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-codex-marketing.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_CODEX_MARKETING_TEST_PORT:-55449}"

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
create schema auth authorization postgres;
create schema extensions authorization postgres;
create extension if not exists pgcrypto with schema extensions;
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.profiles (
  id uuid primary key,
  role text not null,
  full_name text not null default ''
);
create table public.contractor_profiles (
  id uuid primary key
);
create function public.current_user_is_platform_admin()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role = 'platform_admin'
  );
$$;
SQL

psql_run --file "$ROOT_DIR/servsync-internal-marketing-content-approval.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/internal-marketing-content-approval-validation.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-codex-assisted-marketing-drafts.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-marketing-direction-copy-guardrails.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/codex-assisted-marketing-drafts-validation.sql" >/dev/null

before_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_content_preparation_packages),
  (select count(*) from public.marketing_content_items),
  (select count(*) from public.marketing_content_status_events),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'servsync_%marketing%')
));
SQL
)"

if psql_run --file "$ROOT_DIR/servsync-codex-assisted-marketing-drafts.sql" >/dev/null 2>&1; then
  echo "Repeated Codex-assisted Marketing migration unexpectedly succeeded." >&2
  exit 1
fi

after_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_content_preparation_packages),
  (select count(*) from public.marketing_content_items),
  (select count(*) from public.marketing_content_status_events),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'servsync_%marketing%')
));
SQL
)"

if [[ "$before_fingerprint" != "$after_fingerprint" ]]; then
  echo "Rejected repeated migration changed the installed Marketing foundation." >&2
  exit 1
fi

if psql_run --file "$ROOT_DIR/servsync-marketing-direction-copy-guardrails.sql" >/dev/null 2>&1; then
  echo "Repeated Marketing Direction migration unexpectedly succeeded." >&2
  exit 1
fi

psql_run --command "create database marketing_preflight" >/dev/null
PREFLIGHT_URL="postgresql://postgres@/marketing_preflight?host=$PGSOCKET&port=$PGPORT"
if "$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT_DIR/servsync-codex-assisted-marketing-drafts.sql" >/dev/null 2>&1; then
  echo "Missing-prerequisite Codex-assisted Marketing migration unexpectedly succeeded." >&2
  exit 1
fi

if "$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT_DIR/servsync-marketing-direction-copy-guardrails.sql" >/dev/null 2>&1; then
  echo "Missing-prerequisite Marketing Direction migration unexpectedly succeeded." >&2
  exit 1
fi

preflight_residue="$("$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'marketing_content_preparation_packages';")"
if [[ "$preflight_residue" != "0" ]]; then
  echo "Failed preflight left Codex-assisted Marketing residue." >&2
  exit 1
fi

direction_residue="$("$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'servsync_private_marketing_direction_is_safe';")"
if [[ "$direction_residue" != "0" ]]; then
  echo "Failed Marketing Direction preflight left function residue." >&2
  exit 1
fi

echo "Codex-assisted Marketing draft validation passed."
