# ServSync Private Beta Readiness Checklist

Internal operating checklist for deciding whether ServSync is ready to invite live contractor and homeowner beta testers.

Related controlled beta docs:

- [Controlled Beta Launch Plan](./BETA_LAUNCH_PLAN.md)
- [Private Beta Tester Guide](./BETA_TESTER_GUIDE.md)
- [Beta Feedback Triage](./BETA_FEEDBACK_TRIAGE.md)

## 1. Beta Launch Decision

- [ ] Launch as a controlled private beta only.
- [ ] Invite a limited group of trusted contractors first.
- [ ] Pair each contractor with one or more known/friendly homeowner testers when possible.
- [ ] Keep broad public launch on hold.
- [ ] Use fake/test data freely only in sandbox/preview.
- [ ] Remove or clearly separate junk data before any real user account is used for customer-facing work.
- [ ] Treat beta feedback as product discovery, not final validation.
- [ ] Do not promise push/email/text reminders, payment processing, QuickBooks, native mobile apps, or full calendar sync.
- [x] Controlled beta launch docs are created and linked from this checklist.

## 2. Beta QA Operating Model

- [ ] Authenticated testing happens in sandbox/preview by default.
- [ ] Production checks remain read-only only unless a separate task explicitly approves mutation.
- [x] Required production smoke homeowner and contractor owner account credentials are configured for local operator use without documenting values.
- [x] Authenticated production read-only smoke preflight has passed for required homeowner and contractor owner credential names without printing values.
- [x] `TEST_APP_URL=https://servsync.app npm run qa:e2e:production-auth-readonly-smoke` passed required homeowner and contractor owner sign-in/navigation; it remains read-only and must not mutate records.
- [ ] Optional role credentials and optional stable smoke record IDs are configured only if separately approved.
- [ ] No production mutation happens without explicit approval.
- [ ] Sandbox/preview uses the expected Supabase project, not production.
- [ ] Test credentials stay in local env files or a password manager, never in commits/docs/chats/logs.
- [ ] `.env.test.local` is not committed.
- [ ] Screenshots, videos, traces, and Playwright reports are not committed.

## 3. Required Technical Checks

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` passes for release branches.
- [ ] Playwright read-only smoke tests pass against the intended sandbox/preview URL.
- [ ] Mobile read-only smoke test passes against the intended sandbox/preview URL.
- [ ] Mutating Playwright tests pass against sandbox/preview when the release touches those flows.
- [ ] Vercel deploy succeeds on `serv-sync-app-refresh`.
- [ ] Deployed commit matches the commit intended for beta testing.
- [ ] No old `serv-sync-app` check appears on new commits.
- [ ] No unrelated files are included in commits.
- [ ] No credentials, `.env` files, SQL secrets, screenshots, videos, traces, or reports are committed.
- [ ] Production public URL loads after merge/deploy.
- [ ] `TEST_APP_URL=https://servsync.app npm run qa:e2e:production-public-smoke` passes for unauthenticated public routes.
- [ ] FB-020 readiness items have been reviewed for the intended beta stage, especially RLS/storage verification, backup/restore expectations, dependency security triage, and records reliability risks.
- [x] Restore drill, applied-SQL ledger, production SQL rollout, and storage backup/readiness templates exist for sanitized evidence capture.
- [x] Local backup/restore/export/query-output/storage-export artifact ignore rules are in place before any future approved drill.
- [x] A non-production restore drill preflight plan exists for future separately approved restore drill execution.
- [x] A non-production restore drill operator checklist exists for future go/no-go review.
- [ ] A non-production restore drill has been completed and recorded with the approved template.
- [ ] Backup/restore and storage-object readiness remain tracked as FB-020 follow-ups until separately verified.
- [ ] Public, auth, legal, trust, and beta copy avoid fake/demo claims, unsupported compliance claims, or misleading data.

## 4. Sandbox QA Account Plan

Primary sandbox accounts:

