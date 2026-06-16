# ServSync Master Plan Changelog

This changelog tracks approved app changes and master-plan updates that affect ServSync product direction, roadmap, workflows, beta strategy, or implementation context.

Do not update this changelog for audit-only tasks unless specifically requested.

## 2026-06-16

- Branch: `feature/navigation-terminology-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `tests/e2e/contractor-finalize-report.spec.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Tightened user-facing contractor navigation and terminology by broadening Jobs wording, clarifying service job versus checklist/report language, replacing beta-facing legacy ZIP copy, and making closed/billed buckets clearer without changing stored statuses.
- Reason for change: Reduce beta-user confusion after the core-loop cleanups while preserving homeowner wording, internal database field names, schema, RPCs, RLS, and app behavior.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/homeowner-smoke.spec.ts tests/e2e/contractor-smoke.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Manual preview review should confirm the contractor Jobs overview, customer workspace job/report cards, Business Profile ZIP coverage copy, and mobile button wrapping feel clear.
  - Some internal code/type names still use inspection/fieldwork terminology because the underlying schema has not been renamed.

## 2026-06-16

- Branch: `feature/homeowner-core-loop-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Improved homeowner-side core loop guidance by clarifying accepted-estimate handoff copy, adding linked request access from estimate cards, surfacing approved work on the homeowner dashboard from existing accepted estimates, and tightening invoice/Home History language around completed work records and duplicate PDF avoidance.
- Reason for change: Help homeowners understand the request -> estimate approval -> contractor job/scheduling -> invoice -> Home History path without changing schema, RPCs, Edge Functions, reminders automation, or backend behavior.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test tests/e2e/homeowner-smoke.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Manual preview review should confirm accepted-estimate cards, request linked updates, dashboard approved-work cards, and invoice/Home History guidance feel clear on mobile.
  - Broader end-to-end test coverage for the full homeowner request-to-invoice-to-Home-History loop remains a follow-up.

## 2026-06-15

- Branch: `feature/contractor-core-loop-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Improved contractor-side core loop guidance by surfacing Create/Open Estimate from service request cards, making Create Job the primary next action for accepted estimates without jobs, polishing estimate status labels, replacing confusing estimate-record wording, clarifying local-only invoice send guidance, and gating checklist-job invoice creation behind report finalization.
- Reason for change: Help contractors follow the intended request -> estimate -> accepted estimate -> job -> completed job -> invoice flow without changing schema, RPCs, Edge Functions, or backend behavior.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/contractor-smoke.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Manual preview review should confirm the request-card actions, accepted-estimate ordering, and checklist-job report/invoice sidebar feel clear on mobile.
  - Broader end-to-end test coverage for the full contractor revenue loop remains a follow-up.

## 2026-06-15

- Branch: `feature/homeowner-calendar-event-modal-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a read-only homeowner calendar event detail modal so clicking a homeowner calendar appointment shows event/request context before navigating away.
- Reason for change: Make the homeowner calendar interaction consistent with the contractor calendar detail experience while keeping appointment response actions in the existing Service Requests workflow.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
- Known risks or follow-ups:
  - Manual preview review should confirm the modal feels clear on mobile and that optional estimate, invoice, and Home History actions appear only when linked records exist.

## 2026-06-15

- Branch: `feature/home-history-smoke-test-cleanup`
- Files changed:
  - `tests/e2e/homeowner-smoke.spec.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Updated the homeowner smoke test to expect the current Home History heading instead of stale homeowner-visible “Maintenance log” wording.
- Reason for change: Keep the read-only homeowner smoke test aligned with current product language after Home History replaced homeowner-visible maintenance log wording.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test tests/e2e/homeowner-smoke.spec.ts`
- Known risks or follow-ups:
  - None.

## 2026-06-15

- Branch: `feature/service-requests-heading-cleanup`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Changed the homeowner Service Requests tab's inner duplicate heading from `h1` to `h2` while preserving visible text and styling.
- Reason for change: Keep the app shell active-tab heading as the single page-level `h1` and resolve a Playwright strict-mode selector conflict in the homeowner smoke test.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test tests/e2e/homeowner-smoke.spec.ts` reached past the Service Requests step, then failed on an existing stale Home History expectation for `Maintenance log`.
- Known risks or follow-ups:
  - Update the homeowner smoke test's Home History expectation in a separate approved test cleanup.

## 2026-06-15

