# Native Demo rebuild and acceptance — September 26, 2026

Status: **Implementation In Progress**. The owner approved continuing the mobile status report's next steps. This increment rebuilds the existing Demo apps from current main and tests the current interface; it is not approval for customer distribution, production configuration, a main merge, or an app-store release.

Branch: `codex/mobile-current-acceptance`, starting from `origin/main` at `749d182`; code commit `eaed577f2e4b0477cdfb2645eecdeb8d5070c289` is pushed for review. The [September 9 matrix](ServSync_Native_Polish_Acceptance_2026-09-09.md) remains historical evidence. Its legacy Work checks and older packaged binaries do not establish acceptance of this build.

## Build and implementation evidence

- Mobile bundle/sync and both native builds passed. The separate web build remains unchanged by the native entry point.
- Final Android clean Debug APK: ignored `mobile-build/servsync-demo-acceptance-debug.apk`; SHA-256 `5aec04d8e5fbc012552d66322be4af2d5bb5e840472cd676bfda7bcd4a91a945`. It installed/launched successfully through standard development-lifecycle ADB on the dedicated `ServSync_Pixel_8_API_36`, `emulator-5556`. This is a development artifact, not a signed store release.
- Final unsigned iOS simulator build passed and the package containing the Back correction installed/launched successfully on the dedicated iPhone simulator (`2821CA81-0355-4FD8-BAF8-532A27C3233A`). Final-package UI confirmed restored contractor Business Profile, current Work/At a Glance, Start New Draft, and the existing Estimate. No saved Draft was created by the temporary input. No physical-device signing or provisioning was performed.
- Android Back now detects the current visible modal, including the shared accessible Draft confirmation, before navigating or minimizing. It uses existing dialog cancel/Escape handlers, respects busy states, and preserves component-owned cancellation and focus behavior. Native top-layer dialogs take precedence over background overlays. The change is isolated to `src/mobile/main.ts` and `src/mobile/back.ts`.
- Existing mobile environment/package, viewport, and PDF lifecycle checks: **11/11 passed**. Real-component browser Back regressions: **6/6 passed**, covering actual Draft cancellation/focus restoration, busy confirmation, active PDF sharing/cleanup, nested dialogs, native top-layer priority, and ordinary history/root behavior. Browser checks isolate the native boundary; they do not replace Android runtime acceptance.
- Local repository checks passed: TypeScript, web build, **27/27 architecture checks**, and lint with **0 errors / 76 existing warnings**. The web build retains its existing chunk-size warning.
- Local logs and screenshots are ignored under `mobile-build/`; credentials, generated bundles, binaries, and signing files are excluded from commits.

## Website Preview verification

