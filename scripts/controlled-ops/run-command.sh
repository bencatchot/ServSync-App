#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  printf '%s\n' 'run-command.sh: SOURCING_REJECTED: invoke this script as a process.' >&2
  return 94
fi

set -euo pipefail
umask 077

HARNESS_ARGUMENT_ERROR=90
HARNESS_SANITIZER_ERROR=92
HARNESS_EVIDENCE_ERROR=93

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
evidence_cli="${script_dir}/evidence.mjs"
sanitizer_cli="${script_dir}/sanitize.mjs"

operation_root=''
stage_id=''
execution_token=''
command_category=''
expected_result=''
retry_of=''
retry_authorization=''
expected_affected_rows=''

while (($# > 0)); do
  case "$1" in
    --operation-root) operation_root="${2-}"; shift 2 ;;
    --stage) stage_id="${2-}"; shift 2 ;;
    --token) execution_token="${2-}"; shift 2 ;;
    --category) command_category="${2-}"; shift 2 ;;
    --expected) expected_result="${2-}"; shift 2 ;;
    --retry-of) retry_of="${2-}"; shift 2 ;;
    --retry-authorization) retry_authorization="${2-}"; shift 2 ;;
    --expected-affected-rows) expected_affected_rows="${2-}"; shift 2 ;;
    --) shift; break ;;
    *) printf '%s\n' 'run-command.sh: INVALID_ARGUMENTS: unknown wrapper argument.' >&2; exit "$HARNESS_ARGUMENT_ERROR" ;;
  esac
done

