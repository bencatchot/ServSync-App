# ServSync Mobile Prototype v1

Owner direction: September 9, 2026, iPhone and Android together. Branch `codex/mobile-prototype-v1`, based on main `68e16f52c339a68630dd6826de6db03f347fa966`.

## Continuing acceptance

PR #572 is merged at `fd912266919eb02dc821cdb4e150538b38d4f944`. The next native presentation increment and its explicit device/tutorial blockers are tracked in [September 9 native acceptance](ServSync_Native_Polish_Acceptance_2026-09-09.md). The original evidence below remains historical; compilation does not close native acceptance.

## Implemented

Capacitor 8.5.1 projects at `mobile/ios` and `mobile/android` bundle the existing React app using a separate `mobile/index.html` and `src/mobile/main.ts` entry point. The provisional identity is `app.servsync.demo`, named ServSync Demo. The Vite mobile configuration requires the exact Demo Supabase URL and a public key; it rejects privileged credentials and non-Demo legacy JWTs. Anonymous/publishable keys are kept in ignored local configuration; no passwords are bundled.

The native entry registers a PDF dialog/share-sheet adapter for existing Preview/Download actions, observes connection status, and implements Android back behavior. Generated links use the Demo website origin instead of a device-local URL. The existing browser behavior and web build remain separate. iOS photo/camera usage descriptions and the filesystem timestamp privacy reason are present. Android backup is disabled for this development app's data. No remote hosted shell, global request rewriting, relaxed transport policy, or origin spoofing was added.

## Evidence

- Mobile build and sync: pass for both native projects.
- Unsigned iOS simulator build: **BUILD SUCCEEDED**, Xcode 26.6, Capacitor 8.5.1. The built app includes the filesystem privacy declaration.
- Website build and TypeScript: pass.
- ESLint: 0 errors; 77 existing warnings, unchanged baseline.
- Mobile environment/package guards: 5/5 pass.
- Astra corrections regression: 7/7 pass.
- Architecture suite: 26/26 pass.
- iOS interactive checks after unlock: existing Demo contractor sign-in; Dashboard, Work, Customers, Calendar Agenda/Month; existing $250 draft estimate PDF generation; native share sheet; opening the PDF in Apple Preview; returning to ServSync; reopening/canceling the sheet; dialog close and successful Filesystem delete callback. No document was sent to a recipient or source record changed.
- Fresh process launch retained the contractor session. Sign-out removed the contractor workspace; the existing Demo homeowner then opened Demo Bay Home with homeowner navigation. Another fresh launch retained the homeowner session.
- Used a separate iPhone 17 / iOS 26.5 simulator (`2821CA81-0355-4FD8-BAF8-532A27C3233A`), preserving AthleticsArc's iPhone 17 Pro. First launch showed a black screen. Removed redundant window creation so UIKit owns the storyboard window; subsequent fresh launches rendered correctly. The native build now omits Vercel's website-only analytics script, which cannot load from the bundled local origin.
- Still unverified: Android interactive behavior, photo/camera selection, network interruption/recovery, physical devices, and VoiceOver/TalkBack. Simulator web content was not exposed in its accessibility tree; screenshots and native document accessibility supplied the runtime evidence. Native safe-area/header and keyboard presentation need a polish pass before distribution.
- Android compilation: **BUILD SUCCESSFUL**, including a repeat after final bundle sync. The earlier inventory checked standard locations; an SDK with accepted license files, API 36, and build-tools 36.0.0 was subsequently found at `/opt/homebrew/share/android-commandlinetools`. Used a checksum-verified Temurin 21 archive and a task-local Gradle cache, with SDK auto-download disabled. This task accepted no SDK agreement and changed no global toolchain settings.

Xcode initially waited on a locked Keychain while fetching public binary dependencies. Re-running this task's build with its supported `-packageAuthorizationProvider netrc` option fetched the public packages and completed. No Keychain was unlocked, credential exposed, global setting changed, package validation disabled, or other task's build stopped.

## Next acceptance steps

