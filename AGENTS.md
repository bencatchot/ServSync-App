# ServSync AI Workflow Instructions

These instructions apply to AI coding agents working in this repository.

## Required Planning Context

- Always review `docs/CODEX_WORKFLOW_TEMPLATE.md` before deciding task flow, approval gates, Builder Mode permissions, or risk-based routing for ServSync work.
- Always review `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md` before planning or implementing ServSync product changes.
- Always review `docs/servsync-master-plan/CHANGELOG.md` before making changes.
- Treat `docs/CODEX_WORKFLOW_TEMPLATE.md` as the source of truth for the ChatGPT <-> Codex workflow, Risk-Based Fast Track, and Builder Mode.
- Do not treat the master plan as blanket approval to change the app. Use it as planning context only.
- Keep implementation tasks narrow and explicitly approved.

## Codex Workflow Template

- Follow the risk-based workflow in `docs/CODEX_WORKFLOW_TEMPLATE.md`.
- After audit approval and Builder Mode approval, Codex may make routine in-scope coding decisions without returning for approval on every small file decision.
- Builder Mode may include creating or switching to the approved branch, editing in-scope files, running validation, committing, pushing the feature branch, opening or updating a PR, and allowing normal Vercel Preview or sandbox deployments that are part of the approved workflow.
- Hard approval gates still remain: no merge to `main`, manual production deploy, SQL/RLS/RPC/storage/auth/permissions/env/settings changes, production data or user-record changes, or scope expansion without explicit user approval.
- If a task exceeds the approved risk level or scope in `docs/CODEX_WORKFLOW_TEMPLATE.md`, stop and report before continuing.

## Master Plan And Changelog Updates

- After every approved app change, update `docs/servsync-master-plan/CHANGELOG.md` with:
  - date
  - branch
  - files changed
  - summary of change
  - reason for change
  - tests/checks run
  - known risks or follow-ups
- If the change affects roadmap, product direction, workflows, pricing, beta strategy, permissions, Discover, contractor onboarding, homeowner onboarding, invoices, estimates, jobs, timeline, reminders, or marketplace strategy, also update `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`.
- Do not update the changelog for audit-only tasks unless specifically asked.

## Safety Rules

- Never modify production deployment settings, Supabase schema/RLS/RPCs, Edge Functions, environment variables, or app code unless explicitly approved.
- No production deploys unless explicitly approved.
- Do not expose credentials, secrets, tokens, private keys, or service role keys.
- Do not commit `.env.test.local` or any local credential file.
- Do not include unrelated files or generated artifacts in commits.

## Branch And Release Discipline

- Start product/code work from latest `origin/main`.
- Create a fresh feature branch for each task unless the user explicitly instructs otherwise.
- Push feature branches for preview review when approved.
- Do not merge to `main` without explicit approval.
- Do not apply production SQL without explicit approval.

## Required Task Report

Return a report after every task with:

```text
ACTION
FILES MODIFIED
MASTER PLAN UPDATED: yes/no
CHANGELOG UPDATED: yes/no
TESTS RUN
RISKS
NEXT STEP
```
