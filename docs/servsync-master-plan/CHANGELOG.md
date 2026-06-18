# ServSync Master Plan Changelog

This changelog tracks approved app changes and master-plan updates that affect ServSync product direction, roadmap, workflows, beta strategy, or implementation context.

Do not update this changelog for audit-only tasks unless specifically requested.

## 2026-06-18

- Branch: `feature/build-estimate-draft-v3-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Cleaned up the Build Estimate Draft workflow by moving Trade Tools behind a collapsed Advanced trade tools section, running trade/job inference only on Build, adding current-draft labor format selection, replacing prior generated builder content on rebuild, and improving scope-aware Plumbing sink/faucet/disposal draft lines.
- Reason for change: Contractors need faster draft generation without live typing noise, duplicate generated lines, internal helper copy in homeowner-facing estimate fields, or vague placeholder/contingency line items.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - Relevant Playwright check/listing
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Authenticated preview smoke should verify both estimate composer surfaces, mobile layout, job-total and line-specific labor modes, saved-charge exact-match behavior, and kitchen sink/faucet/disposal output.
  - Future slices may add SQL-backed line name/customer description/model/spec/supply status fields, PDF/subtotal display refinements, and saved contractor language/settings, but this branch does not add those.

- Branch: `feature/build-estimate-draft-v2-rule-based-ui-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Replaced the old Smart estimate assistant with a compact rule-based Build Estimate Draft workflow in the contractor estimate composer, including trade/job-type selection, rough-scope input, conservative trade/job suggestions, and starter draft lines for HVAC, Plumbing, Electrical, Carpentry, and Other.
- Reason for change: Contractors need faster estimate draft creation while preserving the Price Required foundation, keeping generated lines editable/removable, and avoiding invented rough-scope pricing or AI-style automation claims.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - Relevant Playwright check/listing
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Authenticated preview smoke should verify the draft builder on both estimate composer surfaces with HVAC, Plumbing, Electrical, Carpentry, Other, trade mismatch suggestions, saved-charge match/no-match behavior, manual Add line, saved-charge quick-pick, and mobile layout.
  - This branch does not add SQL/schema/RLS/RPC/storage changes, AI generation, subscription gating, saved-charge metadata persistence, estimate-line source metadata, production data changes, or deployment behavior.

- Branch: `feature/estimate-price-required-foundation-v1`
- Files changed:
  - `src/App.tsx`
  - `src/types.ts`
  - `servsync-estimate-price-required-foundation.sql`
  - `servsync-estimate-job-approved-scope.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added the Slice 1 Price Required foundation for estimate line items so blank line pricing remains unpriced/price-to-be-confirmed instead of being converted to intentional `$0.00`, while preserving intentional zero-dollar line items and normal positive pricing.
- Reason for change: Contractors need a safe way to include known-scope line items whose price still needs confirmation without confusing homeowners, PDFs, totals, or downstream invoice compatibility.
- Sandbox blocker follow-up: Preserved intentional `$0.00` when persisted line items reload into estimate/invoice/template draft editors and updated accepted-estimate-to-job approved-scope text so unpriced lines say `Price to be confirmed` instead of `$0.00`.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL has not been applied to sandbox or production in this branch; separate approval is required before applying and verifying the patch.
  - Focused sandbox smoke should verify create/send warnings, homeowner display, PDF display, and estimate-to-invoice compatibility after the schema patch is applied.
  - This branch does not implement Build Estimate Draft v2, trade-specific estimating logic, AI generation, pricing-library redesign, or saved-charge quick-pick changes.

## 2026-06-17

- Branch: `docs/builder-mode-workflow-v1`
- Files changed:
  - `docs/CODEX_WORKFLOW_TEMPLATE.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a Builder Mode workflow to the Codex workflow template so Codex can proceed faster after an approved audit by making routine in-scope implementation decisions, committing, pushing, opening PRs, and using normal Preview/sandbox deployment flow while preserving explicit approval gates for merge to `main`, production deploys, SQL, permissions, auth, env/settings, users, and production data.