1. Use a separate simulator/device from AthleticsArc and the approved existing Demo accounts.
2. Repeat the verified iOS sign-in/session/account-switch checks on Android; complete physical-device accessibility and safe-area/keyboard checks.
3. Extend the verified Work, Calendar, customer list, and estimate PDF checks to job details and invoice views.
4. Exercise existing photo picker grant/denial/cancel with synthetic test media; validate actual camera capture on physical devices later.
5. Generate a Demo document and test the native PDF share sheet, cancellation, retry, and temporary-file cleanup. Do not send to a recipient.
6. Interrupt network connectivity during an unsaved task; record actual behavior without claiming offline editing or queued synchronization.
7. Run the compiled Android APK on a separate Android device/emulator and repeat the core checks.

## Known integration gaps

Relative `/api/*` server routes still require an intentional native API/CORS/cookie design. They include external email delivery, some guest views, payment/provider and Marketing operations; those paths are not native-prototype acceptance claims. Existing Supabase-backed account and record screens are the initial test target.

Password recovery/invitation links remain web links; they do not automatically resume the native app. Universal links/app links, secure native session lifecycle review, notification delivery, offline synchronization, branded store artwork, signing, App Store/Play disclosures, and physical-device acceptance remain open. Store release and protected shared-configuration changes require separate owner approval.

## Tutorial freshness

Tutorial impact: UPDATE REQUIRED
Tutorial evidence: September 9 searches for mobile, iPhone, Android, PDF, share, sign in, and Calendar found no matching walkthroughs. Contractor, Work, and estimate searches identified existing guidance. Opened Preview for all five published walkthroughs and reviewed their written steps; TUT-002 revision 3 still says to open Drafts. Native PDF behavior was verified separately. The continuing polish task subsequently played all five published videos to their reported ends; see the September 9 native acceptance record for that newer evidence.
Affected tutorials: TUT-002 How to create an estimate, revision 3; native PDF guidance assessment remains open.
Tutorial follow-up: Codex completes native acceptance and Help Studio comparison, then prepares any required mobile guidance; Ben authorizes Production Help publication.

Known existing follow-up: TUT-002 “How to create an estimate,” revision 3, needs the narrated/captioned replacement already recorded in PR #571. This prototype does not publish or retire Help content. The new native PDF behavior also requires a mobile-specific walkthrough assessment after interactive acceptance. Fresh Help Studio search and written-step Preview review are recorded above. The continuing task completed video playback comparison; after both-platform acceptance, finalize mobile PDF guidance covering Preview PDF → Open or share PDF → system viewer/save/cancel → return, after both-platform acceptance. Do not merge this prototype or declare tutorial completion from compilation alone.

## Release state

Development foundation implemented for review; prototype acceptance incomplete. No main merge, production deployment, shared Auth/SQL/RLS/RPC/storage-policy/provider change, signup, outgoing communication, payment, or Production Help publication performed.

## September 9 resumed native acceptance

The continuing polish task completed final-build role switching and fresh launches on iPhone and Android, existing estimate/invoice native rendering, cancellation/retry and temporary-file cleanup. Android standard testing controls were explicitly approved for the dedicated ServSync emulator; network interruption/recovery, Back behavior and Files cancellation passed. See [the current acceptance matrix](ServSync_Native_Polish_Acceptance_2026-09-09.md) for exact platform paths and remaining physical-device/accessibility items. The [native PDF guidance draft](../tutorials/NATIVE_PDF_GUIDANCE_DRAFT_2026-09-09.md) is ready for review; TUT-002 replacement/publication remains open. Earlier unverified items above describe the original prototype increment.

The final native polish correction prevents section jumps from scrolling the outer workspace. Rebuilt Android section-jump, Photos/Albums cancellation and keyboard checks passed; rebuilt iPhone sign-in/Work passed, with its final section-jump replay still limited by CUA pointer errors. See the acceptance matrix for the build sequence and remaining checks.

## September 9 Work parity correction

The earlier native Work checks used the legacy fallback because the mobile build omitted all three current Work switches. Installed iPhone/Android bundles were verified, hosted Demo embeds all three as true, and the same contractor is cohort-eligible. Native-only build defines now match the approved Demo workflow and reject conflicting values while retaining account checks. Both rebuilt apps show current At a Glance; Android Start New Draft/Estimate entry and keyboard visibility passed without saving. iPhone composer activation remains blocked by CUA pointer errors. Earlier legacy navigation evidence is not full current-workflow acceptance. TUT-002 written Draft-first steps are current; its replacement media must align with them, as corrected in the revised brief.
