# ServSync Demo Mode Runbook

This runbook describes the hidden Demo Mode foundation for a dedicated ServSync demo environment. It is for internal operators preparing screenshots, screen recordings, onboarding videos, App Store previews, and sales demonstrations.

Demo Mode is not a public feature, not production data, and not a reset button inside the application. Slice 1 seeds one connected water-heater scenario into a dedicated demo Supabase project so the existing ServSync UI can show real records, permissions, and lifecycle behavior after logging in as the demo homeowner and contractor. Slice 2C-A adds a browser-safe presentation mode for the dedicated demo deployment only; it hides capture clutter and mutating controls but does not add browser-side checkpoint, reset, seed, role-switching, or privileged controls.

## Scope

Slice 1 includes:

- Private demo registry SQL: `demo_scenarios`, `demo_scenario_runs`, and `demo_scenario_records`.
- Private seed/reset/verify runner: `scripts/demo/seed-demo-scenario.mjs`.
- Dedicated demo auth identities, provisioned by the runner through the Supabase Admin API.
- One fictional homeowner, one fictional contractor company, one fictional property, an active connection, a water-heater service request, an accepted estimate, and a job created from that accepted estimate.
- Current-looking dates generated from a reset-time anchor.

Slice 1 excludes:

- Production SQL application.
- Shared sandbox use.
- User-facing Demo Mode UI.
- Role switching, impersonation, or browser-side privileged reset tools.
- Invoice creation/sending/payment, Home History filing, finalized job reports, report PDFs, reminders, messages beyond required workflow records, media, documents, storage uploads, public capture tooling, screenshots, or screen recording automation.
- Email, SMS, push, payment, webhook, accounting sync, AI, geocoding, or external calendar activity.

## Dedicated Environment Requirement

The runner must target a dedicated demo Supabase project and a dedicated demo Vercel environment. It refuses the known ServSync production and shared sandbox refs by default.

Known forbidden refs:

- Production: `uqgtheclhxqlnjpfmheq`
- Shared sandbox: `zpzdkoaubyjtsomccxya`

Do not run the seed/reset/verify commands against production or the shared sandbox. Do not place a service-role key in frontend code or browser-accessible environment variables.

The optional presentation mode is also dedicated-demo only. It activates in browser code only when all of these public Vite variables agree on the dedicated demo project:

- `VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED=true`
- `VITE_SERVSYNC_DEMO_PROJECT_REF=bdytwgejqnlblhrnqxkp`
- `VITE_SUPABASE_URL` parses to project ref `bdytwgejqnlblhrnqxkp`

Presentation mode fails closed for missing, malformed, mismatched, production, or shared-sandbox refs. Do not use it outside the dedicated demo Vercel environment.

## Required Environment Variables

Values are intentionally omitted from this runbook.

- `DEMO_MODE_ENABLED`
- `DEMO_SUPABASE_URL`
- `DEMO_SUPABASE_PROJECT_REF`
- `DEMO_SUPABASE_ANON_KEY`
- `DEMO_SUPABASE_SERVICE_ROLE_KEY`
- `DEMO_HOMEOWNER_EMAIL`
- `DEMO_HOMEOWNER_PASSWORD`
- `DEMO_CONTRACTOR_EMAIL`
- `DEMO_CONTRACTOR_PASSWORD`
- `DEMO_RESET_ACKNOWLEDGE` for reset only
- `DEMO_ANCHOR_TIMESTAMP` optional

The runner also refuses to proceed if these external-effect flags are set to enabled-looking values in the process environment. Rejected values are case-insensitive and include `true`, `1`, `yes`, `on`, and `enabled`. Unrecognized non-empty boolean values also fail closed; unset the flag or use a clear disabled value such as `false`.

- `EMAIL_ENABLED`
- `STRIPE_ENABLED`
- `SMS_ENABLED`
- `PUSH_NOTIFICATIONS_ENABLED`
- `WEBHOOK_DELIVERY_ENABLED`
- `QUICKBOOKS_ENABLED`
- `ACCOUNTING_SYNC_ENABLED`
- `AI_ENABLED`
- `GEOCODING_ENABLED`

No email, SMS, push, payment, webhook, AI, geocoding, storage upload, or deployment action is part of Slice 1.

## One-Time SQL Preparation

Apply `servsync-demo-mode-foundation.sql` only to the dedicated demo Supabase project after separate approval. Do not apply it to production or the shared sandbox.

The SQL creates private registry tables and internal helper functions. RLS is enabled on all registry tables, browser roles do not receive table access, and privileged helper functions are not executable by `public`, `anon`, or `authenticated`.

