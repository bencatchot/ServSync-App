#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POSTGRES_BIN_DIR="$(dirname "$(command -v postgres)")"
TEST_ROOT="$(mktemp -d /tmp/servsync-prospects.XXXXXX)"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_PROSPECT_TEST_PORT:-55448}"
cleanup() {
  "$POSTGRES_BIN_DIR/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT
mkdir -p "$PGSOCKET"
"$POSTGRES_BIN_DIR/initdb" -D "$PGDATA" -U postgres --auth=trust --no-locale >/dev/null
"$POSTGRES_BIN_DIR/pg_ctl" -D "$PGDATA" -o "-F -k $PGSOCKET -p $PGPORT" -w start >/dev/null
PROSPECT_TEST_DB="postgresql://postgres@/postgres?host=$PGSOCKET&port=$PGPORT"
run_sql() { psql "$PROSPECT_TEST_DB" -X --set=ON_ERROR_STOP=1 "$@"; }
run_sql >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
SQL
for migration in servsync-clean-foundation.sql servsync-admin-contractor-management.sql servsync-email-prep.sql \
  servsync-permanent-referral.sql servsync-referrals-v1.sql servsync-referral-attribution.sql \
  servsync-public-signup-role-hardening.sql servsync-contractor-team-access.sql servsync-contractor-billing-readiness.sql \
  servsync-service-requests-v1.sql; do
  run_sql -f "$ROOT_DIR/$migration" >/dev/null
 done
run_sql >/dev/null <<'SQL'
-- Only the logo column is required; these tests do not use Storage.
alter table public.contractor_profiles add column if not exists logo_url text not null default '';
SQL
run_sql -f "$ROOT_DIR/servsync-admin-contractor-prospects.sql" >/dev/null
run_sql -f "$ROOT_DIR/servsync-admin-contractor-prospects.sql" >/dev/null
run_sql -f "$ROOT_DIR/tests/sql/admin-contractor-prospects-validation.sql"
# Force overlap between two claim transactions. Exactly one may consume the
# invitation or initialize the canonical owned profile and billing account.
run_sql >/dev/null <<'SQL'
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
insert into public.prospect_test_state values ('race',public.servsync_admin_save_contractor_prospect(null,null,'race-plumbing','{"business_name":"Race Plumbing"}',true));
insert into public.prospect_test_state values ('race_invite',public.servsync_admin_issue_contractor_claim((select (v->>'id')::uuid from public.prospect_test_state where k='race'),1,'other@example.test'));
reset role;
create function public.prospect_test_slow_insert() returns trigger language plpgsql as $$begin perform pg_sleep(0.4); return new; end$$;
create trigger prospect_test_slow before insert on public.contractor_profiles for each row execute function public.prospect_test_slow_insert();
SQL
claim_race() {
  run_sql <<'SQL'
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
select public.servsync_accept_contractor_claim((select v->>'token' from public.prospect_test_state where k='race_invite'),2,'{"business_name":"Race Winner"}');
SQL
}
claim_race >"$TEST_ROOT/race-a.log" 2>&1 & RACE_A=$!
claim_race >"$TEST_ROOT/race-b.log" 2>&1 & RACE_B=$!
RACE_SUCCESS=0
if wait "$RACE_A"; then RACE_SUCCESS=$((RACE_SUCCESS+1)); fi
if wait "$RACE_B"; then RACE_SUCCESS=$((RACE_SUCCESS+1)); fi
if [[ "$RACE_SUCCESS" != 1 ]]; then
  cat "$TEST_ROOT/race-a.log" "$TEST_ROOT/race-b.log"
  exit 1
fi
run_sql >/dev/null <<'SQL'
select public.prospect_test_assert((select count(*)=1 from public.contractor_profiles where slug='race-plumbing'),'one concurrent claim winner');
select public.prospect_test_assert((select count(*)=1 from public.contractor_billing_accounts where contractor_id=(select (v->>'id')::uuid from public.prospect_test_state where k='race')),'one concurrent billing initialization');
SQL
printf '%s\n' 'Concurrent claim validation passed: exactly one success, one owned profile, one billing account.'
printf '%s\n' 'Contractor prospect lifecycle and security validation passed (disposable local PostgreSQL only).'
