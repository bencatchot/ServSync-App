# ServSync Beta Feedback Triage

Internal template for reviewing controlled private beta feedback.

## First-Week Review Cadence

During the first beta week:

- Review feedback daily.
- Label each item before deciding on fixes.
- Treat blockers and security/privacy concerns before feature requests.
- Look for repeated confusion across users.
- Avoid broad scope expansion unless a core workflow is blocked.

Suggested daily review:

1. Read all new feedback.
2. Assign category and severity.
3. Identify owner and next action.
4. Decide whether the issue blocks beta expansion.
5. Update the status before the next review.

## Feedback Categories

| Category | Meaning |
| --- | --- |
| Blocker | Prevents a user from continuing a ready beta workflow or creates a trust/security concern. |
| Bug | Something does not work as intended, but a workaround may exist. |
| Confusing UX | The app works, but the user does not understand the next step or wording. |
| Feature request | New capability that may improve the product but is not required for the current beta scope. |
| Future integration | Requests for payments, QuickBooks, push/email/text automation, native mobile, full calendar sync, or other future systems. |

## Severity Levels

| Severity | Definition | Response |
| --- | --- | --- |
| S0 Critical | Security/privacy issue, data exposure, broken auth, or production outage. | Pause beta expansion and investigate immediately. |
| S1 High | Core workflow blocked: request, estimate, job/report, invoice, Home History, or reminder. | Same-day triage and fix plan. |
| S2 Medium | Workflow still possible but confusing, slow, or error-prone. | Acknowledge within 24 hours and prioritize. |
| S3 Low | Polish issue, wording issue, or minor layout concern. | Batch into cleanup work. |
| S4 Future | Useful idea outside the current beta scope. | Log for roadmap review. |

## Feedback Log Template

Copy one row per feedback item.

| Field | Value |
| --- | --- |
| Date received |  |
| Reporter |  |
| User role | Homeowner / Contractor / Internal |
| Screen or tab |  |
| Attempted workflow |  |
| Expected result |  |
| Actual result |  |
| Screenshot available | Yes / No |
| Browser/device |  |
| Blocker | Yes / No |
| Category | Blocker / Bug / Confusing UX / Feature request / Future integration |
| Severity | S0 / S1 / S2 / S3 / S4 |
| Follow-up owner |  |
| Decision | Fix now / Fix before more invites / Log for later / Needs more info |
| Status | New / Triaged / In progress / Fixed / Deferred / Closed |
| Notes |  |

## Triage Rules

Pause expansion immediately for:

- Any possible cross-user data access.
- Any private document/media visibility issue.
- Login, signup, or password reset failure affecting beta users.
- Broken request, estimate, job/report, invoice, Home History, or reminder workflow.
- Repeated mobile blocker on a core screen.
- Production deployment/check failure.

Fix before inviting more users:

- Repeated next-step confusion in the core loop.
- Invoice or Home History wording that causes users to misunderstand storage, PDFs, or payment status.
- Contractor workflow wording that causes users to skip intended job/report steps.
- Mobile layout issues that hide or clip primary actions.

Log for later:

- Stripe/payment processing.
- QuickBooks/accounting sync.
- Push/email/text reminder automation.
- Recurring reminders or scheduler automation.
- Native mobile apps.
- Full external calendar sync.
- Broad Discover/feed marketplace growth.
- Advanced team dispatch, analytics, or contractor call tracking.

## Weekly Summary Template

Use at the end of the first beta week.

```text
WEEK:

TESTERS ACTIVE:

WORKFLOWS COMPLETED:
- Requests:
- Estimates:
- Accepted estimate -> job:
- Job/report:
- Invoice:
- Home History:
- Manual reminders:

BLOCKERS:

BUGS:

REPEATED CONFUSION:

FEATURE REQUESTS:

FUTURE INTEGRATIONS:

MOBILE NOTES:

SUPPORT LOAD:

DECISION:
Continue / Invite 1-2 more / Pause for fixes / Re-scope beta
```
