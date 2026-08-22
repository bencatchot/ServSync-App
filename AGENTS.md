# ServSync AI Workflow Instructions

These instructions apply to AI coding agents working in this repository.

## Source of Truth and Authority

- Follow `docs/CODEX_WORKFLOW_TEMPLATE.md` for the ServSync working model, authority boundaries, operating modes, and approval gates.
- Follow the user's explicit product decisions and constraints.
- Treat ChatGPT-authored technical suggestions as advisory unless they record a user decision, documented product invariant, repository rule, or genuine safety gate.
- The approved task is defined by its desired outcome and product constraints, not by a speculative file list.

## Codex Autonomy

When the outcome and applicable protected-change approvals are clear, use Builder Mode by default.

In Builder Mode, Codex owns:

- Repository investigation and technical design.
- Files reasonably necessary to complete the approved outcome.
- Focused in-scope refactoring.
- Tests, fixtures, and validation.
- Materially required documentation updates.
- Branch creation, commits, feature-branch pushes, draft PR creation or updates, and normal Preview verification.
- Repairing in-scope problems discovered during validation.

Do not stop merely because an additional file, helper, component, type, fixture, test, or documentation adjustment is reasonably necessary.

Use Audit Mode when the user asks for read-only work, the desired behavior is materially unclear, viable choices would materially change the product experience, or an unapproved protected change blocks safe implementation.

## Stop Conditions

Stop and request the smallest necessary decision or approval when:

- The desired product behavior is materially ambiguous.
- Viable choices would create meaningfully different user experiences.
- The work would expand into another feature, workflow, permission boundary, data behavior, integration, or product promise.
- An unapproved protected change or action is necessary.
- Continuing could create meaningful data-loss, privacy, security, billing, permission, or operational risk.
- Required access is unavailable and no safe in-scope alternative exists.

Routine implementation uncertainty is not a stop condition. Resolve it through repository investigation, testing, and engineering judgment.

## Protected Actions and Changes

Never perform these without explicit user approval:

- Merge into `main`.
- Manual production deployment or promotion.
- SQL application to a shared or production database.
- Production-data or user-record mutation.
- Production user creation, deletion, or impersonation.
- Unapproved schema, RLS, RPC, storage-policy, authentication, authorization, role, or permission changes.
- Unapproved Supabase, Vercel, environment, domain, secret, provider, or infrastructure changes.
- Destructive, irreversible, privacy-sensitive, or security-sensitive operations.

Editing an approved migration does not authorize applying it.

Feature-branch pushes, draft PRs, and normal Preview builds are permitted in Builder Mode.

## Repository Context

- Start new implementation work from current `origin/main` unless the task explicitly continues an existing branch or PR.
- Preserve unrelated user changes.
- Keep commits focused; Codex chooses the reasonable commit count and sequence.
- Do not expose or commit credentials, secrets, tokens, private keys, service-role keys, local environment files, or unrelated generated artifacts.

Read only the planning and reference documents that can materially affect the task:

- Read the master plan when product direction, feature boundaries, roles, workflow definitions, lifecycle behavior, or roadmap status matters.
- Read the feature backlog when the task changes feature status, remaining scope, priority, guardrails, or next step.
- Read the marketing inventory when the task changes what ServSync can honestly claim, demonstrate, or promise.
- Read the changelog before updating it or when recent related work is needed to understand the task.

Do not perform broad document review as a ritual when those documents cannot affect the work.

## Documentation Impact

- Update the master plan only for a material change to product direction, workflow definitions, feature boundaries, roles, lifecycle behavior, or roadmap decisions.
- Update the feature backlog only when feature status, remaining scope, priority, guardrails, or the next meaningful step changes.
- Update the marketing inventory only when the change affects honest marketing claims, demonstrations, limitations, or feature status.
- Update the changelog when repository practice requires it for a meaningful completed change.
- Do not update these documents for read-only audits or trivial mechanical changes unless a specific repository rule requires it.
- Documentation updates materially required by the approved implementation are in scope. Unrelated documentation cleanup is not.

## Validation

Choose validation proportionate to the affected area and repository practices. Use relevant automated tests, static checks, build checks, diff review, secret safety, and Preview verification as appropriate.

For every pull request, record the tutorial freshness result in the PR body. User-facing changes require a Help Studio search by affected feature, route context, screen, and workflow plus Preview of any matching published walkthrough. Use exactly `NOT APPLICABLE`, `NONE`, `UPDATE REQUIRED`, or `UPDATED`. `UPDATE REQUIRED` must name the affected tutorial and bounded follow-up, and the task must not be reported complete until the replacement revision is published and verified.

Fix in-scope validation failures without requesting routine approval. Stop only if the fix requires material scope expansion or an unapproved protected change.

## Required Report

Lead with the result. Keep the report concise and include:

```text
OUTCOME
WHAT CHANGED OR WHAT WAS FOUND
VALIDATION EVIDENCE
TUTORIAL IMPACT
PR AND PREVIEW, IF APPLICABLE
DOCUMENTATION IMPACT
MATERIAL RISKS, FOLLOW-UPS, OR OWNER DECISIONS
PROTECTED ACTIONS NOT TAKEN
STATUS
```

Omit fields that genuinely do not apply. List changed files when useful for review, especially for unexpected or sensitive areas.
