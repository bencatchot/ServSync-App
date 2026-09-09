# ServSync Mobile Prototype v1

Owner direction: September 9, 2026, iPhone and Android together. Branch `codex/mobile-prototype-v1`, based on main `68e16f52c339a68630dd6826de6db03f347fa966`.

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
- Native interactive testing: **pending**. The Mac was locked when simulator access was attempted. No native sign-in, camera, network interruption, or sharing result is claimed.
- Android compilation: **pending**. No Java runtime, standard-location Android SDK, or Android Studio was detected. SDK installation/license approval was requested; no SDK agreement has been accepted by this task.

Xcode initially waited on a locked Keychain while fetching public binary dependencies. Re-running this task's build with its supported `-packageAuthorizationProvider netrc` option fetched the public packages and completed. No Keychain was unlocked, credential exposed, global setting changed, package validation disabled, or other task's build stopped.

## Next acceptance steps

1. Use a separate simulator/device from AthleticsArc and the approved existing Demo accounts.
2. Verify native launch, contractor sign-in, close/reopen and background/resume, sign-out, and contractor/homeowner account isolation.
3. Verify Work, Calendar, customer/job context, and authorized estimate/invoice views.
4. Exercise existing photo picker grant/denial/cancel with synthetic test media; validate actual camera capture on physical devices later.
5. Generate a Demo document and test the native PDF share sheet, cancellation, retry, and temporary-file cleanup. Do not send to a recipient.
6. Interrupt network connectivity during an unsaved task; record actual behavior without claiming offline editing or queued synchronization.
7. Compile and repeat the core checks on Android once its toolchain is available.

## Known integration gaps

Relative `/api/*` server routes still require an intentional native API/CORS/cookie design. They include external email delivery, some guest views, payment/provider and Marketing operations; those paths are not native-prototype acceptance claims. Existing Supabase-backed account and record screens are the initial test target.

Password recovery/invitation links remain web links; they do not automatically resume the native app. Universal links/app links, secure native session lifecycle review, notification delivery, offline synchronization, branded store artwork, signing, App Store/Play disclosures, and physical-device acceptance remain open. Store release and protected shared-configuration changes require separate owner approval.

## Tutorial freshness

Tutorial impact: UPDATE REQUIRED.

Known existing follow-up: TUT-002 “How to create an estimate,” revision 3, needs the narrated/captioned replacement already recorded in PR #571. This prototype does not publish or retire Help content. The new native PDF behavior also requires a mobile-specific walkthrough assessment after interactive acceptance. Fresh Help Studio search/review for this increment is pending Mac unlock; prior browser tutorial evidence is not represented as native acceptance. Do not merge this prototype or declare tutorial completion from compilation alone.

## Release state

Development foundation implemented for review; prototype acceptance incomplete. No main merge, production deployment, shared Auth/SQL/RLS/RPC/storage-policy/provider change, signup, outgoing communication, payment, or Production Help publication performed.
