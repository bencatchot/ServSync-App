# Astra audit corrections — September 7, 2026

The audit corrections are implemented on `codex/astra-audit-corrections-2026-09-07`, isolated from the owner's existing working changes. Release remains pending: the branch must pass Preview review and the repository's Help Studio freshness gate before an approved merge. This is not a claim that the fixes are live.

## Changes and verification

| Audit item | Correction | Evidence and limits |
| --- | --- | --- |
| F1: connected customer absent in Calendar event picker | Calendar and the new-event composer offer a connected-customer path into the existing service-request appointment flow; the local event selector is explicitly labeled Local customer. | Component filtering test excludes other customers and closed requests. Authenticated Demo test follows the connected customer's request handoff. No new cross-customer sharing or appointment mutation. |
| F2: Draft invoices counted as Open; tiles open All | One shared Open predicate includes sent, viewed, overdue, and partially paid. Draft, Open, and Closed tiles clear stale search/customer focus and select their matching filter. | All seven invoice states covered; component counts/callbacks and actual Demo tile-to-filter navigation pass. |
| F3: Customer Jobs count includes estimates/invoices/requests | Jobs uses the same active operational Job count as its destination. | Source review confirms financial/request counts removed from the Jobs tile. Existing financial and request destinations retained. |
| F4: mobile menu and notification labels | Named buttons and expanded state; a native navigation dialog with Escape, focus wrap/restoration, background scroll containment, and an explicit Close button. | Contractor/homeowner mobile smoke plus 390px keyboard interaction pass. StrictMode open/cleanup issue found and corrected during validation. |
| Intermittent Home Access warning after account switch | Dashboard identity keys, remembered property cleanup at sign-out, owned-home hydration guard, and stale-response suppression. | Same browser signs out of contractor, injects an unowned remembered property, signs into homeowner, and navigates Properties. Home Access requests use the loaded owned home and no stale permission warning appears. The original intermittent backend cause was not proven; this addresses the identified frontend stale-state paths. |
| Free beta and internal language | Consistent current-free contractor CTA/signup/access card; concise user-facing Home Access and Templates explanations. | Existing entitlement loading/fallback and no-payment-gate contracts pass. Billing and authorization implementations unchanged. |
| Mobile estimate introduction | Hide redundant workspace masthead and focused-editor introduction while editing on a phone; retain editing fields and save/cancel actions. | Type/build and source review; desktop presentation retained. |
| PDF preview | Same-page native dialog, download fallback, focus restoration, blob URL lifetime cleanup. | Actual browser tests at 390px/1440px with popups blocked; downloaded PDFs are valid; four persisted invoice-state Preview/Download parity cases pass. |
| Mobile Calendar | Agenda-first mobile layout with selectable Month view. | Demo 390px Agenda/Month controls and horizontal-fit checks pass. Existing desktop month and request/event lists retained. |
| Marketing failed preparation | Retain confirmed media upload and generation request identity within the open composer. Explicit server no-post-created responses permit a fresh generation request; uncertain results replay the same identity. | Unit/adapter/worker cases pass, including changed source/brief and upload failure. No live generation/provider action performed; the original provider failure cause remains unproven. |
| Facebook caption warning after upload | Distinguish provider upload evidence from caption-verification failure and provide a validated Facebook review link. | Exact caption-failure and URL validation tests pass. Backend failure/retry/duplicate safeguards remain authoritative; no inferred public-delivery success and no new publication. |

## Validation

- TypeScript application and Node configuration: pass.
- Production frontend build: pass; existing large App chunk warning remains (approximately 2.4 MB uncompressed). This work reduces App.tsx from 50,796 to 50,722 lines and lowers the architecture budget accordingly.
- ESLint: zero errors, 77 existing warnings; baseline lowered from 79 to 77.
- Architecture suite: 26 passing tests.
- Focused invoice/Marketing reliability, creation adapter, and publishing worker: 37 passing tests.
- PDF/component browser suites: 13 passing tests.
- Entitlement loading/presentation and calendar appointment presentation compatibility: 14 passing tests.
- Approved Demo read-only browser flows: 2 desktop smoke, 3 mobile smoke (including iPhone SE Properties/Home Access), and 3 targeted audit flows pass.
- Changed-file diff and credential scan: pass, with zero sensitive-value pattern findings across 29 changed files. No local environment file or generated browser artifact is part of the change.

Browser tests use the new frontend on localhost with the existing Demo anonymous frontend configuration and approved fictional contractor/homeowner credentials. They do not represent a new hosted deployment. No service-role credential is included in frontend configuration. No production business records were changed. Earlier audit-created Demo records were retained.

## Tutorial and release gates

Tutorial impact: UPDATE REQUIRED
Tutorial evidence: On September 8, Help Studio access was restored and all five published walkthroughs were previewed to completion. The 16-term search and comparison found a pre-existing mismatch in TUT-002: its written steps say Drafts, while its video starts from Service Requests. TUT-001, TUT-003, TUT-004, and TUT-005 remain applicable. See `TUTORIAL_FRESHNESS_REVIEW_2026-09-08.md`.
Affected tutorials: TUT-002 How to create an estimate, published revision 3.
Tutorial follow-up: Codex has prepared corrected steps, a narration draft, and a bounded replacement brief in `tutorials/TUT-002_REPLACEMENT_BRIEF_2026-09-08.md`. Retain the current immutable lesson until the approved narrated/captioned replacement is published and verified. Any merge before that point requires Ben's explicit acknowledgement of the temporary tutorial gap.

Preserve current immutable tutorial revisions. TUT-002's existing voiceover/caption standards upgrade and the planned TUT-006 remain separately tracked in FB-040A. The existing repository rule, `docs/CODEX_WORKFLOW_TEMPLATE.md` under Tutorial Freshness Gate, requires this pending state and prohibits declaring overall completion with a required replacement open.

## Scope and owner decisions

Builder Mode changes include application components/helpers, relevant regression tests, smaller lint/App size baselines, changelog, active backlog release follow-up, and marketing inventory release limits. The master plan is unchanged because product direction, permissions, lifecycle, and pricing policy do not change.

No merge to main, manual Production deployment, SQL, shared-database schema/policy changes, environment/secret changes, payment operation, external marketing publication, or Production Help publication was performed. Owner approval is required for merge and any Production Help replacement under the repository's explicit protected-action rules.

Status: PR #571 application corrections pass local and hosted Demo validation. Interactive tutorial review is complete; the confirmed TUT-002 replacement remains an open owner-gated follow-up. No merge or Production Help publication has been performed.
