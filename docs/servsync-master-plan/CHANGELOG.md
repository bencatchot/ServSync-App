# ServSync Master Plan Changelog

This changelog tracks approved app changes and master-plan updates that affect ServSync product direction, roadmap, workflows, beta strategy, or implementation context.

Do not update this changelog for audit-only tasks unless specifically requested.

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