- Reason for change: Reduce unnecessary ChatGPT/Codex back-and-forth for approved implementation work while keeping production, database, permission, and user-data changes protected.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - Markdown sanity review
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - This is documentation/process-only and does not change app code, SQL/schema/RLS/RPC/storage policies, Supabase Edge Functions, Vercel/env/config files, production data, user records, or deployment behavior.

- Branch: `feature/contextual-connection-active-sharing-ui-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added homeowner active shared-property management UI in the Contractors tab so active connections can be edited with connection-level contact sharing and per-property Home overview, Address, and Preferred vendors permissions while keeping Photos/media disabled and deferred.
- Reason for change: Complete the next contextual connection UI slice by replacing active global permission editing with the deployed `servsync_update_connection_shared_properties` RPC and explicit shared-property drafts.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - This branch does not change SQL/schema/RLS/RPC files, Supabase/Vercel/env settings, storage policies, production data, contractor pending review UI, contractor connected-home active display, invite/referral-link acceptance, service request/job/estimate/invoice flows, general messaging, or photos/media sharing.
  - Authenticated sandbox/preview smoke is recommended before merge with a homeowner account that has at least two homes and an active contractor connection.

- Branch: `feature/contextual-connection-contractor-review-ui-v1`
- Files changed:
  - `src/App.tsx`
  - `src/types.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added Phase 2B-1 contractor review UI support for pending contextual connection requests by loading the new read-only pending-request RPC, showing the homeowner request message and masked selected-property permission summary, and routing accept/decline actions through the existing contextual response RPC.
- Reason for change: Let contractor managers review contextual homeowner connection requests with the per-property context needed for approval while avoiding direct pending shared-property table reads and direct legacy connection table updates.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Authenticated preview/sandbox smoke is still recommended to verify the contractor review UI with real pending contextual request data.
  - Active connection shared-property management, connected-home permission-display polish, invite/referral acceptance migration, and photos/media sharing remain later-phase work.
  - This branch does not change SQL/schema/RLS/RPC files, Supabase/Vercel/env settings, storage policies, production data, service request/job/estimate/invoice flows, homeowner active connection management, or contractor connected-home display behavior.

- Branch: `feature/contextual-connection-pending-review-rpc-v1`
- Files changed:
  - `servsync-contextual-connection-pending-review-rpc.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a narrow read-only SQL/RPC patch for contractor pending contextual connection request review so contractor owners/admin/office users can retrieve pending request messages and masked selected-property permission summaries before accepting or declining.
- Reason for change: Phase 2 audit found that `connection_request_contexts` is readable for pending requests but `connection_shared_properties` contractor SELECT is active-only; a SECURITY DEFINER review RPC provides the needed pending-request context without granting contractors direct `homes` access or broadening table RLS.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - Static SQL/RLS/RPC inspection
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL has not been applied to sandbox or production in this branch; separate approval is required before applying and verifying the patch.
  - Phase 2B frontend work is still needed to consume this RPC, migrate contractor accept/decline to `servsync_respond_to_connection_request`, and add homeowner active connection shared-property management.

- Branch: `feature/contextual-connection-homeowner-ui-v1`
- Files changed:
  - `src/App.tsx`
  - `src/types.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added Phase 1 homeowner contextual connection request UI with a reusable modal for selecting a contractor, optional request message, connection-level contact sharing, one or more homeowner properties, and per-property permissions for home overview, address, and preferred vendors while keeping photos/media deferred.
- Reason for change: Move primary homeowner connection request entry points onto the contextual connection RPC foundation so new requests can carry explicit per-property sharing choices under one homeowner-contractor connection.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Contractor invite/referral-link acceptance, contractor pending request review, active connection shared-property management, connected-home property permission display, and photos/media sharing remain separate later-phase work.
  - This branch does not change SQL/schema/RLS/RPC files, Supabase/Vercel/env settings, storage policies, production data, service request/job/estimate/invoice flows, or contractor UI.

