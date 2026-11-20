# Portal switching prototype

The standalone `/portal-switch-preview.html` review page uses three fictional accounts and no ServSync session. A dual-role account can switch between an existing home and a business. Single-role examples expose only their available portal. Switching or changing example discards the selection and scratch note. Refresh remembers only a validated portal preference per fictional account on that origin.

Only the protected servsync-demo project's Vercel Preview builds include the page. The separate native entry and ordinary production build do not include it. The page has its own application entry, a restrictive content security policy and no backend client. The example selector simulates different accounts for review.

## Later enrollment and existing-account linking

New-role enrollment should reuse the signed-in identity and normal role-specific setup. Authorize enrollment and resource access on the server. Continue to check individual home membership, sharing, contractor ownership, team permissions and business subscription independently of the selected portal. Preserve existing single-role routes and honor authorized deep links. Namespace caches and cancel stale loads when account or workspace changes.

Offering an existing account is a separate workflow. Keep the preferred login and require fresh proof of control of both accounts, then show the exact workspaces and ask for confirmation. Preserve original home, contractor, billing, record and audit identities. Do not match by email alone, auto-join a team, promote privileges or duplicate a subscription. Resolve ownership conflicts before committing a scoped, auditable, revocable link. The prototype performs neither enrollment nor linking.

## Local review

Run `npx playwright test -c tests/portal-switch/playwright.config.ts` to build the preview with simulated Vercel build metadata and test it on loopback in desktop Chromium and iPhone WebKit. No account or backend configuration is needed.
