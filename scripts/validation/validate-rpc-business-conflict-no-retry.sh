#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVSYNC_VALIDATE_RPC_CONFLICT_FIX=true \
  bash "$ROOT_DIR/scripts/validation/validate-marketing-publishing-queue-authorization.sh"
echo "RPC business conflict migration and regression validation passed."
