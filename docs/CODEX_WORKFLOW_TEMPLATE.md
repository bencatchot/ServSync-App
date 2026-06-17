# ServSync Codex Workflow Template

## Purpose

Use this template when starting a new ChatGPT chat for ServSync work. It keeps the ChatGPT <-> Codex workflow disciplined, reviewable, and explicit about approval gates.

This is an internal workflow template only. It is not product strategy, marketing copy, or a feature roadmap.

## Roles

| Role | Responsibility |
| --- | --- |
| User | Defines goals, makes scope decisions, approves implementation, approves merges, approves SQL, approves production deploys, approves env/Supabase/Vercel/data changes. |
| ChatGPT | Helps frame the task, reviews Codex replies, creates the next Codex prompt, keeps scope disciplined, separates live features from roadmap ideas. |
| Codex | Audits, implements only approved changes, runs checks, reports changed files, risks, and PR links when applicable. |

## Standard Workflow Loop

1. User describes the goal to ChatGPT.
2. ChatGPT prepares a Codex audit prompt.
3. User gives the prompt to Codex.
4. Codex audits and reports findings.
5. User brings the Codex report back to ChatGPT.
6. ChatGPT reviews the report and prepares an approval or implementation prompt.
7. Codex implements only approved work.
8. Codex reports changed files, checks, risks, and PR link when applicable.
9. User brings the Codex result back to ChatGPT.
10. ChatGPT prepares a verification or merge-approval prompt.
11. Codex verifies or merges only when explicitly approved.
12. Continue the loop until the task is complete.

## Risk-Based Fast Track

Not every task needs the same level of back-and-forth. Match the workflow to the risk level, and keep the scope explicit. Faster paths are acceptable only when the task is low-risk, clearly bounded, and does not touch app behavior, user data, permissions, SQL, auth, storage, production, env, or deploy settings.

If Codex discovers that a task is riskier than expected, it must stop and report instead of continuing.

### Low-Risk Fast-Track Path

Low-risk work may include documentation-only changes, content-only changes, harmless copy or wording cleanup, internal templates, non-app marketing docs, and other bounded edits that do not affect app behavior, user data, permissions, SQL, auth, storage, production, env, or deploy settings.

For low-risk work, Codex may briefly audit the relevant docs/files, implement the approved change in the same pass, run validation, commit/push/open a PR if requested, and report changed files, checks, risks, and the PR link.

Still required:

- No merge without explicit approval.
- No production deploy without explicit approval.
- No SQL/env/settings/data/user changes without explicit approval.
- Changelog update when files/docs change and changelog practice requires it.
- Master plan update only when appropriate.
- Changed-file secret scan.
- Clear return report with risk level, fast-track use, validation, risks, and stop conditions.

### Medium-Risk Path

Medium-risk work includes app UI or app behavior changes that do not touch SQL/RLS/auth/storage/env/production data. Examples include labels, helper text, layout polish, data-testid additions, minor frontend-only user experience changes, or simple non-sensitive workflow display improvements.

For medium-risk work, Codex may audit and implement in one pass only if the user explicitly authorizes "audit + implement in one pass." Otherwise, Codex should audit first and wait for approval.

### High-Risk Full Approval Path

High-risk work requires audit first and explicit approval before implementation. High-risk work includes SQL, schema, RPC, RLS, storage policies, auth, permissions, user access, private data, production data, Supabase/Vercel/env settings, Edge Functions, payments, accounting integrations, file/media access, core request/estimate/job/invoice lifecycle behavior, and anything that could expose, corrupt, delete, duplicate, or misroute user data.

### Risk-Based Workflow Instruction

Use this block in future Codex prompts when risk-based routing matters:

```text
Risk-Based Workflow Instruction:
- If this task is documentation-only, content-only, harmless copy cleanup, or an internal template update, briefly audit and then implement in the same pass if the scope is clear.
- If this task changes app behavior, data flow, permissions, SQL, RLS, auth, storage, Edge Functions, environment variables, production data, user access, or core workflow logic, stop after audit and wait for explicit approval before implementing.
- If you discover the task is riskier than expected, stop and report instead of continuing.
- Never merge, deploy production, apply SQL, change env/settings, create users, or touch production data without explicit approval.
```

