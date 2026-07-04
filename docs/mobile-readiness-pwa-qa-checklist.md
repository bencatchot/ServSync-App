# ServSync Mobile PWA Real-Device QA Checklist

Use this checklist for installed-PWA and mobile browser QA before ServSync moves toward any native wrapper or app-store beta. It is a planning and testing aid only.

## Purpose And Guardrails

- ServSync is preparing for future mobile app work through mobile-first web and PWA readiness first.
- This checklist is for mobile browser and installed-PWA QA only.
- This is not a native iOS or Android app launch.
- This does not add Capacitor.
- This does not add iOS universal links, Android app links, custom schemes, push notifications, service workers, offline sync, or native projects.
- This does not change Supabase Auth settings, Vercel settings, auth behavior, SQL/RLS/RPCs, Edge Functions, production data, or deployment behavior.
- Deep links and app links, when implemented later, must remain navigation hints only. Supabase Auth, RLS, and RPC validation remain the authorization boundary.

## Test Environments

Record the exact environment before testing.

| Environment | Required notes |
| --- | --- |
| iPhone Safari mobile browser | Device model, iOS version, Safari version if available |
| iPhone Safari Add to Home Screen PWA | Confirm launched from home screen, not just browser tab |
| Android Chrome mobile browser | Device model, Android version, Chrome version |
| Android Chrome installed PWA / Add to Home Screen | Confirm install mode and launch source |
| Optional tablet checks | iPad Safari, Android tablet Chrome, or other available tablet |
| Production URL | Usually `https://servsync.app`; use only approved non-mutating production accounts/flows |
| Preview URL | Use PR/Vercel preview for mutation-capable QA unless separately approved |
| Test accounts | Supply manually through approved local/private channels; never commit credentials |

## Installed PWA Checks

| Check | Expected result | Notes |
| --- | --- | --- |
| Add to Home Screen / install flow | ServSync can be added or installed from the supported browser path |  |
| App icon/title display | Icon and title are recognizable and match current PWA metadata |  |
| Launch from home screen | App opens without an obvious broken shell or blank screen |  |
| Standalone display behavior | App uses standalone display where supported; no offline claim is shown |  |
| Start URL behavior | App opens the root web app route, currently `/` |  |
| Refresh/reopen behavior | App reloads without losing basic route state unexpectedly |  |
| Session persistence | Signed-in session persists after close/reopen where the browser/PWA allows it |  |
| Logout/session clear | Logout clears the visible session and returns to signed-out state |  |
| Network interruption | App shows safe loading/error behavior and does not claim offline support |  |

## Auth Checks

| Flow | Web browser | Installed PWA | Notes |
| --- | --- | --- | --- |
| Homeowner signup | Confirmation modal appears when email confirmation is required | Same behavior or documented device-specific variance |  |
| Contractor signup | Confirmation modal appears when email confirmation is required | Same behavior or documented device-specific variance |  |
| Confirmation modal | Copy is readable on small screens | Same |  |
| Confirmation resend | Resend behavior remains conservative and does not expose internals | Same |  |
| Login | User reaches correct dashboard for role | Same |  |
| Logout | Session clears and signed-out state appears | Same |  |
| Password reset request | Reset request can be submitted from role auth page | Same |  |
| Recovery link from mobile email client | Opens a predictable browser/PWA target; record whether it opens browser, PWA, or another context | Same |  |
| Reset-password screen | Password recovery UI appears only when Supabase session/link state is valid | Same |  |
| Browser/PWA routing observation | Record final URL/hash and whether the app state matches the intended role | Same |  |

## Route And Link Checks

Open each route/link from the mobile browser and, where possible, from the installed PWA or a mobile email/message app.

