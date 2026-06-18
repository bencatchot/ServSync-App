#!/usr/bin/env bash
set -euo pipefail

cat <<'WARNING'
ServSync schema dry run

WARNING:
- This helper is for a brand-new blank throwaway Supabase project only.
- The first SQL file, servsync-clean-foundation.sql, is destructive.
- It drops public schema objects and deletes auth.users.
- Do not run this against sandbox, production, or any project with real data.
- This script does not copy sandbox data and does not touch Vercel.
WARNING

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Missing DATABASE_URL. Set it to the throwaway project's direct database connection URL." >&2
  exit 1
fi

if [[ "${SERVSYNC_SCHEMA_DRY_RUN_CONFIRM:-}" != "blank-throwaway-only" ]]; then
  echo "Refusing to run without SERVSYNC_SCHEMA_DRY_RUN_CONFIRM=blank-throwaway-only." >&2
  echo "This is an intentional guard because servsync-clean-foundation.sql is destructive." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Missing psql. Install PostgreSQL client tools before running this helper." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SQL_FILES=(
  "servsync-clean-foundation.sql"
  "servsync-admin-contractor-management.sql"
  "servsync-email-prep.sql"
  "servsync-permanent-referral.sql"
  "servsync-referrals-v1.sql"
  "servsync-referral-attribution.sql"
  "servsync-fix-invite-code-gen.sql"
  "servsync-preserve-original-connection-source.sql"
  "servsync-invite-reward-tracking.sql"
  "servsync-homeowner-contractor-invite-leads.sql"
  "servsync-homeowner-contractor-invite-leads-privilege-hardening.sql"
  "servsync-contractor-team-access.sql"
  "servsync-connection-detail-fields.sql"
  "servsync-homeowner-connection-requests.sql"
  "servsync-connection-request-ux.sql"
  "servsync-connected-homeowner-homes.sql"
  "servsync-service-requests-v1.sql"
  "servsync-service-request-home-id-column.sql"
  "servsync-quote-attachment.sql"
  "servsync-appointment-scheduling.sql"
  "servsync-appointment-counter-proposal.sql"
  "servsync-reschedule-appointment.sql"
  "servsync-appointment-proposal-lifecycle.sql"
  "servsync-request-lifecycle.sql"
  "servsync-notifications.sql"
  "servsync-media-attachments.sql"
  "servsync-contractor-media.sql"
  "servsync-maintenance-log.sql"
  "servsync-maintenance-log-home-id-column.sql"
  "servsync-maintenance-log-autocreate.sql"
  "servsync-home-documents.sql"
  "servsync-maintenance-log-invoices.sql"
  "servsync-home-documents-home-id.sql"
  "servsync-homeowner-profile-photos.sql"
  "servsync-inspections.sql"
  "servsync-local-field-work.sql"
  "servsync-connected-homeowner-job-home-id.sql"
  "servsync-inspection-media.sql"
  "servsync-private-media-storage.sql"
  "servsync-field-work-maintenance-log.sql"
  "servsync-maintenance-log-home-id.sql"
  "servsync-field-work-report-delivery.sql"
  "servsync-report-documents-home-id.sql"
  "servsync-field-work-draft-delete.sql"
  "servsync-estimates.sql"
  "servsync-estimate-templates.sql"
  "servsync-contractor-saved-estimate-charges.sql"
  "servsync-job-lifecycle.sql"
  "servsync-invoices-schema.sql"
  "servsync-estimate-price-required-foundation.sql"
  "servsync-invoice-discount-details.sql"
  "servsync-estimate-job-approved-scope.sql"
  "servsync-invoice-from-source.sql"
  "servsync-invoice-actions.sql"
  "servsync-estimate-invoice-home-id.sql"
  "servsync-homeowner-file-estimates.sql"
  "servsync-reviews.sql"
  "servsync-public-reviews.sql"
  "servsync-review-eligibility.sql"
  "servsync-service-request-home-id.sql"
  "servsync-connection-shared-properties.sql"
  "servsync-connection-shared-properties-rls-fix.sql"
  "servsync-homes-field-work-privilege-hardening.sql"
  "servsync-contextual-connection-pending-review-rpc.sql"
  "servsync-unified-visit-events.sql"
  "servsync-standalone-calendar-events.sql"
  "servsync-recurring-calendar-events.sql"
  "servsync-calendar-event-job-links.sql"
  "servsync-contractor-public-profile.sql"
  "servsync-discover.sql"
  "servsync-discover-analytics.sql"
  "servsync-external-review-links.sql"
  "servsync-contractor-service-areas.sql"
  "servsync-discover-service-area-filtering.sql"
  "servsync-geocoding-radius-matching.sql"
  "servsync-contractor-logos.sql"
  "servsync-fix-contractor-logo-upload-policy-v2.sql"
  "servsync-local-customer-claim-invites.sql"
  "servsync-local-customer-claim-token-fix.sql"
  "servsync-support-inquiries.sql"
  "servsync-support-attachments.sql"
  "servsync-stripe-prep.sql"
  "servsync-admin-connection-overview.sql"
  "servsync-admin-reports.sql"
  "servsync-admin-contractor-connection-alerts.sql"
  "servsync-go-live-security-hardening.sql"
  "servsync-discover-media-browser-safe.sql"
)

echo
echo "Verifying approved SQL files exist..."
for sql_file in "${SQL_FILES[@]}"; do
  if [[ ! -f "$sql_file" ]]; then
    echo "Missing required SQL file: $sql_file" >&2
    exit 1
  fi
done

echo "All approved SQL files are present."
echo

total="${#SQL_FILES[@]}"
index=1
for sql_file in "${SQL_FILES[@]}"; do
  echo "[$index/$total] Applying $sql_file"
  psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --file "$sql_file"
  index=$((index + 1))
done

echo
echo "Schema SQL sequence completed. Running verification checks..."
psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --file "scripts/verify-sql-dry-run.sql"

echo
echo "Dry run completed successfully."
