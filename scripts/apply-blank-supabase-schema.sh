#!/usr/bin/env bash
set -euo pipefail

# ServSync blank Supabase schema installer
#
# Purpose:
#   Applies the approved ServSync SQL schema files, in order, to a brand-new
#   blank Supabase project such as "ServSync Production".
#
# Safety:
#   - This is for a blank project only.
#   - servsync-clean-foundation.sql is destructive.
#   - Do not run this against sandbox, production with users, or any project
#     containing real data.
#   - Do not include a password in DATABASE_URL.
#   - The password prompt is hidden and exported only to this process as
#     PGPASSWORD for psql.
#
# Expected direct connection URL format:
#   postgresql://postgres@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require
#
# Usage from zsh or bash:
#   cd "/Users/bencatchot/Documents/Codex/Home Maintenance app for sell/servsync-app-development"
#   ./scripts/apply-blank-supabase-schema.sh

CONFIRM_PHRASE="blank-project-schema-install"

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
  "servsync-estimate-job-support.sql"
  "servsync-home-specific-inspection-templates.sql"
  "servsync-invoices-schema.sql"
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

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cat <<'WARNING'
ServSync blank Supabase schema installer

WARNING:
- This must only be used on a brand-new blank Supabase project.
- servsync-clean-foundation.sql is destructive.
- It drops public schema objects and deletes auth.users.
- Do not run this against sandbox.
- Do not run this against any project with real users or customer data.
- This script does not touch Vercel and does not copy sandbox data.
WARNING

echo
printf "Type %s to continue: " "$CONFIRM_PHRASE"
IFS= read -r entered_confirm
if [[ "$entered_confirm" != "$CONFIRM_PHRASE" ]]; then
  echo "Confirmation phrase did not match. Aborting." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  cat >&2 <<'PSQL_MISSING'
Missing psql.

Install PostgreSQL client tools first, then rerun this helper.
Common Mac options:
- brew install libpq
- brew install postgresql@16
- Postgres.app
PSQL_MISSING
  exit 1
fi

echo
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Using DATABASE_URL from the current environment."
  db_url="$DATABASE_URL"
else
  echo "Paste the direct database URL WITHOUT the password."
  echo "Example: postgresql://postgres@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
  printf "Database URL without password: "
  IFS= read -r db_url
fi

if [[ -z "$db_url" ]]; then
  echo "Database URL is required. Aborting." >&2
  exit 1
fi

if [[ "$db_url" =~ ^postgres(ql)?://[^/@:]+:[^/@]+@ ]]; then
  echo "Refusing to run because the database URL appears to contain a password." >&2
  echo "Use a URL without password and enter the password at the hidden prompt." >&2
  exit 1
fi

if [[ -n "${PGPASSWORD:-}" ]]; then
  echo "Using PGPASSWORD from the current environment."
else
  printf "Database password (hidden): "
  old_stty="$(stty -g)"
  stty -echo
  IFS= read -r PGPASSWORD
  stty "$old_stty"
  echo
  export PGPASSWORD
fi

if [[ -z "${PGPASSWORD:-}" ]]; then
  echo "Database password is required. Aborting." >&2
  exit 1
fi

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
echo "Excluded files are not part of this install:"
echo "- servsync-estimate-to-job.sql"
echo "- servsync-home-specific-templates.sql"
echo "- legacy-archive-20260518/**"

echo
echo "Testing database connection..."
psql "$db_url" --set=ON_ERROR_STOP=1 --command "select current_database() as database_name;" >/dev/null

total="${#SQL_FILES[@]}"
index=1
for sql_file in "${SQL_FILES[@]}"; do
  echo "[$index/$total] Applying $sql_file"
  psql "$db_url" --set=ON_ERROR_STOP=1 --file "$sql_file"
  index=$((index + 1))
done

echo
echo "Schema SQL sequence completed. Running final verification..."
psql "$db_url" --set=ON_ERROR_STOP=1 --file "scripts/verify-sql-dry-run.sql"

echo
echo "ServSync blank schema install completed successfully."