- Branch: `feature/sql-provenance-cleanup-v1`
- Files changed:
  - `servsync-estimate-job-support.sql`
  - `servsync-home-specific-inspection-templates.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added tracked SQL provenance patches for accepted-estimate-to-job support and home-specific inspection templates, and included them in the blank-schema install sequence.
- Reason for change: Reduce risk from loose untracked SQL files by capturing the currently needed schema/RLS pieces in reviewed tracked SQL without applying SQL or changing app behavior.
- Tests/checks run:
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - `git diff --check`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - SQL has not been applied to sandbox or production yet.
  - The loose files `servsync-estimate-to-job.sql` and `servsync-home-specific-templates.sql` still exist locally and should not be deleted until the tracked replacements are reviewed and applied as needed.
  - `scripts/apply-sql-dry-run.sh` has a separate SQL sequence and should be reviewed before using it to validate this provenance cleanup on a throwaway database.

## 2026-06-15

- Branch: `feature/home-reminders-v1`
- Files changed:
  - `src/App.tsx`
  - `src/types.ts`
  - `servsync-home-reminders.sql`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added proposed schema/RLS for homeowner-owned Home Reminders and a homeowner UI for creating manual follow-up reminders from Home History, viewing upcoming reminders on the dashboard, and marking reminders complete or dismissed.
- Reason for change: Complete the final manual follow-up step of the core MVP loop without building notification automation, recurrence, calendar sync, contractor-side reminders, or a full scheduler.
- Tests/checks run:
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - SQL must be applied to sandbox before authenticated preview testing.
  - V1 reminders are manual in-app records only; no push, email, text, cron, recurring automation, or calendar sync was added.
  - Contractor-side reminders and automatic reminders from jobs/invoices remain deferred.

## 2026-06-15

- Branch: `feature/invoice-home-history-filing-v1`
- Files changed:
  - `src/App.tsx`
  - `src/types.ts`
  - `servsync-invoice-home-history.sql`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a proposed SQL patch and homeowner UI flow for filing visible non-draft, non-void invoices to Home History through a durable `invoice_id` relationship, with duplicate prevention and structured invoice data as the source.
- Reason for change: Complete the invoice-to-Home-History step of the core MVP loop without creating duplicate Home History rows or storing unnecessary duplicate invoice PDFs.
- Tests/checks run:
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - SQL must be applied to sandbox before authenticated preview testing.
  - Existing document-backed receipt uploads remain separate from structured invoice-linked Home History entries.
  - Contractor-side filing, payment processing, reminders, and backfill of older invoices remain deferred.

## 2026-06-15

- Branch: `feature/home-history-v1-cleanup`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Improved the homeowner Home History tab with clearer “what belongs here” guidance, record counts, source/type chips, linked request/estimate/report/receipt actions, and more consistent Home History wording.
- Reason for change: Make existing `home_maintenance_log` records feel like the homeowner-facing destination for completed work, filed reports, receipts/invoices, notes, warranty details, and follow-up context without changing schema or building reminders.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Invoice-to-history filing is deferred because the current Home History model links receipt documents but does not have a durable `invoice_id` link.
  - A full unified Home Timeline and reminder workflow remain future roadmap work.

## 2026-06-15

- Branch: `feature/core-loop-navigation-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added UI-only core loop navigation guidance across homeowner requests, homeowner estimate/invoice records, contractor accepted-estimate follow-up, contractor Jobs overview, completed job invoice prompts, and Home History labels.
- Reason for change: Make the existing Homeowner Request -> Contractor Estimate -> Homeowner Approval -> Job -> Completion -> Invoice -> Home History flow easier to follow without changing schema, RPCs, Edge Functions, or production settings.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - This is a navigation/copy cleanup only. A true unified Home Timeline and reminder system are still future roadmap work.
  - Manual preview review should confirm the added guidance feels helpful rather than repetitive on mobile.

## 2026-06-15

- Branch: `main`
- Files changed:
  - `AGENTS.md`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added repository-level AI workflow instructions, created a Markdown companion for the ServSync Master Plan Word document, and created this changelog.
- Reason for change: Make the ServSync master plan readable by AI/code agents and establish a required workflow for future roadmap-aware app changes.
- Tests/checks run:
  - Parsed `docs/servsync-master-plan/ServSync_Master_Plan_v1_0_Updated.docx` from OOXML successfully.
  - Verified generated Markdown content exists.
  - Verified no app code files were changed.
- Known risks or follow-ups:
  - The Markdown companion is generated from the current Word document and should be kept synchronized when roadmap/product direction changes.