- Branch: `feature/homes-field-work-privilege-hardening-v1`
- Files changed:
  - `servsync-homes-field-work-privilege-hardening.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a narrow follow-up SQL hardening patch that removes broad `public.homes` table privileges from `PUBLIC`, `anon`, and `authenticated`, re-grants only owner-flow `SELECT`, `INSERT`, and `UPDATE` access for authenticated users under existing RLS, and conditionally revokes client EXECUTE access from the legacy 7-argument `servsync_create_field_work` overload when present.
- Reason for change: A security audit found pre-existing metadata-level grants that were broader than needed and a production-only legacy field-work overload without the newer shared-property guardrail; this patch tightens privileges without changing `public.homes` RLS, dropping functions, changing frontend behavior, applying SQL, or deploying.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - Static SQL privilege inspection
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL has not been applied to sandbox or production in this branch; separate approval is required before applying and verifying the patch.
  - Follow-up sandbox verification should confirm homeowner-owned home SELECT/INSERT/UPDATE still works under RLS, anon/unrelated users cannot access homes, contractors cannot directly read homes, and the current 8-argument field-work RPC remains available while the legacy 7-argument overload is not client-executable.

- Branch: `feature/contextual-connection-shared-properties-rls-fix-v1`
- Files changed:
  - `servsync-connection-shared-properties-rls-fix.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a narrow follow-up SQL/RLS patch for contextual connection shared-property reads by moving the contractor shared-property row eligibility check into a `SECURITY DEFINER` helper and updating only the contractor SELECT policy to use that helper.
- Reason for change: Sandbox verification showed direct contractor SELECT from `public.connection_shared_properties` returned no rows because the contractor policy joined homeowner-owned `public.homes` under caller RLS; the fix preserves contractor shared-property reads without granting contractors direct `homes` access or changing homeowner/platform-admin policies.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - Static SQL/RLS inspection
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL has not been applied to sandbox or production in this branch; separate approval is required before applying and verifying the patch.
  - Follow-up sandbox verification should confirm direct contractor SELECT now returns only eligible shared-property rows and that field-work guardrails still reject unshared homeowner properties.

- Branch: `feature/contextual-connection-sql-foundation-v1`
- Files changed:
  - `servsync-connection-shared-properties.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added the SQL/RLS/RPC foundation for contextual homeowner-contractor connection requests with per-property shared permissions under one connection, durable request context message storage, homeowner submit/update RPCs, a narrow contractor response RPC, contractor connected-homeowner visibility based on explicit shared-property rows, beta-safe backfill from existing global home-overview sharing, a source-tagged temporary compatibility bridge for existing global permission saves, and a guardrail requiring contractor-created homeowner jobs to use an explicitly shared property unless tied to a homeowner-initiated service request.
- Reason for change: Implement the first approved SQL foundation slice for the PR #38 contextual connection product direction while keeping contact sharing connection-level and deferring frontend UI, media/photo storage, general messaging, and broader workflow changes.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - SQL syntax/dry-run inspection without applying SQL
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL has not been applied to sandbox or production; separate approval and verification are required before application.
  - App UI/types are unchanged in this slice, so later approved PRs are still needed for homeowner contextual request UI, contractor pending-request review UI, active connection permission editing, removal or narrowing of the temporary legacy compatibility bridge, and focused RLS/E2E coverage.
  - Photos/media remain later-phase and are not exposed by this SQL foundation.

- Branch: `feature/contextual-connection-product-spec-v1`
- Files changed:
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Updated the master plan with the approved contextual connection request product direction: one homeowner-contractor connection, multiple shared properties under that connection, per-property permissions for implemented property categories, relationship-level contact sharing, copy-from-property permission setup, contractor customer-view guardrails, existing-record routing for open work/history, beta-safe migration direction, and phased implementation guidance.
- Reason for change: Define the product/spec baseline before any SQL/RLS/RPC or app implementation for contextual connection requests and multi-property permission access.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - Documentation sanity review for roadmap-vs-live wording
  - Changelog duplicate label/heading check
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Documentation/product-spec only; no app code, tests, SQL/schema/RLS/RPC/storage policies, Supabase/Vercel/env settings, DNS, users, production data, deploys, or merges changed.
  - Future implementation still needs separate approval for SQL/RLS/RPC foundation, homeowner UI, contractor review UI, active connection editing, routing polish, and optional media/photo support.
  - Optional connection request photos/media remain later-phase because storage, media access, and RLS handling must be designed safely before implementation.

- Branch: `feature/codex-risk-based-fast-track-v1`
- Files changed:
  - `docs/CODEX_WORKFLOW_TEMPLATE.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added risk-based fast-track guidance to the Codex workflow template so low-risk documentation/content/internal-template tasks can be audited and implemented in one pass while medium/high-risk app, data, SQL, auth, storage, env, production, or core workflow tasks keep full approval gates.
