#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PG_BIN=${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/servsync-demo-draft.XXXXXX")
trap '"$PG_BIN/pg_ctl" -D "$TMP_ROOT/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$TMP_ROOT/socket"
"$PG_BIN/initdb" -D "$TMP_ROOT/data" -A trust -U postgres >/dev/null
"$PG_BIN/pg_ctl" -D "$TMP_ROOT/data" -o "-k $TMP_ROOT/socket -p 55448 -c listen_addresses=''" -w start >/dev/null
psql=("$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$TMP_ROOT/socket" -p 55448 -U postgres -d postgres)
"${psql[@]}" -f "$ROOT/tests/demo-recorder/fixtures/draft-first-cleanup-schema.sql" >/dev/null
"${psql[@]}" -f "$ROOT/servsync-demo-mode-foundation.sql" >/dev/null
"${psql[@]}" -f "$ROOT/tests/demo-recorder/fixtures/reset-functions-before.sql" >/dev/null
"${psql[@]}" -f "$ROOT/servsync-demo-draft-first-recorder-support.sql" >/dev/null
"${psql[@]}" -f "$ROOT/tests/demo-recorder/fixtures/draft-first-cleanup-cases.sql" >/dev/null
"${psql[@]}" -f "$ROOT/servsync-demo-draft-first-audit-ownership.sql" >/dev/null
"${psql[@]}" -f "$ROOT/tests/demo-recorder/fixtures/draft-first-audit-cases.sql" >/dev/null
# A second application must fail rather than silently replace unknown definitions.
if "${psql[@]}" -f "$ROOT/servsync-demo-draft-first-audit-ownership.sql" >"$TMP_ROOT/reapply.log" 2>&1; then
  echo 'Unsafe reapplication succeeded' >&2; exit 1
fi
rg -q 'baseline differs' "$TMP_ROOT/reapply.log"
echo 'Draft-first cleanup: ownership, dependency, atomic rejection, ACL, exact deletion, and preflight tests passed.'
