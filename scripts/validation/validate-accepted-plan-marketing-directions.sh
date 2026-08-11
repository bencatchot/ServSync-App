#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-marketing-directions.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_MARKETING_DIRECTIONS_TEST_PORT:-55455}"

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
psql_run --file "$ROOT_DIR/servsync-marketing-planner-quality-v2.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-marketing-planner-coherence-relevance-v3.sql" >/dev/null

before_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select md5(jsonb_agg(to_jsonb(profile) order by profile.id)::text) from public.marketing_business_profiles profile),
  (select count(*) from public.marketing_plans),
  (select count(*) from public.marketing_plan_revisions),
  (select count(*) from public.marketing_content_preparation_packages),
  (select count(*) from public.marketing_content_items),
  (select count(*) from public.marketing_content_status_events)
));
SQL
)"

psql_run --file "$ROOT_DIR/servsync-accepted-plan-marketing-directions.sql" >/dev/null

after_fingerprint="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select md5(jsonb_agg(to_jsonb(profile) order by profile.id)::text) from public.marketing_business_profiles profile),
  (select count(*) from public.marketing_plans),
  (select count(*) from public.marketing_plan_revisions),
  (select count(*) from public.marketing_content_preparation_packages),
  (select count(*) from public.marketing_content_items),
  (select count(*) from public.marketing_content_status_events)
));
SQL
)"

if [[ "$before_fingerprint" != "$after_fingerprint" ]]; then
  echo "Marketing Direction migration changed existing Marketing business data." >&2
  exit 1
fi

psql_run --file "$ROOT_DIR/tests/sql/accepted-plan-marketing-directions-validation.sql" >/dev/null

psql_run >/dev/null <<'SQL'
insert into public.profiles (id, role, full_name)
values ('48000000-0000-4000-8000-000000000001', 'platform_admin', 'Concurrent Direction Owner');
select set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$
declare
  v_receipt jsonb;
begin
  v_receipt := public.servsync_create_internal_marketing_plan_v3(
    '48000000-0000-4000-8000-000000000010', 1, 'recommended',
    'Concurrent Direction plan', current_date, current_date + 30, null,
    '[{"audience":"Small contractors","topic":"Invoices","direction":"Explain one invoice interaction after completed work.","rationale":"A precise current capability for contractor growth.","content_roles":["educational_post"]}]'::jsonb,
    3
  );
  perform public.servsync_accept_internal_marketing_plan((v_receipt ->> 'plan_id')::uuid, 1);
end;
$$;
reset role;
SQL

concurrent_plan_id="$(psql_run --quiet --tuples-only --no-align --command "select id from public.marketing_plans where client_request_id = '48000000-0000-4000-8000-000000000010';")"
CONCURRENT_SQL="select set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-000000000001', false); set role authenticated; select public.servsync_prepare_internal_marketing_directions('48000000-0000-4000-8000-000000000020', '$concurrent_plan_id', 2, 'servsync-marketing-truth-v3', 'codex_assisted', 'recommended', null, '[{\"plan_item_index\":1,\"audience_key\":\"small_contractors\",\"objective\":\"Help small contractors understand one current invoice interaction.\",\"statement\":\"Focus on completed service work becoming an invoice tied to the same customer and service context without promising accounting integration or automatic collection.\",\"central_message\":\"The invoice stays connected to the work it represents.\",\"supporting_points\":[\"Show one completed service visit before the invoice.\"],\"cautions\":[\"Do not imply accounting integration or automatic collection.\"],\"corrected_assumptions\":[],\"recommendation_rationale\":\"This narrows the accepted invoice item into one grounded and useful contractor story.\",\"truth_capability_keys\":[\"invoices\"]}]'::jsonb);"

"$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet --command "$CONCURRENT_SQL" >"$TEST_ROOT/concurrent-a.out" &
concurrent_a_pid=$!
"$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet --command "$CONCURRENT_SQL" >"$TEST_ROOT/concurrent-b.out" &
concurrent_b_pid=$!
wait "$concurrent_a_pid"
wait "$concurrent_b_pid"

concurrent_counts="$(psql_run --quiet --tuples-only --no-align --field-separator='|' <<'SQL'
select
  (select count(*) from public.marketing_directions where preparation_request_id = '48000000-0000-4000-8000-000000000020'),
  (select count(*) from public.marketing_direction_revisions revision
     join public.marketing_directions direction on direction.id = revision.direction_id
    where direction.preparation_request_id = '48000000-0000-4000-8000-000000000020');
SQL
)"
if [[ "$concurrent_counts" != "1|1" ]]; then
  echo "Concurrent Marketing Direction replay created duplicate state: $concurrent_counts" >&2
  exit 1
fi

before_repeat="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_directions),
  (select count(*) from public.marketing_direction_revisions),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%marketing_direction%')
));
SQL
)"
if psql_run --file "$ROOT_DIR/servsync-accepted-plan-marketing-directions.sql" >/dev/null 2>&1; then
  echo "Repeated Marketing Direction migration unexpectedly succeeded." >&2
  exit 1
fi
after_repeat="$(psql_run --quiet --tuples-only --no-align <<'SQL'
select md5(concat_ws('|',
  (select count(*) from public.marketing_directions),
  (select count(*) from public.marketing_direction_revisions),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%marketing_direction%')
));
SQL
)"
if [[ "$before_repeat" != "$after_repeat" ]]; then
  echo "Rejected repeated Marketing Direction migration changed installed state." >&2
  exit 1
fi

psql_run --command "create database marketing_directions_preflight" >/dev/null
PREFLIGHT_URL="postgresql://postgres@/marketing_directions_preflight?host=$PGSOCKET&port=$PGPORT"
if "$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --file "$ROOT_DIR/servsync-accepted-plan-marketing-directions.sql" >/dev/null 2>&1; then
  echo "Missing-prerequisite Marketing Direction migration unexpectedly succeeded." >&2
  exit 1
fi
preflight_residue="$("$PSQL_BIN" "$PREFLIGHT_URL" --set=ON_ERROR_STOP=1 --quiet --tuples-only --no-align --command "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('marketing_directions', 'marketing_direction_revisions');")"
if [[ "$preflight_residue" != "0" ]]; then
  echo "Failed Marketing Direction preflight left relation residue." >&2
  exit 1
fi

echo "Accepted Plan Marketing Direction validation passed."
