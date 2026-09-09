# Admin Contractor Prospects v1

Status: source implemented; shared rollout and hosted/tutorial acceptance pending. Approved by Ben on September 9, 2026 after deciding that unclaimed listings should be public and unable to receive homeowner contact.

## User experience

- Platform Admin → Contractors → Create prospect profile. Prepare business name, contact name, email, phone, website, logo URL, city/state/ZIP, services, service ZIPs, and description. The profile address is generated from the business name and may be edited before the first save. Admins can publish or hide unclaimed listings.
- Discover includes a business-profile directory alongside the existing contractor posts. Unclaimed profiles show their status, ServSync attribution, an explanation, and disabled connection/request buttons. Contact name, email, phone, and website are excluded from public responses and rendering. No fabricated posts, reviews, owner endorsement, or credential verification is added.
- Create a private claim link for a named email, copy it, and send it manually. Issuance replaces previous links; links expire after 14 days. Admin reads never return token/hash values. The raw token is shown only in the issuing screen and is not persisted in local storage. Save edits to revoke stale invitations; explicit revocation is also available.
- The recipient signs up or signs in through existing authentication, verifies the invited email, reopens the claim URL, reviews/corrects the business details, confirms authority, and claims. The same profile identity and address become a canonical owned contractor profile. Existing beta/billing initialization runs at that point, without changing billing policy. The directory then reads current owner-controlled profile fields and honors public visibility/account status.
- An account already owning a contractor profile must contact ServSync; the claim cannot overwrite or merge it. There is no automatic email delivery, publicly available claim token, broad ownership transfer, fake user creation, or admin editing of claimed owner details in this feature.

## Backend and authorization

Migration SHA-256: `0aa72fef5517fa8e843d39876637394a75b36662e37496c362b02836baf6dd42`.

`servsync-admin-contractor-prospects.sql` adds one RLS-enabled private prospect table and explicit RPCs/helpers. Anonymous callers can read only the public projection and token-scoped public claim introduction. Full claim details and acceptance require the authenticated contractor's verified `auth.users.email` to equal the invited email; role is read from the canonical profile, never signup metadata. Installation requires the existing signup-role guard and billing initialization trigger. Blank-install sequences include the existing billing prerequisite before this migration.

Unclaimed UUIDs do not exist in `contractor_profiles`. Existing foreign keys and request/connection authorization therefore reject attempted contact at the server. A trigger reserves prospect slugs and UUIDs against direct profile insertion/renaming, including browser attempts to create a lookalike target. Claiming holds an invitation row lock and account lock, sets the ownership mapping, and inserts the canonical profile in one transaction with a deferred foreign key. Failed insertion rolls back consumption; concurrent/replayed claims cannot create a second profile or billing record. Owner edits after claim preserve existing permissions; the prospect snapshot is provenance, not owner-editable data.

All new functions have explicit ownership, fixed search paths, and restricted execution grants; direct prospect access is revoked from anon, authenticated, and service_role. Private helper execution is not granted to browser roles. Normalized copied fields are allowlisted so privileges, billing fields, admin notes, and ownership cannot be injected.

## Validation evidence

- `npm run test:contractor-prospects`: disposable local PostgreSQL, migration applied twice, direct-table/helper denial, platform-admin boundary, public/contact/token redaction, search, URL validation, duplicate/reserved slug and UUID rejection, wrong/unverified recipient rejection, stale revision, failed-insert rollback, existing-owner refusal, replay, rotation, edits, revocation, expiration, same identity, one billing initialization, owner editing, self-promotion denial, service-request denial before claim, and post-claim connection/service-request success. Two overlapping claim transactions produce one success and one canonical profile/billing record.
- `tests/e2e/admin-contractor-prospects.spec.ts`: seven passing browser tests covering 1440px/390px public profiles and Discover, no contact links/actions, admin create/save/issue/edit/revoke, recipient review/acceptance, wrong-recipient denial, anonymous auth entry, and unavailable-backend compatibility. Components use mocked RPC transport; PostgreSQL tests independently exercise the real SQL. These are not claims of hosted or shared-environment acceptance.
- TypeScript, production build, focused ESLint, diff checks, and app-size baseline pass. New UI lives in feature modules; the App.tsx baseline decreases to 50,721 lines.
- Related signup/route tests: 17/18 passed when combined with the feature suite. The legacy mobile-auth-link test asserting that no Capacitor code exists fails against the already-approved current-main mobile prototype. The feature does not add native configuration or change that behavior.
- Local screenshots reviewed for legibility and no horizontal overflow: `/tmp/servsync-unclaimed-profile-1440.png`, `/tmp/servsync-unclaimed-profile-390.png`, `/tmp/servsync-prospect-admin-390.png`. No real customer information or live claim tokens were used.

## Tutorial freshness and release gates

Tutorial impact: UPDATE REQUIRED
Tutorial evidence: Current Help Studio search and published Preview review are blocked because the existing Safari private session and Mac are locked. The previous September 8 catalog records TUT-005 How to connect and request service as the relevant published walkthrough, but that historical evidence is not a substitute for this feature's current search/playback comparison. No claim is made that the current tutorial has been proven stale.
Affected tutorials: TUT-005 How to connect and request service — freshness review target; any additional current matches must also be reviewed.
Tutorial follow-up: Codex must search Help Studio for Discover, contractor profile, Contractors, unclaimed, claim, connection, service request, homeowner.discover, and public profile, then Preview all published matches. If TUT-005 implies that every visible business can receive requests or its Discover path becomes misleading, prepare a bounded revision explaining unclaimed listings and showing an available claimed contractor; publish only with explicit owner approval and verify it. If no guidance is stale, replace this conservative pending status with NONE and record actual evidence. Do not declare completion while this gate is unresolved.

The rollout ledger marks Sandbox, Demo, and Production Pending. No shared SQL, production data/user mutation, infrastructure change, merge, or manual production deployment is authorized or performed by this source task. Next: approve the exact migration for Sandbox, validate authenticated admin/recipient/homeowner flows on the feature Preview, and separately decide Demo/Production rollout. Read-only live parity has not been claimed; applying SQL remains separately protected.