## Commands

Run commands only from the repository root after loading the dedicated demo environment.

```bash
npm run demo:seed
npm run demo:verify
DEMO_RESET_ACKNOWLEDGE=reset-water_heater_core_loop npm run demo:reset
npm run demo:checkpoints
```

By default, `demo:seed` restores the backward-compatible `job_created` checkpoint. Slice 2A and Slice 2B also support explicit checkpoint restoration through argument forwarding:

```bash
npm run demo:seed -- --checkpoint=request_ready
npm run demo:verify -- --checkpoint=request_ready
```

The canonical documented form is `--checkpoint=<key>`. The runner also accepts `--checkpoint <key>` for operator convenience. Unknown, empty, malformed, or deferred checkpoint keys fail before remote target validation or mutation.

The command output reports safe identifiers, run reconciliation summaries, verification categories, and record counts. It must not print passwords, tokens, access keys, or full sensitive environment values.

## Supported Slice 2A and Slice 2B Checkpoints

Slice 2A adds deterministic checkpoint restoration for the existing `water_heater_core_loop` scenario through accepted-estimate job creation. Slice 2B extends the same private runner through lightweight job lifecycle checkpoints, without invoice creation, Home History filing, report finalization, media, storage, public controls, or browser checkpoint controls. Slice 2C-A adds a dedicated-demo-only presentation mode that makes these checkpoints easier to capture visually while preserving the underlying product states.

| Checkpoint | Primary role | Purpose | Expected records |
| --- | --- | --- | --- |
| `request_ready` | Homeowner | Fresh homeowner request for water-heater replacement. | Property, connection, one service request; no estimate or job. |
| `contractor_review_ready` | Contractor | Contractor-readable request state. This is a narrative checkpoint, not a fabricated product status. | Property, connection, one service request; no estimate or job. |
| `estimate_draft` | Contractor | Contractor draft estimate with line items and payment schedule rows. | One draft estimate; no sent evidence, approval event, or job. |
| `estimate_sent` | Homeowner | Homeowner review state for a sent estimate. | One sent estimate with sent evidence; no approval event or job. |
| `estimate_accepted` | Contractor | Accepted-estimate handoff before job creation. | One accepted estimate and exact `estimate_approved` workflow event; no job. |
| `job_created` | Contractor | Final Slice 1 state with accepted estimate and linked draft job. | Accepted estimate, exact `estimate_approved` event, linked draft job, exact `job_created` event. |
| `job_scheduled` | Contractor | Job scheduled with the real visit scheduling RPC. | Linked job status `scheduled`, one private contractor visit event, no homeowner appointment proposal. |
| `job_in_progress` | Contractor | Controlled demo fixture state for active work. | Linked job status `in_progress`; some estimate-derived work items complete and at least one still open. |
| `job_review_ready` | Contractor | All seeded work items completed before lightweight completion. | Linked job remains `in_progress`; all estimate-derived work items complete; no completed-at timestamp. |
| `job_completed` | Contractor | Lightweight current-product completion. | Linked job status `completed`, completed timestamp present, visit event completed, no closed timestamp, invoice, Home History row, report file, or fabricated `job_completed` workflow event. |

Deferred checkpoints are not supported in Slice 2B and must not be claimed as available: `estimate_viewed`, `invoice_draft`, `invoice_sent`, `invoice_paid`, and `home_history_updated`.

## Checkpoint Reset and Restore Behavior

Checkpoint seed uses one canonical lifecycle path and advances only as far as the selected checkpoint. It does not keep independent per-checkpoint seed scripts.

Before any seed, the runner resets all non-reset seed runs for the scenario, including `started`, `failed`, and `succeeded` runs. Moving from a later checkpoint to an earlier checkpoint therefore uses reset-and-rebuild behavior. For example, seeding `job_created` and then seeding `request_ready` removes the registered job, estimate, workflow-event, and request rows from the old run, then rebuilds only the request-ready graph while preserving the demo auth identities.

`demo:verify` behavior is checkpoint-aware:

- With no `--checkpoint`, it verifies the active successful run's recorded checkpoint.
- With `--checkpoint=<key>`, it requires the requested checkpoint, the active run metadata, and the database graph to match.
- Lower checkpoints explicitly require later records to be absent. For example, `request_ready` fails if an estimate or job remains, and `estimate_accepted` fails if a linked job or `job_created` event exists.

Registry rows record the creation step/checkpoint for each resettable row, and every resettable row remains tied to the exact run that created it. No `is_demo` fields are added to product tables. Slice 2B extends the reset allowlist only for registered `contractor_visit_events` rows created by the demo scheduling checkpoint.

