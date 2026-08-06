# Demo Production Schema Parity Validation

Date: 2026-08-06

Demo target: `bdytwgejqnlblhrnqxkp`

Read-only Production authority: `uqgtheclhxqlnjpfmheq`

Source baseline: `528b5c4e0fa549aaf74047c974fa2ab7aabc47bc`

## Outcome

Demo contains every Production-owned relation, column, constraint, index, trigger, policy, function, type, extension, and default ACL with the same definition. Demo's only catalog additions are its three private scenario registry tables, six trusted scenario operator functions, and their supporting metadata. Project Collaboration is absent in both environments.

Demo Presentation remains enabled. Durable Draft backend support is installed, but its server rollout mode remains disabled and its three UI gates remain false/absent. Request-free invoice-delivery database support is installed but remains operationally fail-closed without separately authorized Demo server credentials and Firewall configuration. No Vercel variable, feature flag, entitlement, email/payment safeguard, Production state, or Sandbox state changed.

## Applied Migration Ledger

The following exact repository files were applied in order. Every successful row committed independently after its prerequisite and preservation checks passed.

| Group | Migration | SHA-256 |
| --- | --- | --- |
| A | `servsync-external-review-links.sql` | `2ebc2f3be107e8185276e391e47268f6fa7d446b08f098f2f254fc36bbdcdc0c` |
| A | `servsync-estimate-invoice-home-id.sql` | `fd694b3abbe1984f55b690c4dd35662198dbf8f80754fc1ff3329ba3bffef663` |
| A | `servsync-estimate-labor-model-conversion-rpcs.sql` | `c88e976cebd0919b3ea54b62345bec93a878c1e56d56d84616d1c7cb7c75376c` |
| A | `servsync-invoice-notifications.sql` | `0c5dd8a2c518c3c5080e3c393e41df61e97cf2af020079fd1ce456e5d6b0fe31` |
| A | `servsync-invoice-home-history.sql` | `1e5fd09bb6fe5485a82f9ae4cc033f08b14f1587cd0059a33b294a2a833f61ee` |
| A | `servsync-partial-invoicing-data-foundation.sql` | `287909033039973c8076528ccaa3531da2b26d5427ff14ad6a6a9a50a2a80a81` |
| A | `servsync-partial-invoicing-estimate-work-items.sql` | `36845fc62121497012cfd024332918fb94e446470f0f085d25ee66e87dafa479` |
| A | `servsync-partial-invoicing-simple-work-items.sql` | `ed3ec986d8f2d00461c2724c884dba880a9546301625520d47cfdf5b3d9decbb` |
| A | `servsync-partial-invoicing-manual-work-items.sql` | `dcf51411f16967208249b9c298139d437eab53a44298d96af9c1328eff444202` |
| A | `servsync-whole-job-invoice-work-item-guard.sql` | `4e71bcb246b6513dbcda441220003c26b395fac90fccaeb6c04b33a8e72140ea` |
| A | `servsync-fb020-billing-permission-helper.sql` | `1d68a91a21fcf7360f92354299625003dfc14978b8867285d7e6d37ea71af8f0` |
| A | `servsync-fb020-immutable-invoice-rls.sql` | `0f2661d9c302063971fbcdfa0aa1e22fe27d631cea67729f8d33bef5a6399c41` |
| A | `servsync-fb020-rpc-grant-hardening.sql` | `75f72ca2f8288c6053b2b61692857574fe505676b73e1314b10aefbeaaf0b3ab` |
| A | `servsync-fb021-scheduling-foundation.sql` | `c4a631b36fb5f18b49caa5fd89a9401211b2e1175e9c79f6e3ed7f8705fbc82d` |
| A | `servsync-fb021-reschedule-cancel-activity-events.sql` | `53469be9ecb9176aa54b947cc6a851941add0a65254e47a72e14b97aaf6f0b7c` |
| A | `servsync-shared-home-shell.sql` | `67d67780a0d2d5762fab7bfbe4bb1035754293f9cdf7c34204ccacdb4968e720` |
| A | `servsync-home-access-invite-delivery-foundation.sql` | `765173ef67fafaf552a15e38cd1ae679beb7361905134be01f61fdf4d0bb9c6b` |
| A | `servsync-home-access-invite-delivery-enable-contract.sql` | `bae46e450a5b7a5f277eafc379117a4542b16b99ac40e083e26a0133366931b5` |
| A | `servsync-contractor-billing-admin-visibility.sql` | `7bac8fc8b96cb1a6f869790d0a12191cc000098e899ec391ffc711e55a5894a3` |
| A | `servsync-review-eligibility.sql` | `6fe30c9570992432a9b66d7bd0b55fb255c9d29b6465f67427b43955b5d432f9` |
| A | `servsync-review-public-display-pause.sql` | `85253a0f36ae12f19818e56524042dacc6df5dbf859c89fdcad42bcbc67d8f16` |
| A | `servsync-review-grant-hardening.sql` | `baea493c7981d5e5582d19455b76b6369ebbbeb9debd322532cfe1d0ac32c914` |
| A | `servsync-review-moderation-foundation.sql` | `ee5dbb4c56f83f87a5f108d245eb4a9e9175bced3aec88b75da7c8835679f765` |
| A | `servsync-contractor-referral-foundation.sql` | `a1b4fef2d0cf460fd93c848ca2d56d09fa980a3e7962ce46229365c8a3f21c8e` |
| A | `servsync-home-document-beta-upload-limits.sql` | `dee9f6d2263e330f8d897535d9f4565b0c41a085da33d6eb146963a6b530f79b` |
| A | `servsync-home-document-room-foundation.sql` | `dfa65b7eec49636ff67881ba3735436f2d79703223494688bb59c5af21d554e6` |
| A | `servsync-home-document-upload-room-registration.sql` | `6dd593422d01ceb0c57387c6c79ef0d6b9c1cd9854ab93cbc6721cc4911291b0` |
| A | `servsync-integration-foundation.sql` | `6ac9da30e09a77dd58c73bc3ef08d04987624770521fa07534ddc1cac96096eb` |
| A | `servsync-estimate-schedule-invoice-generation.sql` | `8535e824b750ab56e80fd9efaf79a935a9fe19cf9178af8b63869b1fa5c6196a` |
| A | `servsync-price-book-organization-foundation.sql` | `7516de4e1dbb8ab03080cb150246314e8d33a1ee55018386023d26ffc4f51875` |
| A | `servsync-price-book-repeat-import-reconciliation.sql` | `7dac1b3c7fd62240d9d05e498a3db0af39fe93549c375ca8262f941cbb6d14a3` |
| B | `servsync-draft-job-scope-backend-foundation.sql` | `190143155bf5fbb00fa32d13ad6db1fd413ff88ec0b072d5d8b7809644b8c1c4` |
| B | `servsync-durable-draft-launch-foundation.sql` | `ac9e600ece3075e2d171da5571aab2b26e7a1f6f234239b02194fa7be3d2354f` |
| B | `servsync-durable-draft-cohort-entitlement.sql` | `51d1921d1d19cb79a95c4c81976b78a09d00968d7020140598362e8b72cf453b` |
| B | `servsync-durable-draft-inspection-checklist-path.sql` | `42737587a9fdeb248a30dc0bb95b4fe1cb02a0140d583b19d8161d41e9c6e93e` |
| B | `servsync-durable-draft-invoice-launch-foundation.sql` | `41045a4f125e791963318430946c36ddd8cf3181d8c112133081d3cc6996fdbe` |
| B | `servsync-durable-draft-preview-rollout-mode.sql` | `b44478ff049e25bf1ebbc4e3f0ec53c5b79d0b62cce9b079ce73da2442738228` |
| B | `servsync-draft-first-inspection-path-completion.sql` | `f4ab79b68ebe56edd36f6c545fac08584558f6da520672e2bee74b3508f93473` |
| C | `servsync-request-free-local-invoice-delivery.sql` | `244b3a9275862f6c855a360970d74b4b42b581aca36f26c7fb7adf82001fe8b4` |
| C | `servsync-request-free-local-invoice-delivery-gateway-hardening.sql` | `a9822d63302812f08c9e968555bee39188994fef3b8ec40c2b9a7c2ab2d76bd1` |
| C | `servsync-request-free-local-invoice-delivery-session.sql` | `33356ec93eaf4c8b415fa44008a49cf378de02356da3c109b6a529e67341901d` |
| D | `servsync-contractor-local-customer-read-list-parity.sql` | `0b90e4548ceec24e7bdd96a12ad9951f74b7ffc064f222a2f41b0e2ce109f41f` |
| D | `servsync-contractor-local-customer-property-archive-restore.sql` | `762c6fdd8b1dacabb70730c7257691f959ebfd07cf67d2688b97756015a46c17` |
| E | `servsync-appointment-proposal-lifecycle.sql` | `d4a9620ee640a50e92106592b14f2927507c308432681b9fbaf3b17facb8be7c` |
| E | `servsync-service-request-home-id.sql` | `7eea4820ae6ae40e32dfee9db2b0e084031ff32a45c469b6fa00715c9817ea26` |
| E | `servsync-connection-shared-properties.sql` | `c0155bcd8be9e984533d03bb62ae0a08b5f1ba103990592ffae450f60c7f88b1` |
| E | `servsync-multiple-invoices-foundation.sql` | `a332e1a81967e2cbc14f7c9f114c4cdd3a3b1917a5663638559b323cb8622bb6` |
| E | `servsync-fb025-workflow-activity-event-writers.sql` | `ca6458fae594ec0949d6f7597666c3a3a47c4a58194ea3324b3889dfdeba902b` |
| F | `servsync-connection-shared-properties-rls-fix.sql` | `61fe1fc1611f36507102c191c10e2d9fdc3424986325bcd3ffc1bfaa64cb65eb` |
| G | `servsync-demo-production-schema-parity-reconciliation.sql` | `6e2641f94c96075b20b3a27ff483c84541a06c83c3ddd4edb805c8675d9d701f` |

