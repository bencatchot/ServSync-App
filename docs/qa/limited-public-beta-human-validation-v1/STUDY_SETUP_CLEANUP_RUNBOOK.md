# Study Setup and Cleanup Runbook

## 1. Environment policy

| Target | Allowed use |
| --- | --- |
| Sandbox Supabase `zpzdkoaubyjtsomccxya` with an exact-main local/Preview app | Preferred for mutable contractor and homeowner sessions, provided approved test identities and exact cleanup authority are available. |
| Dedicated Demo | Read-only orientation or a supported `water_heater_core_loop` checkpoint. Mutation is allowed only through its private, approved seed/reset/verify operator and documented exact records. Demo currently supports request through lightweight Job completion, not Invoice, payment, or Home History checkpoints. |
| Production | Prohibited for study mutation, fake participants, or fake business records. Bounded public/read-only smoke is not a human study session. |

Never use a target when its environment identity is uncertain. Never move public domains or enable external providers for a session.

## 2. Session identity and fictional data

Assign `C01-YYYYMMDD-A` or `H01-YYYYMMDD-A`. Use that session ID in every safely taggable fictional label and in the private mutation ledger.

Use:

- `example.test` email addresses or another approved non-delivery test domain;
- reserved fictional phone values;
- clearly fictional names and properties;
- test-only prices and offline payment methods;
- no personal photos, documents, messages, or addresses.

Do not put credentials in task sheets, notes, shell history, or Git.

## 3. Preflight

Before every session:

1. Record repository/deployment SHA and application URL.
2. Verify Supabase project ref is the intended non-Production target.
3. Verify external email, SMS, live Stripe, live webhooks, and Production Cron are disabled or unreachable from the session path.
4. Verify the approved contractor/homeowner test identity and role.
5. Capture baseline counts and exact IDs for the scenario's Customers, properties, requests, Drafts, Estimates, Jobs, Invoices, payments/events, and Storage objects.
6. Verify each planned task against the staged state in both desktop and required phone viewport.
7. Verify sign-out works.
8. Open a private session mutation ledger outside Git.

Abort if any baseline is ambiguous, unrelated records could be deleted, a participant could reach Production, or a task requires an unsupported provider action.

## 4. Sandbox session strategy

Prefer one isolated tagged scenario per session. Record every created ID as soon as it exists. For pre-staged lifecycle states, record source fixture IDs and restoration method before starting.

Do not rely on searching by a broad name during cleanup. Do not use wildcard or tenant-wide delete commands. Cleanup must target exact IDs and verify ownership/lineage before mutation.

Prepare tasks at durable checkpoints so session time is not spent waiting for cross-role coordination. The participant may work within the checkpoint, but do not pretend a pre-staged transition was performed during the session.

## 5. Dedicated Demo strategy

The private Demo runner supports `water_heater_core_loop` checkpoints from contractor discovery through `job_completed`. Use only documented commands after loading the approved Demo operator environment:

```bash
npm run demo:checkpoints
npm run demo:seed -- --checkpoint=<supported_key>
npm run demo:verify -- --checkpoint=<supported_key>
DEMO_RESET_ACKNOWLEDGE=reset-water_heater_core_loop npm run demo:reset
```

The runner is not a generic study-data deleter. It does not support Invoice, paid Invoice, or Home History checkpoints. Do not force unsupported rows into Demo to complete the contractor script.

## 6. Large Customer-list task

The product's automated regression uses 322 in-memory Customer options, but that is not a reusable human-study fixture and is not human evidence.

Run the participant scale task only when a dedicated Sandbox study tenant has approximately 300 clearly tagged fictional Customers and:

- creation/reset authority is approved;
- the baseline and exact fixture membership are known;
- cleanup does not risk unrelated records;
- the target Customer has at least one similar name and clear property context;
- desktop and mobile preflight pass.

Otherwise mark the task `NOT STAGED - scale fixture unavailable`. Do not create hundreds of Production records and do not score the participant as failing.

## 7. Recording and evidence

Request consent separately for screen and audio. A participant may continue without recording. Facilitator notes are always required.

Store recordings outside Git under anonymous session ID. Do not record password entry. Avoid browser tabs, notifications, or desktop surfaces that reveal personal information. Follow applicable recording-consent law and the owner's retention policy.

## 8. Exact cleanup

Immediately after each session:

1. Sign out the participant.
2. Freeze the session mutation ledger.
3. Compare created/changed IDs with the baseline.
4. Remove disposable records in dependency-safe reverse lifecycle order using established, authorized operators or exact record APIs.
5. Restore altered fixture state using the documented scenario reset, never ad hoc broad SQL.
6. Remove session Storage objects by exact bucket/path only when the path is documented as session-created.
7. Re-query every recorded ID and confirm expected absence or restored baseline state.
8. Reconcile aggregate counts to baseline and verify unrelated fingerprints where available.
9. Run the scenario's verify/read-only smoke.
10. Record cleanup timestamp, operator, result, and any residue.

Stop future sessions if cleanup is incomplete. Never "fix" ambiguity with a broad delete.

## 9. Dry-run evidence for v1 preparation

The preparation review mapped every task to current source and focused tests, verified the dedicated Demo checkpoint contract, and ran bounded Sandbox contractor/homeowner read-only smoke. The large-list selector has automated 322-option desktop/mobile coverage. This confirms that the protocol can be staged, with these explicit limits:

- no human participant has run the protocol yet;
- no large persistent study fixture was created;
- Demo alone cannot execute Invoice/payment/Home History tasks;
- mutable end-to-end sessions require approved Sandbox fixture setup and exact cleanup.

These limits must remain visible in the study decision record.
