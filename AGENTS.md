# ServSync AI Workflow Instructions

These instructions apply to AI coding agents working in this repository.

## Required Planning Context

- Always review `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md` before planning or implementing ServSync product changes.
- Always review `docs/servsync-master-plan/CHANGELOG.md` before making changes.
- Do not treat the master plan as blanket approval to change the app. Use it as planning context only.
- Keep implementation tasks narrow and explicitly approved.

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
