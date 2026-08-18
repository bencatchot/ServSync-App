#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-marketing-media-cost.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_MARKETING_MEDIA_COST_TEST_PORT:-55479}"

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
  business_summary text not null default '',
  service_categories text[] not null default '{}'::text[],
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
create table public.inspections (
  id uuid primary key,
  contractor_id uuid not null references public.contractor_profiles(id),
  name text not null default 'Fixture Job',
  summary text not null default '',
  job_status text not null default 'draft',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  rooms_with_findings jsonb not null default '[]'::jsonb
);
create table public.job_work_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  title text not null,
  customer_description text not null default '',
  internal_notes text not null default '',
  completion_status text not null default 'open',
  created_at timestamptz not null default now()
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
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-media', 'inspection-media', false, 104857600,
  array['image/jpeg','image/png','image/webp','video/mp4']::text[]);
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

psql_run >/dev/null <<'SQL'
insert into public.profiles (id, role, full_name)
values ('10000000-0000-4000-8000-000000000099', 'platform_admin', 'Legacy fixture owner');
insert into storage.objects (id, bucket_id, name, metadata)
values (
  '15000000-0000-4000-8000-000000000099', 'marketing-assets',
  '00000000-0000-4000-8000-000000000037/15000000-0000-4000-8000-000000000099/servsync-legacy-demo-v1-2026-08-17T120000Z.mp4',
  '{"mimetype":"video/mp4","size":"12"}'
);
insert into public.marketing_media_assets (
  id, workspace_id, asset_type, source, recorder_scenario, source_commit,
  storage_path, mime_type, file_size_bytes, width, height, duration_seconds,
  sha256, validation_status, sensitive_data_check, pacing_review,
  pacing_reviewed_at, created_by
) values (
  '15000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000037',
  'video', 'demo_recorder', 'legacy-demo', repeat('a', 40),
  '00000000-0000-4000-8000-000000000037/15000000-0000-4000-8000-000000000099/servsync-legacy-demo-v1-2026-08-17T120000Z.mp4',
  'video/mp4', 12, 1440, 900, 20, repeat('b', 64), 'passed', 'passed', 'passed', now(),
  '10000000-0000-4000-8000-000000000099'
);
SQL

for migration in \
  servsync-marketing-beta-entitlements-cost-metering.sql \
  servsync-marketing-media-intake-ephemeral-lifecycle.sql \
  servsync-marketing-abandoned-upload-cleanup.sql \
  servsync-marketing-storage-policy-helper-execute.sql; do
  psql_run --file "$ROOT_DIR/$migration" >/dev/null
done

psql_run --file "$ROOT_DIR/tests/sql/marketing-media-cost-lifecycle-validation.sql" >/dev/null

if [[ -n "${SERVSYNC_MARKETING_QUEUE_MIGRATION:-}" ]]; then
  if [[ -n "${SERVSYNC_MARKETING_QUEUE_COMPATIBILITY:-}" ]]; then
    psql_run --file "$ROOT_DIR/$SERVSYNC_MARKETING_QUEUE_COMPATIBILITY" >/dev/null
  fi
  psql_run --file "$ROOT_DIR/$SERVSYNC_MARKETING_QUEUE_MIGRATION" >/dev/null
  if [[ -n "${SERVSYNC_MARKETING_QUEUE_FORWARD_FIX:-}" ]]; then
    psql_run --file "$ROOT_DIR/$SERVSYNC_MARKETING_QUEUE_FORWARD_FIX" >/dev/null
  fi
  psql_run --file "$ROOT_DIR/${SERVSYNC_MARKETING_QUEUE_VALIDATION:?Marketing queue validation is required.}" >/dev/null
  if psql_run --file "$ROOT_DIR/$SERVSYNC_MARKETING_QUEUE_MIGRATION" >/dev/null 2>&1; then
    echo "Repeated Marketing publishing queue migration unexpectedly succeeded." >&2
    exit 1
  fi
fi

if [[ -n "${SERVSYNC_MARKETING_CONTENT_CREATION_MIGRATION:-}" ]]; then
  psql_run --file "$ROOT_DIR/$SERVSYNC_MARKETING_CONTENT_CREATION_MIGRATION" >/dev/null
  psql_run --file "$ROOT_DIR/${SERVSYNC_MARKETING_CONTENT_CREATION_VALIDATION:?Marketing content creation validation is required.}" >/dev/null
  if psql_run --file "$ROOT_DIR/$SERVSYNC_MARKETING_CONTENT_CREATION_MIGRATION" >/dev/null 2>&1; then
    echo "Repeated Marketing content creation migration unexpectedly succeeded." >&2
    exit 1
  fi
fi

if [[ -n "${SERVSYNC_ADMIN_MARKETING_DOGFOOD_MIGRATION:-}" ]]; then
  psql_run --file "$ROOT_DIR/$SERVSYNC_ADMIN_MARKETING_DOGFOOD_MIGRATION" >/dev/null
  if [[ -n "${SERVSYNC_ADMIN_MARKETING_DOGFOOD_FORWARD_FIX:-}" ]]; then
    psql_run --file "$ROOT_DIR/$SERVSYNC_ADMIN_MARKETING_DOGFOOD_FORWARD_FIX" >/dev/null
  fi
  psql_run --file "$ROOT_DIR/${SERVSYNC_ADMIN_MARKETING_DOGFOOD_VALIDATION:?Admin Marketing dogfood validation is required.}" >/dev/null
  if psql_run --file "$ROOT_DIR/$SERVSYNC_ADMIN_MARKETING_DOGFOOD_MIGRATION" >/dev/null 2>&1; then
    echo "Repeated Admin Marketing dogfood migration unexpectedly succeeded." >&2
    exit 1
  fi
  if [[ -n "${SERVSYNC_ADMIN_MARKETING_DOGFOOD_FORWARD_FIX:-}" ]] \
      && psql_run --file "$ROOT_DIR/$SERVSYNC_ADMIN_MARKETING_DOGFOOD_FORWARD_FIX" >/dev/null 2>&1; then
    echo "Repeated Admin Marketing dogfood forward fix unexpectedly succeeded." >&2
    exit 1
  fi
fi

if psql_run --file "$ROOT_DIR/servsync-marketing-media-intake-ephemeral-lifecycle.sql" >/dev/null 2>&1; then
  echo "Repeated Marketing media lifecycle migration unexpectedly succeeded." >&2
  exit 1
fi

if psql_run --file "$ROOT_DIR/servsync-marketing-abandoned-upload-cleanup.sql" >/dev/null 2>&1; then
  echo "Repeated Marketing abandoned-upload cleanup migration unexpectedly succeeded." >&2
  exit 1
fi

psql_run --file "$ROOT_DIR/servsync-marketing-storage-policy-helper-execute.sql" >/dev/null

echo "Marketing media, entitlement, cost, and lifecycle validation passed."
