# ServSync Master Plan Changelog

This changelog tracks approved app changes and master-plan updates that affect ServSync product direction, roadmap, workflows, beta strategy, or implementation context.

Do not update this changelog for audit-only tasks unless specifically requested.

## 2026-06-16

- Branch: `feature/mobile-qa-smoke-v1`
- Files changed:
  - `tests/e2e/mobile-smoke.spec.ts`
  - `package.json`
  - `docs/BETA_READINESS_CHECKLIST.md`
  - `docs/QA_PLAYWRIGHT_GUIDE.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a read-only mobile Playwright smoke spec with test-local mobile device emulation and documented the mobile QA operating model without adding a global mobile project.
- Reason for change: Start beta mobile coverage with low-risk authenticated navigation/load checks for high-risk homeowner and contractor screens while keeping mutating/core-loop mobile automation future-facing.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/mobile-smoke.spec.ts`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/homeowner-smoke.spec.ts tests/e2e/contractor-smoke.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - This branch does not automate full mobile workflows, field-use scenarios, or mutating mobile coverage.
  - Manual mobile QA remains required for dense cards, forms, modals, and contractor field workflows.

## 2026-06-16

- Branch: `feature/rls-cross-user-e2e-v1`
- Files changed:
  - `tests/e2e/helpers/env.ts`
  - `tests/e2e/rls-cross-user.spec.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added secondary sandbox credential support and a guarded Playwright RLS/cross-user spec that checks homeowner, contractor, and connection boundaries with sandbox-only Supabase sessions.
- Reason for change: Turn the beta RLS account/data setup into repeatable cross-user access verification before inviting controlled beta users.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/rls-cross-user.spec.ts`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/homeowner-smoke.spec.ts tests/e2e/contractor-smoke.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - The new spec depends on the approved sandbox RLS QA fixture records and is not intended for production.
  - Storage signed URL negative checks and contractor viewer/team-member role checks remain deferred.

## 2026-06-16

- Branch: `feature/full-core-loop-e2e-v1`
- Files changed:
  - `tests/e2e/full-core-loop.spec.ts`
  - `tests/e2e/helpers/auth.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added the first focused sandbox-only Playwright E2E for the full core loop from homeowner service request through contractor estimate, homeowner approval, contractor job completion, invoice sending, homeowner invoice filing to Home History, and linked manual Home Reminder creation.
- Reason for change: Turn the proven manual sandbox core-loop run into repeatable automated coverage using the stable hooks added in the prior testability cleanup.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/full-core-loop.spec.ts`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/homeowner-smoke.spec.ts tests/e2e/contractor-smoke.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - This mutating test creates timestamped sandbox records and is intended for deliberate sandbox/preview runs only.
  - The shared homeowner login helper now accepts the existing `Estimates / Invoices` navigation badge suffix when present.
  - Production authenticated testing remains blocked by policy unless dedicated production smoke accounts are approved later.

## 2026-06-16

- Branch: `feature/beta-core-loop-testability-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added stable test hooks and accessible labels across the sandbox core-loop path, including request, estimate, accepted-estimate job creation, job work item, invoice, Home History, and reminder form surfaces.
- Reason for change: Make the next full core-loop Playwright E2E branch more reliable after the manual sandbox run passed but exposed brittle selectors around cards, job work-item completion, invoice filing, and linked reminders.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/homeowner-smoke.spec.ts tests/e2e/contractor-smoke.spec.ts`
  - Targeted local sandbox hook/accessibility check for request, estimate, accepted-estimate job creation, job checkbox, Complete Job, invoice, Home History, and reminder form surfaces
  - Secret scan on changed diff
- Known risks or follow-ups:
  - This branch does not add the full core-loop E2E test; it prepares the UI for that next branch.
  - Contractor Service Request cards with existing draft estimates should still receive manual preview attention because the manual run observed a draft-estimate visibility inconsistency.

## 2026-06-16

- Branch: `feature/beta-qa-docs-refresh-v1`
- Files changed:
  - `docs/BETA_READINESS_CHECKLIST.md`
  - `docs/GO_LIVE_AUDIT.md`
  - `docs/QA_PLAYWRIGHT_GUIDE.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Refreshed the beta QA documentation to match the current Playwright scripts, sandbox-only authenticated testing model, production public-smoke policy, sandbox account/data plan, Home History/Home Reminders checks, mobile QA gate, RLS/privacy checks, and controlled-beta versus public go-live distinction.
- Reason for change: Reduce beta workflow confusion before creating smoke accounts, adding deeper E2E coverage, or inviting controlled beta users.
- Tests/checks run:
  - `git diff --check`
  - Markdown sanity review of changed docs
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Documentation-only; no app code, tests, SQL, schema, Edge Functions, Vercel settings, environment variables, users, or data were changed.
  - Full core-loop E2E coverage, production smoke account policy, mobile QA automation, and RLS/cross-user testing remain follow-up work.

## 2026-06-16

- Branch: `feature/master-plan-status-refresh-v1`
- Files changed:
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Refreshed the master plan status language after PRs #1-#11 to mark shipped v1 core-loop clarity, Home History, invoice-to-Home-History filing, manual Home Reminders, SQL provenance cleanup, calendar details, smoke-test cleanup, and terminology cleanup while keeping deeper automation and integrations future-facing.
- Reason for change: Keep the planning baseline aligned with the current shipped product state before starting another product branch.
- Tests/checks run:
  - `git diff --check`
  - Markdown sanity review of changed headings/tables
  - Secret scan on changed diff
- Known risks or follow-ups:
  - This is documentation-only and does not change app behavior, schema, Vercel, Supabase, or deployment settings.
  - Beta-readiness audit, full E2E core-loop coverage, production smoke account setup, mobile visual QA, and Discover/connection strategy remain future work.

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
