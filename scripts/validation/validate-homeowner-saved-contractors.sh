#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POSTGRES_BIN_DIR="$(dirname "$(command -v postgres)")"
TEST_ROOT="$(mktemp -d /tmp/servsync-shortlist.XXXXXX)"
cleanup() { "$POSTGRES_BIN_DIR/pg_ctl" -D "$TEST_ROOT/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$TEST_ROOT"; }
trap cleanup EXIT
mkdir -p "$TEST_ROOT/socket"
"$POSTGRES_BIN_DIR/initdb" -D "$TEST_ROOT/data" -U postgres --auth=trust --no-locale >/dev/null
"$POSTGRES_BIN_DIR/pg_ctl" -D "$TEST_ROOT/data" -o "-F -k $TEST_ROOT/socket -p 55459 -h ''" -w start >/dev/null
run_sql() { psql "postgresql://postgres@/postgres?host=$TEST_ROOT/socket&port=55459" -X --set=ON_ERROR_STOP=1 "$@"; }
run_sql >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table public.profiles(id uuid primary key references auth.users(id), role text not null);
create table public.contractor_profiles(id uuid primary key, public_profile_enabled boolean not null, account_status text not null);
alter table public.profiles enable row level security;
create policy own_profile on public.profiles for select to authenticated using (id=auth.uid());
alter table public.contractor_profiles enable row level security;
create policy visible_contractors on public.contractor_profiles for select to authenticated using (public_profile_enabled and account_status='active');
grant select on public.profiles, public.contractor_profiles to authenticated;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
insert into public.profiles values ('00000000-0000-4000-8000-000000000001','homeowner'),('00000000-0000-4000-8000-000000000002','homeowner'),('00000000-0000-4000-8000-000000000003','contractor');
insert into public.contractor_profiles values ('10000000-0000-4000-8000-000000000001',true,'active'),('10000000-0000-4000-8000-000000000002',false,'active'),('10000000-0000-4000-8000-000000000003',true,'suspended');
SQL
run_sql -f "$ROOT_DIR/servsync-homeowner-saved-contractors.sql" >/dev/null
run_sql -f "$ROOT_DIR/servsync-homeowner-saved-contractors.sql" >/dev/null
run_sql -f "$ROOT_DIR/tests/sql/homeowner-saved-contractors-validation.sql"
