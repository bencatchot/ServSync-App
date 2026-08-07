# ServSync Codex Workflow

## Purpose

This document defines how the user, ChatGPT, and Codex work together on ServSync.

The goal is to protect product decisions, production systems, and user data without turning routine implementation into a series of approval handoffs.

This document governs working process only. It does not approve a feature, change product strategy, or authorize a protected action.

## Core Principle

The user decides **what ServSync should do** and controls all protected actions.

Once the desired outcome and applicable constraints are clear, Codex decides **how to implement and validate it**.

ChatGPT helps clarify the outcome and explain meaningful choices. ChatGPT does not manage Codex command by command or invent technical restrictions the user did not request.

## Authority Order

When instructions appear to conflict, use this order:

1. The user's explicit instruction or product decision.
2. Repository safety rules in `AGENTS.md`.
3. Documented ServSync product invariants and approved decisions.
4. The approved outcome and constraints for the current task.
5. Codex's technical judgment for routine in-scope decisions.
6. ChatGPT-authored implementation suggestions.

A ChatGPT suggestion is advisory unless it records an explicit user decision, a documented product invariant, an existing repository rule, or a genuine safety or production approval gate.

## Roles and Boundaries

### User

The user controls:

- Product goals, priorities, and user-facing outcomes.
- Meaningful scope and experience decisions.
- Approval of protected technical changes.
- Merge approval.
- Production deployment approval.
- Production SQL, data, authentication, authorization, environment, and infrastructure actions.

The user is not expected to choose files, functions, commands, test structure, commit count, or implementation sequence.

### ChatGPT

ChatGPT should:

- Help the user define the desired outcome.
- Surface unresolved product choices and meaningful risks.
- Translate the user's decision into a concise, outcome-focused Codex assignment.
- Explain Codex findings, Preview results, and genuine approval questions.
- Keep roadmap ideas, live behavior, and marketing claims clearly separated.

ChatGPT must not:

- Invent file allowlists or stop conditions that are not required for safety.
- Prescribe functions, components, commands, commit counts, or implementation order unless the user asks.
- Turn a technical suggestion into a mandatory restriction without a supporting rule or user decision.
- Require separate audit, implementation, verification, PR, and Preview handoffs when Codex can safely complete them together.
- Send Codex back for approval on routine implementation decisions or in-scope fixes.

When uncertain whether a technical restriction is necessary, ChatGPT should state the outcome and let Codex determine the implementation.

### Codex

After the outcome is approved and Builder Mode applies, Codex owns:

- Repository investigation and current-state verification.
- Technical design and implementation.
- All files reasonably necessary for the approved outcome.
- Focused refactoring required to implement the outcome safely.
- Tests, fixtures, and validation.
- Documentation updates that are materially required by the change.
- Branch creation, commits, pushes, draft PR creation or updates, and Preview verification.
- Repairing in-scope problems found during validation.

Codex should make reasonable assumptions when they do not materially change the product outcome. It should state important assumptions in its final report.

## Standard Operating Modes

ServSync uses two working modes. Risk changes the approval gates; it does not create additional routine handoffs.

### Audit Mode

Audit Mode is read-only. Use it when:

- The desired product behavior is materially unclear.
- Two viable approaches would create meaningfully different user experiences.
- The likely solution may require an unapproved protected change.
- The task affects sensitive permissions, private data, payments, destructive operations, or a core lifecycle in a way that needs an owner decision first.
- The user explicitly asks for an audit, diagnosis, or implementation plan only.

Codex should inspect enough of the repository to identify the current behavior, root cause or design constraints, meaningful options, risks, and recommended path.

Audit Mode should end with the smallest decision the user actually needs to make. It should not produce a command-by-command implementation script or a speculative file allowlist.

### Builder Mode

Builder Mode is the default once the desired outcome and applicable protected-change approvals are clear.

Builder Mode authorizes Codex to complete the approved outcome through:

- Investigation.
- Implementation.
- Validation.
- In-scope repairs.
- Documentation-impact handling.
- Feature-branch commits and pushes.
- Draft PR creation or update.
- Normal Preview or sandbox deployment and verification.

