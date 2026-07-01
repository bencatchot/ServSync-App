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
6. ChatGPT and the user decide whether to use the full approval loop or Builder Mode.
7. ChatGPT prepares an approval, Builder Mode proceed, or implementation prompt.
8. Codex implements only approved work.
9. Codex reports changed files, Backlog Impact, checks, risks, and PR link when applicable.
10. User brings the Codex result back to ChatGPT.
11. ChatGPT prepares a verification or merge-approval prompt.
12. Codex verifies or merges only when explicitly approved.
13. Continue the loop until the task is complete.

## Builder Mode

Builder Mode is the faster workflow for approved feature/fix implementation after the initial audit has already happened. It is meant to reduce routine back-and-forth while preserving hard gates for production, SQL, permissions, auth, environment settings, and user data.

Use Builder Mode when:

1. ChatGPT and the user have brainstormed the desired feature or fix and defined the intended outcome.
2. ChatGPT has given Codex an initial audit prompt.
3. Codex has audited the repo and recommended an implementation path.
4. The user has brought the audit back to ChatGPT.
5. ChatGPT and the user agree the path is good.
6. ChatGPT gives Codex a Builder Mode proceed prompt with approved scope, stop conditions, and final return format.

Once Builder Mode is approved, Codex may implement the approved scope without returning for approval on routine coding decisions. Routine coding decisions include local component structure, small helper functions, naming that follows existing patterns, minor copy needed to make the approved UI coherent, and focused tests or validation needed for the approved change.

Builder Mode may include:

- Creating or switching to the approved feature branch.
- Editing in-scope files.
- Running local validation.
- Committing approved changes.
- Pushing the feature branch to GitHub.
- Opening or updating a pull request.
- Triggering Vercel Preview or sandbox deployments that normally happen from feature branches or PRs.

Builder Mode does not allow:

- Merging the PR branch into `main` without explicit user approval.
- Manually deploying production without explicit user approval.
- Applying SQL without explicit user approval.
- Changing RLS, RPC, storage policies, auth, permissions, Supabase settings, Vercel settings, env values, production data, or user records without explicit user approval.
- Expanding into another user-facing workflow, data behavior, permission rule, database behavior, production setting, or core lifecycle behavior outside the approved scope.

If Codex discovers that the implementation may affect another user-facing workflow, data behavior, permission rule, database behavior, production setting, or core lifecycle behavior outside the approved scope, it must stop and ask before continuing.

Important wording:

- Do not say Codex cannot "push" generally. Pushing a feature branch or PR branch is allowed after Builder Mode approval.
- "Merge" means combining the PR branch into `main`; this can trigger production deployment and requires explicit approval.
- Vercel Preview or sandbox deployments from feature branches are allowed more liberally when they are part of the approved Builder Mode workflow.
- Production remains protected by requiring explicit approval before merge to `main` or manual production deploy.

After Builder Mode approval, ChatGPT's role is to interpret Codex reports/questions, help the user understand risks, and help decide when Codex asks for approval. ChatGPT should not micromanage every routine file change once the implementation path is approved.

## Builder Mode Proceed Prompt Template

