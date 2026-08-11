#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-approved-direction-content.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_APPROVED_DIRECTION_CONTENT_TEST_PORT:-55467}"

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

for migration in \
  servsync-internal-marketing-content-approval.sql \
  servsync-codex-assisted-marketing-drafts.sql \
  servsync-marketing-direction-copy-guardrails.sql \
  servsync-business-marketing-profile-plan.sql \
  servsync-marketing-planner-quality-v2.sql \
  servsync-marketing-planner-coherence-relevance-v3.sql \
  servsync-accepted-plan-marketing-directions.sql; do
  psql_run --file "$ROOT_DIR/$migration" >/dev/null
done

# Create one genuine historical package before the lineage migration. Its rows
# must remain byte-for-byte equivalent apart from newly added null columns.
psql_run >/dev/null <<'SQL'
insert into public.profiles (id, role, full_name) values
  ('52000000-0000-4000-8000-000000000001', 'platform_admin', 'Direction Content Owner'),
  ('52000000-0000-4000-8000-000000000002', 'contractor', 'Direction Content Contractor'),
  ('52000000-0000-4000-8000-000000000003', 'homeowner', 'Direction Content Homeowner');
select set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.servsync_ingest_internal_marketing_package(
  '52000000-0000-4000-8000-000000000010',
  'contractor_acquisition',
  'servsync-marketing-truth-v3',
  'Historical package before first-class Direction lineage.',
  '[{"title":"Historical Marketing draft","content_type":"social_post","body":"A historical draft remains valid without retroactive Direction lineage.","channel_category":"social","intended_audience":"small_contractors","content_role":"educational_post"}]'::jsonb
);
reset role;
SQL

before_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select md5(jsonb_agg(to_jsonb(package) order by package.id)::text) from public.marketing_content_preparation_packages package),
  (select md5(jsonb_agg(to_jsonb(item) order by item.id)::text) from public.marketing_content_items item),
  (select md5(jsonb_agg(to_jsonb(event) order by event.id)::text) from public.marketing_content_status_events event),
  (select count(*) from public.marketing_directions),
  (select count(*) from public.marketing_direction_revisions)
));
SQL
)"

psql_run --file "$ROOT_DIR/servsync-approved-direction-content-preparation.sql" >/dev/null

after_historical_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select md5(jsonb_agg(to_jsonb(package) - 'strategic_source' - 'source_plan_id' - 'source_plan_revision' order by package.id)::text) from public.marketing_content_preparation_packages package),
  (select md5(jsonb_agg(to_jsonb(item) - 'source_plan_id' - 'source_plan_revision' - 'source_plan_item_index' - 'source_direction_id' - 'source_direction_revision' order by item.id)::text) from public.marketing_content_items item),
  (select md5(jsonb_agg(to_jsonb(event) order by event.id)::text) from public.marketing_content_status_events event),
  (select count(*) from public.marketing_directions),
  (select count(*) from public.marketing_direction_revisions)
));
SQL
)"

if [[ "$before_fingerprint" != "$after_historical_fingerprint" ]]; then
  echo "Approved-Direction migration changed historical Marketing state." >&2
  exit 1
fi

psql_run --file "$ROOT_DIR/tests/sql/approved-direction-content-preparation-validation.sql" >/dev/null

before_repeat="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_content_preparation_packages),
  (select count(*) from public.marketing_content_items),
  (select count(*) from public.marketing_content_status_events),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%marketing_direction_package%')
));
SQL
)"
if psql_run --file "$ROOT_DIR/servsync-approved-direction-content-preparation.sql" >/dev/null 2>&1; then
  echo "Repeated approved-Direction content migration unexpectedly succeeded." >&2
  exit 1
fi
after_repeat="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_content_preparation_packages),
  (select count(*) from public.marketing_content_items),
  (select count(*) from public.marketing_content_status_events),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%marketing_direction_package%')
));
SQL
)"
if [[ "$before_repeat" != "$after_repeat" ]]; then
  echo "Rejected repeated approved-Direction migration changed installed state." >&2
  exit 1
fi

psql_run --command "create database approved_direction_preflight" >/dev/null
PREFLIGHT_URL="postgresql://postgres@/approved_direction_preflight?host=$PGSOCKET&port=$PGPORT"
if "$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT_DIR/servsync-approved-direction-content-preparation.sql" >/dev/null 2>&1; then
  echo "Missing-prerequisite approved-Direction migration unexpectedly succeeded." >&2
  exit 1
fi
preflight_residue="$("$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --quiet --tuples-only --no-align --command "select count(*) from information_schema.columns where table_schema='public' and column_name in ('strategic_source','source_direction_id');")"
if [[ "$preflight_residue" != "0" ]]; then
  echo "Failed approved-Direction migration preflight left residue." >&2
  exit 1
fi

echo "Approved Direction content preparation validation passed."