- Reason for change: Make the ChatGPT <-> Codex workflow faster for clearly bounded low-risk work without weakening guardrails for changes that could affect app behavior, user data, permissions, production systems, or live feature claims.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - Markdown sanity review
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Documentation/process-only; no app code, tests, SQL/schema/RLS/RPC/storage policies, Supabase/Vercel/env settings, DNS, users, production data, deploys, or merges changed.
  - Master plan was not updated because this clarifies the operating workflow and does not change product direction, roadmap decisions, user workflows, feature definitions, or implementation strategy.

- Branch: `ops/retrigger-vercel-main-deploy-pr35-v1`
- Files changed:
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added an operational no-op changelog note to trigger a fresh GitHub -> Vercel production deployment event after PR #35 was already merged to `main` but did not create a visible Production deployment.
- Reason for change: Vercel missed the automatic Production deployment for merge commit `74e881ffd0243d2e7367fdd9cc077c02272a297b`, leaving `servsync.app` on the prior PR #34 bundle even though `main` includes the PR #35 saved-charge quick-pick code.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - This is a docs-only deployment-trigger PR. It does not change app behavior, tests, SQL/schema/RLS/RPC, Supabase/Vercel/env settings, DNS, production data, users, or manual deployment state.
  - After this PR is merged, verify that Vercel creates a Production deployment from the new `main` commit and that `servsync.app` includes the PR #35 quick-pick bundle.

- Branch: `feature/estimate-saved-charge-quick-pick-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added active saved-charge quick-pick controls to the contractor estimate composer so contractors can manually add saved flat or hourly charges into a draft as normal editable estimate line items.
- Reason for change: Complete the next Contractor Estimate Defaults & Templates slice after the saved-charge SQL/RLS foundation and Estimate Settings UI, while keeping saved charges manual, contractor-only, and separate from estimate templates and automatic estimate loading.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - This branch does not auto-load saved charges, does not persist saved-charge IDs on estimate line items, does not change homeowner estimate/PDF behavior beyond normal line-item content, and does not add SQL/schema/RLS/RPC, Supabase/Vercel/env settings, payments, QuickBooks, accounting, tax, production data, or deploy changes.
  - Authenticated preview testing should verify the quick-pick in the contractor estimate composer with the secondary sandbox contractor account if local setup supports it.

## 2026-06-16

- Branch: `feature/estimate-settings-saved-charges-ui-v1`
- Files changed:
  - `src/App.tsx`
  - `src/types.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added contractor Business Profile / Estimate Settings UI for managing saved estimate charges, including explicit saved-charge loading, create/edit, activate/deactivate controls, validation for names, nonnegative amounts, positive default quantities, and flat/hourly display support.
