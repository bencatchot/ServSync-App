# Native presentation and acceptance — September 9, 2026

Status: implementation prepared; cross-platform acceptance incomplete. This is a continuation of PR #572 from main `fd912266919eb02dc821cdb4e150538b38d4f944`, on `codex/mobile-native-polish`. It is not a store release or approval to merge.

## Changes and observed defects

The old iPhone document screen allowed scrolled content beneath the status bar. Native-only CSS now owns safe-area padding, keeps the Demo label and workspace header above an independently scrolling content area, and keeps bottom navigation within the visible viewport. The iOS automatic scroll-view content inset is disabled to avoid competing inset ownership. Android uses Capacitor SystemBars' injected safe-area variables, with platform CSS environment variables as fallback.

The software-keyboard test exposed a focused field hidden by the navigation after resize. The native viewport adapter now reveals the focused field after resize, hides workspace tabs during text editing, and compensates for iOS visual-viewport panning. Editing text remains in the existing form. Blur restores navigation. Form controls use at least 16px text to avoid focus zoom. The connection notice is in the safe-area layout flow so it remains visible during editing.

Only inert class hooks were added to the shared sidebar layout. The website does not import the native stylesheet or install the native viewport adapter. No auth, role, permission, persistence, shared integration, or source-document behavior changed.

## Devices and access

- iPhone: dedicated iPhone 17 / iOS 26.5, `2821CA81-0355-4FD8-BAF8-532A27C3233A`.
- Android: created separate `ServSync_Pixel_8_API_36`, booted as `emulator-5556`; APK installation succeeded. Used the already installed API 36 Google APIs arm64 image. No SDK agreement was accepted.
- AthleticsArc's `emulator-5554` / `AthleticsArc_Pixel_8_API_36` and iPhone 17 Pro were preserved. GUI coordination confirmed the other task has no supported CUA emulator target either.
- CUA lists no Android emulator application and rejects the qemu executable and attempted emulator bundle identifier. No shell touch/key injection, emulator-console interaction, or adb screenshot was substituted for CUA. Android interactive acceptance is blocked by the required UI access path.
- The Mac locked during iPhone testing. CUA automatic unlock failed; manual unlock was requested. Browser Help review remained available separately.

## Runtime matrix

Only existing fictional Demo identities and records were used. No document, message, payment, recovery email, or signup was submitted.

| Check | iPhone evidence in this increment | Android |
| --- | --- | --- |
| Fresh launch and session | Rebuilt app repeatedly restored the homeowner session and Demo Bay Home; no black screen after startup | Blocked: CUA access |
| Sign-out | Homeowner sign-out returned to public landing and removed private navigation | Blocked |
| Contractor sign-in / identity separation | Existing contractor opened Gulf Coast Home Services with contractor Calendar/Work/Customers; homeowner private Documents workspace absent. One early CUA input attempt failed; exact password entered after focus settled succeeded. Direct Demo credential check also passed without logging secrets | Blocked |
| Header / safe area | Status bar, Demo label, header, and bottom controls visually separated; the scrolled form stayed below the header | Blocked |
| Scrolling | Long Documents and Work screens scrolled with keyboard navigation. CUA drag/wheel attempts did not establish touch-scroll behavior; real touch scrolling remains open | Blocked |
| Keyboard | Software keyboard shown on homeowner document notes; focused field stayed visible after correction. Typed/cleared temporary text without upload/save; blur restored navigation | Blocked |
| Work | Work overview, saved estimate list, existing $250 Draft estimate visible | Blocked |
| Calendar | Contractor Agenda and Month controls rendered September 2026 | Blocked |
| Customers | Sarah Johnson / Demo Bay Home opened with the expected connected customer context | Blocked |
| Estimate PDF preview/share/cancel | PR #572 evidence remains valid prior evidence; new-build repeat interrupted by Mac lock before the PDF controls | Blocked |
| Invoice PDF preview/share/cancel | Not yet established; do not create or send a replacement invoice merely for the check | Blocked |
| Files chooser cancel | Native Files Recents opened, canceled, returned to unchanged document form; count remained 0/50 | Blocked |
| Photo chooser cancel | Native Photo Library opened, canceled without selecting or uploading an image | Blocked |
| Connection loss/recovery | Notice presentation moved into safe layout; actual device interruption/recovery remains unverified | Blocked |
| Back / modal dismissal / root minimize | Android-specific; not inferred from iPhone | Blocked |
| Physical camera / accessibility | No physical camera available. Web content still absent from Simulator accessibility tree; screenshots do not establish VoiceOver | No physical device; TalkBack not tested |

The remaining iPhone contractor fresh-launch/sign-out and return-to-homeowner checks must be repeated on the final installed build. Role-switch evidence is UI state separation, not a new authorization or cross-tenant security audit.

## Local verification

