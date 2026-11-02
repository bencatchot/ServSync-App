# Demo Practice entry and maintenance review

October 16, 2026. Reviewed follow-up to commit `2a2352a` / draft PR #588. The owner approved publishing the UI, tests and documentation and rebuilding the existing Demo Preview. Deployment-specific verification is recorded in the PR. Database maintenance remains separate and unapproved.

## Local UI change

The unauthenticated Practice page's working sign-in destination was hidden behind **Go to the regular app**. It now offers **Sign in to Demo**, with a 44px minimum touch height. The fixed same-origin `#/contractor` sign-in opens in a separate tab with `noopener noreferrer`. Explicit instructions say to use the existing approved Demo account and return to the original Practice tab.

The existing Auth subscription receives cross-tab sign-in updates. No new redirect parameter, token copying, role assignment, authentication rule or normal-app change was introduced. The normal sign-in page still resolves the signed-in account's actual role. Disabled Practice retains its previous current-tab regular-app escape. Switching back to the Practice tab is manual; there is no claimed automatic cross-tab navigation.

Files: `src/features/practice/PracticeDemoEntry.tsx` and focused cases in `tests/practice/demo-ui.spec.ts`.

## Verification and mobile review

- **28/28** local browser checks passed across desktop Chromium and emulated iPhone WebKit. These exercise the actual UI and disposable PostgreSQL; Auth sessions and RPC routing are synthetic. The new sign-in test opens the actual normal sign-in form, verifies no opener, keeps the original Practice route, verifies no pre-sign-in Practice RPC, and exercises the existing cross-tab sign-in event.
- A new 320×568 viewport case verifies no horizontal overflow, Save/Preview touch targets at least 44px tall, tap operation in mobile WebKit, reachable PDF Close/Download controls and focus after Close. At this width, action text wraps inside the buttons without clipping.
- Fresh sign-in, narrow-editor and PDF-control screenshots were visually reviewed independently. Headless WebKit's PDF content area is blank; those screenshots establish control layout only. Existing PDF byte/content checks and actual hosted desktop Safari rendering are separate evidence. Physical iPhone rendering, keyboard and tab switching are still unverified.
- Full and Practice TypeScript, lint at the existing 76-warning baseline, build and diff checks pass. Existing Browserslist/large-chunk notices remain.
- Hosted Escape was verified on the existing published `2a2352a` Preview: opened an existing fictional draft without edits, opened its PDF, sent Escape only after identifying the exact Practice window/dialog, and confirmed focus returned to Preview. Returned to saved drafts and restored the previous front Safari window. No saved record, pilot expiration, zoom or unrelated tab changed. Two drafts remain at revisions 1 and 3; read-only checks confirm preserved prior data/pilot fingerprints and unchanged owner privileges.
- Independent reviewer found no blocking UI or mobile-layout issue. The reviewer inspected source/tests/screenshots but did not independently rerun the browser suite or hosted Safari check.

Tutorial impact: **NONE**. After final application checks, read-only Demo Help Studio searches of current/published revisions covered Practice, sign-in/login, sample, estimate/Draft/save/resume and relevant route contexts. No matching walkthrough was returned; none required playback. No Help publication occurred.

## Deadline blocker: read-only findings

Target remains the existing **Demo project**, PostgreSQL 17.6. The function is `servsync_practice_demo.dispatch(text,jsonb)`; its runtime owner is the restricted `servsync_practice_demo_executor` role.

The original approved installation deliberately transferred ownership, revoked runtime schema CREATE, then set the installer's membership to `SET FALSE, INHERIT FALSE`. This prevents the restricted runtime identity creating/replacing functions and prevents ordinary installer sessions using ownership rights afterward. It is a maintenance barrier, not evidence of broken runtime RLS.

Read-only catalog evidence reconfirms:

| Role | Relevant capability |
| --- | --- |
| `postgres` (current operator) | Not superuser; existing schema CREATE; membership ADMIN is present, but effective SET and inherited owner rights are both false. |
| `servsync_practice_demo_executor` | NOLOGIN, no superuser/BYPASSRLS/CREATEROLE, no schema CREATE. |
| `dashboard_user` | NOLOGIN and no owner SET/inheritance or schema CREATE. |
| `supabase_admin` | Provider-internal superuser; not an available authorized operator route. No credential/access was sought. |

