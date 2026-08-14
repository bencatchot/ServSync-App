# ServSync Limited Public Beta Human Validation v1

Status: prepared, not yet executed with participants

Study question: Can unfamiliar contractors and homeowners complete ServSync's current core workflows with acceptable assistance and trust?

Evidence boundary: automated tests and the operator dry run establish study feasibility only. They are not human-usability evidence.

## Package index

| Artifact | Purpose |
| --- | --- |
| [Human Validation Master Protocol](HUMAN_VALIDATION_MASTER_PROTOCOL.md) | Governs cohorts, session conduct, metrics, privacy, intervention, and decision rules. |
| [Contractor Facilitator Script](CONTRACTOR_FACILITATOR_SCRIPT.md) | Step-by-step moderator script for the contractor session. |
| [Homeowner Facilitator Script](HOMEOWNER_FACILITATOR_SCRIPT.md) | Step-by-step moderator script for the homeowner session. |
| [Contractor Task Sheet](CONTRACTOR_TASK_SHEET.md) | Participant-facing contractor scenario and neutral task prompts. |
| [Homeowner Task Sheet](HOMEOWNER_TASK_SHEET.md) | Participant-facing homeowner scenario and neutral task prompts. |
| [Session Observation Template](SESSION_OBSERVATION_TEMPLATE.md) | In-session behavioral and intervention log. |
| [Participant Result Template](PARTICIPANT_RESULT_TEMPLATE.md) | Anonymous post-session summary. |
| [Cross-Session Findings Matrix](CROSS_SESSION_FINDINGS_MATRIX.md) | Rolling synthesis across participants. |
| [Severity and Classification Guide](SEVERITY_CLASSIFICATION_GUIDE.md) | P0-P3 definitions, tags, and repeat-signal heuristics. |
| [Recruitment and Profile Guide](RECRUITMENT_PROFILE_GUIDE.md) | Cohort quotas, screener, exclusions, and anonymization. |
| [Study Setup and Cleanup Runbook](STUDY_SETUP_CLEANUP_RUNBOOK.md) | Non-Production fixture, preflight, reset, and exact cleanup procedure. |
| [Fictional Scenario Cards](FICTIONAL_SCENARIO_CARDS.md) | Repeatable test-only Customer, service, appointment, completion, payment, and history inputs. |
| [Limited Public Beta Decision Template](LIMITED_PUBLIC_BETA_DECISION_TEMPLATE.md) | Evidence-based readiness decision after the study. |
| [Current Beta Limitations](CURRENT_BETA_LIMITATIONS.md) | Internal product-truth boundaries for recruitment, onboarding, support, and later marketing. |

## Operating boundary

- Use only approved Sandbox or dedicated Demo identities and fictional data.
- Never mutate Production for a study.
- Never commit participant names, contact details, credentials, real addresses, recordings, or raw transcripts.
- Do not give a product tour before tasks.
- Log every intervention. Behavior is primary evidence; compliments are not.
- Stop a session if environment identity, fixture isolation, authorization, or cleanup safety is uncertain.

The immediate next action is owner-led recruitment and a one-participant pilot. Product development should resume only for a genuine P0/P1 finding or another explicitly prioritized initiative.
