# ServSync manual privacy requests and retention — proposed launch procedure

Prepared 2026-10-01. Support intake exists in the app; the public inbox, accountable operator and operating owner still need confirmation. This document does not authorize deletion, provider settings or retention automation. It becomes an operating promise only after the owner accepts and rehearses it.

## Intake and response

1. Receive through Privacy & Data Requests / Support, or the confirmed public inbox for non-account customers and people who cannot sign in. Assign a case ID, received date, handler, requested action, state of residence, deadline under applicable law, verification status and secure correspondence location. Do not put real cases in Git or a public policy archive.
2. Acknowledge and identify the requested account, property or contractor relationship using the minimum necessary information. Never request passwords, access tokens, entire identity documents or unrelated household records in the initial email. Verify account control through existing channels; independently verify an agent's authority. A shared address or forwarded guest link alone is not proof of authority over every record.
3. Separate access/export, correction, deletion, account closure, relationship revocation, public-content removal and appeal. A person without an account can still have contractor-entered data. Do not require signup just to submit a request.
4. Inventory affected categories and controllers: account/private homeowner records, other household members, contractor independent business records, shared accepted documents/history, copies sent to guests, public media, provider logs and backups. Record purpose/authority and any legal hold per category; escalate disputed authority and law questions before disclosing or removing another person's records.
5. Prepare a scoped export/redacted response or correction/removal plan. Preserve invoice/approval evidence when a documented lawful reason requires it; do not treat “business records” as a universal exemption. Explain partial denials, verification limits and how to request review. Counsel/handler determines statutory deadlines and any permitted extension from current applicable law; no invented universal period.
6. Obtain explicit approval for destructive actions and execute only a reviewed category-specific procedure. Current support buttons open requests; they do not automatically export or delete accounts. No bulk cleanup or inactivity purge is introduced here.
7. Record completion evidence, remaining categories/reasons, provider action status, backup caveat and the response. Deliver through a verified channel without including other people's private information. Provide reconsideration/appeal through the same contact and any regulator route required by applicable law. Do not penalize exercise of applicable privacy rights.
8. Retain only necessary case evidence under an owner/counsel-approved category schedule. A request remains open until unresolved provider/backup steps and any promised follow-up are tracked, not merely because an account disappeared.

## Retention decision register

No new calendar-day or multi-year period is authorized by this task.

| Category | Purpose and trigger to review | Current boundary / required decision |
| --- | --- | --- |
| Account/profile/auth | Service access; review at closure or verified request | Decide minimum security/identity evidence, deletion mechanics and deadlines. Deleting Auth may cascade business records in existing schema; never run an unreviewed account delete. |
| Home/property files and private drafts | User-requested service/history; review on deletion, property transfer, closure | Check file bytes versus metadata, sharing and downloaded copies; owner approves category scope. |
| Contractor local customer/property | Service delivery and business records; review on customer request/inactivity/closure | Archive/restore is organizational, not erasure. Claimed/mapped records have separate boundaries. Contractor independence does not justify unlimited retention. |
| Estimates, approvals, plans, reports, invoices, manual payments and Home History | Evidence of work, disputes and applicable recordkeeping | Counsel determines purpose, legal period and exceptions by record/state; choose redaction/restriction where appropriate. No blanket seven-year assumption. |
| Signup acceptance ledger / archived policy | Demonstrate the submitted terms/version; review with closure/retention schedule | Append-only actor UUID/time/version/hash/assent, no email/IP/device fingerprint copied. UUID is still personal data. No cascade or routine delete; any lawful eventual disposal needs separately approved controlled maintenance, not falsification of history. |
| Support/privacy/security logs | Request resolution, abuse prevention and legal holds | Set bounded category-specific periods and access; no indefinite or tax-derived security-log rule. |
| Public content and recipient copies | User-directed publication/delivery | Remove controlled public exposure as approved; cannot recall external downloads, emails or screenshots. |
| Supabase database/Auth backups | Disaster recovery | Confirm actual current plan/window; Storage bytes are separately backed up. Do not promise selective deletion or exact expiry without provider evidence. |
| R2 Storage backups | Independent file recovery | Existing configuration/evidence says 90 retained successful runs. Failed/missed runs can extend calendar residence; retained manifests preserve referenced objects. Validate pruning before promising erasure. |
| OpenAI, Resend, analytics and other provider logs | The specific enabled processing | Account agreements/configured periods remain unresolved; request provider action as needed, record limitations and expiry evidence. |

## Restore after a privacy request

Maintain a restricted deletion/restriction decision register separate from the backup being restored. It records case ID, stable affected identifiers, action, approval, scope and required exclusions without retaining deleted content. Before any restored environment receives normal access or outbound provider access, compare it against that register, reapply approved deletion/redaction/restriction decisions, verify shared records and legal holds, and obtain incident-owner approval. R2 object tombstones describe source changes; they are not a complete privacy-request suppression register. Existing recovery procedures need this manual gate before cutover; no destructive automated restore filter is enabled by this PR.

## Synthetic rehearsal performed 2026-10-01

Desk rehearsal using fictional records only; no customer request, email delivery, shared DB mutation or actual deletion.

| Scenario | Decision exercised | Result |
| --- | --- | --- |
| H-001 requests access/correction/closure for Home A | Verify H-001, limit export to their data, correct their contact detail; do not export household member H-002's private support message | PASS: authority and minimization steps identify separate scopes. |
| C-001 entered H-001 before account signup | Accept a public-channel request without requiring an account; validate contractor relationship and independent records | PASS in tabletop; real inbox receipt/handler rehearsal remains BLOCKED pending mailbox/owner. |
| Shared accepted estimate E-001, invoice I-001, report R-001 | Connection revocation is an access change; assess lawful business-history retention separately; no blanket account cascade | PASS: document approval and financial history are not silently erased. |
| Backup B-001 predates approved deletion of photo F-001 | Keep recovery isolated; consult separate decision register; exclude F-001/reapply approved removal before cutover; record retained shared invoice | PASS: no false claim of immediate backup expiry or suppression automation. |
| A forwarded guest link requests complete household history | Link possession is insufficient identity/authority; do not disclose broader history | PASS: route to proportional verification and document-specific access. |
| Prior partial denial is challenged | Log review request, independent review when practicable, applicable deadline/regulator route | PASS as procedure; actual staffing/deadlines need owner/counsel confirmation. |

Required before public launch: functioning inbox and receipt test; named owner/backup handler; secure case/register storage and access decisions; category retention approval; provider evidence; owner-run synthetic receipt-to-response drill. These are open operational decisions, not completed code capabilities.
