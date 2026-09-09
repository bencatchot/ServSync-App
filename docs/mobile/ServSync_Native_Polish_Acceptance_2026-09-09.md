# Native presentation and acceptance — September 9, 2026

Status: implementation prepared; cross-platform acceptance incomplete. This is a continuation of PR #572 from main `fd912266919eb02dc821cdb4e150538b38d4f944`, on `codex/mobile-native-polish`. It is not a store release or approval to merge.

## Changes and observed defects

The old iPhone document screen allowed scrolled content beneath the status bar. Native-only CSS now owns safe-area padding, keeps the Demo label and workspace header above an independently scrolling content area, and keeps bottom navigation within the visible viewport. The iOS automatic scroll-view content inset is disabled to avoid competing inset ownership. Android uses Capacitor SystemBars' injected safe-area variables, with platform CSS environment variables as fallback.

The software-keyboard test exposed a focused field hidden by the navigation after resize. The native viewport adapter now reveals the focused field after resize, hides workspace tabs during text editing, and compensates for iOS visual-viewport panning. Editing text remains in the existing form. Blur restores navigation. Form controls use at least 16px text to avoid focus zoom. The connection notice is in the safe-area layout flow so it remains visible during editing.

Business Profile section jumps exposed a second scroll container: `scrollIntoView` moved the native root by about 69 CSS pixels, carrying the header and bottom navigation out of position. The native workspace root now uses `overflow: clip`, while its content remains scrollable and public pages retain root scrolling. The rebuilt Android app passed the same Logo & Branding section jump with root scroll position zero, header/navigation in place, photo-picker cancel, focused-field reveal and blur. The rebuilt iPhone app passed sign-in and Work rendering, but its final section-jump replay remains unverified: CUA pointer actions repeatedly returned `windowNotFoundAtPosition`; keyboard controls worked. A later bounded pointer retry failed with the same error. No substitute iPhone control method was used.

Only inert class hooks were added to the shared sidebar layout. The website does not import the native stylesheet or install the native viewport adapter. No auth, role, permission, persistence, shared integration, or source-document behavior changed.

## Devices and access

- iPhone: dedicated iPhone 17 / iOS 26.5, `2821CA81-0355-4FD8-BAF8-532A27C3233A`. CUA testing resumed after Ben unlocked the Mac.
- Android: separate `ServSync_Pixel_8_API_36`, `emulator-5556`, installed API 36 Google APIs arm64 image. Ben explicitly approved standard Android testing controls after CUA could not target the emulator. Every scoped control verified the AVD identity. No SDK agreement was accepted.
- AthleticsArc's `emulator-5554` / `AthleticsArc_Pixel_8_API_36` and iPhone 17 Pro were preserved. Simulator GUI use was coordinated with that task and released after iPhone checks.

## Runtime matrix

Only existing fictional Demo identities and records were used. No document, message, payment, recovery email, or signup was submitted. The estimate and invoice remained Draft, $250; the invoice remained paid $0, balance $250.

| Check | iPhone evidence | Android evidence |
| --- | --- | --- |
| Fresh launch and session | Final installed app restored contractor Gulf Coast Home Services and homeowner Demo Bay Home after termination; no black screen | Both roles restored after force-stop/relaunch; root minimize/reopen also retained the homeowner session |
| Sign-out / role switching | Both roles returned to public landing; contractor and private homeowner navigation separated | Both roles signed out to public landing, and the next identity received the correct workspace |
| Header / safe area | Status bar, Demo label, header and bottom controls visually separated; scrolled form stayed below header | Status bar, Demo label, header, keyboard and bottom navigation separated; see renderer investigation below |
| Scrolling | Documents and Work scrolled using keyboard navigation. CUA drag/wheel did not establish touch scrolling | Touch swipes scrolled Calendar, Work estimates, invoices and homeowner Documents while header/navigation stayed in place |
| Keyboard | Software keyboard on document notes; focused field visible after correction, temporary text cleared, blur restored tabs | Sign-in and customer-search keyboard visible without header overlap; tabs hidden during editing and restored after blur. Customer search text survived network loss/recovery. Document-note temporary text cleared without upload; system stylus onboarding was canceled |
| Work / Calendar / Customers | Existing saved $250 estimate, September Calendar, Sarah Johnson / Demo Bay customer context | Same existing estimate; Agenda and Month; connected Sarah Johnson customer details |
| Estimate PDF | System sheet → Apple Preview rendered one-page estimate with title, customer, scope, line items and $250 total; returned, retried, canceled and closed | System sheet → Print rendered the same one-page estimate. Returned without selecting a printer, retried sheet, canceled and dismissed dialog with Back |
| Invoice PDF | Apple Preview rendered existing draft invoice, $250 total / $0 paid / $250 due; retry/cancel/Close passed | System Print preview rendered the same amounts and line items; return/retry/cancel/Close passed. No print job or external delivery submitted |
| Temporary PDF cleanup | One cached file during sharing; zero PDF files after each dialog Close | Retry reused one cached path; zero cached PDFs after estimate Back dismissal and invoice Close |
| Files chooser cancel | Files Recents canceled to unchanged form, 0/50 manual documents | Native Recent chooser canceled with Back; unchanged empty notes and 0/50 manual documents. Also recovered after app termination during an earlier chooser attempt |
| Photo chooser cancel | Native Photo Library opened and canceled without selection | Business Profile Upload logo opened native Photos/Albums; Back canceled to the unchanged empty logo. Repeated on the final rebuilt APK; no image selected or uploaded |
| Connection loss/recovery | Actual interruption remains unverified; no isolated Simulator network control was established | Disabled only this emulator's Wi-Fi and mobile data. Notice remained visible with keyboard; restored both to their original enabled state. Notice cleared and typed search text remained |
| Android Back | Not applicable | Closed drawer and PDF dialog, traversed from Financials to Work, and minimized at root; reopening preserved session |
| Physical camera / accessibility | No physical camera; Simulator web content absent from accessibility tree; VoiceOver remains open | No physical device; TalkBack remains open |

