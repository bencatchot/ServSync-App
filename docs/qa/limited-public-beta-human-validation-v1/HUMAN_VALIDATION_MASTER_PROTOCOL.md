# Human Validation Master Protocol

## 1. Research objective

Determine whether people who did not design ServSync can understand and complete its current core contractor and homeowner workflows without a product tour, unacceptable assistance, or loss of trust.

This is a small qualitative usability study. It measures behavior and identifies recurring friction. It does not estimate market share, price sensitivity, broad launch demand, or statistical prevalence.

## 2. Cohorts

| Cohort | Target | Required mix |
| --- | ---: | --- |
| Small service contractor owner/operators | 5-8 | Directly handle Customers, Estimates, Jobs, and Invoices; 2-3 have used Jobber, Housecall Pro, or a comparable field-service system. Do not require HVAC. |
| Homeowners | 5-8 | Have hired home-service contractors; ordinary app/web comfort; varied technical confidence; no prior ServSync training. |

Run a one-participant pilot before the main cohort. A pilot may reveal protocol defects, but do not quietly combine materially changed protocols with earlier results.

## 3. Session shape

- Duration: 45-60 minutes.
- Mode: moderated in person or remote screen share.
- Device: participant's normal device where practical; every cohort must include meaningful phone-size use.
- Environment: approved non-Production target prepared under the [Study Setup and Cleanup Runbook](STUDY_SETUP_CLEANUP_RUNBOOK.md).
- Evidence: anonymous notes and metrics keyed only by participant ID (`C01`, `H01`).

Recommended sequence:

1. Verify consent and recording choice.
2. Explain think-aloud behavior, not ServSync's navigation or terminology.
3. Run tasks in order using the applicable facilitator script.
4. Ask neutral confidence and difficulty questions after each task.
5. Ask post-session questions; ask competitor questions only after all contractor tasks.
6. Complete the participant result before memory fades.
7. Reset and verify the environment before the next session.

## 4. Opening script

> Thank you for helping us evaluate a product, not you. Some parts may be unclear. Please work as you normally would and say what you are looking for or expecting. I may stay quiet because we are testing whether the product communicates clearly. You can stop at any time.

Then confirm:

- the participant understands the session purpose;
- screen/audio recording consent separately, if recording is proposed;
- no real customer, property, financial, or account information will be entered;
- the participant may decline recording and still participate.

Do not store raw recordings or identifying notes in Git. Retain them only in the owner's approved research storage with the anonymous session ID and the agreed retention period.

## 5. Moderator behavior

Do not demonstrate the product before task execution. Do not name the control or destination embedded in a task. Allow silence and normal exploration.

Use neutral probes:

- "What are you looking for?"
- "What do you expect to happen next?"
- "What do you think this means?"
- "What would you do now?"
- "What made you choose that?"
- "What were you expecting to see?"
- "Tell me what you're thinking."

Avoid:

- "Do you like ServSync?"
- "Was that easy?"
- "Isn't this easier?"
- "Can you find the Jobs tab?"
- "Why didn't you click X?"
- "Wouldn't Home History be useful?"
- "Is this better than Jobber?"
- pricing questions; those require a separate value study.

## 6. Intervention levels

| Level | Definition | Allowed example |
| --- | --- | --- |
| 0 | No help | Silence; participant works independently. |
| 1 | Neutral encouragement | "Keep going with what you think makes sense." |
| 2 | Clarify the real-world goal, not the UI | Restate what the customer or contractor needs accomplished. |
| 3 | General location hint after meaningful blocking | "The functionality you need is available somewhere in this page or navigation." |
| 4 | Direct UI help | Identify the control or sequence. |

Log every intervention with timestamp and trigger. Level 4 on a core task is normally a significant usability failure even if the participant then completes it.

Suggested blocking threshold: allow approximately 60-90 seconds of active exploration, or a clear abandonment statement, before Level 2 or above. Intervene sooner only to prevent unsafe data entry, leaving the study target, or an accidental irreversible action.

## 7. Task measures

For each task record:

- completion: unaided, with Level 1, Level 2, Level 3, Level 4, or failed/abandoned;
- approximate elapsed time;
- meaningful wrong paths or misclicks;
- significant hesitation or rereading, especially pauses over 2-3 seconds around a decision;
- backtracking and recovery behavior;
- exact terminology questions and the participant's interpretation;
- confidence: 1 (not confident) through 5 (very confident);
- difficulty: 1 (very difficult) through 5 (very easy);
- unexpected action, workaround, praise, frustration, or trust concern.

Time is comparative context, not an absolute KPI. Do not turn small-sample averages into product guarantees.

## 8. Evidence standards

- Record observed behavior separately from participant quotes and researcher inference.
- A participant statement is not proof that a feature exists, works, or is valuable.
- A task completed only after direct UI help did not pass unaided.
- Environment or fixture failures are study-operations findings, not participant failures.
- Automated browser tests and facilitator dry runs are feasibility evidence, not human evidence.
- Use the [Severity and Classification Guide](SEVERITY_CLASSIFICATION_GUIDE.md) and update the [Cross-Session Findings Matrix](CROSS_SESSION_FINDINGS_MATRIX.md) after every session.

## 9. Privacy and safety

- Use anonymous IDs only in committed artifacts.
- Do not record names, emails, phone numbers, credentials, real addresses, or real customer data in repository files.
- Use fictional participants, Customers, homes, work descriptions, prices, and payment methods.
- Never use Production business records.
- Do not expose environment credentials to participants.
- Do not ask participants to upload personal photos or documents.
- Stop and quarantine evidence outside Git if identifying information is accidentally captured.

## 10. Study completion and decision

After 5-8 completed sessions per cohort, use the [Limited Public Beta Decision Template](LIMITED_PUBLIC_BETA_DECISION_TEMPLATE.md). The initial decision concerns limited beta, not broad public launch.

Minimum limited-beta gate:

- no unresolved P0;
- no repeated P1 blocking the canonical contractor lifecycle;
- no repeated P1 blocking the canonical homeowner lifecycle;
- no material privacy, security, financial, or trust concern;
- at least one meaningful mobile workflow is usable in each relevant cohort;
- the first genuine scheduled PR #447 role-smoke execution has passed;
- known beta limitations are communicated candidly;
- study evidence and environment cleanup are complete.

Do not require every P2/P3 to be fixed. Do not claim readiness merely because participants were polite or completed tasks after coaching.
