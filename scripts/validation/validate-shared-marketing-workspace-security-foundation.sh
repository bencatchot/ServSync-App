#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-marketing-workspace-security.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_MARKETING_WORKSPACE_SECURITY_TEST_PORT:-55478}"

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
create role service_role nologin;
create schema auth authorization postgres;
create schema extensions authorization postgres;
create schema storage authorization postgres;
create schema vault authorization postgres;
create extension if not exists pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create table public.profiles (
  id uuid primary key,
  role text not null,
  full_name text not null default ''
);
create table public.contractor_profiles (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles(id),
  business_name text not null default '',
  account_status text not null default 'active'
);
create table public.contractor_team_members (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id),
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('admin', 'office', 'field_tech', 'viewer')),
  status text not null check (status in ('active', 'disabled')),
  unique (contractor_id, user_id)
);
create function public.current_user_is_platform_admin() returns boolean
language sql security definer set search_path = pg_catalog, public, auth stable
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'platform_admin'); $$;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key,
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
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
) returns uuid language plpgsql security definer set search_path = pg_catalog, vault
as $$
declare v_id uuid;
begin
  insert into vault.secrets(secret, name, description, key_id)
  values (new_secret, new_name, new_description, new_key_id)
  returning id into v_id;
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
  servsync-provider-neutral-marketing-publishing.sql \
  servsync-marketing-media-assets.sql \
  servsync-facebook-marketing-connection.sql \
  servsync-facebook-granular-page-discovery.sql \
  servsync-narrated-marketing-media-publication.sql \
  servsync-facebook-managed-video-publishing-adapter.sql \
  servsync-shared-marketing-workspace-security-foundation.sql; do
  psql_run --file "$ROOT_DIR/$migration" >/dev/null
done

psql_run --file "$ROOT_DIR/tests/sql/shared-marketing-workspace-security-foundation-validation.sql" >/dev/null

if psql_run --file "$ROOT_DIR/servsync-shared-marketing-workspace-security-foundation.sql" >/dev/null 2>&1; then
  echo "Repeated shared Marketing workspace foundation migration unexpectedly succeeded." >&2
  exit 1
fi

echo "Shared Marketing workspace security foundation validation passed."
