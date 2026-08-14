# Limited Public Beta Decision Template

Decision date:

Protocol version: v1

Study window:

Decision owner:

## Allowed outcomes

Select one:

- `NOT READY`
- `READY AFTER BLOCKING FIXES`
- `READY FOR LIMITED PUBLIC BETA`
- `READY TO EXPAND BETA`

For the first human study, do not select `READY TO EXPAND BETA`. Broad launch/expansion requires later operational and market evidence.

## Evidence completeness

| Gate | Evidence | Result |
| --- | --- | --- |
| 5-8 contractor sessions complete | IDs only | PASS / PENDING / FAIL |
| 2-3 competitor-experienced contractors represented | IDs only | PASS / PENDING / FAIL |
| 5-8 homeowner sessions complete | IDs only | PASS / PENDING / FAIL |
| Meaningful contractor and homeowner mobile tasks complete | | PASS / PENDING / FAIL |
| Findings matrix current | | PASS / PENDING / FAIL |
| All session cleanup verified | | PASS / PENDING / FAIL |
| Natural PR #447 scheduled role-smoke accepted | Run ID/date | PASS / PENDING / FAIL |
| Current beta limitations approved for use | | PASS / PENDING / FAIL |

## Product gate

| Gate | Result | Evidence/finding IDs |
| --- | --- | --- |
| No unresolved P0 | PASS / FAIL | |
| No repeated P1 blocking canonical contractor lifecycle | PASS / FAIL | |
| No repeated P1 blocking canonical homeowner lifecycle | PASS / FAIL | |
| No material privacy/security/tenant concern | PASS / FAIL | |
| No material financial-state or trust misunderstanding | PASS / FAIL | |
| Core mobile workflow usable | PASS / FAIL | |
| Intended initial cohort can operate within candid limitations | PASS / FAIL | |

Do not block on every P2/P3. Explain any accepted P1 scope decision rather than silently downgrading severity.

## Cohort results

Contractor summary:

- Unaided/assisted pattern:
- Strongest workflow:
- Weakest workflow:
- Competitor subgroup signal:
- Trust and switching concerns:

Homeowner summary:

- Unaided/assisted pattern:
- Strongest workflow:
- Weakest workflow:
- Home History comprehension:
- Trust and relationship-model concerns:

## Blocking findings

| ID | Severity | Cohort/task | Decision impact | Required correction/retest |
| --- | --- | --- | --- | --- |
| | | | | |

## Accepted beta limitations

List the approved limitations and how each will be communicated to participants, support, onboarding, and marketing. Reference [Current Beta Limitations](CURRENT_BETA_LIMITATIONS.md); do not copy claims without rechecking current runtime state.

## Decision rationale

State what unfamiliar users actually did, what help they needed, what trust signals appeared, and why the selected outcome follows. Separate observation from inference.

## Next gate

- If `NOT READY`: stop recruitment and correct P0/P1.
- If `READY AFTER BLOCKING FIXES`: define exact fixes, regression evidence, and targeted human retest.
- If `READY FOR LIMITED PUBLIC BETA`: define cohort cap, support channel, monitoring, rollback/stop criteria, and limitation disclosure.
- If later `READY TO EXPAND BETA`: require a separate decision with operating and market evidence beyond this study.

Approvals/sign-off must live in the owner's governed decision system; do not commit signatures or participant identities.
