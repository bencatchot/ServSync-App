# Price Book Saved Charges Consolidation v1

## Canonical boundary

Price Book is ServSync's only contractor-facing reusable individual line-item library. Estimate Templates remain reusable multi-line structures. Service Plans and Inspection Checklists remain separate domain concepts.

Historical Draft, Estimate, Job, and Invoice lines are independent snapshots and are not rewritten by this consolidation.

## Migration mapping

| Saved Charge | Price Book |
| --- | --- |
| `contractor_id` | `contractor_id` |
| `name` | `title` |
| private `description` | private `internal_notes` |
| customer-facing description | empty |
| `line_type` | same canonical type; internal `other` is presented as Service |
| `amount_cents` | `default_unit_price_cents` |
| hourly null unit | `hour` |
| flat null unit | `each` |
| explicit unit | same unit |
| `active` | same active state |
| inactive row | archived with `archived_at = updated_at` |
| `created_at`, `updated_at` | preserved exactly |
| quantity | migration requires exactly `1`; Price Book gains no default quantity |

Hourly Saved Charges must be Labor with an hour-compatible unit. Equipment, unsupported quantity, duplicate legacy identity, and same-contractor title/type conflicts fail the transaction before insertion.

## Lineage and transition

Each migrated item receives a deterministic internal UUID derived from the legacy UUID and one immutable row in `contractor_saved_charge_price_book_lineage`. The lineage stores stable legacy and migrated-item fingerprints. It is postgres-owned by deployment, forced-RLS, policy-free, and unavailable to browser roles.

The migration locks both source and target tables, copies and verifies all rows atomically, then removes every browser policy and grant from the legacy table. A write-rejection trigger also blocks stale clients. Legacy rows remain unchanged as private evidence. Old clients therefore cannot display or write the retired records while canonical Price Book rows are available immediately.

## Rollback boundary

The guarded rollback is intended only with a compatible pre-consolidation client. It refuses if a retained legacy row is missing or changed, a migrated item is missing, or any migrated Price Book field differs from its migration fingerprint. A refused rollback leaves all data unchanged. An eligible rollback deletes only the exact unchanged migrated items, preserves every pre-existing Price Book item, drops private lineage, and restores the former Saved Charge policies and grants.

Once a contractor edits a migrated Price Book item, rollback requires a new reviewed reconciliation plan; it must never discard that edit automatically.

## Deferred work

This consolidation does not add Invoice selection, starter catalogs, assemblies, inventory, provider synchronization, AI catalog creation, cost migration, job costing, or historical document rewriting.
