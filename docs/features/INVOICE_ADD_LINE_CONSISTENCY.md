# Invoice Add Line consistency

Scope: UI-only fix on `codex/invoice-add-line-consistency`, based on current main `defce485e94e8f1489f9d136f7bdcc7a880f8049`. PR595 and PR596 are excluded. No hosted records, schema, credentials, settings or Production changes.

Every editable invoice surface has one `+ Add Line` in normal document flow after its last row. Each activation appends a fresh row and focuses its description input after React commits it. Focus is scoped to the current editor, consumed once and has no delayed timer. There is no save/send call, floating Add Line button or autosave. Price Book bulk-add remains separate.

## Entry-point audit

| Reachable path | Effective editor and preserved boundary |
| --- | --- |
| Financials new invoice, shared composer available | `startDraftFirstInvoiceComposer` / `startCleanDraftFirstInvoiceComposer` enter the shared Draft composer with Invoice intent only when the existing shared/cohort and Invoice-launch gates allow it. |
| Financials new invoice, shared composer unavailable | Existing customer selection and `beginInvoiceDraftForCustomer` lead to the standalone editor. The safe-hold path remains nonauthoring. |
| Saved eligible draft invoice / reopen | `openInvoiceRecord` and list `Edit draft` hydrate `invoiceDraftFromInvoice` and render the standalone editor through `authorizedInvoiceComposerOpen`. They do not switch to the shared composer merely because its flag is enabled. |
| Estimate-derived / schedule-derived invoice | Existing source creation RPCs and `beginInvoiceDraftForCustomer` source mapping are unchanged. A newly created saved invoice is reviewed first; editing an eligible draft uses the same standalone editor. |
| Job-derived / partial invoice | Existing creation/selection RPCs still enforce source and completed-item eligibility. Saved draft editing uses the standalone editor. Existing linked item identities and save restrictions are preserved; Add Line does not alter inherited rows or issue a save. |
| Shared Draft changed to Invoice / resumed shared Draft | `ContractorDraftComposer` uses the same below-row label and invoice-only focus behavior. A previously virtual empty starter row becomes real only on edit or explicit Add Line, so an add visibly appends one row. Estimate, Job and undecided Draft labels/behavior remain unchanged. |
| Sent/paid/void invoice or unauthorized role | Existing editable-status and billing-capability gates remain authoritative; no new editable entry is added. |

`InvoiceLineItems` relocates only the standalone section's add action; the existing structured row renderer and callbacks remain in App. Both editors use `useAddedLineFocus`. Neutral description/quantity/unit labels, existing advanced fields, explicit save/send and Price Book behavior are unchanged.

## Verification and limits

Local browser fixtures mount the real standalone section/structured rows and shared composer under React StrictMode, with external HTTPS blocked. Desktop 1440px and mobile 390px checks cover click/Enter/Space/repeated adds, single-row increments, focus, linked-row preservation, no save callbacks, below-row/static positioning, empty/disabled states, dismissal/reopening, and Estimate → Invoice → Job selection. They do not create or modify a hosted invoice. Route coverage above is a source audit and regression contract, not a claim that every authenticated route was exercised end to end.

Relevant existing regression contracts cover Price Book, financial-role/status guards, shared feature gates and estimate-only duplicate/focus behavior. Stale source markers in the estimate/shared-entry tests were updated to current main names and guards without changing product behavior. Hosted role tests requiring credentials remain unrun.

Repository checks include application and Practice types, lint, App-size ratchet, architecture, backend/runtime parity, role-smoke contracts, recorder contracts, disposable local Practice tests and build. PR/Preview metadata carries exact-head CI evidence. App.tsx shrank by one line and its required ratcheting baseline was lowered accordingly.

Backlog reviewed; no update needed. Master plan and marketing inventory require no update: this restores consistent invoice editing controls without changing workflow authority, feature status, pricing or product promises.

Tutorial freshness must be checked after the finished Preview. Relevant context: `contractor.financials` Invoice creation/editing and `contractor.drafts` Invoice intent. Any inability to access or play matching published guidance must remain an explicit review gap; source completion is not Production availability.