Exact code commit `eaed577f2e4b0477cdfb2645eecdeb8d5070c289` passed all three normal Vercel deployment statuses. Its immutable [Demo Preview](https://servsync-demo-ke2t0ueo0-bencatchots-projects.vercel.app) passed **7/7 public-route browser tests** plus authenticated contractor checks at 390px: Work → Start New Draft → blank composer → Back to Work, navigation-drawer Escape dismissal, and focus restoration. No record was saved or sent.

The Preview had no page errors or horizontal overflow. Inspection confirmed a static web body with neither the native class nor native styles; the native Back/viewport presentation is isolated from the website. Authenticated evidence is recorded in local `/tmp/servsync-mobile-preview-results.json`. These web checks supplement, and do not replace, native-device acceptance.

## Current runtime acceptance

Only approved existing fictional Demo accounts and records are used. Temporary composer input is unsaved; no request, estimate, invoice, report, message, payment, signup, or recovery email has been submitted by this acceptance pass.

The detailed iPhone composer, keyboard, format-switching, background/resume, section-jump, and chooser checks used this task's current-main rebuild. The final package differs only by the Android-only Back helper, which does not run on iOS. After installing that final package, contractor-session restoration and current Work/Draft entry were replayed. The earlier unaffected iPhone evidence remains applicable; it is not a claim that every check was repeated after that installation.

| Check | Current evidence | Remaining boundary |
| --- | --- | --- |
| iPhone launch/session | Rebuilt app restored the existing contractor workspace | Physical-device session lifecycle and account isolation still need acceptance |
| iPhone current Draft entry | Work → Start New Draft opens the current composer; previous pointer-coordinate scaling issue was resolved | This closes the prior simulator composer-activation blocker only |
| iPhone keyboard/composer | Title, description, and price remain visible with the software keyboard; a temporary line calculates a $125 total | No save or output launch; physical touch/typing remains unverified |
| iPhone format exploration | Standard/checklist round trip preserves the entered title and description | Does not establish persistence after saving or process termination |
| iPhone background/resume | Unsaved line and $125 total remain after background/resume | This is not offline synchronization or durable saved-Draft evidence |
| iPhone typing investigation | One CUA first-line truncation was not reproduced in **16 Chromium/WebKit real-component cases** using the native stylesheet/viewport adapter; DOM identity and focus stayed stable | Do not label this a reproduced app defect or a proven automation-only issue; repeat normal typing on a physical device |
| iPhone scrolling | Keyboard traversal works | Pointer drag/wheel did not establish touch scrolling; physical swipe acceptance remains open |
| iPhone Business Profile section jump | Passed through CUA pointer input: after hardware Page Up reached the section navigation, Go to section brought Logo & Branding below the header; the Demo label, header, and bottom navigation stayed in position | Visual containment established; no DOM/root-scroll measurement or physical swipe claim |
| iPhone photo/file chooser cancellation | Logo Upload → Photo Library opened the native picker with sample images; Choose File opened native Files Recents. Both canceled cleanly; logo remained empty | No selection, upload, account write, camera capture, or permission grant/denial acceptance |
| Android current-build runtime | Final APK installed and launched on the dedicated emulator through standard development-lifecycle ADB | CUA cannot expose the emulator window; alternate ADB UI controls await user approval before current UI/Back acceptance |
| Generated estimate/invoice PDF replay | Current native replay unverified; real-adapter browser checks pass and historical September 9 platform evidence remains available | The existing iPhone Estimate action was below the reachable viewport: CUA drag acted like a click, and wheel/Page Down did not establish scrolling. This is a control limitation, not a reproduced PDF or scrolling app defect |
| Stored report/document opening | Current native replay unverified | Test an existing finalized report/Home History attachment on both platforms once adequate device control is available; generated estimate/invoice PDFs are a different path |
| Post-validation tutorial freshness | **NONE** for the native Back/modal-cancel correction; fresh Production search and comparison completed after application/Preview checks | No published guidance changed; native Help transport and unpublished PDF guidance remain separate follow-ups |

A paired physical iPhone is available, but no physical test or signing has been performed. Device availability alone does not establish acceptance or authorize shared signing/configuration changes.

## Product and integration boundaries

The connected-account request → estimate → approval → job/report → invoice → Home History path uses the existing Supabase client, RPCs, and storage. Representative source paths include `src/App.tsx` request creation, homeowner estimate response, draft saving, estimate/invoice portal sending, accepted-estimate job creation, report finalization, and Home History filing. Native API-server integration is not a prerequisite for exercising those existing connected-account screens. A fresh mutating native lifecycle run is still needed before claiming that the complete loop passed on these packages.

The following remain distinct gaps, not promises delivered by this rebuild:

| Area | Actual source boundary | Required next step |
| --- | --- | --- |
| Stored reports and documents | `downloadDocument` and `downloadFinalizedInspectionReport` in `src/App.tsx` create signed storage URLs and click HTML download anchors. Generated estimate/invoice PDFs use `src/utils/pdfDocuments.ts` and the native PDF adapter. | Verify existing stored-file opening on both platforms. If needed, add a bounded native file-opening adapter using current authorized storage access; do not change storage policies merely to make downloads work. |
| Help videos | `src/features/help/helpStudio.ts` calls relative `/api/help-walkthrough-media`. The bundled local origin has no hosted API server, and `server/helpWalkthroughMedia.ts` has no cross-origin/OPTIONS support. | Ordinary end-user Help playback needs an intentional native transport or approved hosted handoff. Written Help availability does not prove video playback. |
| External estimate/report email | Relative `/api/send-local-estimate-email` and `/api/send-finalized-report-email`; server handlers reject foreign Origin headers. | An absolute URL alone is insufficient. Native API/auth/CORS work requires its protected approvals. Demo estimate-email delivery is independently provider-disabled; transport does not enable or authorize sending. |
| Guest document access | Guest estimate/invoice/report routes are relative `/api` calls using secure, HttpOnly, SameSite=Strict web cookies. | Keep generated guest links in their existing hosted web flow for the bounded connected-account Demo. Any in-app guest session requires an explicit cookie/session design. |
| Recovery, invitations, claims, and links | `src/appLinks.ts` deliberately generates hosted Demo links. No JavaScript app-URL/open-launch handler, Android app-link intent filter, or iOS associated-domain/custom-scheme registration is implemented. Native scene forwarding alone does not finish this flow. | Existing-account login can be accepted now; a customer beta needs a deliberate browser-return experience or approved callback/deep-link work. |
| Payments and Marketing providers | Stripe and Facebook endpoints use relative routes and same-origin checks; provider return URLs are web URLs. | Remain excluded from this native increment. Do not broadly relax Origin checks or spoof web origins. |
| Push and offline synchronization | No push integration or synchronization queue is implemented. The current connection notice warns that changes cannot be saved without connectivity. | Optional later scope; temporary in-memory state retention is not offline support. |
| Native session lifecycle | `src/supabaseClient.ts` uses the existing web client without a native secure-storage or explicit foreground/background session adapter. | Review storage and session lifecycle before customer distribution. Successful relaunch/resume does not complete that review. |

## Distribution readiness

Already configured: isolated locally bundled app; exact Demo backend guard; provisional `app.servsync.demo` identity; iOS minimum 15 and Android minimum 24/target 36; filesystem/share/network plugins; iOS camera/photo usage text and filesystem privacy reason; Android backup disabled and FileProvider configured.

Not configured in committed release files: iOS development team/provisioning, Android release signing, store export/release automation, and universal/app-link associations. Both platforms retain version `1.0`, build/version code `1`. Store account access, certificate availability, listings, artwork suitability, and complete privacy disclosures were not established by this source audit. No store account or signing secret was inspected. Physical camera/touch, VoiceOver/TalkBack, network/lifecycle behavior, and controlled distribution acceptance remain open.

## Tutorial reconciliation

The old TUT-002 replacement dependency is **resolved**. Production revision **4**, published and verified September 25, demonstrates Work → Start New Draft → Save Draft → Create Estimate with the current starter line, narration, captions, and an unsent result. The publication evidence lives on the separately unmerged recorder-support [PR #577](https://github.com/bencatchot/ServSync-App/pull/577), source `7c45ff6`, in [its acceptance record](https://github.com/bencatchot/ServSync-App/blob/7c45ff6/docs/qa/TUT_002_DEMO_RECORDER_SUPPORT_2026-09-25.md). Publication was an independently approved Help operation; this does not imply the recorder branch has merged.

This resolves the specific stale September 9 estimate-media blocker. The [native PDF guidance draft](../tutorials/NATIVE_PDF_GUIDANCE_DRAFT_2026-09-09.md) remains a draft, not published guidance.

**Tutorial impact: NONE** for this Back/modal-cancel correction. After application and Preview validation, 22 fresh searches in each of Demo and Production covered the affected roles, `contractor.drafts`/`contractor.financials` contexts, Draft/Create Estimate/confirmation terms, and native/mobile/Android/Back/cancel/PDF/share terms. Demo returned no published matches; Production supplied the authoritative published-library comparison. Native-specific terms matched no lessons. Broader matches were TUT-001 revision 1, TUT-002 revision 4, TUT-003 revision 1, and TUT-004 revision 1.

All four matching lessons' written steps/transcripts and secure videos were reviewed to the end at normal speed, with sampled visual frames. TUT-002 shows the current Start New Draft, open first line, Next step Estimate, Save Draft/Create Estimate confirmation, and final unsent Draft. TUT-001 retains request-to-estimate entry, TUT-003 ends Filed to Documents, and TUT-004 retains the outside-payment modal and Partially Paid outcome. The native handler reuses existing cancellation behavior without changing those web paths, labels, or outcomes; no Android Back instruction is contradicted. Playback was muted with visual/transcript comparison, not a renewed audio/caption-quality certification. No Help publication or record mutation occurred.

Local evidence: `/tmp/servsync-mobile-production-tutorial-search.json`, `/tmp/servsync-mobile-production-tutorial-playback.json`, and `/tmp/servsync-mobile-production-tutorial-frames/`. Hosted playback does not prove bundled-native Help video transport.

## Next acceptance boundary

Finish post-validation tutorial review and prepare the focused code change for owner review. Resume Android UI/Back and both-platform generated/stored-document acceptance when the required device controls are available; preserve the unverified boundaries above rather than treating compilation or browser tests as device acceptance. Keep FB-015 **Implementation In Progress**. The next distribution-focused increment should define native Help/API transport, callback handling, stored-file access, and physical-device/session acceptance with the exact required configuration approvals. Marketing providers, online payments, push, and offline synchronization can remain explicitly excluded from a controlled first device beta.

No schema, RLS/RPC, storage-policy, auth/provider/environment setting, production record, main merge, production deployment, or store release is part of this increment. The master plan's product direction is unchanged. The marketing inventory was reviewed; its existing native-app/store/offline claim limits remain accurate, so no inventory edit is needed.