- [ ] Primary contractor test account exists.
- [ ] Primary contractor profile is complete enough for service area, business profile, estimates, jobs, invoices, calendar, and Discover testing.
- [ ] Primary homeowner test account exists.
- [ ] Primary homeowner has at least one home/property.
- [ ] Primary homeowner and primary contractor have an active connection.
- [ ] Required sharing permissions are enabled for connected-contractor workflow testing.

RLS/cross-user sandbox accounts:

- [ ] Secondary homeowner test account exists.
- [ ] Secondary homeowner owns a separate home/property.
- [ ] Secondary contractor test account exists.
- [ ] Secondary contractor has a separate contractor profile.
- [ ] Secondary accounts are not connected to primary records unless a specific test creates that relationship.
- [ ] Secondary accounts can be used to verify unrelated records are not visible.

## 5. Sandbox Reusable Test Data

- [ ] Active homeowner service request with no estimate.
- [ ] Service request with a sent estimate.
- [ ] Accepted estimate with no linked job.
- [ ] Accepted estimate with linked job.
- [ ] Job in progress.
- [ ] Checklist/report job before finalization.
- [ ] Finalized/completed job with report.
- [ ] Completed job with no invoice.
- [ ] Draft invoice.
- [ ] Local-only draft invoice that cannot be sent through the homeowner portal.
- [ ] Sent/viewed invoice.
- [ ] Paid/closed invoice where supported.
- [ ] Invoice filed to Home History.
- [ ] Home History manual entry.
- [ ] Home History report-linked entry.
- [ ] Home History invoice-linked entry.
- [ ] Open manual Home Reminder.
- [ ] Completed Home Reminder.
- [ ] Dismissed Home Reminder.
- [ ] Home document upload.
- [ ] Service request attachment/photo if media testing is in scope.
- [ ] Contractor Discover post with real sandbox media if Discover testing is in scope.

Test data rules:

- [ ] Test records use clear prefixes such as `E2E Test`, `Smoke Test`, or `PR Preview Test`.
- [ ] App UI and existing app workflows are preferred over direct SQL.
- [ ] Direct sandbox SQL is used only after separate approval.
- [ ] No test/demo records are created in production unless production smoke accounts are approved.

## 6. Contractor Account Readiness

- [ ] Contractor can sign up.
- [ ] Contractor can log in.
- [ ] Contractor dashboard loads.
- [ ] Contractor onboarding checklist appears when appropriate.
- [ ] Contractor onboarding checklist updates from real app data.
- [ ] Company profile can be completed.
- [ ] Public/profile-facing credential fields use safe wording such as "listed" where appropriate.
- [ ] Local customer can be added.
- [ ] Local customer detail can be opened.
- [ ] Homeowner can be invited to ServSync from a local customer.
- [ ] Claim invite link can be copied.
- [ ] Connected homeowner can be viewed.
- [ ] Connected homeowner properties appear when shared.
- [ ] Property selector works for connected homeowner.
- [ ] Job can be created for a connected homeowner.
- [ ] Job can be created for the intended property.
- [ ] Service job flow works.
- [ ] Checklist/report workflow can be completed.
- [ ] Report can be finalized/filed.
- [ ] Estimate can be created.
- [ ] Estimate can be sent.
- [ ] Accepted estimate clearly leads to Create Job where appropriate.
- [ ] Invoice can be created.
- [ ] Invoice can be sent to a connected homeowner where supported.
- [ ] Local-only invoice send guidance is clear when no connected homeowner exists.
- [ ] Invoice can be marked paid where supported.
- [ ] Calendar loads.
- [ ] Appointment-related views do not show stale/fake summary counts.
- [ ] Support/feedback entry point works.
- [ ] Feedback can be drafted without exposing private customer details unnecessarily.

## 7. Homeowner Account Readiness