- Reason for change: Let contractor owners/admin/office users manage reusable estimate charge settings after the saved-charge SQL/RLS foundation was applied, while keeping saved charges separate from estimate creation until a future quick-pick integration.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - This branch does not add saved-charge quick-pick behavior to the estimate composer and does not auto-load charges into estimates.
  - No SQL/schema/RLS/RPC, Supabase/Vercel/env settings, production data, deploys, payments, QuickBooks, accounting, or tax behavior changed.
  - Future work should add estimate composer quick-pick integration and focused E2E/RLS coverage.

## 2026-06-16

- Branch: `feature/estimate-saved-charges-sql-v1`
- Files changed:
  - `servsync-contractor-saved-estimate-charges.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added the SQL/RLS foundation for contractor saved estimate charges and hardened existing estimate template access with team-aware read policies and owner/admin/office estimate-settings management policies.
- Reason for change: Prepare the backend layer for future contractor Estimate Settings, reusable flat/hourly saved charges, and continued estimate template use without adding UI, auto-loading charges, changing historical estimates, or introducing payments, QuickBooks, accounting, or tax behavior.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL was not applied to sandbox or production in this branch.
  - This branch does not add contractor UI, estimate composer changes, saved-charge quick-pick behavior, template editor UI, payment/accounting/tax behavior, Supabase/Vercel/env setting changes, production data, or deploy changes.
  - Future work should add contractor Estimate Settings UI, saved-charge quick-pick integration, focused E2E/RLS coverage, and sandbox SQL verification after review.

## 2026-06-16

- Branch: `feature/admin-invite-leads-badge-review-action-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a platform-admin "Start review" action for new contractor invite leads that moves the lead from `new` to `researching`, allowing the Invite Leads badge to represent leads still waiting for first admin attention.
- Reason for change: The Invite Leads tab badge counted `new` leads, but viewing the tab or copying manual outreach text did not persist a reviewed state, so the badge could remain visible after admin interaction.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - UI-only admin badge cleanup; no SQL/schema/RLS/RPC, Supabase/Vercel/env settings, production data, user records, notifications, automation, broad notification infrastructure, deploys, or unrelated admin redesign changes are included.
  - Authenticated admin visual verification still requires an approved platform-admin sandbox/preview account.

## 2026-06-16

- Branch: `feature/admin-homeowners-overview-tile-fix-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Fixed the platform-admin overview Homeowners tile by adding a read-only Homeowners admin tab, rendering basic homeowner account profile information from already-loaded profile data, and routing the Homeowners overview tile to that tab.
- Reason for change: The Homeowners overview tile was clickable but fell through to the default overview route, so it appeared to do nothing while the Contractors tile routed correctly.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Read-only admin UI fix; no SQL/schema/RLS, Supabase/Vercel/env settings, production data, user records, deploys, homeowner profile editing, exports, deletes, impersonation, notifications, or automation changed.
  - Authenticated admin visual verification still requires an approved platform-admin sandbox/preview account.

## 2026-06-16

- Branch: `feature/codex-workflow-template-v1`
- Files changed:
  - `docs/CODEX_WORKFLOW_TEMPLATE.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added an internal ChatGPT <-> Codex workflow template for starting new ServSync planning/build chats, including role definitions, standard audit/implementation/verification/merge/post-merge prompt templates, guardrails, and master plan/changelog rules.
- Reason for change: Provide a reusable workflow reference so ChatGPT and Codex keep ServSync work scoped, auditable, and gated by explicit approval before implementation, merges, deploys, SQL, env/settings, or production data changes.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - Markdown sanity review
  - Changed-file secret scan
- Known risks or follow-ups:
  - Documentation-only; no app code, tests, SQL/schema/RLS/storage policies, Supabase/Vercel/env settings, users, production data, deploys, or merges changed.
  - Master plan was not updated because this is workflow/process documentation and does not change product direction, roadmap decisions, user workflows, feature definitions, or implementation strategy.

