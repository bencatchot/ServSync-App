# Fictional Scenario Cards

These cards make the v1 study repeatable. Replace `<SESSION>` with the anonymous session ID. Keep all values non-Production and test-only. If a staged environment requires different exact values, record the variation before the session; do not improvise mid-task.

## Contractor Customer card

| Field | Fictional value |
| --- | --- |
| Customer | Jordan Lee `<SESSION>` |
| Email | `jordan.lee+<SESSION>@example.test` |
| Phone | `555-010-1234` |
| Property label | Jordan Lee Home `<SESSION>` |
| Street | `123 E2E Test Street` |
| City/state/postal | `Example City, AL 00000` |
| Connection expectation | Use the Sandbox fixture's verified contractor-managed/not-connected path. Do not send a real invitation. |

## Contractor service card

Fictional problem: a kitchen faucet drips after being turned off.

| Work | Quantity | Unit price | Customer-facing description |
| --- | ---: | ---: | --- |
| Diagnostic service visit | 1 | $89.00 | Inspect faucet and confirm the source of the drip. |
| Replacement faucet cartridge | 1 | $42.00 | Replace the worn cartridge if inspection confirms it is needed. |
| Repair labor | 1.5 | $95.00 | Complete repair, reassemble, and test operation. |

The prices are fictional usability-test inputs, not market guidance. Before each session, confirm the current Draft/Estimate path accepts the quantities and preserves the expected total. Do not ask a participant to use a line type or tax behavior that preflight did not verify.

## Completion card

> Replaced the worn faucet cartridge, tested hot and cold operation, and checked the fixture for leaks. No leak was observed at completion.

If a checklist/inspection is staged and verified, use only these three simple checks:

- Water supply isolated before repair.
- Faucet operation tested after repair.
- Leak check completed.

Do not require photo upload unless the exact Sandbox session path has passed preflight and exact Storage cleanup is available.

## Offline payment card

Method: check or cash, whichever current preflight confirms in the supported offline recorder.

Amount: the exact remaining balance displayed by the fictional session Invoice.

Reference/note: `TEST <SESSION>` if the current UI supports it.

Never use a card number, bank account, live Stripe path, or real financial information.

## Homeowner issue card

> The kitchen faucet at your fictional home continues to drip after it is turned off. You would like your connected test contractor to inspect and repair it.

Use the same fictional home and workflow scope for request, appointment, Estimate, Job, Invoice, and historical-record checkpoints.

## Appointment card

Before the session, stage two future proposed windows using the current supported appointment response path:

- first option: next business day, 9:00-11:00 AM;
- second option: next business day, 1:00-3:00 PM.

Record the exact staged timestamps in the private fixture ledger. The task asks the participant to review and continue; it does not name Accept or Decline.

## Estimate decision card

The fictional homeowner considers the listed scope and price acceptable and wants the contractor to proceed. The participant should determine the available response without being told which UI control to use.

For a later change-request variation, create a separate, explicitly versioned study condition rather than switching instructions unpredictably between participants.

## Historical-record card

Stage one completed service record and related Invoice through current supported Sandbox workflow. The participant is asked to find:

- the test contractor;
- faucet cartridge repair description;
- completion date;
- Invoice total and paid/balance state.

Do not claim that unrelated outside service, prior guest activity, or every contractor interaction automatically appears in Home History.