Role-switch evidence establishes UI session separation, not a new cross-tenant security audit. Screenshots and temporary-file counts are retained under ignored `mobile-build/evidence/`.

Ben acknowledged the isolated Demo credential appearance in prior tool output and directed that it is not a blocker. Credentials remain excluded from repository and PR content; no credential was changed.

## Android renderer investigation

With the emulator's default graphics backend, Financials repeatedly painted a second header over its “At a Glance” heading. Read-only WebView inspection found exactly one header with correct geometry. A temporary local layout-containment probe did not fix the painting and was reverted. Restarting only the dedicated ServSync AVD with `-gpu swiftshader`, leaving the APK and app CSS unchanged, rendered “At a Glance” correctly on repeated navigation. This is evidence of an emulator graphics artifact, not an additional application header or a shipped CSS fix. The process-only software renderer follows [Android's graphics troubleshooting guidance](https://developer.android.com/studio/run/emulator-troubleshooting). No global AVD/toolchain setting or AthleticsArc process changed. Physical-device rendering still needs acceptance.

## Local verification

- Mobile Demo/package guards, viewport and PDF lifecycle regressions: 8/8 pass. The PDF tests exercise the real adapter with mocked native boundaries: duplicate-click prevention, active-dialog protection, retry path reuse, cancellation, preparation failure, cleanup and focus restoration. The regression covers focus → keyboard resize → reveal, iOS viewport offset, pinch-zoom protection, navigation restoration, and listener cleanup.
- TypeScript: pass.
- Website build: pass.
- ESLint: 0 errors, exactly 77 existing warnings.
- Architecture checks: 26/26 pass.
- Native builds: unsigned iOS simulator build succeeded; Android Debug build succeeded with JDK 21, installed API 36, SDK auto-download disabled, and task-scoped Gradle cache. The initial presentation build was used for the broad runtime matrix above. After the section-jump correction, both native builds succeeded and were reinstalled. Android section-jump, photo-picker cancel, keyboard reveal/blur and header/navigation were repeated; iPhone sign-in/Work passed, with the final iPhone section-jump limitation recorded above.
- Local evidence and build logs are ignored under `mobile-build/`; credentials and generated binaries are not committed.

## Tutorial impact and remaining work

Tutorial impact: UPDATE REQUIRED

Fresh Help Studio searches: `mobile`, `iPhone`, `Android`, `safe area`, `keyboard`, `PDF`, `share`, `sign in`, `sign out`, `Calendar`, `Customers`, and `homeowner.documents` found no published walkthroughs. `Work` matched TUT-002, TUT-003, and TUT-005; `contractor.drafts` matched TUT-002; `contractor.financials` matched TUT-004; `estimate` also matched TUT-001. Additional searches for `Business Profile`, `contractor.profile`, `Logo`, and `Go to section` found no published walkthroughs. Recording requests were not counted as published results.

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

The [native PDF review draft](../tutorials/NATIVE_PDF_GUIDANCE_DRAFT_2026-09-09.md) now records the verified iPhone Preview and Android Print-preview paths, cancellation and local cleanup. Installed destinations vary; a generic Android viewer, external delivery, and save-to-device completion were not tested. Narration, recording, approval and publication remain separate follow-up work.

## PR and website Preview

Draft [PR #573](https://github.com/bencatchot/ServSync-App/pull/573) contains the implementation. Application commit `625a58967dd91e409eea25288fce14ecda1e01cd`, including the section-jump correction, passed the full repository PR quality workflow and all three normal Vercel Preview statuses.

The [Demo web Preview](https://servsync-demo-git-codex-mobile-nati-3b7d75-bencatchots-projects.vercel.app) was checked through CUA with the existing Demo contractor: login, Dashboard, Financials invoice draft filter, Customers, 390px mobile navigation/drawer, Escape dismissal, and focus restoration passed. DOM style inspection confirmed no native class or native stylesheet and the unchanged static body positioning. No browser console errors were captured. The temporary viewport override was reset.

The existing $250 draft invoice `AUDIT 2026-09-07 — invoice draft check` was found read-only. Its website PDF dialog opened and closed with the source unchanged. The in-app browser's embedded PDF area was blank and showed its existing Download PDF fallback; PDF document rendering was not established by this web check and is not counted as native invoice acceptance.

## Completion gates

1. Replay the final iPhone Business Profile section jump when pointer control is available. Complete physical iPhone touch/network/camera and VoiceOver checks, plus Android camera/TalkBack checks on suitable devices.
2. Prepare, approve, publish and verify the required TUT-002 narrated/captioned replacement through the protected Help workflow. Native PDF guidance has a reviewable platform-specific draft; no Production Help change has been made.
Native server-route/CORS integration, callbacks/deep links, notifications, offline synchronization, provider/payment integrations, signing, distribution, and store submission remain outside this increment. No protected integration was required for these layout corrections.
