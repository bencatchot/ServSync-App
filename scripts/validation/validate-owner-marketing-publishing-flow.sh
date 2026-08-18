#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVSYNC_MARKETING_QUEUE_MIGRATION="servsync-marketing-publishing-queue-authorization.sql" \
SERVSYNC_MARKETING_QUEUE_COMPATIBILITY="scripts/validation/marketing-publishing-terminal-backfill-compatibility.sql" \
SERVSYNC_MARKETING_QUEUE_FORWARD_FIX="servsync-marketing-scheduled-destination-invalidation.sql" \
SERVSYNC_MARKETING_QUEUE_VALIDATION="tests/sql/marketing-publishing-queue-authorization-validation.sql" \
SERVSYNC_OWNER_MARKETING_FLOW_MIGRATION="servsync-owner-marketing-approval-policy.sql" \
SERVSYNC_OWNER_MARKETING_FLOW_VALIDATION="tests/sql/owner-marketing-approval-policy-validation.sql" \
  bash "$ROOT_DIR/scripts/validation/validate-marketing-media-cost-lifecycle.sh"

echo "Owner Marketing publishing flow SQL validation passed."
