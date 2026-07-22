#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  printf '%s\n' 'run-command.sh: SOURCING_REJECTED: invoke this script as a process.' >&2
  return 94
fi

set -euo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec node "${script_dir}/execute-command.mjs" "$@"
