#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-facebook-marketing.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_FACEBOOK_MARKETING_TEST_PORT:-55470}"

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
psql_run() { "$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 "$@"; }

psql_run >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth authorization postgres; create schema extensions authorization postgres;
create extension if not exists pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create table public.profiles (id uuid primary key, role text not null, full_name text not null default '');
create table public.contractor_profiles (id uuid primary key);
create function public.current_user_is_platform_admin() returns boolean language sql security definer set search_path=pg_catalog,public,auth stable as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='platform_admin'); $$;

-- Local contract double for the Supabase Vault API. Real environments use the
-- installed Vault extension and never expose this test-only plaintext table.
create schema vault authorization postgres;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  secret text not null,
  name text,
  description text,
  key_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create view vault.decrypted_secrets as
  select id, secret as decrypted_secret, name, description, key_id, created_at, updated_at
  from vault.secrets;
create function vault.create_secret(
  new_secret text,
  new_name text default null,
  new_description text default null,
  new_key_id uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,vault as $$
declare v_id uuid;
begin
  insert into vault.secrets(secret,name,description,key_id)
  values(new_secret,new_name,new_description,new_key_id) returning id into v_id;
  return v_id;
end;
$$;
SQL

for migration in \
  servsync-internal-marketing-content-approval.sql \
  servsync-codex-assisted-marketing-drafts.sql \
  servsync-marketing-direction-copy-guardrails.sql \
  servsync-business-marketing-profile-plan.sql \
  servsync-marketing-planner-quality-v2.sql \
  servsync-marketing-planner-coherence-relevance-v3.sql \
  servsync-accepted-plan-marketing-directions.sql \
  servsync-approved-direction-content-preparation.sql \
  servsync-provider-neutral-marketing-publishing.sql; do
  psql_run --file "$ROOT_DIR/$migration" >/dev/null
done

psql_run --file "$ROOT_DIR/tests/sql/provider-neutral-marketing-publishing-validation.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-facebook-marketing-connection.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/facebook-marketing-connection-validation.sql" >/dev/null

if psql_run --file "$ROOT_DIR/servsync-facebook-marketing-connection.sql" >/dev/null 2>&1; then
  echo "Repeated Facebook Marketing connection migration unexpectedly succeeded." >&2
  exit 1
fi

echo "Facebook Marketing connection validation passed."