The current customer-management subset had already installed local-property edit, management-boundary, Draft-optional read/list, Admin/Office creation, direct-table cleanup, and Draft-optional archive migrations during PR #384 validation. Group D replaced the two Draft-optional customer functions with the canonical Draft-aware Production versions after the complete Durable Draft foundation was present.

Two obsolete/non-idempotent follow-ups were attempted only inside transactions and rolled back completely: the separate Durable Draft permission-parity correction rejected the already-correct canonical foundation fingerprint, and the legacy appointment counter-proposal migration encountered an existing current function. Neither left catalog or data residue; reconciliation used the four read-only-extracted Production appointment definitions instead.

## Final Catalog Comparison

| Category | Production | Demo | Missing | Different | Intentional Demo additions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Relations | 90 | 93 | 0 | 0 | 3 |
| Columns | 1,264 | 1,296 | 0 | 0 | 32 |
| Constraints | 724 | 741 | 0 | 0 | 17 |
| Indexes | 403 | 412 | 0 | 0 | 9 |
| Triggers | 100 | 102 | 0 | 0 | 2 |
| Policies | 218 | 218 | 0 | 0 | 0 |
| Functions | 287 | 293 | 0 | 0 | 6 |
| Types | 0 | 0 | 0 | 0 | 0 |
| Default ACLs | 6 | 6 | 0 | 0 | 0 |
| Extensions | 5 | 5 | 0 | 0 | 0 |

