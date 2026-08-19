# ServSync Core Lifecycle Primary Action Acceptance

Date: 2026-08-19  
Scope: FB-039C contractor-facing lifecycle hierarchy  
Baseline: `253c4624e2099502c40a8d31e66375d6ea06ea8a`

## Frozen action matrix

| Lifecycle state | Dominant next step | Secondary actions retained | Role boundary |
| --- | --- | --- | --- |
| New Request | Review the request and reply | Create Estimate, service visit, and Home Map remain subordinate where authorized | Owner/Admin/Office may reply; Field Technician receives Start/Continue service visit; Viewer receives read-only Review Request |
| Draft Estimate | Send the Estimate | Edit, PDF, template, and authorized Invoice handoff remain subordinate | Owner/Admin/Office retain current Estimate authority; a local-customer draft uses Finish/Edit rather than a disabled connected-homeowner send action; Field Technician/Viewer remain read-only |
| Sent Estimate | Wait for the homeowner response | PDF and other read actions remain available | No contractor mutation is invented while a response is pending |
| Accepted Estimate | Create Job, or View Job when already linked | Authorized Invoice actions remain subordinate and continue to Financials | Existing Job capability decides availability; Viewer has no dead-end Job action |
| Unscheduled Job | Start Work | Delete and completion remain subordinate and lifecycle-gated | Field Technician retains operational authority; Viewer receives read-only View Job |
| Active Job | Continue Work | Completion remains available after entering the Job | Existing Job-operation capability and status rules remain authoritative |
| Completed Job | Create Invoice, review completed priced items, or open the linked Invoice | Report/PDF and operational review remain available | Billing-authorized roles continue into Financials; Field Technician/Viewer receive read-only completed-work review |
| Open Invoice | Record Payment | PDF, void, and other authorized actions remain subordinate | Owner/Admin/Office retain billing authority; Field Technician/Viewer receive read-only Invoice review |

## Compatibility boundaries

- Work remains the canonical owner for Requests, Estimates, Jobs, and reports.
- Financials remains the canonical owner for Invoice Drafts, Invoices, and payments.
- Existing Request -> Estimate -> Job -> Invoice lineage and contextual handoffs are unchanged.
- Existing server-resolved role and lifecycle capabilities remain authoritative.
- Connected and local-customer delivery paths remain distinct; the UI no longer presents a disabled connected-homeowner send action as the primary step for local records.
- Homeowner navigation and behavior are unchanged.
- No SQL, schema, RLS, RPC, auth, permission, provider, environment, or Production-data change is part of FB-039C.

## Validation record

Automated validation on the isolated branch includes the lifecycle policy matrix, Work/Financials and role-visibility regressions, Invoice payment desktop/mobile presentation, TypeScript, Production build, lint warning budget, App-size and architecture guardrails, backend parity, and diff hygiene.

Exact-head authenticated Preview acceptance must cover Owner, Admin, Office, Field Technician, and Viewer at desktop and `390x844`, with resettable Demo lifecycle checkpoints for Request, Estimate, and Job states plus a controlled open-Invoice fixture. The merge gate remains open until that evidence is recorded.
