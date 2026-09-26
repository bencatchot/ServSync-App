# ServSync Demo mobile prototype

An isolated Capacitor 8.5.1 build of the existing ServSync React app for iOS and Android. Development identity: `app.servsync.demo`, display name `ServSync Demo`. This identity is provisional and separate from any eventual production app-store listing.

Current status: [September 26 rebuild and acceptance](../docs/mobile/ServSync_Native_Acceptance_2026-09-26.md). Both current-source native builds pass; native UI acceptance and distribution readiness remain incomplete.

## Build

Use Node 22+ and `npm ci` at the repository root. Create ignored `.env.mobile.local` with only the approved Demo frontend values:

```
VITE_SUPABASE_URL=https://bdytwgejqnlblhrnqxkp.supabase.co
VITE_SUPABASE_ANON_KEY=<Demo public anonymous/publishable key>
```

Never add login passwords, service-role keys, or production configuration. The mobile build checks the exact Demo URL and rejects privileged keys and non-Demo legacy JWTs. Opaque publishable keys are non-privileged but cannot be locally decoded to establish project ownership; an incorrect key fails against the pinned Demo host.

```
npm run mobile:test
npm run typecheck
npm run mobile:sync
npm run mobile:ios
npm run mobile:android
```

The normal `npm run build` still creates the website in `dist`. Mobile uses a separate HTML/entry point, `vite.mobile.config.ts`, and `dist-mobile`. Native projects bundle local assets; no `server.url`, cleartext exception, or remote-navigation wildcard is configured. Always run `mobile:sync` after changing source. Generated asset bundles and local signing/build files are ignored.

For an unsigned iOS simulator build:

```
xcodebuild -project mobile/ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath mobile-build/ios -packageAuthorizationProvider netrc \
  CODE_SIGNING_ALLOWED=NO build
```

For Android, use JDK 21 and an installed Google Android SDK with accepted licenses. Set `ANDROID_HOME` for the process or an untracked `mobile/android/local.properties`. The project specifies API 36 and minimum API 24. Build with `./gradlew :app:assembleDebug -Pandroid.builder.sdkDownload=false --no-daemon` from `mobile/android`; the flag prevents automatic SDK installation. Do not change global toolchain settings used by AthleticsArc. The development Mac already had an SDK at `/opt/homebrew/share/android-commandlinetools`; this task used an isolated Temurin 21 archive and Gradle cache under ignored `mobile-build/`.

## Implemented foundation

- Shared existing role-aware app, with contractor entry on first launch and a Demo label.
- Native PDF action registration: the existing Preview/Download actions offer an explicit system share-sheet action. It never automatically chooses a destination or sends a document. Retry/cancel keeps the source document intact; closing the dialog removes its temporary cache file.
- Native network-status notice; no claim of offline editing or synchronized drafts.
- Android back action closes an open dialog first, otherwise navigates back or minimizes at the root.
- Generated links use the Demo website origin rather than `capacitor://localhost`. Password recovery and invitations still return to the website; automatic native callback handling is not implemented.
- Camera/photo usage descriptions for existing HTML upload inputs. Actual capture, selection, cancellation, and upload require native-device verification.
- Filesystem API privacy reason declaration; this is not a complete App Store privacy disclosure.

## Native Work configuration

The native build pins the three current Demo Work switches in `scripts/mobile/environment.mjs` and rejects conflicting local/process values. This matches verified hosted Demo configuration and preserves existing account eligibility. The earlier native package omitted these switches and showed legacy Work. September 26 rebuilt-iPhone acceptance now verifies Start New Draft, keyboard-visible fields, temporary line pricing, format switching, and unsaved state after background/resume without saving. The earlier pointer-coordinate issue is resolved. Earlier legacy Work navigation evidence is not full current-workflow acceptance; see the current report for Android and remaining device checks.

## Native presentation verification

The native-only layout owns safe-area spacing, keeps the workspace header above scrolling content, and reveals focused fields after keyboard resize. The [September 9 matrix](../docs/mobile/ServSync_Native_Polish_Acceptance_2026-09-09.md) records both-platform session switching/restoration, navigation, generated estimate/invoice PDF viewing, cancellation/retry and temporary-file cleanup; Android Back, network interruption/recovery, and Files/Photos cancellation also passed then. Current-build evidence is recorded separately in the [September 26 report](../docs/mobile/ServSync_Native_Acceptance_2026-09-26.md). Do not count the old packages as acceptance of later Work/Draft changes. The current native Back handler additionally consumes accessible modal confirmations through their existing cancel/Escape behavior, including busy states.

## Explicit limitations

This is a feasibility prototype, not a store-ready app. Remaining checks are tracked in the current acceptance report. Browser-relative `/api/*` routes include ordinary Help video playback, external email delivery, guest document views, payment and Marketing operations. These need a deliberate native/server integration and CORS/cookie assessment; they must not be represented as working in the prototype. Stored report/document downloads also use a different path from generated estimate/invoice PDFs and need their own native acceptance. No global fetch interception, origin spoofing, or authentication workaround has been added. Core Supabase-backed sign-in and connected-account record screens are the intended acceptance path.

Native universal/app links, password recovery callbacks, notification providers, offline synchronization, biometric login, production signing, store submission and physical-device acceptance remain follow-ups. Login persistence uses the existing Supabase client behavior; iOS and Android fresh-launch and account-switch checks passed; physical-device lifecycle checks remain. The iPhone simulator has no physical camera; simulator tests cannot establish actual camera behavior.

Test only with existing approved fictional Demo accounts. Do not submit signups, recovery emails, customer messages, payments or live provider actions as part of a smoke check. Keep AthleticsArc's simulator and processes separate.