The intentional additions all belong to `demo_scenarios`, `demo_scenario_runs`, `demo_scenario_records`, or the six `servsync_demo_*` operator functions. No project relation, function, or trigger exists.

## Authenticated Validation

| Area | Result |
| --- | ---: |
| Role helper matrix | 9 passed |
| Manager creation | 3 passed |
| Creation denial | 6 passed |
| Manager profile/property updates | 6 passed |
| Management denial | 12 passed |
| Manager archive/restore | 12 passed |
| Archive denial | 12 passed |
| Direct browser ACL denial | 20 passed |
| Role-shaped directory | 5 passed |
| Invitation revocation/non-revival | 2 passed |
| Durable Draft backend/disabled rollout | 2 passed |

Owner, Admin, and Office received the intended customer management authority. Field Technician received redacted operational context without management authority. Viewer remained work-linked only. Inactive, removed, homeowner, anonymous, unauthenticated, and cross-tenant callers failed closed. Temporary fixtures and memberships were removed.

## Preservation And Browser Results

Existing counts and identifier digests matched the pre-migration baseline after cleanup: 15 local contacts, 21 local homes, 8 claim invitations, 12 invitation-home mappings, 2 homeowner connections, 8 auth users, 6 storage buckets, 0 storage objects, 1 Demo scenario, 71 scenario runs, and 3 scenario records. No temporary user, membership, customer, property, invitation, archive event, credential file, or browser artifact remained.

Current-main Demo browser checks passed contractor Customers at `1440x900` and `390x844` and homeowner Properties at `1440x900`. Horizontal overflow, console errors, and server failures were all zero. No screenshot, trace, video, token, cookie, private record, or recipient URL was retained.