Feature/function work and marketing work must remain separate. Marketing/content docs can be low-risk, but app feature implementation is not automatically low-risk. Roadmap ideas must not be treated as live features.

## Non-Negotiable Guardrails

- Codex must audit before coding unless explicitly told otherwise.
- Codex must not change code without explicit approval.
- Codex must not merge without explicit approval.
- Codex must not deploy production manually without explicit approval.
- Codex must not apply SQL without explicit approval.
- Codex must not change Supabase, Vercel, or env settings without explicit approval.
- Codex must not create users or touch production data without explicit approval.
- Codex must report changed files and checks.
- Codex must update the changelog when docs or app behavior change, unless the task is audit-only.
- Codex must read the master plan before deciding whether a change affects product direction, roadmap, workflow, or implementation strategy.
- Codex must not update the master plan unless the task changes product direction, roadmap decisions, user workflows, feature definitions, or implementation strategy.
- Codex must read the changelog before adding entries.
- Codex must not duplicate PR numbers, item numbers, task names, version labels, or changelog headings.
- Codex must not invent a PR number before a PR exists.
- Codex must keep changelog entry labels consistent with the existing changelog style.
- Codex must keep feature work separate from marketing work.
- Codex must not treat roadmap ideas as live features.

## Master Plan And Changelog Rules

Read `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md` before planning or implementing ServSync product changes. Use it to classify the task as workflow/process documentation, product-direction documentation, roadmap/planning documentation, marketing documentation, app implementation, test/QA documentation, or SQL/schema/RLS/RPC/storage work.

Update the master plan only when the task changes product direction, roadmap decisions, user workflows, feature definitions, or implementation strategy. Do not update it for simple operational docs, audit-only work, small copy fixes, small test updates, or implementation details that do not change direction.

Read `docs/servsync-master-plan/CHANGELOG.md` before adding a changelog entry. Identify the latest related entry and check existing labels before writing a new one.

When adding a changelog entry:

- Use the current date format and existing bullet style.
- Use the branch name or task name if no PR number exists.
- Use the correct PR number only after the PR exists.
- Do not duplicate PR numbers, item numbers, task names, version labels, or headings.
- Record files changed, summary, reason, checks, and known risks or follow-ups.
- If numbering or naming is unclear, stop and report the ambiguity instead of guessing.

If the task is audit-only and no files are modified, do not update the changelog.

## Standard Codex Audit Prompt Template

```text
TASK TYPE
Audit only. Do not modify files. Do not create a branch. Do not commit. Do not push. Do not open a PR. Do not deploy. Do not apply SQL.

TASK
[Task name]

Repo:
[Repo URL]

Risk level:
[Low / Medium / High]

Audit + implement in one pass allowed:
NO

Required starting state:
- Fetch origin.
- Checkout main.
- Pull latest origin/main.
- Confirm working tree is clean.

Required review:
- AGENTS.md
- docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md
- docs/servsync-master-plan/CHANGELOG.md
- [Additional docs/files]

Scope:
- [What to inspect]

Out of scope:
- [What not to inspect/change]

Files allowed to change:
- None. Audit only.

Files not allowed to change:
- All files. Audit only.

Stop conditions:
- If implementation is needed, stop and report.
- If the task is riskier than described, stop and report.
- If SQL/env/settings/data/user/deploy changes appear necessary, stop and report.

Master plan check:
- Classify whether this task affects product direction, roadmap, workflows, feature definitions, implementation strategy, marketing, QA, or SQL/schema/RLS/RPC/storage.
- Do not update the master plan in this audit.

Changelog check:
- Read the changelog.
- Identify the latest related entry and any relevant highest PR/item number or heading pattern.
- Do not add a changelog entry for audit-only work.

Questions to answer:
- [Question 1]
- [Question 2]
- [Question 3]

Return:
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
WHAT WAS CHECKED
FINDINGS
ISSUES FOUND
STOP CONDITIONS ENCOUNTERED: YES / NO
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Existing highest PR/item number or relevant latest entry:
- New changelog entry label used:
- Confirm no duplicate PR number/item number/heading was introduced:
RISK LEVEL
RECOMMENDED NEXT STEP
STATUS: READY FOR APPROVAL / NEEDS MORE AUDIT / BLOCKED
```