- [ ] Homeowner can sign up.
- [ ] Homeowner can log in.
- [ ] Homeowner dashboard loads.
- [ ] Homeowner onboarding checklist appears when appropriate.
- [ ] Homeowner onboarding checklist updates from real app data.
- [ ] Property can be added.
- [ ] Property can be selected.
- [ ] Selected property persists after refresh.
- [ ] Dashboard filters by selected property.
- [ ] Documents can be uploaded.
- [ ] Manual Documents-tab beta limits are enforced without blocking normal app usage: 10 MB per file, 250 MB per homeowner account, 100 MB per property, 50 active documents, and 100 MB monthly upload ledger.
- [ ] Documents can be viewed/downloaded.
- [ ] Documents can be deleted with confirmation.
- [ ] Estimates/invoices can be viewed.
- [ ] Estimate review flow works.
- [ ] Accepted estimate guidance explains the contractor creates, schedules, or completes the job/work next.
- [ ] Invoice view/download flow works.
- [ ] Eligible invoice can be filed to Home History.
- [ ] Filing the same invoice again does not create duplicate Home History rows.
- [ ] Home History shows completed work, filed reports, invoice/service records, notes, and warranty/follow-up context.
- [ ] Manual Home Reminder can be created.
- [ ] Manual Home Reminder can be completed.
- [ ] Manual Home Reminder can be dismissed.
- [ ] Reminder copy clearly says reminders are manual and do not send automatic emails, texts, or push alerts.
- [ ] Service request can be created.
- [ ] Service request uses the intended property.
- [ ] Contractor connection request works.
- [ ] Connected contractor appears correctly.
- [ ] Calendar loads.
- [ ] Homeowner calendar event modal opens for appointment events where test data exists.
- [ ] Support/feedback entry point works.
- [ ] Feedback can be drafted without asking for sensitive home details unnecessarily.

## 8. Privacy, RLS, And Trust Checks

- [ ] Homeowner cannot read another homeowner profile/home/documents.
- [ ] Homeowner cannot read another homeowner invoices, Home History, reminders, requests, reports, or private files.
- [ ] Contractor cannot read another contractor profile, customers, jobs, estimates, invoices, templates, or calendar records.
- [ ] Contractor cannot read homeowner contact/home details unless permissioned.
- [ ] Connected contractors cannot browse the homeowner private document library unless explicitly supported.
- [ ] Unconnected contractors cannot see private homeowner details.
- [ ] Contractor-filed reports appear only where intended.
- [ ] Contractor-filed report documents inherit the intended property where available.
- [ ] Secondary homeowner/contractor test accounts verify negative access cases.
- [ ] External Reviews and ServSync Reviews are clearly separate.
- [ ] ServSync Reviews only come from completed ServSync work.
- [ ] No fake ratings are shown.
- [ ] No fake review counts are shown.
- [ ] No fake metrics are shown.
- [ ] No unsupported "verified" claims are shown.
- [ ] No SOC 2, HIPAA, GDPR, CCPA, background check, license verification, or insurance verification claims appear unless actually supported.
- [ ] No stale counters or fake summary tiles remain.
- [ ] Unassigned-property warnings only appear when relevant.
- [ ] Support copy avoids asking for sensitive info unless necessary.
- [ ] Privacy & Data Requests page is reachable.
- [ ] Trust & Safety page is reachable.
- [ ] Terms, Privacy, Acceptable Use, and trust/legal links are reachable from public/auth areas where appropriate.

## 9. Multi-Property Checks

- [ ] Homeowner with one property is not shown irrelevant property warnings.
- [ ] Homeowner with multiple properties can switch properties.
- [ ] Dashboard follows selected property.
- [ ] Documents follow selected property.
- [ ] Home History follows selected property.
- [ ] Home Reminders follow selected property where applicable.
- [ ] Estimates/invoices follow selected property.
- [ ] Service requests follow selected property.
- [ ] Old unassigned records remain accessible from Unassigned views.
- [ ] All Properties views still show records across properties.
- [ ] Contractor connected-homeowner detail follows selected property.
- [ ] Contractor can switch connected-homeowner detail between selected property, all properties, and unassigned where supported.
- [ ] Job creation for connected homeowners uses the selected property.
- [ ] Property labels are clear enough to avoid choosing the wrong home.

## 10. Mobile / Responsive Checks

Automated mobile smoke:

- [ ] `npm run qa:e2e:mobile` passes against sandbox/preview.
- [ ] Mobile smoke remains read-only.
- [ ] Mutating/core-loop tests are not run through a broad global mobile project.

Homeowner mobile checks:

- [ ] Homeowner dashboard is usable on phone width.
- [ ] Homeowner mobile drawer opens, closes, and switches tabs reliably.
- [ ] Service Requests cards and actions wrap cleanly.
- [ ] Request creation remains usable on phone width.
- [ ] Estimates / Invoices cards and actions wrap cleanly.
- [ ] Home History cards, chips, linked actions, and reminder controls fit.
- [ ] Reminders dashboard card and Home History reminder controls are usable.
- [ ] Calendar and homeowner calendar event modal remain usable.
- [ ] Documents and Support views remain usable.

Contractor mobile checks:

- [ ] Contractor dashboard is usable on phone width.
- [ ] Contractor mobile drawer opens, closes, and switches tabs reliably.
- [ ] Contractor Homeowners/Customers layout stacks or adapts cleanly on small screens.
- [ ] Service Requests cards and Create/Open Estimate actions are usable.
- [ ] Estimate creation remains usable on phone width.
- [ ] Jobs overview and job cards are usable.
- [ ] Job completion/report workflow remains usable on phone width.
- [ ] Estimates / Invoices cards and actions are usable.
- [ ] Invoice creation/send state remains usable on phone width.
- [ ] Calendar event detail modal remains usable.
- [ ] Business Profile service area and ZIP coverage controls are usable.
- [ ] Cards/tiles do not overflow text.
- [ ] Buttons do not clip long labels.
- [ ] No horizontal scrolling appears on common mobile widths.
- [ ] Key actions are tappable.
- [ ] Forms remain usable on phone width.
- [ ] Full mobile workflow automation remains future work until manual mobile QA identifies stable, high-value targets.

## 11. Core Loop QA Gate

Before inviting controlled beta users, run a full sandbox pass for:

- [ ] Homeowner creates service request.
- [ ] Contractor reviews request.
- [ ] Contractor creates/sends estimate.
- [ ] Homeowner reviews/accepts estimate.
- [ ] Contractor sees accepted estimate and creates job.
- [ ] Contractor completes/finalizes job or report.
- [ ] Contractor creates/sends invoice.
- [ ] Homeowner views invoice.
- [ ] Homeowner files invoice to Home History.
- [ ] Homeowner sees invoice-linked Home History entry.
- [ ] Homeowner creates manual Home Reminder.
- [ ] Homeowner completes or dismisses reminder.

E2E coverage gap:

- [ ] Add a sandbox-only full core-loop Playwright test or documented manual equivalent before broader beta.
- [ ] Avoid brittle assertions for long helper copy.
- [ ] Prefer stable roles, headings, status chips, and unique E2E record names.

## 12. Production Smoke Policy

Current policy:

- [ ] Production checks are public/read-only only.
- [ ] `https://servsync.app` loads.
- [ ] Public/auth/legal/trust pages render.
- [ ] Sign-in page renders.
- [ ] No obvious public runtime/console errors.
- [ ] The unauthenticated production public smoke spec passes without secrets or sign-in.
- [x] The authenticated production read-only smoke spec passed preflight and required homeowner/contractor owner sign-in/navigation without mutation.
- [ ] Vercel production deployment succeeds on `serv-sync-app-refresh`.
- [ ] No authenticated production mutation is performed.

Before using production smoke accounts:

- [x] Dedicated production smoke homeowner account is approved for read-only smoke.
- [x] Dedicated production smoke contractor owner account is approved for read-only smoke.
- [ ] Optional contractor field tech/viewer smoke accounts are approved only if role-specific production smoke is needed.
- [x] Required credential storage is approved outside the repo.
- [x] Required credential values are not stored in repo/docs/chats/logs/screenshots/traces.
- [ ] Ignored/local credential files are not printed or pasted in reports, PRs, logs, screenshots, traces, or chat.
- [ ] If smoke or load-test credentials may have been exposed in a local terminal/session, those credentials are rotated before use.
- [ ] Personal, founder, beta-user, and non-smoke accounts are not used for automated production smoke.
- [x] Allowed authenticated production smoke actions are read-only navigation only.
- [x] Default authenticated production smoke is read-only navigation.
- [ ] Any production mutation is separately approved before the run.
- [ ] Any cleanup is exact-ID or approved-prefix scoped before the run.
- [ ] Optional stable smoke records are approved, clearly labeled, and isolated from real beta customer records before record-specific assertions are added.
- [ ] Production smoke accounts are not personal/founder accounts.

