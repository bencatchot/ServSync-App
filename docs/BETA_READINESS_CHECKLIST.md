# ServSync Private Beta Readiness Checklist

Internal operating checklist for deciding whether ServSync is ready to invite live contractor beta testers.

## 1. Beta Launch Decision

- [ ] Launch as a private beta only.
- [ ] Invite a limited group of trusted contractors first.
- [ ] Keep broad public launch on hold.
- [ ] Use fake/test data freely until real beta users begin.
- [ ] Remove or clearly separate junk data before any real user account is used for customer-facing work.
- [ ] Treat beta feedback as product discovery, not final validation.

## 2. Required Technical Checks

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Playwright smoke tests pass against the intended beta URL.
- [ ] Vercel deploy succeeds.
- [ ] Deployed commit matches the commit intended for beta testing.
- [ ] No unrelated files are included in commits.
- [ ] No credentials are committed.
- [ ] No `.env` files are committed.
- [ ] No screenshots, videos, traces, or Playwright reports are committed.
- [ ] Test credentials remain in environment variables only.

## 3. Contractor Account Readiness

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
- [ ] Inspection/service job flow works.
- [ ] Checklist/report workflow can be completed.
- [ ] Report can be finalized/filed.
- [ ] Estimate can be created.
- [ ] Estimate can be sent.
- [ ] Invoice can be created.
- [ ] Invoice can be sent.
- [ ] Invoice can be marked paid where supported.
- [ ] Calendar loads.
- [ ] Appointment-related views do not show stale/fake summary counts.
- [ ] Support/feedback entry point works.
- [ ] Feedback can be drafted without exposing private customer details unnecessarily.

## 4. Homeowner Account Readiness

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
- [ ] Documents can be viewed/downloaded.
- [ ] Documents can be deleted with confirmation.
- [ ] Estimates/invoices can be viewed.
- [ ] Estimate review flow works.
- [ ] Invoice view/download flow works.
- [ ] Service request can be created.
- [ ] Service request uses the intended property.
- [ ] Contractor connection request works.
- [ ] Connected contractor appears correctly.
- [ ] Home history/maintenance log works.
- [ ] Calendar loads.
- [ ] Support/feedback entry point works.
- [ ] Feedback can be drafted without asking for sensitive home details unnecessarily.

## 5. Privacy And Trust Checks

- [ ] Homeowner private documents are not visible to contractors.
- [ ] Connected contractors cannot browse the homeowner private document library.
- [ ] Contractor-filed reports appear only where intended.
- [ ] Contractor-filed report documents inherit the intended property where available.
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

## 6. Multi-Property Checks

- [ ] Homeowner with one property is not shown irrelevant property warnings.
- [ ] Homeowner with multiple properties can switch properties.
- [ ] Dashboard follows selected property.
- [ ] Documents follow selected property.
- [ ] Maintenance history follows selected property.
- [ ] Estimates/invoices follow selected property.
- [ ] Service requests follow selected property.
- [ ] Old unassigned records remain accessible from Unassigned views.
- [ ] All Properties views still show records across properties.
- [ ] Contractor connected-homeowner detail follows selected property.
- [ ] Contractor can switch connected-homeowner detail between selected property, all properties, and unassigned where supported.
- [ ] Job creation for connected homeowners uses the selected property.
- [ ] Property labels are clear enough to avoid choosing the wrong home.

## 7. Mobile / Responsive Checks

- [ ] Contractor dashboard is usable on phone width.
- [ ] Homeowner dashboard is usable on phone width.
- [ ] Contractor Homeowners/Customers sidebar behaves properly on desktop.
- [ ] Contractor Homeowners/Customers layout stacks or adapts cleanly on small screens.
- [ ] Cards/tiles do not overflow text.
- [ ] Buttons do not clip long labels.
- [ ] No horizontal scrolling appears on common mobile widths.
- [ ] Key actions are tappable.
- [ ] Forms remain usable on phone width.
- [ ] Calendar and Support views remain usable on phone width.

## 8. Beta Tester Onboarding Plan

- [ ] Start with 3 to 5 trusted contractors.
- [ ] Give each contractor a short test mission.
- [ ] Ask contractors to add a customer.
- [ ] Ask contractors to create a job.
- [ ] Ask contractors to complete field work or an inspection checklist.
- [ ] Ask contractors to file a report.
- [ ] Ask contractors to create and send an estimate.
- [ ] Ask contractors to create and send an invoice.
- [ ] Ask contractors to invite a homeowner to ServSync.
- [ ] Ask homeowners to view a filed report.
- [ ] Ask homeowners to upload a document.
- [ ] Ask homeowners to create a service request.
- [ ] Ask testers to submit bugs, confusion, and feature suggestions through the in-app Support/feedback flow.
- [ ] Review feedback daily during the first beta week.

## 9. Known Non-Blockers For Private Beta

- [ ] Stripe/payment processing is not live yet.
- [ ] Advanced admin analytics are not required yet.
- [ ] Full email automation can wait if invite links are manual/copy-link.
- [ ] Broad public marketing site can wait.
- [ ] Deep workflow Playwright tests can be added after smoke tests.
- [ ] Full mobile redesign can wait if core flows remain usable.
- [ ] Bulk reassignment/backfill tools for old unassigned records can wait.
- [ ] Contractor response templates and advanced automation can wait.
- [ ] Public marketplace growth features can wait.

## 10. Beta Blockers

- [ ] Login failures.
- [ ] Signup failures.
- [ ] Users seeing other users' data.
- [ ] Homeowner private documents visible to contractors.
- [ ] Contractor-filed reports visible to the wrong homeowner or property.
- [ ] Estimates broken.
- [ ] Invoices broken.
- [ ] Report filing broken.
- [ ] Claim invite flow broken.
- [ ] Service request creation broken.
- [ ] Property selection saving records to the wrong property.
- [ ] Playwright smoke tests failing.
- [ ] `npm run typecheck` failing.
- [ ] `npm run build` failing.
- [ ] Vercel deploy failing.
- [ ] Confusing stale/fake metrics shown to users.
- [ ] Unsupported trust, privacy, compliance, or verification claims visible in the app.

## 11. Recommended Next Build Tasks

- [ ] Add deeper Playwright mutating workflow tests.
- [ ] Add a contractor workflow test for local customer, job, report, estimate, and invoice.
- [ ] Add a homeowner workflow test for property, document, request, and financial record viewing.
- [ ] Run a focused mobile polish pass.
- [ ] Compact contractor/customer detail related-record previews into cleaner rows.
- [ ] Create demo/sample data that is clearly labeled as fake.
- [ ] Improve contractor marketing/onboarding copy.
- [ ] Add lightweight beta tester instructions inside Support or onboarding.
- [ ] Add a simple internal beta feedback review process.