Two membership rows exist for the operator, with different grantors; both currently have SET/INHERIT false. They must be preserved exactly by any future maintenance operation. ADMIN allows administering membership but is not itself function-owner authority. [PostgreSQL 17 membership semantics](https://www.postgresql.org/docs/17/role-membership.html), [GRANT semantics](https://www.postgresql.org/docs/17/sql-grant.html).

There is **no already-authorized owner-capable route established by the available connection**. Switching to the Dashboard does not solve it: Supabase documents that Dashboard queries run as `postgres`, while `supabase_admin` is internal. [Supabase role documentation](https://supabase.com/docs/guides/database/postgres/roles). Connecting as the same role through another client would not change these capabilities. No denial was worked around.

The original response-only SQL file remains unchanged and **unapplied**: `20261016193850_practice_demo_access_deadline_response.sql`, SHA-256 `56c8894ebe80a8f49294a2e47c88de71d9ae6b22d2c675f505ea0cb123cca093`. Its only functional difference is the existing `access_until` value returned as `accessExpiresAt` on state/start. Signatures, save behavior, public wrapper, owner, function ACL, security-definer setting, search path, RLS and records would remain unchanged.

## Narrow maintenance proposal — not executed or rehearsed

Keep the honest UI fallback until a reviewed maintenance operation is approved. If exact pilot-deadline display is required, the narrow candidate is:

1. Capture the exact current function definition/attributes, schema/function ACLs, policies, all membership rows/grantors, and pilot/draft fingerprints. Require the reviewed baseline and exact Demo target; stop on drift.
2. In **one transaction**, temporarily enable only `INHERIT` on the existing operator's self-granted membership in the runtime-owner role, leaving SET/ADMIN unchanged. Conceptual operation: `GRANT servsync_practice_demo_executor TO postgres WITH INHERIT TRUE GRANTED BY postgres`. This is a security-sensitive membership change requiring new explicit approval.
3. Replace the function as `postgres`, using its existing schema CREATE and temporarily inherited ownership authority. Preserve the existing runtime function owner, grants, signature and configuration. Add only the reviewed response projection.
4. Restore the original membership flags/rows/grantors before commit; the counterpart for that same existing grant is `WITH INHERIT FALSE`. Assert exact membership/security/data fingerprints before the sole commit. Abort on any mismatch.

This avoids changing function ownership, enabling role login, granting schema CREATE to the runtime executor, adding credentials or leaving permanent maintenance access. The consequence is temporary ownership authority for the maintenance transaction; that consequence must be explicitly approved even though the intended committed privilege state is unchanged. Existing tests applied the response draft as a disposable fixture administrator, so they do not prove this non-superuser maintenance route.

**Do not wrap or concatenate the existing response draft unchanged.** It contains its own `BEGIN`/`COMMIT`; an embedded commit could make the temporary membership change persist before restoration. A future maintenance artifact must contain exactly one transaction and a fresh reviewed hash, with the replacement body inside it and restoration/assertions before its sole commit. No such executable artifact or automatic migration path was added here.

Rollback before commit is transaction rollback, covering membership and definition together. After a successful commit, reverting the response requires restoring the captured original function definition through the same separately approved bounded maintenance route; no record rollback is needed. Never change the SECURITY DEFINER owner to the broad operator as a shortcut, and never leave temporary INHERIT enabled.

Next prerequisite: explicitly authorize a disposable PostgreSQL 17 non-superuser rehearsal of this candidate, modeling both original grantor rows, success, injected failure/rollback, and exact membership/function/data preservation. Then review the resulting exact single-transaction artifact before separately approving any shared Demo application. This proposal is source/documentation-reviewed, not execution-proven.

## Approved publication scope

The owner approved publishing only the reviewed sign-in UI/tests and focused documentation to the existing PR #588 branch, updating that draft PR, rebuilding the existing Demo Preview and verifying its entry. This scope excludes SQL application, grants/ownership changes, merge, Production, renewal/purge, and larger sandbox/account-copy/promotion work. The maintenance rehearsal/security decision is separate; the UI can ship with the existing honest deadline-unavailable fallback.
