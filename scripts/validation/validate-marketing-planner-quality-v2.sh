#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-marketing-planner-v2.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_MARKETING_PLANNER_V2_TEST_PORT:-55453}"

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
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.profiles (id uuid primary key, role text not null, full_name text not null default '');
create table public.contractor_profiles (id uuid primary key);
create function public.current_user_is_platform_admin()
returns boolean language sql security definer set search_path = pg_catalog, public, auth stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'platform_admin');
$$;
SQL

psql_run --file "$ROOT_DIR/servsync-internal-marketing-content-approval.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-codex-assisted-marketing-drafts.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-marketing-direction-copy-guardrails.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-business-marketing-profile-plan.sql" >/dev/null

psql_run >/dev/null <<'SQL'
insert into public.profiles (id, role, full_name)
values ('45000000-0000-4000-8000-000000000001', 'platform_admin', 'Historical Planner Owner');
select set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.servsync_create_internal_marketing_plan(
  '45000000-0000-4000-8000-000000000001', 1, 'recommended', 'Historical v1 plan',
  current_date, current_date + 30, null,
  '[{"audience":"Small contractors","topic":"Estimates and approvals","direction":"Explain estimates and approvals in practical language.","rationale":"Historical planner v1 evidence.","content_roles":["educational_post"]}]'::jsonb
);
reset role;
SQL

before_plan_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(row_to_json(plan)::text) from public.marketing_plans plan where client_request_id = '45000000-0000-4000-8000-000000000001';")"
before_revision_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(row_to_json(revision)::text) from public.marketing_plan_revisions revision join public.marketing_plans plan on plan.id = revision.plan_id where plan.client_request_id = '45000000-0000-4000-8000-000000000001';")"

psql_run --file "$ROOT_DIR/servsync-marketing-planner-quality-v2.sql" >/dev/null

after_plan_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(row_to_json(plan)::text) from public.marketing_plans plan where client_request_id = '45000000-0000-4000-8000-000000000001';")"
after_revision_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(row_to_json(revision)::text) from public.marketing_plan_revisions revision join public.marketing_plans plan on plan.id = revision.plan_id where plan.client_request_id = '45000000-0000-4000-8000-000000000001';")"

if [[ "$before_plan_fingerprint" != "$after_plan_fingerprint" || "$before_revision_fingerprint" != "$after_revision_fingerprint" ]]; then
  echo "Planner v2 migration changed historical planner v1 evidence." >&2
  exit 1
fi

psql_run --file "$ROOT_DIR/tests/sql/marketing-planner-quality-v2-validation.sql" >/dev/null

before_repeat="$(psql_run --quiet --tuples-only --no-align --command "select md5(concat_ws('|', (select count(*) from public.marketing_plans), (select count(*) from public.marketing_plan_revisions), (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'servsync_create_internal_marketing_plan')));")"
if psql_run --file "$ROOT_DIR/servsync-marketing-planner-quality-v2.sql" >/dev/null 2>&1; then
  echo "Repeated Marketing planner v2 migration unexpectedly succeeded." >&2
  exit 1
fi
after_repeat="$(psql_run --quiet --tuples-only --no-align --command "select md5(concat_ws('|', (select count(*) from public.marketing_plans), (select count(*) from public.marketing_plan_revisions), (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'servsync_create_internal_marketing_plan')));")"
if [[ "$before_repeat" != "$after_repeat" ]]; then
  echo "Rejected repeated Marketing planner v2 migration changed installed state." >&2
  exit 1
fi

echo "Marketing Planner Quality v2 validation passed."
