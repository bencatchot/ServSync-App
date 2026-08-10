#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-marketing-planning.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_MARKETING_PLANNING_TEST_PORT:-55451}"

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
psql_run --file "$ROOT_DIR/servsync-codex-assisted-marketing-drafts.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-marketing-direction-copy-guardrails.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-business-marketing-profile-plan.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/business-marketing-profile-plan-validation.sql" >/dev/null
psql_run --command "insert into public.profiles (id, role, full_name) values ('44000000-0000-4000-8000-000000000001', 'platform_admin', 'Sandbox Owner'), ('44000000-0000-4000-8000-000000000002', 'contractor', 'Sandbox Contractor'), ('44000000-0000-4000-8000-000000000003', 'homeowner', 'Sandbox Homeowner');" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/business-marketing-profile-plan-sandbox-validation.sql" >/dev/null

CONCURRENT_SQL="select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000001', false); set role authenticated; select public.servsync_create_internal_marketing_plan('44000000-0000-4000-8000-000000000099', 1, 'recommended', 'Concurrent Marketing plan', current_date, current_date + 30, null, '[{\"audience\":\"Small contractors\",\"topic\":\"Customer requests\",\"direction\":\"Explain customer requests in practical language.\",\"rationale\":\"Profile priority with limited recent repetition.\",\"content_roles\":[\"educational_post\"]}]'::jsonb);"
"$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet --command "$CONCURRENT_SQL" >"$TEST_ROOT/concurrent-a.out" &
concurrent_a_pid=$!
"$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet --command "$CONCURRENT_SQL" >"$TEST_ROOT/concurrent-b.out" &
concurrent_b_pid=$!
wait "$concurrent_a_pid"
wait "$concurrent_b_pid"

concurrent_counts="$(psql_run --quiet --tuples-only --no-align --field-separator='|' <<'SQL'
select
  (select count(*) from public.marketing_plans where client_request_id = '44000000-0000-4000-8000-000000000099'),
  (select count(*)
     from public.marketing_plan_revisions revision
     join public.marketing_plans plan on plan.id = revision.plan_id
    where plan.client_request_id = '44000000-0000-4000-8000-000000000099');
SQL
)"
if [[ "$concurrent_counts" != "1|1" ]]; then
  echo "Concurrent Marketing plan replay created duplicate state: $concurrent_counts" >&2
  exit 1
fi

before_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_business_profiles),
  (select count(*) from public.marketing_business_profile_revisions),
  (select count(*) from public.marketing_plans),
  (select count(*) from public.marketing_plan_revisions),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'servsync_%marketing%')
));
SQL
)"

if psql_run --file "$ROOT_DIR/servsync-business-marketing-profile-plan.sql" >/dev/null 2>&1; then
  echo "Repeated Business Marketing Profile migration unexpectedly succeeded." >&2
  exit 1
fi

after_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_business_profiles),
  (select count(*) from public.marketing_business_profile_revisions),
  (select count(*) from public.marketing_plans),
  (select count(*) from public.marketing_plan_revisions),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'servsync_%marketing%')
));
SQL
)"

if [[ "$before_fingerprint" != "$after_fingerprint" ]]; then
  echo "Rejected repeated migration changed the installed Marketing planning foundation." >&2
  exit 1
fi

psql_run --command "create database marketing_planning_preflight" >/dev/null
PREFLIGHT_URL="postgresql://postgres@/marketing_planning_preflight?host=$PGSOCKET&port=$PGPORT"
if "$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT_DIR/servsync-business-marketing-profile-plan.sql" >/dev/null 2>&1; then
  echo "Missing-prerequisite Business Marketing Profile migration unexpectedly succeeded." >&2
  exit 1
fi

preflight_residue="$("$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'marketing_%';")"
if [[ "$preflight_residue" != "0" ]]; then
  echo "Failed Business Marketing Profile preflight left relation residue." >&2
  exit 1
fi

echo "Business Marketing Profile + Plan validation passed."