## 2026-06-16

- Branch: `feature/invite-leads-label-contrast-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Improved label contrast in the platform-admin Invite Leads queue by applying higher-contrast label styling to the dark admin filter, detail/edit, and manual outreach fields.
- Reason for change: Make the Invite a Contractor admin review queue easier to read and use on the dark admin background without changing workflow behavior.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - UI-only contrast fix; no SQL/schema/RLS, notifications, automation, production data, or deploy changes are included.
  - Authenticated admin visual verification remains pending until an approved admin preview/sandbox account is available.

## 2026-06-16

- Branch: `feature/invite-contractor-admin-review-queue-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a platform-admin Invite Leads queue for homeowner-submitted contractor invite leads, including explicit safe-column loading, search/status filtering, lead detail cards, admin/homeowner status updates, outreach tracking fields, matched-contractor selection, and copyable manual email/text outreach templates.
- Reason for change: Give ServSync owners a manual review and follow-up workflow for the homeowner-facing "Invite a contractor to ServSync" feature while keeping invite leads separate from service requests, connection requests, contractor search, Discover, notifications, and automation.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - This branch intentionally does not select, render, or edit `admin_notes`; private/internal notes should wait for a separate DB-level hardening step.
  - Outreach templates are copy-only and do not send email/text automatically or increment outreach counts automatically.
  - No SQL/schema/RLS, notifications, 30-day no-response automation, contractor claim flow, Discover integration, production data, or deploy changes are included.

## 2026-06-16

- Branch: `feature/invite-contractor-homeowner-ui-v1`
- Files changed:
  - `src/App.tsx`
  - `tests/e2e/homeowner-smoke.spec.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added homeowner-facing "Invite a contractor to ServSync" UI v1 with a Contractors-tab invite button, homeowner-safe invite status list, shared invite modal, and Service Requests helper link.
- Reason for change: Let homeowners recommend contractors for ServSync follow-up while keeping the feature separate from service requests, connection requests, contractor search, Discover posts, admin review, and notification automation.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/homeowner-smoke.spec.ts`
  - Changed-file secret scan
- Known risks or follow-ups:
  - The UI intentionally selects only homeowner-safe invite lead fields and does not render admin/status outreach fields.
  - Follow-up work remains for admin review UI, outreach templates, notifications or automation, and contractor claim/connection flows.

## 2026-06-16

- Branch: `feature/invite-contractor-sql-privilege-hardening-v1`
- Files changed:
  - `servsync-homeowner-contractor-invite-leads-privilege-hardening.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a tracked follow-up SQL hardening patch for homeowner contractor invite leads that revokes unintended broad table and RPC privileges, then re-grants only the minimum intended authenticated select, column-limited insert, column-limited admin update, and authenticated RPC execute surface.
- Reason for change: Production metadata verification showed broad `anon` and `authenticated` table ACLs, including metadata-level DELETE, plus public RPC execute visibility. RLS and RPC checks still blocked effective unauthorized access, but the metadata-level privilege surface needed to be tightened before UI work.
- Tests/checks run:
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - `git diff --check`
  - Changed-file secret scan
- Known risks or follow-ups:
  - SQL was not applied to sandbox or production in this branch.
  - This branch does not add homeowner UI, admin UI, notifications, outreach templates, email/text automation, or deploy changes.
  - Homeowner own-row select still exposes row columns, including `admin_notes`, until a future admin-only view/RPC/table hardening is approved.

## 2026-06-16

- Branch: `feature/invite-contractor-sql-rls-foundation-v1`
- Files changed:
  - `servsync-homeowner-contractor-invite-leads.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added the tracked SQL/RLS foundation for homeowner-submitted contractor invite leads, including constrained lead statuses, duplicate-review indexes, homeowner-owned select/insert policies, platform-admin read/status update policies, and a guarded homeowner submission RPC.
