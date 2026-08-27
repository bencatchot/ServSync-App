#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-help-studio.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_HELP_STUDIO_TEST_PORT:-55492}"

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
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth authorization postgres;
create schema storage authorization postgres;
create extension if not exists pgcrypto;
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create table public.profiles (id uuid primary key, role text not null, full_name text not null default '');
create table public.contractor_profiles (
  id uuid primary key, owner_user_id uuid not null references public.profiles(id),
  business_name text not null default '', account_status text not null default 'active'
);
create table public.contractor_team_members (
  id uuid primary key default gen_random_uuid(), contractor_id uuid not null references public.contractor_profiles(id),
  user_id uuid not null references public.profiles(id), role text not null check (role in ('admin','office','field_tech','viewer')),
  status text not null check (status in ('active','disabled')), unique (contractor_id,user_id)
);
create function public.current_user_is_platform_admin() returns boolean language sql security definer
set search_path=pg_catalog,public,auth stable as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='platform_admin');
$$;
create table public.marketing_workspaces (
  id uuid primary key, workspace_key text not null unique, workspace_kind text not null,
  contractor_id uuid null, display_name text not null, created_at timestamptz not null default now()
);
insert into public.marketing_workspaces(id,workspace_key,workspace_kind,contractor_id,display_name)
values ('00000000-0000-4000-8000-000000000037','servsync_internal','internal',null,'ServSync Marketing');
create table public.marketing_media_assets (
  id uuid primary key, workspace_id uuid not null references public.marketing_workspaces(id),
  asset_type text not null, source text not null, ephemeral boolean not null default true,
  storage_bucket text not null, storage_path text not null, mime_type text not null,
  file_size_bytes bigint not null, sha256 text not null,
  constraint marketing_assets_workspace_identity unique (workspace_id,id)
);
create table public.marketing_media_lifecycles (
  asset_id uuid primary key references public.marketing_media_assets(id),
  workspace_id uuid not null references public.marketing_workspaces(id),
  state text not null
);
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id),
  name text not null, metadata jsonb not null default '{}'::jsonb, unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
SQL

psql_run --file "$ROOT_DIR/servsync-help-studio-foundation.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-help-studio-usage-state-forward-fix.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-help-studio-recording-workflow.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-help-studio-recording-package-validation-forward-fix.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-help-media-ready-video-duration-forward-fix.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/help-studio-foundation-validation.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/help-studio-recording-workflow-validation.sql" >/dev/null
psql_run --file "$ROOT_DIR/servsync-help-narration-caption-foundation.sql" >/dev/null
psql_run --file "$ROOT_DIR/tests/sql/help-narration-caption-foundation-validation.sql" >/dev/null

psql_run --file "$ROOT_DIR/servsync-help-studio-usage-state-forward-fix.sql" >/dev/null

if psql_run --file "$ROOT_DIR/servsync-help-studio-recording-workflow.sql" >/dev/null 2>&1; then
  echo "Repeated Help Studio recording workflow migration unexpectedly succeeded." >&2
  exit 1
fi

if psql_run --file "$ROOT_DIR/servsync-help-studio-recording-package-validation-forward-fix.sql" >/dev/null 2>&1; then
  echo "Repeated Help Studio recorder package validation unexpectedly succeeded." >&2
  exit 1
fi

if psql_run --file "$ROOT_DIR/servsync-help-media-ready-video-duration-forward-fix.sql" >/dev/null 2>&1; then
  echo "Repeated Help ready-video duration validation unexpectedly succeeded." >&2
  exit 1
fi

if psql_run --file "$ROOT_DIR/servsync-help-narration-caption-foundation.sql" >/dev/null 2>&1; then
  echo "Repeated Help narration/caption foundation unexpectedly succeeded." >&2
  exit 1
fi

if psql_run --file "$ROOT_DIR/servsync-help-studio-foundation.sql" >/dev/null 2>&1; then
  echo "Repeated Help Studio foundation migration unexpectedly succeeded." >&2
  exit 1
fi

echo "Help Studio foundation validation passed."
