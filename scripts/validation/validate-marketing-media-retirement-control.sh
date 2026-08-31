#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVSYNC_MARKETING_QUEUE_MIGRATION="servsync-marketing-publishing-queue-authorization.sql" \
SERVSYNC_MARKETING_QUEUE_COMPATIBILITY="scripts/validation/marketing-publishing-terminal-backfill-compatibility.sql" \
SERVSYNC_MARKETING_QUEUE_FORWARD_FIX="servsync-marketing-scheduled-destination-invalidation.sql" \
SERVSYNC_MARKETING_QUEUE_VALIDATION="tests/sql/marketing-publishing-queue-authorization-validation.sql" \
SERVSYNC_MARKETING_RETIREMENT_MIGRATION="servsync-marketing-media-retirement-control.sql" \
SERVSYNC_MARKETING_RETIREMENT_VALIDATION="tests/sql/marketing-media-retirement-control-validation.sql" \
  bash "$ROOT_DIR/scripts/validation/validate-marketing-media-cost-lifecycle.sh"

echo "Marketing media retirement control validation passed."
