# Severity and Classification Guide

Severity combines consequence, task centrality, recoverability, assistance required, recurrence, and trust impact. Frequency informs severity but does not determine it.

## Severity

| Level | Definition | Examples | Required response |
| --- | --- | --- | --- |
| P0 - Public Beta Blocker | Safety, privacy, tenant, data-integrity, or severe financial/trust failure; or a core workflow is broadly impossible with no safe recovery. | Cross-tenant exposure; destructive action without comprehension; incorrect paid/balance state; credential exposure. | Stop affected testing. Escalate immediately. Do not begin limited beta until resolved and revalidated. One credible event is sufficient. |
| P1 - Fix Before Limited Public Beta | Repeated or high-impact inability to discover/complete a canonical workflow, misleading status/terminology, major mobile obstruction, or table-stakes gap that materially blocks the intended cohort. | Multiple participants need direct help to continue accepted Estimate to Job; homeowner repeatedly cannot identify an Invoice or balance. | Create a bounded product finding. Fix and retest before limited beta unless an explicit decision removes the workflow from beta scope. |
| P2 - Beta Follow-Up | Meaningful friction, extra work, or comprehension cost, but users normally complete the task independently and recover safely. | Repeated backtracking; unclear secondary label; non-blocking mobile reach issue. | Prioritize against other beta evidence; do not automatically block initial limited beta. |
| P3 - Preference / Later | Low-impact subjective preference, isolated cosmetic issue, or optimization with no meaningful task/trust effect. | Color preference; optional shortcut; wording taste without confusion. | Record and defer unless it becomes a recurring higher-impact pattern. |

## Finding types

Use one or more tags:

- `Contractor`, `Homeowner`, `Mobile`
- `Visual`, `Terminology`, `Navigation`, `Workflow`
- `Competitive`, `Trust`
- `Missing Capability`, `Feature Request`

Separate these concepts:

- **Usability failure:** capability exists, but the participant cannot find, understand, or use it.
- **Missing capability:** the real-world goal is not supported.
- **Feature request:** participant proposes a solution; preserve the underlying need separately.
- **Preference:** personal taste with no demonstrated task impact.
- **Environment incident:** fixture, account, network, or study setup failed; not a participant outcome.

## Repeat-signal heuristics

- One participant: evidence worth recording, not an automatic redesign mandate.
- Two independent participants: meaningful signal; inspect common cause and task impact.
- Three or more independent participants on the same core-workflow friction: strong product signal.
- One privacy, security, data-loss, destructive-action, or material financial-trust event may be P0 regardless of count.
- Five spacing preferences do not outweigh one credible trust failure.

These are practical heuristics, not statistical thresholds. Count participants, not repeated incidents by one participant. Do not inflate evidence by counting one mistake in multiple categories.

## Classification questions

1. What was directly observed?
2. Could the participant recover without help?
3. What was the highest intervention level?
4. Is the task canonical for the intended beta cohort?
5. Could the behavior cause data, financial, privacy, or trust harm?
6. Did independent participants show the same underlying problem?
7. Is this a product issue, missing capability, preference, or study-environment defect?
8. Would candid beta scoping remove the need, or would that make the beta incoherent?

Record a short rationale whenever severity changes.
