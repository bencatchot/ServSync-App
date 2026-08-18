#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVSYNC_MARKETING_QUEUE_MIGRATION="servsync-marketing-publishing-queue-authorization.sql" \
SERVSYNC_MARKETING_QUEUE_COMPATIBILITY="scripts/validation/marketing-publishing-terminal-backfill-compatibility.sql" \
SERVSYNC_MARKETING_QUEUE_FORWARD_FIX="servsync-marketing-scheduled-destination-invalidation.sql" \
SERVSYNC_MARKETING_QUEUE_VALIDATION="tests/sql/marketing-publishing-queue-authorization-validation.sql" \
SERVSYNC_MARKETING_CONTENT_CREATION_MIGRATION="servsync-contractor-marketing-content-creation.sql" \
SERVSYNC_MARKETING_CONTENT_CREATION_VALIDATION="tests/sql/contractor-marketing-content-creation-validation.sql" \
SERVSYNC_ADMIN_MARKETING_DOGFOOD_MIGRATION="servsync-admin-marketing-dogfood.sql" \
SERVSYNC_ADMIN_MARKETING_DOGFOOD_FORWARD_FIX="servsync-admin-marketing-prepared-usage-forward-fix.sql" \
SERVSYNC_ADMIN_MARKETING_DOGFOOD_VALIDATION="tests/sql/admin-marketing-dogfood-validation.sql" \
  bash "$ROOT_DIR/scripts/validation/validate-marketing-media-cost-lifecycle.sh"

echo "Contractor Marketing content creation validation passed."