## Scenario Contents

Scenario key:

- `water_heater_core_loop`

Fictional homeowner:

- Sarah Johnson
- `example.test` email address
- Reserved `555-01xx` phone number
- Fictional South Alabama property

Fictional contractor:

- Gulf Coast Home Services
- Fictional contractor owner
- `example.test` email address
- Reserved `555-01xx` phone number
- Plumbing / water-heater service categories where supported

Scenario records:

- Populated homeowner profile.
- Populated contractor profile/company.
- One property with a garage utility area and water-heater asset.
- Active homeowner-contractor connection with only the permissions needed for this workflow.
- Service request: `Replace leaking water heater`.
- Estimate with realistic fictional line items, notes, terms, and structured payment schedule rows.
- Homeowner acceptance through the existing estimate response RPC.
- Job creation through the existing accepted-estimate-to-job RPC.

All names, addresses, prices, and notes are fictional and presentation-safe. Demo pricing is not market guidance.

## Date Anchor Behavior

The runner uses a reset-time anchor timestamp. Relative dates are regenerated from the anchor so the demo remains current-looking:

- Profile/property records predate the scenario.
- Connection predates the request.
- Request appears about one day before the anchor.
- Estimate appears after the request.
- Estimate approval is verified through the durable `estimate_approved` workflow activity event created by the homeowner response RPC. The runner normalizes that demo-owned event into the anchor-based date sequence, but it does not treat trigger-managed `estimates.updated_at` as a dedicated acceptance timestamp.
- Job creation is verified through the durable `job_created` workflow activity event and the linked job record created by the accepted-estimate-to-job RPC. The runner normalizes the demo-owned job row and job-created event into the anchor-based date sequence before later checkpoint verification.
- Job scheduling uses the product `servsync_schedule_visit_event` RPC with `share_with_homeowner=false`, then normalizes the registered visit event timestamp from the anchor so recordings remain current-looking.
- Job progress and review-ready checkpoints use controlled fixture transitions because ServSync does not yet expose dedicated start-job or review-ready RPCs.
- Lightweight job completion mirrors the current simple job completion boundary: it marks the job completed and completes the linked visit event without finalizing a report, creating an invoice, uploading storage, filing Home History, or notifying the homeowner.

Use `DEMO_ANCHOR_TIMESTAMP` only when a recording needs a deterministic timestamp. Otherwise the runner uses the current time.

## Reset Safety

Reset is registry-based. The runner may delete only rows registered in `demo_scenario_records` for a specific run and only from the SQL allowlist of supported Slice 1 tables.

Before reseeding, the runner inspects all non-reset seed runs for the selected scenario, including `started`, `failed`, and `succeeded` runs. It reconciles registered records from those prior runs before starting a new run, and it refuses to continue if any prior run cannot be safely reset. It does not silently ignore failed or started runs.

Before creating new resettable records, the runner also checks for likely scenario-owned residue that matches stable demo ownership markers but is not registered. If such records are found, the seed fails closed and reports the affected table and ID. Do not add a broad cleanup shortcut by email, user ID, title text, timestamp, or scenario-like wording.

Reset does not:

- Truncate tables.
- Delete auth users.
- Delete demo public profiles or contractor company identity rows during ordinary scenario reset.
- Disable RLS.
- Delete records by user ID as a fallback.
- Touch unregistered records.
- Clean broad production or sandbox data.

If registry ownership is incomplete, stop and audit rather than adding an unsafe cleanup shortcut.

Slice 1 does not register or reset incidental in-app notifications. Existing workflow triggers may still create in-app notifications, but the demo runner does not claim notification ownership using broad recipient or timestamp queries.

## Verify Behavior

`npm run demo:verify` checks the complete graph for the active checkpoint, not just record counts. With no checkpoint argument, it verifies the checkpoint stored on the active successful run. With `--checkpoint=<key>`, the requested checkpoint must match the active run checkpoint before the database graph is accepted.

Checkpoint-specific verification includes:

- `request_ready`: requires one request and forbids estimates, jobs, approval events, and job-created events.
- `contractor_review_ready`: requires the same request graph in a contractor-readable state without fabricating a durable request status.
- `estimate_draft`: requires one draft estimate with line items and payment schedule rows, and forbids sent evidence, approval events, and jobs.
- `estimate_sent`: requires one sent estimate with sent evidence, and forbids approval events and jobs.
- `estimate_accepted`: requires one accepted estimate and the exact current-estimate `estimate_approved` event, and forbids jobs and `job_created` events.
- `job_created`: requires the accepted estimate, exact current-estimate approval event, linked draft job, exact current-job `job_created` event, and valid event ordering.
- `job_scheduled`: requires the linked job to be `scheduled`, one registered private contractor visit event, and no homeowner appointment proposal.
- `job_in_progress`: requires the linked job to be `in_progress`, completed evidence for the first subset of estimate-derived job work items, at least one open estimate-derived work item, and no manual work items.
- `job_review_ready`: requires the linked job to remain `in_progress`, all seeded estimate-derived work items completed, and no job completed timestamp.
- `job_completed`: requires lightweight job completion with `completed_at`, no `closed_at`, completed private visit event, all seeded work items completed, and no invoice, Home History row, finalized report, storage path, or durable `job_completed` workflow event.

All checkpoint verifications also require:

- The dedicated demo-project guard to pass.
- Exactly one active succeeded seed run with registered records.
- No unresolved `started` or `failed` seed runs that still own registered records.
- Demo homeowner and contractor auth users with expected demo ownership metadata.
- Distinct homeowner and contractor identities.
- Matching public profiles, homeowner profile, and contractor profile/company.
- One intended demo home, active connection, required connection permissions, and the records required by that checkpoint.
- Registry rows that point to real supported records with no duplicate registry target.
- Valid date ordering for every stage present in that checkpoint, including scheduled visit before lightweight completion where present.

`verify` exits non-zero if any required check fails.

## Login and Recording Guidance

Use separate browser profiles or separate browsers for the homeowner and contractor identities. Do not use impersonation or frontend identity replacement.

Recommended recording order:

1. Log in as the demo homeowner to show the property and service request.
2. Log in as the demo contractor to show the connected request and accepted-estimate job handoff.
3. Return to the homeowner only where the seeded workflow already supports real homeowner visibility.

Slice 2C-A presentation mode may be enabled only in the dedicated demo Vercel environment. In that mode, setup prompts, onboarding checklists, subscription/readiness clutter, notification badges/lists, and selected mutating capture-surface controls are visually hidden so screenshots and recordings stay focused. The mode also uses presentation-safe job checkpoint copy such as `Draft job created from accepted estimate`, `Contractor visit scheduled`, `Work in progress`, `Ready for contractor review`, and `Work completed. Billing and home records are the next workflow and are intentionally outside this demo.`

Slice 2C-A still does not add browser checkpoint controls, role switching, reset buttons, screenshot automation, public demo controls, invoices, Home History, reports, PDFs, media, reminders, payments, or notification delivery. Checkpoint selection remains a private local/server-side runner operation.

## Troubleshooting

If seed fails:

- Confirm the dedicated demo SQL foundation was applied.
- Confirm `DEMO_MODE_ENABLED=true`.
- Confirm `DEMO_SUPABASE_URL` and `DEMO_SUPABASE_PROJECT_REF` point to the same dedicated demo project.
- Confirm the target is not production and not the shared sandbox.
- Confirm demo passwords are present but not printed.
- Confirm external-effect flags are unset or clearly disabled, not enabled-looking values.
- If an existing auth email is found, confirm that user already has `servsync_demo_owned`, `servsync_demo_scenario`, and `servsync_demo_role` metadata for this scenario. The runner will not repurpose a normal user by email alone.

If reset fails:

- Confirm `DEMO_RESET_ACKNOWLEDGE=reset-water_heater_core_loop`.
- Confirm all prior `started`, `failed`, and `succeeded` seed runs can be inspected.
- Do not perform broad manual deletes. Audit the registry rows first.

If repeated seed shows duplicates:

- Run `npm run demo:verify`.
- Confirm no failed or started run still owns records.
- Confirm all newly created rows were registered.
- Do not delete records by user ID as a shortcut.
- Remember that auth identities, public profiles, homeowner profile details, and contractor company identity rows are intentionally reconciled and preserved rather than reset/deleted.

If `verify` reports suspected unregistered records:

- Stop and inspect the reported table and record IDs.
- Confirm whether the rows are demo-owned and why they were not registered.
- Prefer a targeted, separately reviewed recovery step. Manual cleanup must never use broad table deletes, truncation, user-wide deletes, timestamp windows, or title-text matching.

If multiple active runs are reported:

- Run the guarded reset command once with the explicit acknowledgement.
- Re-run `npm run demo:verify`.
- Stop if any run cannot be reset through the registry.

## Adding Future Scenarios

Future scenarios should add a new stable scenario key, register every resettable record, use fictional `example.test` identities, avoid real customer data, and keep external delivery disabled unless a separately approved provider-test plan exists.
