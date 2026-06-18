# ServSync Master Plan Changelog

This changelog tracks approved app changes and master-plan updates that affect ServSync product direction, roadmap, workflows, beta strategy, or implementation context.

Do not update this changelog for audit-only tasks unless specifically requested.

## 2026-06-18

- Branch/task: direct documentation update from ChatGPT brainstorming chat
- Files changed:
  - `docs/servsync-master-plan/ServSync_Feature_Backlog.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added a living ServSync feature backlog document to track brainstormed product ideas, feature statuses, priorities, guardrails, implementation state, and current next steps across brainstorming and implementation chats.
- Reason for change: Keep a consistent source of truth for discussed ServSync feature direction separate from the changelog and master plan, especially as tasks move from brainstorming to audit, implementation, preview testing, and completion.
- Tests/checks run:
  - GitHub document creation/update only
  - Markdown sanity review by ChatGPT before commit
- Known risks or follow-ups:
  - This was a documentation-only direct update authorized by the user while Codex was busy with other work.
  - Future implementation tasks should update the backlog status when items move into audit, implementation, preview testing, or completion.

- Branch: `feature/structured-line-items-sql-foundation-v1`
- Files changed:
  - `servsync-structured-line-items-foundation.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added the SQL foundation patch for structured estimate and invoice line items by introducing nullable `line_title`, `customer_description`, `model_spec`, and `supply_status` columns on estimate and invoice line items, plus installer sequencing after the equipment line-type cleanup.
- Reason for change: Prepare the next estimate workflow slice so future app support can display a customer-facing line title, optional customer description, optional model/spec, and optional supply status while preserving legacy `description` as a fallback and keeping Price Required behavior unchanged.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL patch has been created but not applied; sandbox SQL application and verification require separate approval.
  - Production SQL application requires separate approval after sandbox verification passes.
  - App/UI support is still needed for structured estimate and invoice editing/display, including homeowner/PDF display, Build Estimate Draft structured output, template JSON support, saved-charge structured metadata decisions, and focused E2E coverage.

- Branch: `feature/estimate-equipment-sql-cleanup-v1`
- Files changed:
  - `servsync-estimate-equipment-line-type-cleanup.sql`
  - `scripts/apply-blank-supabase-schema.sh`
  - `scripts/apply-sql-dry-run.sh`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Added the PR 50B SQL cleanup patch that maps persisted `equipment` line-item values to `material`, normalizes estimate template JSON line items, and tightens estimate, invoice, and saved-charge `line_type` constraints to `labor`, `material`, `fee`, and `other`.
- Reason for change: PR #50 stopped future app-created `equipment` line items; this follow-up prepares the database cleanup and constraint tightening needed so legacy `equipment` values are removed and future direct database writes reject that line type.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - `bash -n scripts/apply-blank-supabase-schema.sh`
  - `bash -n scripts/apply-sql-dry-run.sh`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - SQL patch has been created but not applied; sandbox SQL application and verification require separate approval.
  - Production SQL application requires separate approval after sandbox verification passes.
  - Follow-up smoke should verify the direct saved-charge form, homeowner/PDF display, mobile layout, future structured line item fields, and PDF/homeowner subtotal refinements.

- Branch: `feature/estimate-equipment-line-type-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `src/types.ts`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Stopped future app-created estimate, invoice, saved-charge, Build Estimate Draft, and starter-template line items from using the `equipment` line type by treating equipment-style items as `material` while preserving defensive compatibility for legacy `equipment` records until SQL cleanup.
- Reason for change: Equipment is no longer intended to be a separate estimate/invoice line item category; tools, fixtures, appliances, HVAC units, panels, and similar equipment-style items should be categorized as material in new app-created records.
- Tests/checks run:
  - `git status --short --branch`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build`
  - `TEST_APP_URL=http://localhost:5173 npx playwright test --list`
  - Changed-file secret-value scan
- Known risks or follow-ups:
  - Later PR 50B should perform approved SQL data migration and constraint tightening after the deployed app no longer creates `equipment` line items.
  - Future slices may add structured line title/customer description/model/spec/supply status fields and PDF/homeowner subtotal refinements.

- Branch: `feature/build-estimate-draft-v3-cleanup-v1`
- Files changed:
  - `src/App.tsx`
  - `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
  - `docs/servsync-master-plan/CHANGELOG.md`
- Summary of change: Cleaned up the Build Estimate Draft workflow by moving Trade Tools behind a collapsed Advanced trade tools section, running trade/job inference only on Build, adding current-draft labor format selection, replacing prior generated builder content on rebuild, and improving scope-aware Plumbing sink/faucet/disposal draft lines.
- Reason for change: Contractors need faster draft generation without live typing noise, duplicate generated lines, internal helper copy in homeowner-facing estimate fields, or vague placeholder/contingency line items.
- Blocker follow-up: Tightened the scope-aware Plumbing fixture path so kitchen sink, faucet, and garbage-disposal replacement scopes consistently produce customer-facing material/equipment/labor lines in job-total and line-specific labor modes, and refined conditional fee triggers so permit/inspection/code fees and disposal/haul-off fees are added only when the rough scope calls for them.