Codex does not need another approval merely because:

- An additional reasonable file must change.
- A helper, type, component, fixture, or test must be added or adjusted.
- The existing architecture differs from an earlier assumption.
- Validation exposes an in-scope defect.
- The safest implementation needs focused refactoring.
- Documentation impact differs slightly from what ChatGPT expected.

Builder Mode is authority to complete the approved outcome, not authority to expand into another feature.

## Normal Workflow

1. The user and ChatGPT define the desired outcome and any product constraints.
2. ChatGPT gives Codex one concise assignment.
3. Codex chooses the appropriate mode:
   - use Builder Mode when the outcome and gates are clear;
   - use Audit Mode when a material decision or unapproved protected change blocks safe implementation.
4. In Builder Mode, Codex completes investigation, implementation, validation, draft PR creation, and Preview verification without routine approval handoffs.
5. Codex returns the Preview, evidence, material risks, and any owner decisions still needed.
6. The user reviews the result and separately approves or declines merge.
7. After merge approval, Codex merges and verifies the resulting main/production state that the approved merge normally triggers.
8. Any protected action not already approved remains a separate gate.

A separate pre-merge audit is optional. Use it only when change risk, failed evidence, unexpected scope, or the user's request justifies it.

## Protected Actions

Codex must receive explicit user approval before:

- Merging a PR into `main`.
- Manually deploying or promoting to production.
- Applying SQL to any shared or production database.
- Modifying production data or user records.
- Creating, deleting, or impersonating production users.
- Changing schema, RLS, RPC behavior, storage policy, authentication, authorization, roles, or permissions when that change was not already expressly approved.
- Changing Supabase, Vercel, environment, domain, secret, provider, or infrastructure configuration when that change was not already expressly approved.
- Performing destructive, irreversible, privacy-sensitive, or security-sensitive operations.

Creating or editing an approved SQL migration is not permission to apply it. Applying SQL requires its own explicit approval.

Pushing a feature branch, opening or updating a draft PR, and allowing the normal Preview build are Builder Mode actions. They are not merges or production approvals.

## Stop Conditions

Codex should stop and ask the user only when:

- The desired behavior is materially ambiguous.
- Viable choices would produce meaningfully different product behavior or user experience.
- Completing the work would expand into another feature, workflow, user group, or product promise.
- An unapproved protected action or protected technical change is necessary.
- Continuing could create meaningful data-loss, privacy, security, billing, permission, or operational risk.
- Required access is unavailable and there is no safe in-scope alternative.

When Codex stops, it should explain:

1. What it discovered.
2. Why the issue is material.
3. Its recommended choice.
4. The smallest approval or decision needed to continue.

Codex should not stop for routine technical uncertainty that it can resolve through repository investigation, testing, or normal engineering judgment.

## Scope Interpretation

The approved scope is defined by the desired outcome and stated product constraints, not by a speculative list of files.

An **in-scope implementation change** is work reasonably necessary to deliver or validate that outcome without changing its product meaning.

A **material scope expansion** adds or changes another user-facing capability, workflow, permission boundary, data behavior, product promise, integration, or operational responsibility beyond the approved outcome.

If Codex discovers useful but nonessential follow-up work, it should record it without implementing it.

## Risk Handling

Use risk to decide which approval gates apply, not how many routine handoffs to create.

### Lower risk

Examples include documentation, tests, internal tooling, copy, layout polish, and narrowly bounded frontend behavior with no sensitive data or permission impact.

Codex should normally audit and implement these in one Builder Mode pass.

### Moderate risk

Examples include ordinary application behavior, established workflow changes, and internal refactoring that do not alter protected systems or sensitive access.

Codex should normally use Builder Mode when the product outcome is clear. It should add validation proportionate to the affected workflow.

### Higher risk

Examples include schema, RLS, RPCs, authentication, authorization, payments, private files, production data, destructive operations, and core lifecycle changes.

Codex should use Audit Mode when the safe path or product decision is not already approved. Once the user approves the recommended path and any protected technical change, Codex may use Builder Mode for implementation, while execution of production or destructive actions remains separately protected.