if [[ -z "$operation_root" || -z "$stage_id" || -z "$execution_token" || -z "$command_category" || -z "$expected_result" || $# -eq 0 ]]; then
  printf '%s\n' 'run-command.sh: INVALID_ARGUMENTS: required arguments or command are missing.' >&2
  exit "$HARNESS_ARGUMENT_ERROR"
fi
if [[ -n "$expected_affected_rows" && ! "$expected_affected_rows" =~ ^[0-9]+$ ]]; then
  printf '%s\n' 'run-command.sh: INVALID_ARGUMENTS: expected affected rows must be a nonnegative integer.' >&2
  exit "$HARNESS_ARGUMENT_ERROR"
fi

claim_arguments=(
  claim-token --root "$operation_root" --stage "$stage_id" --token "$execution_token"
  --category "$command_category" --expected "$expected_result"
)
if [[ -n "$retry_of" || -n "$retry_authorization" ]]; then
  claim_arguments+=(--retry-of "$retry_of" --retry-authorization "$retry_authorization")
fi

if ! node "$evidence_cli" "${claim_arguments[@]}" >/dev/null; then
  exit "$HARNESS_ARGUMENT_ERROR"
fi

head_before="$(node "$evidence_cli" head --root "$operation_root")" || {
  node "$evidence_cli" update-token --root "$operation_root" --token "$execution_token" --status failed_before_execution >/dev/null 2>&1 || true
  exit "$HARNESS_EVIDENCE_ERROR"
}
start_time="$(node -e 'process.stdout.write(new Date().toISOString())')"
if ! node "$evidence_cli" append-event \
  --root "$operation_root" --expected-head "$head_before" --stage "$stage_id" \
  --event-id "${execution_token}-started" --event-type command_started --action-timestamp "$start_time" \
  --category "$command_category" --expected "$expected_result" --observed started \
  --result-classification started >/dev/null; then
  node "$evidence_cli" update-token --root "$operation_root" --token "$execution_token" --status failed_before_execution >/dev/null 2>&1 || true
  exit "$HARNESS_EVIDENCE_ERROR"
fi

if ! node "$evidence_cli" update-token --root "$operation_root" --token "$execution_token" --status started >/dev/null; then
  exit "$HARNESS_EVIDENCE_ERROR"
fi

quarantine_dir="${operation_root}/quarantine"
raw_stdout="${quarantine_dir}/${execution_token}.stdout.raw"
raw_stderr="${quarantine_dir}/${execution_token}.stderr.raw"
sanitized_stdout="${quarantine_dir}/${execution_token}.stdout.sanitized"
sanitized_stderr="${quarantine_dir}/${execution_token}.stderr.sanitized"
stdout_summary="${quarantine_dir}/${execution_token}.stdout.summary.json"
stderr_summary="${quarantine_dir}/${execution_token}.stderr.summary.json"

set +e
"$@" >"$raw_stdout" 2>"$raw_stderr"
command_exit_code=$?
set -e
completion_time="$(node -e 'process.stdout.write(new Date().toISOString())')"

sanitize_failed=0
node "$sanitizer_cli" --input "$raw_stdout" --output "$sanitized_stdout" --summary "$stdout_summary" --mode lines >/dev/null 2>&1 || sanitize_failed=1
node "$sanitizer_cli" --input "$raw_stderr" --output "$sanitized_stderr" --summary "$stderr_summary" --mode lines >/dev/null 2>&1 || sanitize_failed=1

if ((sanitize_failed != 0)); then
  rm -f -- "$raw_stdout" "$raw_stderr" "$sanitized_stdout" "$sanitized_stderr" "$stdout_summary" "$stderr_summary"
  node "$evidence_cli" update-token --root "$operation_root" --token "$execution_token" --status sanitizer_failure --exit-code "$command_exit_code" >/dev/null 2>&1 || true
  failure_head="$(node "$evidence_cli" head --root "$operation_root" 2>/dev/null)" || exit "$HARNESS_EVIDENCE_ERROR"
  node "$evidence_cli" append-event \
    --root "$operation_root" --expected-head "$failure_head" --stage "$stage_id" \
    --event-id "${execution_token}-sanitizer-failure" --event-type command_sanitizer_failed \
    --action-timestamp "$completion_time" --category "$command_category" --expected "$expected_result" \
    --observed sanitizer_failure --result-classification sanitizer_failure --exit-code "$command_exit_code" >/dev/null 2>&1 || true
  exit "$HARNESS_SANITIZER_ERROR"
fi

affected_rows_mismatch=0
if [[ -n "$expected_affected_rows" ]]; then
  affected_rows_matches="$(grep -Fxc "affected_rows=${expected_affected_rows}" "$sanitized_stdout" || true)"
  if [[ "$affected_rows_matches" != '1' ]]; then
    affected_rows_mismatch=1
  fi
fi

artifact_dir="${operation_root}/stages/${stage_id}/artifacts"
stdout_name="${execution_token}.stdout.txt"
stderr_name="${execution_token}.stderr.txt"
stdout_summary_name="${execution_token}.stdout.sanitization.json"
stderr_summary_name="${execution_token}.stderr.sanitization.json"

mv -- "$sanitized_stdout" "${artifact_dir}/${stdout_name}"
mv -- "$sanitized_stderr" "${artifact_dir}/${stderr_name}"
mv -- "$stdout_summary" "${artifact_dir}/${stdout_summary_name}"
mv -- "$stderr_summary" "${artifact_dir}/${stderr_summary_name}"
rm -f -- "$raw_stdout" "$raw_stderr"
chmod 600 "${artifact_dir}/${stdout_name}" "${artifact_dir}/${stderr_name}" "${artifact_dir}/${stdout_summary_name}" "${artifact_dir}/${stderr_summary_name}"

if ! node "$evidence_cli" register-artifact --root "$operation_root" --stage "$stage_id" --path "$stdout_name" --class command_stdout --summary "${artifact_dir}/${stdout_summary_name}" ||
   ! node "$evidence_cli" register-artifact --root "$operation_root" --stage "$stage_id" --path "$stderr_name" --class command_stderr --summary "${artifact_dir}/${stderr_summary_name}" ||
   ! node "$evidence_cli" register-artifact --root "$operation_root" --stage "$stage_id" --path "$stdout_summary_name" --class sanitization_summary ||
   ! node "$evidence_cli" register-artifact --root "$operation_root" --stage "$stage_id" --path "$stderr_summary_name" --class sanitization_summary; then
  node "$evidence_cli" update-token --root "$operation_root" --token "$execution_token" --status sanitizer_failure --exit-code "$command_exit_code" >/dev/null 2>&1 || true
  exit "$HARNESS_EVIDENCE_ERROR"
fi

if ! node "$evidence_cli" update-token --root "$operation_root" --token "$execution_token" --status completed --exit-code "$command_exit_code" >/dev/null; then
  exit "$HARNESS_EVIDENCE_ERROR"
fi

completion_head="$(node "$evidence_cli" head --root "$operation_root")" || exit "$HARNESS_EVIDENCE_ERROR"
if ((affected_rows_mismatch != 0)); then
  observed_result='affected_rows_mismatch'
  result_classification='evidence_assertion_failed'
elif ((command_exit_code == 0)); then
  observed_result='completed'
  result_classification='passed'
else
  observed_result='failed'
  result_classification='command_failed'
fi
artifact_paths="stages/${stage_id}/artifacts/${stdout_name},stages/${stage_id}/artifacts/${stderr_name},stages/${stage_id}/artifacts/${stdout_summary_name},stages/${stage_id}/artifacts/${stderr_summary_name}"
if ! node "$evidence_cli" append-event \
  --root "$operation_root" --expected-head "$completion_head" --stage "$stage_id" \
  --event-id "${execution_token}-completed" --event-type command_completed --action-timestamp "$completion_time" \
  --category "$command_category" --expected "$expected_result" --observed "$observed_result" \
  --result-classification "$result_classification" --exit-code "$command_exit_code" --artifacts "$artifact_paths" >/dev/null; then
  exit "$HARNESS_EVIDENCE_ERROR"
fi

if ((affected_rows_mismatch != 0)); then
  exit "$HARNESS_EVIDENCE_ERROR"
fi

exit "$command_exit_code"