## Standard Codex Implementation Prompt Template

```text
TASK TYPE
Implementation approved for the narrow scope below.

TASK
[Task name]

Branch:
[feature/branch-name]

Repo:
[Repo URL]

Risk level:
[Low / Medium / High]

Audit + implement in one pass allowed:
[YES / NO]

Required starting state:
- Fetch origin.
- Checkout main.
- Pull latest origin/main.
- Confirm working tree is clean.
- Create/use branch: [feature/branch-name].

Required pre-work:
- Read AGENTS.md.
- Read docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md.
- Read docs/servsync-master-plan/CHANGELOG.md.
- Read [additional docs/files].

Approved scope:
- [Approved item 1]
- [Approved item 2]

Files allowed to change:
- [Allowed file/path]

Files not allowed to change:
- SQL/schema/RLS/RPC/storage policy files unless explicitly approved.
- Supabase Edge Functions unless explicitly approved.
- Vercel/env files unless explicitly approved.
- Production data or user records.
- [Other exclusions]

Stop conditions:
- If the task is riskier than the approved risk level, stop and report.
- If unapproved files must change, stop and report.
- If SQL/env/settings/data/user/deploy changes are needed, stop and report.
- If implementation would affect feature/marketing boundaries or turn roadmap ideas into live features, stop and report.

Master plan rules:
- Update the master plan only if this changes product direction, roadmap decisions, user workflows, feature definitions, or implementation strategy.
- If not updating, report why.

Changelog rules:
- Read the changelog before editing.
- Use the branch name or task name if no PR number exists.
- Do not invent PR numbers.
- Do not duplicate existing labels/headings.
- Update the changelog for non-audit docs/app behavior changes.

Validation required:
- git status --short --branch
- git diff --check
- [npm run typecheck / npm run build / Playwright list / SQL script check / Markdown sanity review]
- changed-file secret-value scan

Return:
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
FILES CHANGED
SUMMARY OF CHANGES
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Existing highest PR/item number or relevant latest entry:
- New changelog entry label used:
- Confirm no duplicate PR number/item number/heading was introduced:
CHANGELOG UPDATE
VALIDATION RUN
STOP CONDITIONS ENCOUNTERED: YES / NO
RISKS / FOLLOW-UPS
PR LINK, IF OPENED
STATUS

Do not merge.
Do not deploy.
```

## Standard Codex Verification Prompt Template

```text
TASK TYPE
Final pre-merge verification only. Do not modify files. Do not push. Do not merge. Do not deploy. Do not apply SQL.

PR:
[PR link]

Expected branch:
[feature/branch-name]

Latest commit to review:
[commit SHA]

Risk level:
[Low / Medium / High]

Verify:
- PR is open and mergeable.
- Source branch and target branch are correct.
- Branch is not behind main.
- Changed files match the approved scope.
- No unexpected SQL/env/settings/data/user/deploy changes occurred.
- Changelog entry is accurate and does not duplicate PR/item numbers, task names, version labels, or headings.
- Master plan was updated only if appropriate.
- Required tests/checks passed.
- Vercel project is correct if relevant.

Files allowed to change:
- [Expected changed files]

Files not allowed to change:
- [Unexpected files / SQL/env/settings/data/user/deploy files]

Stop conditions:
- If unexpected files or riskier behavior are found, report NEEDS FIXES or BLOCKED.
- If checks/deployment status are pending, report pending instead of marking ready.

Return:
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
BRANCH STATUS
CHANGED FILES
REVIEW SUMMARY
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Existing highest PR/item number or relevant latest entry:
- New changelog entry label used:
- Confirm no duplicate PR number/item number/heading was introduced:
CHECKS STATUS
ISSUES FOUND
STOP CONDITIONS ENCOUNTERED: YES / NO
UPDATE NEEDED: YES / NO
STATUS: READY TO MERGE / NEEDS FIXES / BLOCKED
RECOMMENDED NEXT STEP
```

## Standard Merge Approval Prompt Template

