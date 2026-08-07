#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-signup.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_SIGNUP_TEST_PORT:-55439}"

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

# A legitimate existing administrator must survive both first application and
# idempotent reconciliation without a data rewrite.
psql_run >/dev/null <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', 'existing-admin@example.test', '{"role":"homeowner"}');
update public.profiles
   set role = 'platform_admin'
 where id = '00000000-0000-0000-0000-000000000001';
SQL
psql_run --file "$ROOT_DIR/servsync-public-signup-role-hardening.sql" >/dev/null

# Supabase Auth inserts as its internal role. Trigger execution must not depend
# on exposing the trigger function to browser or service roles.
psql_run >/dev/null <<'SQL'
set role supabase_auth_admin;
insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000021', 'auth-role@example.test', '{"role":"contractor"}');
SQL

psql_run --file "$ROOT_DIR/tests/sql/public-signup-role-hardening-validation.sql" >/dev/null

# Authenticated users may update ordinary fields without changing their role.
psql_run >/dev/null <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
update public.profiles
   set full_name = 'Updated Home Owner', role = 'homeowner'
 where id = '10000000-0000-0000-0000-000000000001';
SQL

psql_run >/dev/null <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
update public.profiles
   set full_name = 'Existing Admin Updated', role = 'platform_admin'
 where id = '00000000-0000-0000-0000-000000000001';
SQL

cross_user_count="$(psql_run --quiet --tuples-only --no-align <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
with changed as (
  update public.profiles
     set role = 'platform_admin'
   where id = '10000000-0000-0000-0000-000000000002'
  returning 1
)
select count(*) from changed;
SQL
)"
if [[ "$cross_user_count" != "0" ]]; then
  echo "Cross-user profile update unexpectedly reached another account." >&2
  exit 1
fi

if psql_run >/dev/null 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
update public.profiles
   set role = 'platform_admin'
 where id = '10000000-0000-0000-0000-000000000001';
SQL
then
  echo "Authenticated profile role escalation unexpectedly succeeded." >&2
  exit 1
fi

# Missing-profile recovery remains available for safe roles, but cannot insert
# platform_admin even when a client bypasses the UI.
psql_run >/dev/null <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000020', 'recovery@example.test', '{"role":"homeowner"}');
delete from public.profiles where id = '10000000-0000-0000-0000-000000000020';
SQL

if psql_run >/dev/null 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000020', false);
insert into public.profiles (id, email, role, full_name)
values ('10000000-0000-0000-0000-000000000020', 'recovery@example.test', 'platform_admin', 'Recovery');
SQL
then
  echo "Authenticated privileged missing-profile insertion unexpectedly succeeded." >&2
  exit 1
fi

psql_run >/dev/null <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000020', false);
insert into public.profiles (id, email, role, full_name)
values ('10000000-0000-0000-0000-000000000020', 'recovery@example.test', 'contractor', 'Recovery');
SQL

# A missing prerequisite must fail before the canonical functions or triggers
# are installed, leaving the existing schema untouched.
psql_run --command "create database signup_hardening_preflight" >/dev/null
PREFLIGHT_DATABASE_URL="postgresql://postgres@/signup_hardening_preflight?host=$PGSOCKET&port=$PGPORT"
"$PSQL_BIN" "$PREFLIGHT_DATABASE_URL" --set=ON_ERROR_STOP=1 >/dev/null <<'SQL'
create extension pgcrypto;
create schema auth authorization postgres;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create table public.profiles (
  id uuid primary key references auth.users(id),
  email text not null default '',
  role text not null,
  full_name text not null default ''
);
SQL

if "$PSQL_BIN" "$PREFLIGHT_DATABASE_URL" --set=ON_ERROR_STOP=1 --file "$ROOT_DIR/servsync-public-signup-role-hardening.sql" >/dev/null 2>&1; then
  echo "Missing-prerequisite migration unexpectedly succeeded." >&2
  exit 1
fi

preflight_residue="$("$PSQL_BIN" "$PREFLIGHT_DATABASE_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('handle_new_user', 'servsync_guard_self_service_profile_role');")"
if [[ "$preflight_residue" != "0" ]]; then
  echo "Failed preflight left signup hardening function residue." >&2
  exit 1
fi

echo "Public signup role hardening validation passed."
