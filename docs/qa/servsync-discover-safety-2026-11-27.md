# Discover safety: app review candidate

The browser preview uses fictional roles and posts only. It does not have a live database. Application code integration and a disposable local PostgreSQL validation are separate checks. This branch does not deploy or apply the SQL.

- **Homeowner:** report a specific Discover post with a reason and receive a reference. Reporting never blocks or removes it by itself. Blocking a contractor hides their Discover activity and stops new connection and service requests; previously authorized records remain readable.
- **Contractor:** submit text and up to six private photos for human review. Pending and rejected posts do not appear in the public feed, saved lists, linked profile evidence or Requests. Approved text can appear publicly; the candidate requires an authorized signed-in session to see photos.
- **Moderator:** the existing platform-admin role receives a private Discover safety queue. Check text and every submitted image before approval; a missing image disables approval. A reason is required for each decision. Removing a reported post requires its own explicit confirmation. Audit and moderation evidence stay restricted.

## Validation and release gates

- Browser checks use the exact UI with intercepted responses. The local-only test permits no external network. The SQL fixture creates synthetic roles, schema and objects in a new Unix-socket-only PostgreSQL 16 cluster; do not point it at any existing database. Run from the repo root using the isolated socket: `psql -X -h "$LOCAL_SOCKET" -d postgres -f tests/sql/discover-safety-local.sql`.
- Adopt an explicit legacy rollout before enabling this candidate. Existing post records are preserved but held for review. Old images stored as public URLs are not re-signed and require a private resubmission. Changing bucket privacy does not recall cached or downloaded copies. Confirm both web and iOS clients switch together and test actual short-lived Storage signing with synthetic data in an approved isolated environment before any customer rollout.
- Review handling of existing service-thread messages separately; the new-contact block deliberately preserves established workflows and is not a promise to stop all communication in an active job. Reconcile Discover media, reporter de-linking, private moderation evidence and retention with the existing account-deletion process before enablement. Assign the staffed queue and escalation expectations before review.
- Do not apply to hosted environments, merge into main, deploy production, or submit any Apple build without separate approval.
