# Synthetic Demo Practice UI review

October 16, 2026 · [Issue #587](https://github.com/bencatchot/ServSync-App/issues/587) · [Draft PR #588](https://github.com/bencatchot/ServSync-App/pull/588)

## Implemented scope

`/#/practice-demo` is an isolated entry using the installed Demo state/start/save RPC and the existing estimate composer/PDF renderer. It requires the build flag `VITE_SERVSYNC_DEMO_PRACTICE_ENABLED=true`, exact Demo project reference `bdytwgejqnlblhrnqxkp`, and exact Supabase URL `https://bdytwgejqnlblhrnqxkp.supabase.co`. Missing or mismatched configuration leaves it off before loading the Auth client or normal business app. Query strings and browser storage cannot enable it.

The screen shows a persistent Demo/fictional-data indicator, fictional customer and setup, fixed cycle expiry, in-app warnings, saved Drafts and explicit Save/Preview actions. No real business snapshot is copied. The composer offers no live launch, transfer, send or payment action. A real Demo session and separately provisioned current pilot binding are still required server-side; the existing session retains its ordinary authority elsewhere in Demo.

Saved work resumes from the server after refresh or in another browser context. Unsaved work is kept in memory with navigation/close warnings; it does not survive closing the tab. Save retries retain their Draft ID after a lost response, and revision conflicts preserve input without silently overwriting another edit. Sign-out/account changes unmount the old editor and ignore its late results. Same-user token refresh preserves input.

Access checks are serialized, including initial load. Focus and 60-second polling recheck access; preview/download recheck before generating or handing off a file. A conservative monotonic deadline includes time spent waiting for a state response, so delayed responses cannot extend the cycle. Expiry clears the displayed content and closes/revokes the app's PDF URL. Revocation detection is bounded by the next action/focus/poll; already delivered or downloaded PDF bytes, including a browser PDF viewer's own save control, cannot be recalled. Every generated Practice PDF is visibly watermarked.

The existing entry router also replaces its zero-delay paired-event suppression with matching navigation URLs. A WebKit regression exposed that a late paired hash event could discard a consumed public-document access token. No delivery permission, token validation or Auth behavior changed.

## Evidence and limits

- 42 real disposable PostgreSQL checks, including 17 Demo integration/gate cases. Installed SQL bytes remain SHA-256 `4394c5ecb28167aee93f7a5cfcc08e3fb135a0e7dd8c45bd0ed02c89e3d833f4`.
- Desktop Chromium and mobile WebKit browser suite uses the real entry, Supabase browser session handling, Practice transport, reviewed SQL and PDF renderer. RPC requests are intercepted and forwarded only to a disposable local PostgreSQL fixture. Auth tokens/claims are synthetic; this is not hosted JWT/session acceptance.
- Browser coverage: default-off zero Auth/business/RPC requests, empty state, save/refresh/second-context resume, exact $250.50 PDF and watermark, cancelled navigation/Back, token refresh, offline recovery, lost acknowledgement, concurrent conflict, account-change late save, expiry while open, delayed expired response, revoked download, mobile overflow and public-document entry isolation.
- Local fixture controls exist only in `scripts/practice/demo-serve.ts`, bind loopback, require an explicit test header and fixed synthetic identities, and are absent from the application bundle. It accepts no remote database or arbitrary SQL input. All external browser traffic except intercepted exact Demo RPC fails closed.
- Read-only Demo check reconfirmed zero pilots, cycles and Drafts. The existing recorder account is confirmed/non-anonymous with profile role `contractor`. Its exact identity is reserved for the private owner handoff. No credential value is recorded here.
- Hosted valid-session/pilot acceptance remains pending. Ordinary automatic Preview builds keep the new flag off. SQL, grants, settings, production data, cleanup and renewal were not changed in this UI step.

Run `npm run test:practice:demo:browser` for the self-contained local browser/database fixture. Run `npm run test:practice` for the broader database boundary suite. The browser suite needs local PostgreSQL and installed Chromium/WebKit; it never consumes the real Demo account.

## Smallest next hosted UI/pilot approval

This is a proposed bounded action, not current authorization:

1. In existing Vercel **servsync-demo**, project `prj_tB94FLcorqX9sW7EGPd7t32Z4rdS`, team `team_Ga7ZoNeteThUar4RQbhiEvGf`, enable only `VITE_SERVSYNC_DEMO_PRACTICE_ENABLED=true` for Preview branch **codex/temporary-practice-workspace**. Verify the existing Demo URL/reference first; stop if any other configuration is needed. Authorize one ordinary branch Preview rebuild with that configuration, then verify its exact URL/commit. No production target or other Vercel project.
2. In **ServSync Demo `bdytwgejqnlblhrnqxkp`**, insert one pilot binding for existing confirmed Auth identity **the existing Demo recorder contractor account identified in the private owner handoff**, with a newly generated synthetic tenant namespace and access until **24 hours after activation**. Reconfirm identity and that it has no binding/cycle immediately before insertion. No account creation, Auth grants, role change or business-record association. Installed SQL remains unchanged.
3. Use that existing account only on the exact resulting Demo Preview to verify synthetic start/save/resume/PDF, safe account exit and absence of business/outbound writes. If deployment protection needs the existing Demo bypass, approve its exact destination before sending it. No real business data, customer sends, charges or live transfer. Stop on a mismatch; do not improvise permissions or credentials.

The pilot access expires independently of the SQL's 720-hour cycle. Access expiration does not delete retained rows. Cleanup, renewal, same-login Production snapshots, transfer and broader rollout each remain separately reviewed decisions. No new project is needed.

Tutorial result and final CI/Preview links are recorded in the PR after completed validation.

## Final local review

Independent reviewer reran **18/18** desktop Chromium/mobile WebKit browser tests, checked the repaired timing/navigation boundaries, reran Practice type checks and inspected the mobile screenshot; no remaining blocking finding within local scope. Full lint passes its existing 76-warning baseline (zero errors); full and Practice type checks, build, 27 architecture checks and 16 backend-parity tooling checks pass. The built default-off artifact was separately opened in Chromium and WebKit on loopback: both showed the disabled entry with zero external requests. Existing large-bundle/Browserslist build notices remain.

Tutorial impact: **NONE** for this Demo-only UI draft. After implementation and application validation, read-only searches of the Demo Help Studio catalog covered practice, fictional/sample estimate, watermark, estimate preview, Draft, save/resume, pricing/scope, onboarding/business setup and public-document workflow terms, plus exact Practice/delivery route contexts. No matching published or current revision was returned, so there was no matching walkthrough to play. No Help content changed. PR #586's separate TUT-002 follow-up is unaffected. A hosted pilot must recheck its actual Help surface after activation; this catalog check is not hosted-session acceptance.