```text
TASK TYPE
Merge PR only.

PR:
[PR link]

APPROVED ACTION
Merge [PR number] into main.

Confirmed before approval:
- PR is open and mergeable.
- Branch is not behind main.
- Changed files are limited to the approved scope.
- Checks are passing.
- Changelog/master plan handling is correct.
- No unexpected SQL/env/settings/data/user/deploy changes occurred.

After merge:
- Confirm merge commit SHA.
- Confirm PR is closed/merged.
- Confirm main is updated.
- Confirm automatic Vercel check/deployment starts or completes if relevant.
- Confirm no manual deploy was performed.
- Confirm no SQL was applied unless explicitly approved.

Return:
ACTION
PRE-MERGE CHECKS
MERGE RESULT
MAIN STATUS
VERCEL / DEPLOY STATUS
SQL APPLICATION STATUS
NEXT RECOMMENDED STEP
STATUS

Do not deploy manually.
Do not start another branch.
```

## Standard Post-Merge Verification Prompt Template

```text
TASK TYPE
Post-merge verification only.

Context:
- PR: [PR number]
- Main commit: [merge/final commit SHA]
- Vercel deployment/check: [link if available]

Verify:
- Main includes the merge commit.
- Automatic checks/deployment completed on the expected project.
- Public app loads if relevant.
- Expected public or bundle evidence is present if safely inspectable.
- No manual deploy was performed.
- No SQL/env/settings/data/user changes happened unless explicitly approved.
- Authenticated production checks are skipped unless approved production smoke accounts exist.

Return:
ACTION
TARGET TESTED
DEPLOYMENT STATUS
PUBLIC / BUNDLE VERIFICATION RESULTS
AUTHENTICATED VERIFICATION
PRODUCTION DATA CHANGES
SQL / DEPLOY STATUS
ISSUES FOUND
RECOMMENDED NEXT STEP
STATUS
```

## Standard Codex Return Formats

### Audit Report

```text
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
WHAT WAS CHECKED
FINDINGS
ISSUES FOUND
STOP CONDITIONS ENCOUNTERED: YES / NO
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Existing highest PR/item number or relevant latest entry:
- New changelog entry label used:
- Confirm no duplicate PR number/item number/heading was introduced:
RISK LEVEL
RECOMMENDED NEXT STEP
STATUS
```

### Implementation Report

```text
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
FILES CHANGED
SUMMARY OF CHANGES
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Existing highest PR/item number or relevant latest entry:
- New changelog entry label used:
- Confirm no duplicate PR number/item number/heading was introduced:
CHANGELOG UPDATE
VALIDATION RUN
STOP CONDITIONS ENCOUNTERED: YES / NO
RISKS / FOLLOW-UPS
PR LINK
STATUS
```

### Verification Report

```text
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
BRANCH STATUS
CHANGED FILES
REVIEW SUMMARY
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Existing highest PR/item number or relevant latest entry:
- New changelog entry label used:
- Confirm no duplicate PR number/item number/heading was introduced:
CHECKS STATUS
ISSUES FOUND
STOP CONDITIONS ENCOUNTERED: YES / NO
UPDATE NEEDED: YES / NO
STATUS
RECOMMENDED NEXT STEP
```

### Post-Merge Report

```text
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
TARGET TESTED
DEPLOYMENT STATUS
VERIFICATION RESULTS
PRODUCTION DATA CHANGES
SQL / DEPLOY STATUS
ISSUES FOUND
STOP CONDITIONS ENCOUNTERED: YES / NO
RECOMMENDED NEXT STEP
STATUS
```

## Starting A New Chat With ChatGPT

Copy this into a new ChatGPT chat:

```text
I am working on ServSync. I use a controlled ChatGPT <-> Codex workflow. Help me keep this workflow disciplined and risk-based. For low-risk documentation/content/internal-template work, help me decide whether Codex can briefly audit and implement in one pass. For medium/high-risk app behavior, data, SQL, RLS, auth, storage, env, production, or core workflow work, keep the full audit -> approval -> implementation loop. Keep feature planning separate from marketing. Keep roadmap ideas separate from live features. Make sure Codex reads the master plan and changelog before changes. Make sure changelog entries do not duplicate PR numbers, item numbers, task names, version labels, or headings. Do not recommend merge/deploy/SQL/env/production changes without explicit approval.
```

## Notes

This document is a workflow template only. It should help the user, ChatGPT, and Codex keep a repeatable approval loop. It should not be used as permission to implement features, merge PRs, deploy production, apply SQL, change env/settings, create users, or modify production data.
