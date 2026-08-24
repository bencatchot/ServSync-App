#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PG16_BIN=${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}
INITDB=${INITDB:-$([[ -x "$PG16_BIN/initdb" ]] && printf '%s' "$PG16_BIN/initdb" || command -v initdb || true)}
PG_CTL=${PG_CTL:-$([[ -x "$PG16_BIN/pg_ctl" ]] && printf '%s' "$PG16_BIN/pg_ctl" || command -v pg_ctl || true)}
PSQL=${PSQL:-$([[ -x "$PG16_BIN/psql" ]] && printf '%s' "$PG16_BIN/psql" || command -v psql || true)}
CREATEDB=${CREATEDB:-$([[ -x "$PG16_BIN/createdb" ]] && printf '%s' "$PG16_BIN/createdb" || command -v createdb || true)}

if [[ -z "$INITDB" || -z "$PG_CTL" || -z "$PSQL" || -z "$CREATEDB" ]]; then
  echo 'PostgreSQL 16 client/server tools are required.' >&2
  exit 2
fi

TMP_ROOT=$(mktemp -d "/tmp/servsync-record-finalization.XXXXXX")
DATA_DIR="$TMP_ROOT/data"
SOCKET_DIR="$TMP_ROOT/socket"
mkdir -p "$SOCKET_DIR"

cleanup() {
  "$PG_CTL" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

"$INITDB" -D "$DATA_DIR" -A trust -U runner >/dev/null
"$PG_CTL" -D "$DATA_DIR" -o "-k $SOCKET_DIR -p 55442" -w start >/dev/null
"$CREATEDB" -h "$SOCKET_DIR" -p 55442 -U runner record_finalization

PSQL_ARGS=(-X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p 55442 -U runner -d record_finalization)
"$PSQL" "${PSQL_ARGS[@]}" -f "$ROOT/tests/sql/core-record-finalization-foundation.sql" >/dev/null
"$PSQL" "${PSQL_ARGS[@]}" -f "$ROOT/servsync-core-record-finalization-durable-idempotency.sql" >/dev/null
"$PSQL" "${PSQL_ARGS[@]}" -f "$ROOT/tests/sql/core-record-finalization-history-deletion-validation.sql" >/dev/null

CONCURRENT_SQL="select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false); set role authenticated; select public.servsync_commit_manual_home_history_creation('30000000-0000-4000-8000-000000000003', jsonb_build_object('home_id','20000000-0000-4000-8000-000000000001','service_request_id',null,'category','Maintenance','title','Concurrent final-byte regression','description','Same operation from two sessions.','performed_at','2026-08-24','contractor_name','Self','cost_cents',0,'notes','','document',null));"
"$PSQL" "${PSQL_ARGS[@]}" --command "$CONCURRENT_SQL" >"$TMP_ROOT/concurrent-a.log" 2>&1 &
CONCURRENT_A_PID=$!
"$PSQL" "${PSQL_ARGS[@]}" --command "$CONCURRENT_SQL" >"$TMP_ROOT/concurrent-b.log" 2>&1 &
CONCURRENT_B_PID=$!
wait "$CONCURRENT_A_PID"
wait "$CONCURRENT_B_PID"

"$PSQL" "${PSQL_ARGS[@]}" <<'SQL' >/dev/null
do $$
begin
  if (select count(*) from public.home_maintenance_log where title = 'Concurrent final-byte regression') <> 1
     or (
       select count(*)
         from public.servsync_core_record_finalization_operations
        where operation_key = '30000000-0000-4000-8000-000000000003'
          and status = 'succeeded'
     ) <> 1 then
    raise exception 'Concurrent same-operation commit did not converge to one History row and one succeeded receipt.';
  end if;
end;
$$;
SQL

"$PSQL" "${PSQL_ARGS[@]}" <<'SQL' >/dev/null
insert into public.contractor_profiles(id, business_name)
values ('40000000-0000-4000-8000-000000000001', 'Concurrent Report Contractor');
insert into public.inspections(id, contractor_id, name)
values (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Concurrent final-byte report'
);

do $$
declare
  v_prepared jsonb;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  set local role authenticated;
  v_prepared := public.servsync_prepare_job_report_finalization(
    '60000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'rooms_with_findings', '[]'::jsonb,
      'summary', 'Concurrent report summary',
      'file_name', 'concurrent-report.pdf',
      'file_size_bytes', 7,
      'file_sha256', repeat('b', 64),
      'include_summary', true,
      'include_value_add', false,
      'value_add_text', ''
    )
  );
  reset role;

  insert into storage.objects(bucket_id, name, owner_id, metadata, user_metadata)
  values (
    'home-documents',
    v_prepared ->> 'storage_path',
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_object('size', 7, 'mimetype', 'application/pdf'),
    jsonb_build_object(
      'servsync_sha256', repeat('b', 64),
      'servsync_operation_key', '60000000-0000-4000-8000-000000000001'
    )
  );
end;
$$;
SQL

CONCURRENT_REPORT_SQL="select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false); set role authenticated; select public.servsync_commit_job_report_finalization('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',jsonb_build_object('rooms_with_findings','[]'::jsonb,'summary','Concurrent report summary','file_name','concurrent-report.pdf','file_size_bytes',7,'file_sha256',repeat('b',64),'include_summary',true,'include_value_add',false,'value_add_text',''));"
"$PSQL" "${PSQL_ARGS[@]}" --command "$CONCURRENT_REPORT_SQL" >"$TMP_ROOT/concurrent-report-a.log" 2>&1 &
CONCURRENT_REPORT_A_PID=$!
"$PSQL" "${PSQL_ARGS[@]}" --command "$CONCURRENT_REPORT_SQL" >"$TMP_ROOT/concurrent-report-b.log" 2>&1 &
CONCURRENT_REPORT_B_PID=$!
wait "$CONCURRENT_REPORT_A_PID"
wait "$CONCURRENT_REPORT_B_PID"

"$PSQL" "${PSQL_ARGS[@]}" <<'SQL' >/dev/null
do $$
begin
  if (
       select count(*)
         from public.servsync_core_record_finalization_operations
        where operation_key = '60000000-0000-4000-8000-000000000001'
          and status = 'succeeded'
     ) <> 1
     or not exists (
       select 1
         from public.inspections
        where id = '50000000-0000-4000-8000-000000000001'
          and status = 'finalized'
          and job_status = 'completed'
     )
     or exists (
       select 1
         from public.home_maintenance_log
        where inspection_id = '50000000-0000-4000-8000-000000000001'
     ) then
    raise exception 'Concurrent same-operation local report commit did not converge to one canonical result.';
  end if;
end;
$$;
SQL

"$PSQL" "${PSQL_ARGS[@]}" -f "$ROOT/servsync-core-record-finalization-legacy-retirement.sql" >/dev/null

echo 'Core record finalization History-deletion tombstone PostgreSQL validation passed.'