- Reason for change: Prepare the database layer for the future "Invite a contractor to ServSync" homeowner growth feature while keeping it separate from service requests, connection requests, contractor search, Discover posts, existing contractor invite records, UI, notifications, and outreach automation.
- Tests/checks run:
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - `git diff --check`
  - Changed-file secret scan
- Known risks or follow-ups:
  - SQL was not applied to sandbox, production, or a throwaway blank schema in this branch.
  - This branch does not add homeowner UI, admin UI, notifications, outreach templates, email/text automation, test data, or production SQL application.
  - Future PRs should add homeowner submission/status UI, admin review/update UI, copyable outreach templates, and targeted E2E/RLS coverage after SQL review and sandbox application.

## 2026-06-16

- Branch: `feature/homeowner-beta-one-pager-v1`
- Files changed:
  - `docs/HOMEOWNER_BETA_ONE_PAGER.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a homeowner-facing private beta one-pager with clear positioning, beta fit, testable homeowner workflows, limitations, feedback guidance, getting-started steps, and short text/email versions.
- Reason for change: Prepare a practical founder-sendable homeowner beta handout for friendly homeowner testers paired with trusted beta contractors without overpromising payments, QuickBooks, automatic reminders, native mobile apps, full calendar sync, broad marketplace behavior, public self-serve launch, or other future capabilities.
- Tests/checks run:
  - `git diff --check`
  - Markdown sanity review of changed docs
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Documentation/content-only; no app code, tests, SQL, schema, RLS, storage policies, Edge Functions, Vercel settings, environment variables, users, production data, deploys, or beta messages were changed or sent.
  - FAQ, landing page sections, social ad concepts, and short video scripts remain future marketing artifacts.

## 2026-06-16

- Branch: `feature/contractor-beta-one-pager-v1`
- Files changed:
  - `docs/CONTRACTOR_BETA_ONE_PAGER.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a contractor-facing private beta one-pager with concise positioning, beta fit, testable workflows, limitations, feedback guidance, getting-started steps, and short text/email versions.
- Reason for change: Prepare a practical founder-sendable contractor beta handout for the first 2 to 3 trusted contractors without overpromising payments, QuickBooks, automatic reminders, native mobile apps, full calendar sync, public marketplace lead generation, or other future capabilities.
- Tests/checks run:
  - `git diff --check`
  - Markdown sanity review of changed docs
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Documentation/content-only; no app code, tests, SQL, schema, RLS, storage policies, Edge Functions, Vercel settings, environment variables, users, production data, deploys, or beta messages were changed or sent.
  - Homeowner beta one-pager, FAQ, landing page sections, social ad concepts, and short video scripts remain future marketing artifacts.

## 2026-06-16

- Branch: `feature/marketing-product-inventory-v1`
- Files changed:
  - `docs/MARKETING_PRODUCT_INVENTORY.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a marketing product inventory and source-of-truth brief that separates ServSync live, beta, manual, and future-facing capabilities for future marketing plans, flyers, ads, landing-page copy, and video scripts.
- Reason for change: Give future marketing work a grounded feature/function inventory with claim guardrails so controlled-beta messaging stays honest and does not overpromise payments, QuickBooks, automatic reminders, native mobile apps, full calendar sync, broad marketplace behavior, or unsupported trust/security claims.
- Tests/checks run:
  - `git diff --check`
  - Markdown sanity review of changed docs
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Documentation-only; no app code, tests, SQL, schema, RLS, storage policies, Edge Functions, Vercel settings, environment variables, users, production data, deploys, or marketing campaigns were changed or launched.
  - Recommended next marketing assets remain future work: one-page contractor/homeowner flyers, FAQ, landing-page sections, social ad concepts, and short video scripts.

## 2026-06-16

- Branch: `feature/beta-invite-message-kit-v1`
- Files changed:
  - `docs/BETA_INVITE_MESSAGES.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a controlled beta invite message kit with contractor and homeowner invite drafts, short text-message versions, agree-to-join follow-up copy, first-test checklists, known-limitations wording, and first-use feedback prompts.
