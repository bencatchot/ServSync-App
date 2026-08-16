#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-marketing-media.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_MARKETING_MEDIA_TEST_PORT:-55473}"

cleanup() { if [[ -f "$PGDATA/postmaster.pid" ]]; then "$PG_CTL_BIN" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true; fi; rm -rf "$TEST_ROOT"; }
trap cleanup EXIT
mkdir -p "$PGSOCKET"
"$INITDB_BIN" -D "$PGDATA" -U postgres --auth=trust --no-locale >/dev/null
"$PG_CTL_BIN" -D "$PGDATA" -o "-F -k $PGSOCKET -p $PGPORT" -w start >/dev/null
DATABASE_URL="postgresql://postgres@/postgres?host=$PGSOCKET&port=$PGPORT"
psql_run() { "$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 "$@"; }

psql_run >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth authorization postgres; create schema extensions authorization postgres; create schema storage authorization postgres;
create extension if not exists pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create table public.profiles (id uuid primary key, role text not null, full_name text not null default '');
create table public.contractor_profiles (id uuid primary key);
create function public.current_user_is_platform_admin() returns boolean language sql security definer set search_path=pg_catalog,public,auth stable as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='platform_admin'); $$;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key, bucket_id text not null references storage.buckets(id), name text not null, metadata jsonb not null default '{}'::jsonb, unique(bucket_id,name));
alter table storage.objects enable row level security;
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
  servsync-provider-neutral-marketing-publishing.sql \
  servsync-marketing-media-assets.sql; do
  psql_run --file "$ROOT_DIR/$migration" >/dev/null
done

psql_run --file "$ROOT_DIR/tests/sql/marketing-media-assets-validation.sql" >/dev/null

if psql_run --file "$ROOT_DIR/servsync-marketing-media-assets.sql" >/dev/null 2>&1; then
  echo "Repeated Marketing media migration unexpectedly succeeded." >&2
  exit 1
fi

echo "Marketing media asset and pairing validation passed."
