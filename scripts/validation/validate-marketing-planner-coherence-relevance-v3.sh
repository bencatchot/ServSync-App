#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL_BIN="${PSQL_BIN:-$(command -v psql)}"
POSTGRES_BIN="${POSTGRES_BIN:-$(command -v postgres)}"
POSTGRES_BIN_DIR="$(cd "$(dirname "$POSTGRES_BIN")" && pwd)"
INITDB_BIN="${INITDB_BIN:-$POSTGRES_BIN_DIR/initdb}"
PG_CTL_BIN="${PG_CTL_BIN:-$POSTGRES_BIN_DIR/pg_ctl}"
TEST_ROOT="$(mktemp -d "/tmp/servsync-marketing-planner-v3.XXXXXX")"
PGDATA="$TEST_ROOT/data"
PGSOCKET="$TEST_ROOT/socket"
PGPORT="${SERVSYNC_MARKETING_PLANNER_V3_TEST_PORT:-55454}"

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

psql_run >/dev/null <<'SQL'
insert into public.profiles (id, role, full_name)
values ('45000000-0000-4000-8000-000000000001', 'platform_admin', 'Historical Planner Owner');
select set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.servsync_create_internal_marketing_plan(
  '45000000-0000-4000-8000-000000000001', 1, 'recommended', 'Historical v1 plan',
  current_date, current_date + 30, null,
  '[{"audience":"Small contractors","topic":"Estimates and approvals","direction":"Explain estimates and approvals in practical language.","rationale":"Historical planner v1 evidence.","content_roles":["educational_post"]}]'::jsonb
);
reset role;
SQL

psql_run --file "$ROOT_DIR/servsync-marketing-planner-quality-v2.sql" >/dev/null

psql_run >/dev/null <<'SQL'
select set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.servsync_create_internal_marketing_plan(
  '45000000-0000-4000-8000-000000000002', 1, 'recommended', 'Historical v2 plan',
  current_date, current_date + 30, null,
  '[{"audience":"Homeowners","topic":"Home History","direction":"Explain one current Home History interaction.","rationale":"Historical planner v2 evidence.","content_roles":["homeowner_benefit"]}]'::jsonb,
  2
);
reset role;
SQL

before_plan_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(jsonb_agg(to_jsonb(plan) order by plan.id)::text) from public.marketing_plans plan;")"
before_revision_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(jsonb_agg(to_jsonb(revision) order by revision.id)::text) from public.marketing_plan_revisions revision;")"
before_other_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(concat_ws('|', (select md5(jsonb_agg(to_jsonb(profile) order by profile.id)::text) from public.marketing_business_profiles profile), (select count(*) from public.marketing_content_preparation_packages), (select count(*) from public.marketing_content_items), (select count(*) from public.marketing_content_status_events)));")"

psql_run --file "$ROOT_DIR/servsync-marketing-planner-coherence-relevance-v3.sql" >/dev/null

after_plan_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(jsonb_agg(to_jsonb(plan) order by plan.id)::text) from public.marketing_plans plan;")"
after_revision_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(jsonb_agg(to_jsonb(revision) order by revision.id)::text) from public.marketing_plan_revisions revision;")"
after_other_fingerprint="$(psql_run --quiet --tuples-only --no-align --command "select md5(concat_ws('|', (select md5(jsonb_agg(to_jsonb(profile) order by profile.id)::text) from public.marketing_business_profiles profile), (select count(*) from public.marketing_content_preparation_packages), (select count(*) from public.marketing_content_items), (select count(*) from public.marketing_content_status_events)));")"

if [[ "$before_plan_fingerprint" != "$after_plan_fingerprint" || "$before_revision_fingerprint" != "$after_revision_fingerprint" || "$before_other_fingerprint" != "$after_other_fingerprint" ]]; then
  echo "Planner v3 migration changed historical Marketing evidence." >&2
  exit 1
fi

psql_run --file "$ROOT_DIR/tests/sql/marketing-planner-coherence-relevance-v3-validation.sql" >/dev/null

planner_payload="$(node <<'NODE'
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { buildRecommendedMarketingPlan } = await server.ssrLoadModule('/src/features/marketing/marketingPlanning.ts');
    const {
      operationalPlannerV3Profile,
      operationalPlannerV3RecentContent,
    } = await server.ssrLoadModule('/tests/fixtures/marketingPlannerV3Operational.ts');
    const items = buildRecommendedMarketingPlan(operationalPlannerV3Profile, operationalPlannerV3RecentContent);
    process.stdout.write(JSON.stringify(items.map(item => ({
      audience: item.audience,
      topic: item.topic,
      direction: item.direction,
      rationale: item.rationale,
      content_roles: item.contentRoles,
    }))));
  } finally {
    await server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
NODE
)"

planner_payload_base64="$(printf '%s' "$planner_payload" | base64 | tr -d '\n')"
package_valid="$(psql_run --quiet --tuples-only --no-align \
  --set=planner_payload_base64="$planner_payload_base64" <<'SQL'
select public.servsync_private_marketing_plan_items_valid(
  convert_from(decode(:'planner_payload_base64', 'base64'), 'UTF8')::jsonb
);
SQL
)"
if [[ "$package_valid" != "t" ]]; then
  echo "Deterministic operational planner v3 package failed the runtime validator." >&2
  exit 1
fi

claim_guard_valid="$(psql_run --quiet --tuples-only --no-align --command "
  select
    public.servsync_private_marketing_direction_is_safe(
      'Explain one supported contractor-profile interaction without claiming ranking, credential verification, or lead outcomes.'
    )
    and not public.servsync_private_marketing_direction_is_safe(
      'ServSync guarantees contractor leads.'
    );
")"
if [[ "$claim_guard_valid" != "t" ]]; then
  echo "Marketing claim guard did not preserve safe caution and prohibited-claim rejection." >&2
  exit 1
fi

before_repeat="$(psql_run --quiet --tuples-only --no-align --command "select md5(concat_ws('|', (select count(*) from public.marketing_plans), (select count(*) from public.marketing_plan_revisions), (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'servsync_create_internal_marketing_plan%')));")"
if psql_run --file "$ROOT_DIR/servsync-marketing-planner-coherence-relevance-v3.sql" >/dev/null 2>&1; then
  echo "Repeated Marketing planner v3 migration unexpectedly succeeded." >&2
  exit 1
fi
after_repeat="$(psql_run --quiet --tuples-only --no-align --command "select md5(concat_ws('|', (select count(*) from public.marketing_plans), (select count(*) from public.marketing_plan_revisions), (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'servsync_create_internal_marketing_plan%')));")"
if [[ "$before_repeat" != "$after_repeat" ]]; then
  echo "Rejected repeated Marketing planner v3 migration changed installed state." >&2
  exit 1
fi

echo "Marketing Planner Coherence + Relevance v3 validation passed."