- Reason for change: Prepare practical founder-facing beta outreach content for the first 2 to 3 trusted contractors and friendly homeowner testers while keeping private beta expectations honest and clear.
- Tests/checks run:
  - `git diff --check`
  - Markdown sanity review of changed docs
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Documentation/content-only; no app code, tests, SQL, schema, RLS, storage policies, Edge Functions, Vercel settings, environment variables, users, production data, deploys, or beta invitations were changed or sent.
  - Payments/Stripe, QuickBooks, push/email/text reminders, recurring reminders, native mobile apps, full calendar sync, and broad Discover/feed marketplace behavior remain not live and should not be promised.

## 2026-06-16

- Branch: `feature/controlled-beta-launch-docs-v1`
- Files changed:
  - `docs/BETA_LAUNCH_PLAN.md`
  - `docs/BETA_TESTER_GUIDE.md`
  - `docs/BETA_FEEDBACK_TRIAGE.md`
  - `docs/BETA_READINESS_CHECKLIST.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added controlled private beta launch documentation, including a launch plan, tester guide, and internal feedback triage template, and linked those docs from the beta readiness checklist.
- Reason for change: Prepare practical, honest beta operating materials for a small private beta without implying public go-live, payment readiness, reminder automation, QuickBooks, native mobile, full calendar sync, or broad marketplace readiness.
- Tests/checks run:
  - `git diff --check`
  - Markdown sanity review of changed docs
  - Secret scan on changed diff
- Known risks or follow-ups:
  - Documentation-only; no app code, tests, SQL, schema, RLS, storage policies, Edge Functions, Vercel settings, environment variables, users, production data, deploys, or public launch changes were made.
  - Production smoke accounts, payment/Stripe activation, QuickBooks, push/email/text reminders, recurring reminders, native mobile apps, full calendar sync, and broad Discover/feed marketplace behavior remain future-facing.

## 2026-06-16

- Branch: `feature/storage-media-access-e2e-v1`
- Files changed:
  - `tests/e2e/storage-media-access.spec.ts`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a guarded sandbox-only Playwright storage/media access spec that verifies private home document, support attachment, finalized report media, and finalized report document access boundaries across primary and secondary homeowner/contractor test accounts.
- Reason for change: Turn the approved sandbox storage fixture setup into repeatable beta-critical storage/media access verification without changing app code, schema, RLS, storage policies, Edge Functions, Vercel settings, users, or production data.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/storage-media-access.spec.ts`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/rls-cross-user.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - The new spec depends on the approved `Storage QA 20260616134147` sandbox fixture records and is not intended for production.
  - Contractor viewer/team-member media tests, contractor-assets own-folder hardening, production smoke accounts, and broad sandbox cleanup remain deferred.

## 2026-06-16

- Branch: `feature/local-draft-signout-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `tests/e2e/signout-local-storage.spec.ts`
  - `docs/BETA_READINESS_CHECKLIST.md`
  - `docs/GO_LIVE_AUDIT.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added targeted sign-out cleanup for sensitive ServSync local browser state, including contractor field-work drafts and lightweight homeowner/contractor search or selected-customer context, while preserving harmless setup, walkthrough, active-tab, and view preferences.
- Reason for change: Address the beta/go-live local draft storage risk found in the sign-out audit without wiping unrelated browser storage or changing Supabase auth behavior.
- Tests/checks run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/signout-local-storage.spec.ts`
  - `TEST_APP_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/homeowner-smoke.spec.ts tests/e2e/contractor-smoke.spec.ts`
  - Secret scan on changed diff
- Known risks or follow-ups:
  - A future user-facing "clear local drafts" control may still be useful for shared-device situations.

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
