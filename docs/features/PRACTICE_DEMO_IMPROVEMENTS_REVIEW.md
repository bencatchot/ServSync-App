# Practice Demo improvements — local review

October 16, 2026. Continuing [Issue #587](https://github.com/bencatchot/ServSync-App/issues/587) / [draft PR #588](https://github.com/bencatchot/ServSync-App/pull/588), based on `a6dfd8cb8946629475ffc3291f175f7687e97f1d`. This pass is approved for feature-branch publication and a Demo Preview rebuild; hosted verification is recorded in the PR after deployment. It is not a Production release. The original guided-onboarding PR #586 remains separate.

## Diagnosis and changes

The existing Practice screen reused the real composer, but long setup text delayed the first editable field, it started empty, Back to Work did nothing, and familiar currency inputs could turn validation into an access failure that hid the editor. Preview accepted blank descriptions. The displayed cycle could outlast pilot access, and closing the PDF lost keyboard focus.

- Added explicit **Try sample repair** / **Start blank** entry choices. The sample uses existing fictional scope, labor and template fixtures: two hours at $75 plus a $125 repair gives $275. It is not saved until Save Draft. These are example prices, not recommended rates.
- Kept scope, lines, totals and PDF in the existing composer/renderer. Practice-only guidance is shorter; fixed fictional customer details replace irrelevant pickers, unsupported checklist guidance is hidden, and empty details sections are omitted. Labor settings and retention explanation are collapsed. Existing real-editor defaults remain unchanged.
- Save and Preview share a sticky row on mobile. Preview is visually primary. It works before saving; copy now explains that saving permits return later. Back to Practice drafts returns to the saved list with the existing discard confirmation for unsaved edits.
- Dollar signs/grouping commas normalize before strict wire validation. Shared cents rounding is preserved. Invalid prices, missing/overlong descriptions and other local input errors leave the editor intact with inline feedback and field focus where available. Incomplete lines may be saved; preview requires usable descriptions/prices.
- Close/Escape restore focus to Preview. Automatic expiry closes/revokes the PDF and schedules focus restoration to the page heading. Server access/revocation failures still fail closed.
- Prepared earliest-access-deadline support, including the earlier of cycle and pilot expiry and the existing conservative monotonic timing. The legacy response clearly says **Access deadline unavailable. This pilot may end before its cycle.** It does not present the cycle as the access deadline.

## Validation evidence

Final local verification:

| Check | Result and scope |
| --- | --- |
| `npm run test:practice` | 44/44 passing. Real disposable PostgreSQL plus contract tests, including currency normalization/rounding, existing isolation/expiry/retry boundaries and response deadline. |
| `npm run test:practice:demo:browser` | 24/24 passing, desktop Chromium and mobile WebKit. Real entry/composer/transport/PDF and reviewed SQL on loopback; synthetic Auth and intercepted RPC routing. No hosted JWT acceptance in this run. |
| Types | Full application/node and Practice TypeScript checks pass. |
| Lint/build | Lint passes the existing 76-warning budget with zero errors; production build passes. Existing Browserslist/large-chunk notices remain. |
| Architecture/tooling | 27 architecture and 16 backend-parity tooling tests pass. These are not a live environment-parity claim. |
| Diff/SQL | `git diff --check` passes. Installed SQL SHA-256 remains `4394c5ecb28167aee93f7a5cfcc08e3fb135a0e7dd8c45bd0ed02c89e3d833f4`. |

Browser cases cover empty/sample starts, explicit save, back/resume, refresh and a second browser context, keyboard decimal entry, `$125.255 × 2 = $250.52`, formatted prices, inline invalid recovery, blank/501-character description recovery, exact PDF amounts/watermark, Close/Escape focus, lost acknowledgements without duplicates, revision conflicts, offline access recovery, account-change isolation, expiry/revocation, legacy deadline fallback, mobile overflow and public-document navigation. Automatic-expiry focus restoration was source-reviewed; its closing behavior is browser-tested. Physical iPhone PDF viewing remains unverified.

Screenshots are generated locally under `test-results/practice-demo/`, including `demo-ui-guided-sample-uses-f6044-and-returns-to-saved-drafts-{desktop-chromium,mobile-webkit}/guided-sample.png`. Both were visually inspected. Readability and same-row action placement also have browser assertions. Screenshots are excluded from the public repository.

Independent review found two issues: conflicting color classes made primary buttons unreadable, and overlong descriptions still took the access-failure path. Both were repaired and rechecked. The reviewer independently reproduced local error classification for long descriptions/units/customer descriptions and excess line count, inspected fresh desktop/mobile screenshots, reviewed shared-default isolation and the response-only SQL diff, and found no remaining blockers in the local scope.

## Deadline response draft and release gates

`server/practice/demo-draft/20261016193850_practice_demo_access_deadline_response.sql` is a separate, **unapplied** review artifact outside automatic migrations. It projects the already-existing pilot `access_until` into state/start responses. It does not change pilot rows, cycle expiry, grants, policies, authentication or access rules. The disposable fixture verifies unchanged function owner, ACL, security-definer and configuration attributes.

Shared application needs separate approval and an operator with existing function-owner capability. The prior managed installer does not establish that capability; no new role grant or credential is authorized. Local superuser execution is not evidence that the hosted installer can apply it. Until that path is approved, the UI's legacy fallback remains the supported behavior.

The owner explicitly approved GitHub publication, PR updates and a Demo Preview rebuild. The separately approved SQL operation stopped at read-only preflight: the existing managed postgres operator is not a superuser, does not inherit the function owner privileges, and cannot SET ROLE to the owner. No SQL was attempted. The unaffected UI publication proceeds with the tested legacy-response fallback; no grants, ownership changes or alternate credentials are authorized. The existing pilot Preview at commit `a6dfd8c` contains the earlier UI, not this pass. Its earlier approved start/save/refresh/resume/PDF acceptance does not validate these new changes. The pilot deadline and saved synthetic draft were not reset, renewed, cleaned up or mutated in this pass.

## Fresh UI recommendations

The compact start choice, persistent fictional context and reachable actions address the immediate friction without redesigning the app. Next small improvement to consider: show template selection below populated sample lines so editable prices appear sooner on mobile. Keep a clearly labeled template entry available for blank work. A later real-phone check should assess PDF usability before broader rollout. Do not add completion-time guarantees or describe the flow as proven seamless.

## Tutorial and documentation impact

Tutorial impact: **NONE** within this Demo Practice scope. After final application/browser validation, read-only Demo Help Studio catalog searches covered current and published revisions by Practice, fictional/sample, estimate/Draft, save/resume, pricing/scope/onboarding terms and Practice/Draft/estimate/work route contexts. No matching current or published walkthrough was returned, so none required playback. No Help content changed. The separate TUT-002/onboarding follow-up is unaffected.

Updated the focused UI review, feature backlog, changelog and descriptive rollout ledger for publication. No shared SQL application, account/security change, real customer access/message, payment, pilot renewal or cleanup occurred. No new dependencies or trackers were added. Status: local implementation/review complete; UI-only publication approved, exact hosted evidence follows in PR #588, deadline-response application blocked by existing owner privileges. The response draft remains outside automatic migrations and is NOT applied.