| Link | Expected current behavior | Result |
| --- | --- | --- |
| `/#/homeowner` | Homeowner auth/dashboard route loads depending on session |  |
| `/#/contractor` | Contractor auth/dashboard route loads depending on session |  |
| `/#/profile?slug=...` | Public contractor profile route loads when slug exists |  |
| `/#/homeowner?claim=...` | Homeowner local-customer claim flow loads when token is valid |  |
| `/#/homeowner?invite=...` | Homeowner invite/referral flow loads when code is valid |  |
| `/#/contractor?team_invite=...` | Contractor team invite path is recognized for eligible signed-in users |  |
| Legal links | Terms, Privacy, Acceptable Use, Contractor Agreement, and Trust & Safety routes load |  |
| Generic app/notification link | App-level link opens ServSync; record whether it lands on dashboard/home only |  |

## Workflow Smoke Checks

Run these in preview/sandbox unless the specific production flow is explicitly read-only and approved.

| Workflow | Mobile browser | Installed PWA | Notes |
| --- | --- | --- | --- |
| Homeowner request flow | Create/review flow is usable on mobile | Same |  |
| Contractor dashboard | Navigation and dense cards are readable | Same |  |
| Estimates | Create/review/send/approve surfaces are usable for the approved test scope | Same |  |
| Jobs | Job detail, report/checklist, and status surfaces are usable | Same |  |
| Scheduling | Appointment proposal/response surfaces are readable and usable | Same |  |
| Invoices | Invoice cards, view/send/read-only surfaces, and totals are readable | Same |  |
| Home Access/shared-home flows | Invite/shell/shared-home copy remains clear and does not imply unsupported shared records | Same |  |
| Contractor invite/referral flows | Contractor invite/referral links and submit/admin areas remain separated by role | Same |  |

## File, Photo, And PDF Checks

Use non-sensitive test files only. Do not upload real customer, financial, identity, or private home records during casual QA.

| Check | Expected result | Notes |
| --- | --- | --- |
| Homeowner profile photo upload | Supported image upload works or shows safe error copy |  |
| Home photo upload | Supported image upload works or shows safe error copy |  |
| Request media upload | Supported image/video upload works where the flow is enabled |  |
| Home Documents upload | PDF/JPG/PNG/WebP rules and file-size errors are clear |  |
| Contractor logo upload | Supported image upload works or shows safe error copy |  |
| Job/inspection image upload | Camera/photo library choices work where available |  |
| Estimate PDF download/open | PDF opens/downloads predictably on device |  |
| Invoice PDF download/open | PDF opens/downloads predictably on device |  |

## Future Capacitor POC Notes

A future Capacitor proof of concept must prove the following before any TestFlight or Google Play beta decision:

- App shell loads the existing ServSync web app.
- Current hash routes work inside the WebView.
- Supabase session persists safely across close/reopen.
- Logout clears session reliably.
- Password recovery behavior is understood and documented.
- External browser versus app WebView behavior is understood for auth and invite links.
- File/photo picker behavior is known on iOS and Android.
- PDF download/open/share behavior is known on iOS and Android.
- No RLS/security bypass is introduced.
- No service-role key, privileged native-only credential, or secret is exposed.
- No offline capability is claimed unless a future approved offline strategy exists.
- Native URL handling, universal links, Android app links, push notifications, and app-store configuration remain separate future approvals.

## Result Recording Template

Copy this table for each QA session.

| Date | Tester | Device | OS/browser | Environment URL | Flow tested | Result | Notes | Screenshot/video reference | Follow-up issue/PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD |  |  |  |  |  | Pass / Fail / Needs follow-up |  |  |  |

## Follow-Up Classification

Use this classification when recording issues.

| Classification | Meaning |
| --- | --- |
| Current web bug | Should be fixed in the responsive web app before broader beta |
| PWA-specific issue | Appears only after Add to Home Screen / install behavior |
| Auth/settings dependency | Likely needs future Supabase/Vercel settings approval |
| Native POC dependency | Can wait for a future Capacitor proof of concept |
| Deferred native feature | Push, offline sync, app links, custom schemes, app-store work, or native-only behavior |