- Mobile Demo/package guards plus viewport event regression: 6/6 pass. The regression covers focus → keyboard resize → reveal, iOS viewport offset, pinch-zoom protection, navigation restoration, and listener cleanup.
- TypeScript: pass.
- Website build: pass.
- ESLint: 0 errors, exactly 77 existing warnings.
- Architecture checks: 26/26 pass.
- Native builds: unsigned iOS simulator build succeeded; Android Debug build succeeded with JDK 21, installed API 36, SDK auto-download disabled, and task-scoped Gradle cache. Final source bundle builds both succeeded and was installed on the dedicated iPhone and Android emulator. Native acceptance still requires final-build UI checks after unlock.
- Local evidence and build logs are ignored under `mobile-build/`; credentials and generated binaries are not committed.

## Tutorial impact and remaining work

Tutorial impact: UPDATE REQUIRED

Fresh Help Studio searches: `mobile`, `iPhone`, `Android`, `safe area`, `keyboard`, `PDF`, `share`, `sign in`, `sign out`, `Calendar`, `Customers`, and `homeowner.documents` found no published walkthroughs. `Work` matched TUT-002, TUT-003, and TUT-005; `contractor.drafts` matched TUT-002; `contractor.financials` matched TUT-004; `estimate` also matched TUT-001. Recording requests were not counted as published results.

TUT-002 revision 3 still directs users to Drafts in its written steps. Its normal-speed video starts at Service Requests and ends in a saved $1,895 Draft. Preserve the existing [replacement brief](../tutorials/TUT-002_REPLACEMENT_BRIEF_2026-09-08.md), including narrated/captioned media and publication verification. Ben's explicit approval is required for Production Help changes. No published revision was changed.

All five matching published videos were played from the beginning through their reported end at normal speed, with sampled visual frames and written-step comparison. This is a freshness review, not a new narration/caption quality approval:

| Lesson | Revision / displayed end | Comparison |
| --- | --- | --- |
| TUT-001 service request | 1 / 0:15 | Request context → Create Estimate → Start your estimate choices; no workflow change in this increment |
| TUT-002 estimate | 3 / 0:45 | Video ends at saved $1,895 Draft; written Drafts instructions remain stale |
| TUT-003 complete work | 1 / 0:57 | Approved work → Job completion → final report Filed to Documents; written steps/transcript retain this lifecycle |
| TUT-004 invoice | 1 / 0:57 | Invoice delivery/outside-payment ledger ends at Partially Paid, $400 paid, $1,765 due; the tutorial does not demonstrate native PDF sharing |
| TUT-005 connection/request | 1 / 1:59 | Connection step, contractor selection, request review, and final submitted request remain consistent with the existing workflow |

No additional stale workflow instruction was identified in the other four lessons. End-frame screenshots and search results are retained under ignored `mobile-build/evidence/`. No Production Help save, revision, provider generation, upload, or publication occurred.

Native PDF guidance remains a bounded follow-up after both-platform PDF acceptance. [The review draft](../tutorials/NATIVE_PDF_GUIDANCE_DRAFT_2026-09-09.md) records the intended scope and evidence still required; it is not publishable guidance or an assertion that Android sharing passed.

## PR and website Preview

Draft [PR #573](https://github.com/bencatchot/ServSync-App/pull/573) contains the implementation. Application commit `58ba0725bd6105c376735cbed8b5ab8108d81f8c` passed the full repository PR quality workflow and all three normal Vercel Preview statuses.

The [Demo web Preview](https://servsync-demo-git-codex-mobile-nati-3b7d75-bencatchots-projects.vercel.app) was checked through CUA with the existing Demo contractor: login, Dashboard, Financials invoice draft filter, Customers, 390px mobile navigation/drawer, Escape dismissal, and focus restoration passed. DOM style inspection confirmed no native class or native stylesheet and the unchanged static body positioning. No browser console errors were captured. The temporary viewport override was reset.

The existing $250 draft invoice `AUDIT 2026-09-07 — invoice draft check` was found read-only. Its website PDF dialog opened and closed with the source unchanged. The in-app browser's embedded PDF area was blank and showed its existing Download PDF fallback; PDF document rendering was not established by this web check and is not counted as native invoice acceptance.

## Completion gates

1. Restore CUA iPhone access and finish the current-build session, PDF, and connection checks.
2. Obtain a supported CUA Android surface/device, or an explicit owner revision of the CUA-only restriction. Do not reuse AthleticsArc's emulator.
3. Verify invoice/PDF viewer availability using existing Demo records, without sending or processing payment.
4. Complete physical touch/camera and VoiceOver/TalkBack checks where hardware permits; otherwise retain explicit open release items.
5. Prepare, approve, publish, and verify the required TUT-002 narrated/captioned replacement through the protected Help workflow. Finalize native PDF guidance only from verified platform behavior.

Native server-route/CORS integration, callbacks/deep links, notifications, offline synchronization, provider/payment integrations, signing, distribution, and store submission remain outside this increment. No protected integration was required for these layout corrections.