```text
TASK TYPE
Builder Mode implementation approved. Audit has already been completed and approved. Implement the approved scope without returning for approval on routine coding decisions.

TASK
[Task name]

Repo:
[Repo URL]

Branch:
[feature/branch-name]

Risk level:
[Low / Medium / High]

Approved outcome:
- [Outcome 1]
- [Outcome 2]

Approved implementation path:
- [Implementation path item 1]
- [Implementation path item 2]

Builder Mode permission:
- Codex may create/use the approved branch.
- Codex may modify only the approved in-scope files.
- Codex may make routine coding decisions that stay inside the approved scope.
- Codex may run validation.
- Codex may commit, push the feature branch, open/update a PR, and allow normal Vercel Preview/sandbox deployments.

Stop conditions:
- Stop if unapproved files need to change.
- Stop if the implementation may affect another user-facing workflow, data behavior, permission rule, database behavior, production setting, or core lifecycle behavior outside the approved scope.
- Stop if SQL/RLS/RPC/storage/auth/permissions/env/settings changes are needed and not explicitly approved.
- Stop if production data/user records would be touched.
- Stop if validation fails and the fix would exceed the approved scope.

Not approved:
- Do not merge into main.
- Do not manually deploy production.
- Do not apply SQL.
- Do not change Supabase/Vercel/env/settings.
- Do not create users or touch production data.
- Do not start unrelated follow-up work.

Validation required:
- git status --short --branch
- git diff --check
- [Task-specific checks]
- changed-file secret-value scan

Return:
ACTION
RISK LEVEL ASSESSED
BUILDER MODE USED: YES / NO
FILES CHANGED
SUMMARY OF CHANGES
BACKLOG IMPACT
BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
REASON
VALIDATION RUN
STOP CONDITIONS ENCOUNTERED: YES / NO
PR LINK, IF OPENED
RISKS / FOLLOW-UPS
STATUS
```

## Risk-Based Fast Track

Not every task needs the same level of back-and-forth. Match the workflow to the risk level, and keep the scope explicit. Faster paths are acceptable only when the task is low-risk, clearly bounded, and does not touch app behavior, user data, permissions, SQL, auth, storage, production, env, or deploy settings.

If Codex discovers that a task is riskier than expected, it must stop and report instead of continuing.

Builder Mode can be used after the initial audit for low-risk or medium-risk implementation work, and for high-risk work only when the approved prompt narrowly defines the safe implementation path and keeps all high-risk operations behind explicit stop conditions. Builder Mode is not permission to merge, deploy production, apply SQL, change env/settings, create users, or touch production data.

### Low-Risk Fast-Track Path

Low-risk work may include documentation-only changes, content-only changes, harmless copy or wording cleanup, internal templates, non-app marketing docs, and other bounded edits that do not affect app behavior, user data, permissions, SQL, auth, storage, production, env, or deploy settings.

For low-risk work, Codex may briefly audit the relevant docs/files, implement the approved change in the same pass, run validation, commit/push/open a PR if requested, and report changed files, checks, risks, and the PR link.

Still required:

- No merge without explicit approval.
- No production deploy without explicit approval.
- No SQL/env/settings/data/user changes without explicit approval.
- Changelog update when files/docs change and changelog practice requires it.
- Master plan update only when appropriate.
- Backlog Impact review for implementation tasks, with `docs/servsync-master-plan/ServSync_Feature_Backlog.md` updated when feature status, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority changes.
- Changed-file secret scan.
- Clear return report with risk level, fast-track use, Backlog Impact, validation, risks, and stop conditions.

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
- If this task changes app behavior, data flow, permissions, SQL, RLS, auth, storage, Edge Functions, environment variables, production data, user access, or core workflow logic, stop after audit and wait for explicit approval before implementing unless a Builder Mode proceed prompt has already approved the implementation path.
- If Builder Mode is approved, implement in-scope work without routine approval, and you may branch, commit, push, open/update a PR, and trigger normal Vercel Preview/sandbox deployments.
- For implementation tasks, review `docs/servsync-master-plan/ServSync_Feature_Backlog.md` when the task changes feature status, roadmap state, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority; update it or explicitly report: "Backlog reviewed; no update needed."
- If the backlog should change but the correct update cannot be safely determined, stop and report: "Backlog update required but not completed — stop condition."
- Builder Mode does not permit merge to main, manual production deploy, SQL application, env/settings changes, user creation, or production data changes without explicit approval.
- If you discover the task is riskier than expected, stop and report instead of continuing.
- Never merge, deploy production, apply SQL, change env/settings, create users, or touch production data without explicit approval.
```

Feature/function work and marketing work must remain separate. Marketing/content docs can be low-risk, but app feature implementation is not automatically low-risk. Roadmap ideas must not be treated as live features.

## Non-Negotiable Guardrails

- Codex must audit before coding unless explicitly told otherwise.
- Codex must not change code without explicit approval, a low-risk one-pass prompt, or a Builder Mode proceed prompt.
- Codex must not merge without explicit approval.
- Codex must not deploy production manually without explicit approval.
- Codex must not apply SQL without explicit approval.
- Codex must not change Supabase, Vercel, or env settings without explicit approval.
- Codex must not create users or touch production data without explicit approval.
- Codex must report changed files and checks.
- Codex must update the changelog when docs or app behavior change, unless the task is audit-only.
- Codex must include Backlog Impact in every implementation report and PR handoff.
- Codex must review `docs/servsync-master-plan/ServSync_Feature_Backlog.md` when a task changes feature status, roadmap state, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority.
- Codex must either update `docs/servsync-master-plan/ServSync_Feature_Backlog.md` when needed or explicitly report: "Backlog reviewed; no update needed."
- Codex must stop and report "Backlog update required but not completed — stop condition." when a backlog update is required but Codex cannot safely determine it.
- Codex must read the master plan before deciding whether a change affects product direction, roadmap, workflow, or implementation strategy.
- Codex must not update the master plan unless the task changes product direction, roadmap decisions, user workflows, feature definitions, or implementation strategy.
- Codex must read the changelog before adding entries.
- Codex must not duplicate PR numbers, item numbers, task names, version labels, or changelog headings.
- Codex must not invent a PR number before a PR exists.
- Codex must keep changelog entry labels consistent with the existing changelog style.
- Codex must keep feature work separate from marketing work.
- Codex must not treat roadmap ideas as live features.
- Codex may push approved feature branches and open PRs when the implementation prompt or Builder Mode explicitly allows it.
- Codex must treat merge to `main` as a separate approval gate because it can trigger production deployment.
- Codex must review `docs/MARKETING_PRODUCT_INVENTORY.md` when a PR adds, removes, renames, or materially changes a user-facing feature, user workflow, feature status, value proposition, marketing claim, limitation, or do-not-promise item.
- Codex must either update `docs/MARKETING_PRODUCT_INVENTORY.md` when the change affects what ServSync can honestly say to homeowners, contractors, beta users, ads, social posts, brochures, landing pages, or video scripts, or explicitly report: "Marketing inventory reviewed; no update needed."

## Master Plan, Changelog, And Marketing Inventory Rules

Read `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md` before planning or implementing ServSync product changes. Use it to classify the task as workflow/process documentation, product-direction documentation, roadmap/planning documentation, marketing documentation, app implementation, test/QA documentation, or SQL/schema/RLS/RPC/storage work.

Update the master plan only when the task changes product direction, roadmap decisions, user workflows, feature definitions, or implementation strategy. Do not update it for simple operational docs, audit-only work, small copy fixes, small test updates, or implementation details that do not change direction.

Read `docs/servsync-master-plan/CHANGELOG.md` before adding a changelog entry. Identify the latest related entry and check existing labels before writing a new one.

Marketing inventory check:

- Read `docs/MARKETING_PRODUCT_INVENTORY.md` when a task adds, removes, renames, or materially changes a user-facing feature, user workflow, feature status, value proposition, marketing claim, limitation, or do-not-promise item.
- If the change affects what ServSync can honestly say to homeowners, contractors, beta users, ads, social posts, brochures, landing pages, or video scripts, update `docs/MARKETING_PRODUCT_INVENTORY.md`.
- If no update is needed, explicitly report: "Marketing inventory reviewed; no update needed."
- Do not use the changelog alone as the source for marketing claims.
- Do not market roadmap ideas, future work, or planned features as live/beta/manual capabilities unless `docs/MARKETING_PRODUCT_INVENTORY.md` supports that status.

Backlog impact check:

- For every implementation task/report/PR, review whether `docs/servsync-master-plan/ServSync_Feature_Backlog.md` must change.
- Update the backlog when the task changes feature status, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority.
- If no update is needed, explicitly report: "Backlog reviewed; no update needed."
- If the backlog needs an update but Codex cannot safely determine the correct wording, stop and report: "Backlog update required but not completed — stop condition."
- Every implementation report and PR handoff must include:
  - `BACKLOG IMPACT`
  - `BACKLOG FILE UPDATED: YES / NO / NOT NEEDED`
  - `REASON`

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

Marketing inventory check:
- Read `docs/MARKETING_PRODUCT_INVENTORY.md` if this audit concerns a user-facing feature, user workflow, feature status, value proposition, marketing claim, limitation, or do-not-promise item.
- Do not use the changelog alone as the source for marketing claims.
- Identify whether the implementation would require a marketing inventory update or the explicit report: "Marketing inventory reviewed; no update needed."

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
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
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

Builder Mode approved after audit:
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
- Read docs/servsync-master-plan/ServSync_Feature_Backlog.md.
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

Backlog impact check:
- Determine whether this implementation changes feature status, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority.
- If yes, update `docs/servsync-master-plan/ServSync_Feature_Backlog.md`.
- If no, report: "Backlog reviewed; no update needed."
- If the backlog update is required but cannot be completed safely, stop and report: "Backlog update required but not completed — stop condition."

Marketing inventory check:
- Does this PR add a user-facing feature?
- Does it remove, rename, or materially change a user-facing feature?
- Does it change a feature status from Future/Manual/Beta/Live?
- Does it change what homeowners or contractors can honestly be told?
- Does it create a new limitation or do-not-promise item?
- If yes, update `docs/MARKETING_PRODUCT_INVENTORY.md`.
- If no, report: "Marketing inventory reviewed; no update needed."

Validation required:
- git status --short --branch
- git diff --check
- [npm run typecheck / npm run build / Playwright list / SQL script check / Markdown sanity review]
- changed-file secret-value scan

Return:
ACTION
RISK LEVEL ASSESSED
FAST-TRACK USED: YES / NO
BUILDER MODE USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
FILES CHANGED
SUMMARY OF CHANGES
BACKLOG IMPACT
- Backlog reviewed: YES / NO
- BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
- REASON:
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
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
- Backlog Impact is documented, and `docs/servsync-master-plan/ServSync_Feature_Backlog.md` was updated if feature status, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority changed.
- If no backlog update was needed, the report explicitly says: "Backlog reviewed; no update needed."
- Marketing inventory was updated if the PR changes user-facing features, workflows, feature status, value propositions, marketing claims, limitations, or do-not-promise items.
- If no marketing inventory update was needed, the report explicitly says: "Marketing inventory reviewed; no update needed."
- Required tests/checks passed.
- Vercel project is correct if relevant.

Marketing inventory check:
- Does this PR add a user-facing feature?
- Does it remove, rename, or materially change a user-facing feature?
- Does it change a feature status from Future/Manual/Beta/Live?
- Does it change what homeowners or contractors can honestly be told?
- Does it create a new limitation or do-not-promise item?
- If yes, confirm `docs/MARKETING_PRODUCT_INVENTORY.md` was updated.
- If no, report: "Marketing inventory reviewed; no update needed."

Backlog impact check:
- Does this PR change feature status, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority?
- If yes, confirm `docs/servsync-master-plan/ServSync_Feature_Backlog.md` was updated.
- If no, report: "Backlog reviewed; no update needed."
- If the report says the backlog update was required but not completed, mark the PR as needing fixes before merge approval.

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
- Backlog reviewed: YES / NO
- BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
- Backlog impact reason:
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
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
- Backlog Impact was reviewed; `ServSync_Feature_Backlog.md` was updated or "no update needed" was explained.
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
- Backlog Impact verified: YES / NO
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
- Backlog Impact from the merged PR was reviewed; `ServSync_Feature_Backlog.md` was updated or "no update needed" was explained.
- Authenticated production checks are skipped unless approved production smoke accounts exist.

Return:
ACTION
TARGET TESTED
DEPLOYMENT STATUS
PUBLIC / BUNDLE VERIFICATION RESULTS
AUTHENTICATED VERIFICATION
PRODUCTION DATA CHANGES
SQL / DEPLOY STATUS
BACKLOG IMPACT CHECK
- Backlog reviewed: YES / NO / NOT APPLICABLE
- BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
- Reason:
MARKETING INVENTORY CHECK
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
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
- Backlog reviewed: YES / NO / NOT APPLICABLE
- BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
- Backlog impact reason:
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
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
BUILDER MODE USED: YES / NO
WHY FAST-TRACK WAS OR WAS NOT APPROPRIATE
FILES CHANGED
SUMMARY OF CHANGES
BACKLOG IMPACT
- Backlog reviewed: YES / NO
- BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
- REASON:
CHANGELOG / MASTER PLAN CHECK
- Master plan reviewed: YES / NO
- Master plan update needed: YES / NO, with reason
- Changelog reviewed: YES / NO
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
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
- Backlog reviewed: YES / NO
- BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
- Backlog impact reason:
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
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
BACKLOG IMPACT CHECK
- Backlog reviewed: YES / NO / NOT APPLICABLE
- BACKLOG FILE UPDATED: YES / NO / NOT NEEDED
- Reason:
MARKETING INVENTORY CHECK
- Marketing inventory reviewed: YES / NO / NOT APPLICABLE
- Marketing inventory update needed: YES / NO / NOT APPLICABLE, with reason
ISSUES FOUND
STOP CONDITIONS ENCOUNTERED: YES / NO
RECOMMENDED NEXT STEP
STATUS
```

