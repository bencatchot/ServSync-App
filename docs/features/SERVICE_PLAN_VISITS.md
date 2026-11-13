# Service Plan visit tracking — first version

Status: source implementation on `codex/service-plan-visits`, based on released main `111c3097f0d8982518256d99c80da0c052ecc121`. PR595 is excluded. Production is unchanged.

## Behavior

Authorized contractor owners/admins/office users open Jobs → Service Plans → Accepted plan visits. Customer and property labels distinguish plans. `Set up visits` explicitly creates the accepted allowance's slots once, without dates or Jobs. A plan with zero visits creates none. A plan with no allowance retains that unknown total; `Add a tracked visit` records one explicit visit without changing the contract.

Each slot has a target due date and optional existing Job for the exact contractor, homeowner and property. `Start New Draft for this property` enters the existing contextual Draft workflow; after creating the Job, return to Service Plans to link it. This first version deliberately requires that explicit link. `Open Job / schedule` reuses normal Job/appointment/Calendar work; finalized work opens the existing Job/report. There is no separate scheduler or appointment creation RPC.

Completion is read from the linked Job (`completed` or `closed`), never a stored counter. Cancelling or rescheduling an appointment does not consume a visit. A cancelled Job does not count; reopening supported work changes progress on reload. The app's existing finalized-report reopening limit remains. A mistaken completed link can instead be corrected through an explicit confirmation; before/after visit state is recorded and the original Job/report is untouched. One Job cannot count toward multiple visits.

Visit progress is private until explicitly shared. The homeowner projection contains only shared visit dates/status and labels its completion count as partial shared progress; no private Job identifier/title/report data is returned. Existing report sharing stays separate. Current active connection and exact property-sharing authorization are rechecked. Managers can stop sharing on inactive/read-only plans. Field technicians gain no access to plan price/terms or visit management; they continue working on authorized Jobs.

Work overview, Needs Attention and Active Jobs show overdue and next-30-day targets for active plans. Dates are date-only targets, not timed appointments. Refresh/reopening the view derives current counts. Background refresh keeps dirty edits, and conflicting versions require discard/review. Actor changes clear data; unconfirmed unknown-allowance setup uses a per-user/plan session action identity for safe retry.

## Persistence and rollout

Additive artifact: `supabase/migrations/20261113223048_service_plan_visits.sql`. It creates private visit/change-history tables, guarded RPCs and an identity guard on linked Jobs. It requires the existing Service Agreements, Jobs and entitlement foundations; it is not a standalone replacement schema. No hosted migration has been applied. The normal repository rollout ledger marks Sandbox, Demo and Production Pending.

The database preserves accepted snapshots. No schedules, renewals, invoices, charges, notifications or external communications are generated. Linked Jobs cannot be reassigned to a different customer/property or deleted while linked. Corrections must precede reassignment; existing report/history policies remain independent.

For real acceptance, separately approve applying the exact reviewed artifact to an identified non-production project and a bounded fictional plan/Job/appointment test with exact fixture cleanup. No approval is inferred for Production, retained showcase or seven pending cleanup records.

## Validation evidence and limits

- Disposable local PostgreSQL installs the actual Service Agreement foundation and visit migration over minimal existing dependency fixtures. Tests cover known/unknown/zero allowances, retries/concurrent action identity, foreign properties/tenants, field-tech/homeowner/anonymous denial, office management, entitlement restrictions, private/shared projection, connection/property revocation, date changes, cancelled/completed/reopened Job projections, completed correction history and snapshot preservation.
- Lifecycle tests update disposable Job fixture status; they do not claim live execution of all existing Job RPCs or actual Calendar cancellation UI.
- Four pure logic tests passed and cover completion, date-only attention, unknown/partial shared totals and candidate isolation.
- All 16 desktop/mobile component cases passed. These tests use fictional client fixtures, not live backend persistence. They verify existing navigation callbacks, state refresh, corrections, failure recovery and account interruption.
- Hosted schema, authenticated real-backend scheduling/completion/report acceptance, tutorial playback and final owner review remain gates until separately evidenced.

Local verification: 20 existing Service Plans source regressions passed (one broad source assertion was updated for the authorized contextual Draft callback), 27 architecture tests, 16 backend-parity/ledger tests and 6 runtime-parity tests passed. Typecheck, build and lint passed (0 errors, unchanged 76-warning baseline). Independent source review found no remaining blocking findings after fixes. Mobile screenshot `/tmp/servsync-plan-visits-390.png` was visually inspected; desktop screenshot `/tmp/servsync-plan-visits-1440.png` was captured.

Migration SHA-256: `3bcba1c91d9427d70a9e19a18932f44ab619771b5030525c03c29aba6818a7de`.

Tutorial impact: pending the required post-Preview catalog and playback comparison. No tutorial completion or Production availability is claimed.
