# ServSync Demo mobile prototype

An isolated Capacitor 8.5.1 build of the existing ServSync React app for iOS and Android. Development identity: `app.servsync.demo`, display name `ServSync Demo`. This identity is provisional and separate from any eventual production app-store listing.

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

## Native presentation verification

The native-only layout owns safe-area spacing, keeps the workspace header above scrolling content, and reveals focused fields after keyboard resize. Both platforms have session switching/restoration, core navigation, estimate/invoice PDF rendering, cancellation/retry and temporary-file cleanup evidence. iPhone used Apple Preview; Android used system Print preview without submitting a print job. Android Back and device-only network loss/recovery passed. Ben approved standard Android testing controls for the dedicated `ServSync_Pixel_8_API_36` (`emulator-5556` during this run), with identity checks before actions. The default emulator GPU produced duplicate paint in Financials; the unchanged APK rendered correctly using the task-scoped `-gpu swiftshader` option. See [the current acceptance matrix](../docs/mobile/ServSync_Native_Polish_Acceptance_2026-09-09.md) for the final iPhone section-jump replay and remaining physical-device/accessibility checks. Android Files and Photos/Albums cancellation passed without selection or upload.

## Explicit limitations

This is a feasibility prototype, not a store-ready app. Both native projects compile; iOS sign-in/session switching, core navigation, and estimate PDF preview/share/cancel have initial runtime evidence. Remaining checks are tracked in `docs/mobile/ServSync_Mobile_Prototype_v1.md`. Browser-relative `/api/*` routes (including external email delivery, some guest views, payment and Marketing operations) need a deliberate native/server integration and CORS/cookie assessment; they must not be represented as working in the prototype. No global fetch interception, origin spoofing, or authentication workaround has been added. Core Supabase-backed sign-in and record screens are the first intended test path.

Native universal/app links, password recovery callbacks, notification providers, offline synchronization, biometric login, production signing, store submission and physical-device acceptance remain follow-ups. Login persistence uses the existing Supabase client behavior; iOS and Android fresh-launch and account-switch checks passed; physical-device lifecycle checks remain. The iPhone simulator has no physical camera; simulator tests cannot establish actual camera behavior.

Test only with existing approved fictional Demo accounts. Do not submit signups, recovery emails, customer messages, payments or live provider actions as part of a smoke check. Keep AthleticsArc's simulator and processes separate.