## Repository and Documentation Discipline

Codex should read the files necessary to understand and safely change the affected area. It should not perform broad documentation review as a ritual when those documents cannot affect the task.

Use the ServSync planning documents as follows:

- Read the master plan when product direction, workflow definitions, feature boundaries, roles, lifecycle behavior, or roadmap status could affect the decision.
- Update the master plan only when the approved change materially changes those items.
- Read or update the feature backlog when the work changes feature status, remaining scope, priority, guardrails, or the next meaningful step.
- Read or update the marketing inventory when the work changes what ServSync can honestly claim, demonstrate, or promise.
- Update the changelog when repository practice requires it for a meaningful completed change. Do not add entries for read-only audits or trivial mechanical edits unless an existing rule specifically requires one.

Documentation updates reasonably required by an approved implementation are in scope. Unrelated documentation cleanup is not.

Codex should report documentation impact concisely. It does not need to repeat “reviewed; no update needed” for every unaffected document.

## Validation Standard

Codex chooses validation based on the change and repository practices.

Validation should normally include:

- Relevant automated tests or focused new tests.
- Type, build, lint, or static checks that apply to the changed area.
- Diff and working-tree review.
- Secret and credential safety.
- Preview verification for user-facing changes when a Preview is available.

Codex may fix in-scope failures without additional approval. If a failure reveals material scope expansion or a protected change, the applicable stop condition applies.

Passing unrelated exhaustive checks is not required unless repository rules, CI, or the task make them relevant.

## Branch, PR, Merge, and Deployment Rules

- Start implementation from current `origin/main` unless the task explicitly continues an existing branch or PR.
- Use a focused feature branch.
- Codex may choose commit count and sequence.
- Keep unrelated user changes out of the task.
- Open or update a draft PR and verify the Preview in Builder Mode.
- Do not merge without explicit user approval.
- A user-approved merge authorizes the normal automatic deployment triggered by that merge, unless the user says otherwise.
- A manual production deploy or promotion remains separately protected.
- Do not apply SQL merely because related code was merged.

## Backend Environment Parity And Rollout Visibility

Production defines the supported ServSync backend schema. Demo should normally remain on that schema generation, with only exact fingerprinted Demo-only additions recorded in `config/backend-environment-parity.json`. Sandbox may carry exact fingerprinted experimental additions, but unapproved additions and any missing or logically changed Production-supported objects fail parity. Intentional additions never excuse drift in an object that exists in Production.

For every relevant database migration or bounded foundation:

- update `config/backend-environment-rollouts.json` with `Applied`, `Pending`, `N/A`, or `Intentionally deferred` for Sandbox, Production, and Demo;
- include a reason whenever an environment is skipped or deferred;
- after an authorized Production or Demo rollout, run the explicit read-only parity command when approved credentials are available;
- report whether Production/Demo parity passes and whether Sandbox has experiments or unexplained supported-object drift.

Use `npm run backend:rollout:status` for the descriptive repository ledger and `npm run backend:parity:check -- --demo-only` for the live supported-peer comparison. An `Applied` ledger entry is not deployment or parity proof and never overrides a failing live comparison. The live command is operator-controlled and must not become a routine credentialed CI dependency. Source-only work does not need live database access unless its claims depend on deployed state. Applying SQL and changing environment state remain separately protected actions.

See [ServSync Backend Environment Parity](servsync-master-plan/ServSync_Backend_Environment_Parity.md) for the comparison contract, fixed identities, intentional-difference manifest, security boundaries, and current state.

## Concise Codex Reports

Codex reports should lead with the outcome and include only information useful for review or the next decision.

### Audit report

```text
OUTCOME
CURRENT BEHAVIOR / FINDINGS
RECOMMENDED PATH
MATERIAL RISKS OR TRADEOFFS
OWNER DECISION NEEDED
STATUS
```

### Builder Mode report

```text
OUTCOME
WHAT CHANGED
VALIDATION EVIDENCE
PR AND PREVIEW
DOCUMENTATION IMPACT
MATERIAL RISKS OR FOLLOW-UPS
PROTECTED ACTIONS NOT TAKEN
STATUS
```

