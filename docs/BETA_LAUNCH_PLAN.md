# ServSync Controlled Beta Launch Plan

Internal plan for running a small private beta without treating ServSync as public-launch or payment-ready.

## Controlled Beta Status

ServSync is ready for a small controlled private beta with trusted users.

This is not a broad public launch. It is not a paid contractor launch. It is a focused test of the core homeowner-contractor workflow with hands-on support.

Recommended first beta group:

- 2 to 3 trusted contractors.
- Friendly homeowner testers connected to those contractors.
- Solo operators or very small teams with simple service workflows.

## Beta Scope

The beta should focus on the core service workflow:

- Homeowner creates a service request.
- Contractor reviews the request.
- Contractor creates and sends an estimate.
- Homeowner reviews and accepts the estimate.
- Contractor creates a job from the accepted estimate.
- Contractor completes service work or a checklist/report workflow.
- Contractor creates and sends an invoice.
- Homeowner views the invoice.
- Homeowner files eligible invoice records to Home History.
- Homeowner creates manual Home Reminders.
- Users submit support/feedback when something is confusing or broken.

Use this beta to learn whether the core workflow is understandable and useful in real contractor/homeowner relationships.

## Workflows Ready To Test

Contractor workflows:

- Business profile setup.
- Local customer/customer workspace basics.
- Connected homeowner records where permissions allow.
- Service request review.
- Estimate creation and sending.
- Accepted-estimate to Create Job handoff.
- Service jobs and checklist/report jobs.
- Job/report completion and filing.
- Invoice creation and sending where connected homeowner data supports it.
- Calendar and appointment visibility.
- Support/feedback submission.

Homeowner workflows:

- Account/home setup.
- Connected contractor workflow.
- Service request creation.
- Estimate review and acceptance.
- Invoice viewing.
- Invoice filing to Home History.
- Home History review.
- Manual Home Reminder creation.
- Calendar appointment/event detail review.
- Support/feedback submission.

## Not Ready / Do Not Promise

Do not tell beta users these are live:

- Stripe or in-app payment processing.
- QuickBooks or accounting sync.
- Push notifications.
- Email or text reminder automation.
- Recurring reminders or scheduler automation.
- Native mobile apps.
- Full external calendar sync.
- Broad Discover/feed marketplace lead volume.
- Public self-serve launch.
- Enterprise dispatch or advanced team operations.
- Automated contractor call tracking.

Reminders are manual in-app reminders only. Invoices can be created and viewed, but payment collection happens outside ServSync for now.

## Recommended Beta User Limits

Invite first:

- 2 to 3 trusted contractors.
- Contractors who already know the founder or are comfortable with direct beta feedback.
- Solo or very small teams.
- Contractors with simple request, estimate, job, invoice, and follow-up needs.
- Friendly homeowners who can test with those contractors.

Do not invite yet:

- High-volume teams that need dispatch, field roles, or advanced admin controls.
- Contractors that require Stripe, QuickBooks, SMS, email automation, or full calendar sync.
- Contractors expecting immediate public marketplace lead flow.
- Unpaired homeowners who do not have a friendly contractor workflow to test.
- Users who need a polished native mobile app.

## First-Week Operating Process

Before the first invite:

- Confirm the production URL loads publicly.
- Confirm the latest Vercel deployment is green on `serv-sync-app-refresh`.
- Confirm recent sandbox QA checks are green or documented.
- Prepare the beta invite message.
- Share the beta tester guide.
- Prepare the feedback triage log.
- Decide the exact first contractor and homeowner testers.
- Confirm beta users understand what is manual or not live.

During the first week:

- Review feedback every day.
- Track whether each user completes their assigned mission.
- Separate blockers from confusing UX and feature requests.
- Avoid broad feature expansion during the first week unless a core-loop blocker requires it.
- Keep authenticated QA in sandbox/preview.
- Keep production checks public/read-only unless production smoke accounts are separately approved.

After the first week:

- Summarize which workflows worked.
- Summarize repeated confusion.
- Rank blockers and bugs before feature requests.
- Decide whether to invite 1 to 2 more contractors or pause for fixes.
- Update beta docs/checklists if real usage changes assumptions.

## Support / Feedback Process

Preferred support path:

- In-app Support/feedback flow.

Acceptable early-beta backup:

- Direct founder text or email, if needed for fast support.

Ask beta users to include:

- Role: homeowner or contractor.
- Screen or tab.
- What they were trying to do.
- What they expected.
- What actually happened.
- Screenshot if easy.
- Whether the issue blocked their work.

Suggested response expectations:

- Blocker: same day, ideally within a few hours.
- Bug or confusing UX: acknowledge within 24 hours.
- Feature request or future integration: acknowledge and log for prioritization.

## Pause Criteria

Pause beta expansion if any of these happen:

- Any possible data access or privacy issue.
- Wrong user can see private records, documents, media, invoices, reports, reminders, or homeowner data.
- Login, signup, or password reset breaks for beta users.
- Request, estimate, approval, job/report, invoice, Home History, or reminder workflow breaks.
- Invoice-to-Home-History filing creates wrong records, duplicate records, or misleading storage/PDF behavior.
- A mobile issue blocks a key contractor or homeowner task.
- Multiple users fail the same workflow because it is confusing.
- Production deployment/checks fail.
- Users see fake metrics, stale claims, or unsupported trust/compliance language.

## Post-Week-One Decision Process

At the end of the first week, decide one:

- Continue with the same testers and fix small issues.
- Invite 1 to 2 more trusted contractors.
- Pause expansion for a focused cleanup branch.
- Re-scope the beta if a workflow is not ready for real users.

Decision inputs:

- Number of completed core-loop workflows.
- Number and severity of blockers.
- Repeated confusion themes.
- Mobile usability feedback.
- Support load.
- Whether users understood manual limitations.

## Operating Guardrails

- Do not mutate production data for QA unless separately approved.
- Do not create production smoke accounts unless separately approved.
- Do not use founder/personal accounts as automated test credentials.
- Do not promise future integrations as already live.
- Keep beta fixes narrow and reviewed.
- Keep broad public launch on hold.
