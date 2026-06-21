# Estimate Draft Library

The Estimate Draft Library is an app-consumable recommendation library for the contractor Build Estimate Draft flow.

## Path Flow

The path is:

```text
trade
-> work category
-> specific job bundle
-> estimate sections
-> recommended items
-> scope wording helpers
-> notes / terms candidates
-> contractor review reminders
```

Example:

```text
hvac
-> replace
-> hvac_system_replacement
```

The first v1 bundle lives at:

```text
src/data/estimateDraftLibrary/hvac/replace/hvac-system-replacement.ts
```

## Work Categories

Approved work categories are:

- `install`
- `repair`
- `replace`
- `inspect`
- `service`

Maintenance belongs under `service`. Diagnostic/service calls belong under `service`. Emergency is not a category; it should be handled as a fee, condition, or review note.

## Guardrails

- The library must not include prices, average prices, rates, or cost ranges.
- Notes and terms are candidates, not final legal terms.
- Contractors must review and edit all generated content before sending.
- Code, permit, safety, licensing, electrical, gas, refrigerant, structural, manufacturer, and regional-sensitive items must be marked for contractor review.
- Contractor review reminders must stay editor-only unless a contractor intentionally converts them into customer-facing wording.
- If no matching bundle exists, the app must fall back to the existing rule-based Build Estimate Draft behavior.

## Data Format

v1 uses TypeScript data files, not JSON imports, because JSON module imports are not enabled in the current TypeScript configuration. The data is still JSON-shaped and validated with TypeScript `satisfies` checks.