List changed files when useful, especially for unexpected or sensitive areas. Do not require a ceremonial field for information that does not apply.

### Merge report

```text
MERGE RESULT
FINAL MAIN COMMIT
CHECKS / DEPLOYMENT STATUS
PROTECTED ACTIONS NOT TAKEN
ISSUES OR NEXT STEP
STATUS
```

## Prompt Templates

### Normal implementation assignment

```text
Use the ServSync workflow.

TASK
[Plain-language task name]

DESIRED OUTCOME
[What the user should be able to do or observe when the work is complete.]

PRODUCT CONSTRAINTS
- [Only meaningful user decisions, product invariants, or explicit exclusions.]

PROTECTED CHANGES ALREADY APPROVED
- [List approved schema/RLS/RPC/auth/permission/env/infrastructure changes, or “None.”]

ACCEPTANCE EVIDENCE
- [The behavior or evidence that will demonstrate success.]

Codex owns the in-scope technical approach, necessary files, tests, validation,
documentation impact, branch, commits, draft PR, and Preview verification.
Do not return for routine implementation approval or in-scope fixes.

Stop only for a material product decision, meaningful scope expansion,
an unapproved protected change/action, or meaningful data, privacy, security,
billing, permission, or operational risk.

Do not merge or perform a protected action without explicit user approval.
```

### Audit-only assignment

```text
Use the ServSync workflow in Audit Mode.

TASK
[Question or proposed outcome]

AUDIT GOAL
[What must be understood or decided.]

KNOWN CONSTRAINTS
- [Relevant product decisions or safety boundaries.]

Inspect the current implementation and return the current behavior, material
findings, recommended path, risks or tradeoffs, and the smallest owner decision
needed. Do not modify files, create a branch, push, open a PR, merge, deploy,
apply SQL, or change external state.
```

### Merge approval

```text
Use the ServSync workflow.

Merge the approved PR into main:
[PR link or number]

Before merging, confirm the PR target, head commit, required checks, and changed
scope still match the reviewed result. If they do, merge using the repository's
normal merge method and verify the resulting main commit and automatic deployment
status. Do not manually deploy, apply SQL, change settings, or begin new work.
```

### Protected-action approval

```text
Use the ServSync workflow.

APPROVED PROTECTED ACTION
[Exact SQL application, environment/configuration change, production operation,
or other protected action.]

TARGET
[Exact environment, project, database, or resource.]

PRECONDITIONS
- [Required backup, hash, branch/commit, validation, or rollback condition.]

Perform only the approved action, validate the result, and report what changed.
Do not merge, deploy, or perform adjacent protected actions unless separately
approved.
```

## Starting a New ChatGPT Conversation

Use this short instruction:

```text
Use the ServSync workflow and authority boundaries in
docs/CODEX_WORKFLOW_TEMPLATE.md.

Help me define the product outcome and meaningful constraints. Do not invent
technical restrictions or micromanage Codex. Once the outcome and approval
gates are clear, Codex owns the in-scope technical approach, necessary files,
tests, validation, documentation impact, branch, commits, draft PR, and Preview
verification.

Return to me only for a material product decision, meaningful scope expansion,
merge approval, protected action, or meaningful data, privacy, security,
billing, permission, or operational risk.
```

## Stable Terminology

Use these terms consistently:

| Term | Meaning |
| --- | --- |
| Audit Mode | Read-only investigation used to support a material decision or expose risk. |
| Builder Mode | Default implementation mode after the outcome and applicable gates are clear. |
| Protected action | A merge, production action, SQL application, sensitive configuration or data operation, or other action requiring explicit user approval. |
| In-scope fix | Technical work reasonably necessary to deliver or validate the approved outcome without changing its product meaning. |
| Material scope expansion | Work that adds or changes another capability, workflow, permission boundary, data behavior, integration, or product promise. |
| Preview | A non-production build or sandbox used to review a feature branch or PR. |
| Merge | Combining the approved PR into `main`; requires explicit user approval. |

Do not introduce replacement terms for these concepts unless the workflow itself is intentionally revised.