## Starting A New Chat With ChatGPT

Copy this into a new ChatGPT chat:

```text
I am working on ServSync. I use a controlled ChatGPT <-> Codex workflow. Help me keep this workflow disciplined and risk-based. For low-risk documentation/content/internal-template work, help me decide whether Codex can briefly audit and implement in one pass. After Codex audits a feature/fix and we approve the implementation path, help me decide whether to use Builder Mode so Codex can make routine in-scope coding decisions, branch, commit, push, open a PR, and trigger Preview/sandbox deployments without coming back for every small file decision. For high-risk app behavior, data, SQL, RLS, auth, storage, env, production, or core workflow work, keep SQL/env/settings/data/user changes, merge to main, and production deploys behind explicit approval. Keep feature planning separate from marketing. Keep roadmap ideas separate from live features. Make sure Codex reads the master plan and changelog before changes. Make sure every implementation report and PR includes Backlog Impact with `BACKLOG FILE UPDATED: YES / NO / NOT NEEDED` and a reason; Codex must review `docs/servsync-master-plan/ServSync_Feature_Backlog.md` when a task changes feature status, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority, and must either update it or report: "Backlog reviewed; no update needed." Make sure Codex reviews docs/MARKETING_PRODUCT_INVENTORY.md whenever a PR adds, removes, renames, or materially changes a user-facing feature, workflow, feature status, value proposition, marketing claim, limitation, or do-not-promise item; Codex must update it when needed or report: "Marketing inventory reviewed; no update needed." Do not use the changelog alone as the source for marketing claims, and do not market roadmap ideas, future work, or planned features as live/beta/manual capabilities unless the marketing inventory supports that status. Make sure changelog entries do not duplicate PR numbers, item numbers, task names, version labels, or headings. Do not recommend merge/deploy/SQL/env/production changes without explicit approval.
```

## Notes

This document is a workflow template only. It should help the user, ChatGPT, and Codex keep a repeatable approval loop. It should not be used as permission to implement features, merge PRs, deploy production, apply SQL, change env/settings, create users, or modify production data.