## 13. Beta Tester Onboarding Plan

- [ ] Start with 3 to 5 trusted contractors.
- [ ] Give each contractor a short test mission.
- [ ] Ask contractors to add a customer.
- [ ] Ask contractors to create a job.
- [ ] Ask contractors to complete service work or a checklist/report workflow.
- [ ] Ask contractors to file a report.
- [ ] Ask contractors to create and send an estimate.
- [ ] Ask contractors to create and send an invoice.
- [ ] Ask contractors to invite a homeowner to ServSync.
- [ ] Ask homeowners to view a filed report.
- [ ] Ask homeowners to upload a document.
- [ ] Ask homeowners to create a service request.
- [ ] Ask homeowners to view/file an invoice to Home History.
- [ ] Ask homeowners to create a manual Home Reminder.
- [ ] Ask testers to submit bugs, confusion, and feature suggestions through the in-app Support/feedback flow.
- [ ] Review feedback daily during the first beta week.

## 14. Known Non-Blockers For Private Beta

- [ ] Stripe/payment processing is not live yet.
- [ ] QuickBooks is not live yet.
- [ ] Push/email/text reminder automation can wait.
- [ ] Recurring reminders, scheduler/cron, and full calendar sync can wait.
- [ ] Native mobile apps can wait.
- [ ] Advanced admin analytics are not required yet.
- [ ] Full email automation can wait if invite links are manual/copy-link.
- [ ] Broad public marketing site can wait.
- [ ] Full mobile redesign can wait if core flows remain usable.
- [ ] Bulk reassignment/backfill tools for old unassigned records can wait.
- [ ] Contractor response templates and advanced automation can wait.
- [ ] Public marketplace growth and deeper Discover/feed strategy can wait.
- [ ] Contractor call tracking remains no-priority backlog.

## 15. Beta Blockers

- [ ] Login failures.
- [ ] Signup failures.
- [ ] Password reset failure.
- [ ] Users seeing other users' data.
- [ ] Homeowner private documents visible to contractors unexpectedly.
- [ ] Contractor-filed reports visible to the wrong homeowner or property.
- [ ] Estimates broken.
- [ ] Invoices broken.
- [ ] Report filing broken.
- [ ] Invoice-to-Home-History filing broken.
- [ ] Home Reminders broken.
- [ ] Claim invite flow broken.
- [ ] Service request creation broken.
- [ ] Property selection saving records to the wrong property.
- [ ] Playwright smoke tests failing.
- [ ] Full sandbox core-loop manual pass blocked.
- [ ] RLS/privacy verification blocked or failing.
- [ ] Critical mobile flow unusable.
- [ ] `npm run typecheck` failing.
- [ ] `npm run build` failing.
- [ ] Vercel deploy failing.
- [ ] Confusing stale/fake metrics shown to users.
- [ ] Unsupported trust, privacy, compliance, or verification claims visible in the app.

## 16. Recommended Next Build / QA Tasks

- [ ] Refresh this checklist after each major beta-readiness decision.
- [ ] Add a full sandbox core-loop Playwright test.
- [ ] Add invoice-to-Home-History Playwright coverage.
- [ ] Add Home Reminders Playwright coverage.
- [ ] Add RLS/cross-user verification tests or a documented manual checklist.
- [ ] Add a mobile read-only Playwright project or formal mobile manual QA checklist.
- [ ] Decide whether and when to add optional production smoke role credentials and optional stable smoke record IDs.
- [x] Add an unauthenticated production public smoke spec and document its allowed scope.
- [ ] Run a focused mobile polish pass.
- [x] Add sign-out cleanup for sensitive local draft storage.
- [ ] Create clearly labeled demo/sample data only after approval.
- [ ] Improve contractor marketing/onboarding copy.
- [x] Add lightweight beta tester instructions as a private beta guide.
- [x] Add a simple internal beta feedback triage process.
