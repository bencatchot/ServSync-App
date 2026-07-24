# Controlled Operations Policy And Runbook

Status: local and provider-neutral controlled-operations foundation documented through Slice 2D-A. Slice 2D-B live provider adapters, provider credentials, deployments, SQL authority, and live-environment operation remain deferred.

This document is the authoritative operator policy for the controlled-operations evidence tooling. It complements the broader [FB-020 Operations And Security Readiness Runbook](FB-020_OPERATIONS_SECURITY_READINESS_RUNBOOK.md), but it does not approve production work, provider access, SQL, deployment, or live operational commands.

## Current Capability

The controlled-operations foundation currently provides packet-local evidence for high-risk operational workflows. Implemented slices cover:

- Slice 1: provider-neutral operation packets, execution tokens, sanitized command evidence, terminal token states, packet-wide locking, workflow freeze, manifests, seals, expected external seal-digest verification, and fail-closed packet verification.
- Slice 2A: local-only structured browser workflow capture for controlled browser evidence.
- Slice 2B: browser safety and privacy boundaries for retained packet evidence.
- Slice 2C-A: packet-bound browser import, browser summaries, import summaries, artifact-index entries, promotion events, and recoverable local browser-import transactions.
- Slice 2C-B: browser-aware freeze, manifest, seal, and verification, including v1 and v2 browser packet evidence.
- Slice 2C-C1: browser attempt lineage, up to three sequential attempts, one active attempt per stage, retained terminal outcomes, latest terminal success selection, and anti-cherry-picking.
- Slice 2C-C2: authorized interrupted-attempt reconciliation, explicit cleanup-assurance recording, retry-after-reconciliation rules, and prevention of silent disappearance for claimed or started browser attempts.
- Slice 2D-A: provider-neutral adapter contract, local fake provider adapter, provider-operation evidence shape, and local external-anchor custody reference implementation.
- Slice 3: this policy and runbook closeout.

The current tooling can create and verify evidence packets for local fake commands, local browser pilot runs, packet-bound browser evidence, and local fake-provider simulations. It can freeze, manifest, seal, and verify packet evidence when all token, attempt, browser, provider, privacy, and integrity requirements are satisfied.

The current tooling does not provide:

- live provider authority;
- credential resolution or secret custody;
- Production, Sandbox, Preview, Demo, Vercel, Supabase, GitHub, or SQL authority;
- automatic rollback of a real provider action;
- nonrepudiation against host compromise;
- protection against a privileged actor who can rewrite a whole packet and every external anchor;
- proof that an external browser workspace was deleted after process or host loss;
- a real Vercel, Supabase, GitHub, billing, deployment, or database adapter.

## Trust Model

Controlled operations separate authorization, execution, evidence, and external anchoring.

The packet proves what the local harness observed and retained under its own token, filesystem, schema, scan, and locking rules. It does not prove that the host was uncompromised. It does not create provider authority. It does not grant a human or process permission to mutate Production, Sandbox, Preview, Demo, Vercel, Supabase, GitHub, SQL, Storage, Auth, or customer data.

Workflow-frozen means packet files are locked by the harness lifecycle and verified by packet digests and modes. It is not OS-level immutability. A seal is internally tamper-evident only as long as the original seal digest is retained outside the packet. If a privileged actor can reconstruct the whole packet and replace the external reference, internal verification alone cannot detect that reconstruction.

External seal-digest custody is therefore mandatory for any real audit claim. The packet must not store its own external trust anchor as the sole source of truth.

## Operator Runbook

Use this sequence for any approved local controlled-operations exercise.

1. Confirm scope and authority.
   - Verify the task explicitly authorizes the operation category, target class, evidence retention, and environment boundary.
   - Stop if the task asks for live provider access, SQL, deployment, credentials, or Production/Sandbox/Preview/Demo authority without a separate approval.
2. Prepare a local packet location.
   - Use a packet-owned directory outside application source and outside generated artifact directories.
   - Keep private evidence directories mode `0700` and private evidence files mode `0600` where practical.
3. Create operation metadata and execution token evidence.
   - Use the controlled-ops token model.
   - A claimed or started token must reach a terminal state, or it must be explicitly reconciled where browser attempt recovery allows it.
4. Run only approved local commands or local browser workflows.
   - Use fake commands, loopback services, and local fake providers unless the task separately approves a real provider adapter.
   - Do not use a real operational command as a stand-in for local validation.
5. Promote evidence into the packet.
   - Retain only sanitized summaries and supported packet-owned artifacts.
   - Do not retain raw stdout/stderr, raw browser journals, screenshots, traces, HAR, videos, DOM, HTML, headers, cookies, request/response bodies, credentials, or customer content.
6. Reconcile browser attempts when needed.
   - Claimed or started browser attempts may not disappear.
   - Reconciliation requires explicit bounded authorization and honest cleanup assurance.
   - A later retry may begin only after the current lineage tail is terminal, represented, and continuable.
7. Freeze the workflow stage.
   - Freeze only after tokens, attempts, transactions, quarantine, artifact indexes, browser verification, provider evidence, privacy scans, and cleanup policies are satisfied.
8. Build packet manifest and seal.
   - Confirm manifests and seals include the final event-chain head, permission digest, scan summaries, stage-freeze digests, and browser/provider evidence through the normal packet inventory.
9. Retain the seal digest outside the packet.
   - Store the returned seal SHA-256 using an approved external custody location.
   - Keep the custody record outside the packet and do not treat packet-local copies as an independent anchor.
10. Verify.
   - Verify the packet with the expected external seal digest.
   - Treat missing, mismatched, or unavailable external digest custody as a stop condition for audit-grade acceptance.

## Stop Conditions

Stop and do not continue the controlled operation when any of these conditions appears:

- a required branch, PR, commit, base SHA, head SHA, or scope differs from the approved task;
- live provider, SQL, Supabase, Vercel, Production, Sandbox, Preview, Demo, Auth, Storage, or customer-data access would be needed;
- credentials, tokens, provider secrets, or private IDs are required but not separately approved;
- a token remains claimed or started without terminal evidence or authorized reconciliation;
- a browser attempt lineage has an unresolved tail, missing outcome, invalid selection, or anti-cherry-picking failure;
- cleanup assurance is `cleanup_not_completed` or `cleanup_state_unknown_after_process_loss` and the next action requires continuable cleanup;
- a transaction, candidate, mutation lock, quarantine file, unknown hidden file, or unsupported transient file remains unresolved;
- packet verification reports a schema, canonicalization, mode, digest, scan, manifest, seal, or external-anchor mismatch;
- a packet contains raw browser output, command output, credentials, customer content, prohibited artifacts, or generated packets that should remain private;
- the host platform cannot enforce required no-follow, ownership, link-count, mode, process-group, or directory-sync semantics.

## Evidence Retention Policy

Retain only the packet-owned evidence needed to prove the controlled operation. Supported retained evidence includes operation metadata, canonical event records, token records, sanitization summaries, retained sanitized artifacts, browser summaries, browser import summaries, browser attempt outcomes, reconciliation records, attempt selection, browser freeze verification records, provider plans/results, stage manifests, stage-freeze records, packet manifests, seals, and local external-anchor custody references.

Do not retain:

- raw command stdout or stderr;
- raw browser journals;
- launch descriptors;
- reporter-ready files;
- workspace paths;
- source paths;
- console or page-error text;
- screenshots, traces, videos, HAR, HTML, DOM snapshots, accessibility snapshots, or storage state;
- URLs with query or fragment, headers, cookies, request bodies, or response bodies;
- Supabase, Vercel, GitHub, provider, Auth, Storage, SQL, or credential values;
- customer names, emails, phone numbers, addresses, notes, or other customer content.

Generated local evidence packets, local probes, raw quarantine output, and private custody files must stay outside Git unless explicitly sanitized and approved for documentation.

## External Anchor Custody

The packet seal returns a SHA-256 digest. For audit-grade tamper evidence:

- retain that digest outside the packet;
- keep the custody location independent from the packet directory;
- protect the custody location with local permissions or an approved external records system;
- verify later packets with the expected digest;
- reject `EXTERNAL_ANCHOR_MISMATCH`;
- treat an absent expected digest as limited internal verification, not independent tamper evidence.

Slice 2D-A includes a local reference custody implementation for fake-provider/local use. It is not a live custody provider, not a credential vault, and not a deployment or production-record system.

## Failure And Recovery Guidance

| Condition | Packet representation | Operator action |
| --- | --- | --- |
| Command never started | failed-before-execution or reconciled pre-execution outcome | Verify no start evidence, retain terminal evidence, then decide whether an approved retry is allowed. |
| Command exited normally | terminal token with normal exit provenance | Retain sanitized evidence and continue only if policy permits the result. |
| Command was signaled or interrupted | terminal token with signal or interruption provenance | Retain the honest terminal result; do not fabricate a normal exit code. |
| Browser attempt claimed but never started | authorized reconciliation record and terminal pre-execution outcome | Require explicit authorization; no elapsed-time-only terminalization. |
| Browser attempt started and process was lost | authorized reconciliation with honest cleanup assurance | Represent unknowns honestly; allow retry only if cleanup policy is continuable. |
| Browser workspace cleanup succeeded in-process | `authenticated_in_process_cleanup` | May be continuable if all packet evidence verifies. |
| Browser workspace state is unknown after process loss | `cleanup_state_unknown_after_process_loss` or packet-only recovery assurance | Do not claim global workspace absence; block retry/freeze/seal until separate resolution represents a continuable state. |
| Cleanup failed | `cleanup_not_completed` | Block retry/freeze/seal until separately resolved or represented by an approved noncontinuable outcome. |
| Import transaction remains | packet transaction state | Resume or reconcile under packet mutation lock; do not freeze or seal. |
| External anchor mismatch | seal verification failure | Stop; do not reconstruct trust from packet-local data alone. |

## Provider Boundary

The provider-neutral adapter contract defines how a future provider operation can be planned, classified, executed, retained, and verified without hardcoding a live provider into the packet core. The local fake provider adapter is for tests and local pilots only.

Before any live provider adapter exists, a separate approval gate must define:

- the provider and exact target class;
- credential source and custody;
- permission and role boundary;
- dry-run and cancellation semantics;
- idempotency key policy;
- timeout, retry, and ambiguous-result handling;
- rollback or compensating-action policy;
- sensitive-output redaction;
- live-environment stop conditions;
- external anchor custody outside the packet;
- independent review and re-audit requirements.

Generic automation convenience is not enough to approve a live provider adapter.

## Planning Reconciliation

Controlled Operations Slices 1, 2A, 2B, 2C-A, 2C-B, 2C-C1, 2C-C2, and 2D-A are complete on the current foundation. Slice 3 documentation is current with this runbook. Slice 2D-B live provider adapter work remains deferred until a specific provider, credential, target, authorization, and rollback model is approved.

The next controlled-operations workstream should remain provider-neutral planning unless an owner explicitly approves a live-provider implementation gate.
