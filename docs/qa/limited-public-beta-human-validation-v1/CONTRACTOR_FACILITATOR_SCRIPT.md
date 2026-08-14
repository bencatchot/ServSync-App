# Contractor Facilitator Script

Use with the [Master Protocol](HUMAN_VALIDATION_MASTER_PROTOCOL.md), [Contractor Task Sheet](CONTRACTOR_TASK_SHEET.md), and [Observation Template](SESSION_OBSERVATION_TEMPLATE.md).

## Before the participant arrives

1. Complete runbook preflight and record the exact target, session ID, baseline, and fixture IDs.
2. Confirm the account is a billing-authorized contractor role and has no Production connection.
3. Prepare the [Fictional Scenario Cards](FICTIONAL_SCENARIO_CARDS.md): Customer, work, completion note, and supported offline payment.
4. Stage lifecycle checkpoints for tasks that cannot be advanced reliably during a timed session. Do not tell the participant the destination names.
5. Enable the large-list task only if the runbook's dedicated Sandbox scale fixture passed preflight.
6. Open at the normal signed-in landing view. Do not open Jobs, Customers, Drafts, or Price Book for the participant.

## Opening

Read the master opening script. Confirm think-aloud expectations and recording consent. Say:

> I will give you real-world goals, but I will not normally tell you where to click. Please say what you are looking for and what you expect to happen.

Do not provide a tour or explain `Draft`, `Jobs`, `Price Book`, `Home History`, or the navigation groups.

## Task 1 - Orientation

Read:

> You run a small service business. Take a look around and tell me where you would go if you needed to manage the work you have going on.

Observe first correct destination, Jobs discoverability, schedule prominence, Customer Work hierarchy, Add-ons distraction, and the participant's interpretation of each area. Do not require mutation.

## Task 2 - Add a Customer

Give the fictional Customer card. Read:

> A new customer called about work at their home. Add them to your system using this information.

Observe terminology, connected/not-connected assumptions, property handling, required versus optional fields, Save discoverability, and the participant's description of what was created.

Checkpoint after completion: record exact new Customer and property IDs in the private session mutation ledger.

## Task 3 - Create an Estimate

Give the service card. Read:

> The customer needs this work performed. Prepare an estimate for them using this information.

Do not mention Price Book. Observe Customer-to-work transition, meaning of Draft, reusable versus manual line discovery, quantities, price clarity, editing, save/send expectations, and cognitive load.

If sending would contact an external recipient, use a fictional non-delivery path approved by the runbook or stop at the durable draft checkpoint. Never send to a real address.

## Task 4 - Find a Customer in a large list

Only run when the tagged large-list Sandbox fixture is verified. Read:

> Create new work for [fixture Customer label].

Observe discovery of search, search terms, similar-name handling, property context, clearing/retrying, and keyboard/mobile behavior. Do not reveal the expected record position or tell the participant to search.

If the fixture is unavailable, mark `NOT STAGED - environment`, not participant failure.

## Task 5 - Accepted Estimate to Job

Move to the prepared accepted-estimate checkpoint and read:

> The customer accepted the estimate. Continue the work from here.

Observe expected next action, continuity, Job creation, schedule interpretation, and retained context. Do not say "Create Job."

## Task 6 - Perform and complete work

Switch to phone size or the participant's phone where feasible. Read:

> You are at the customer's property and have finished the work. Update ServSync appropriately using these completion notes.

Use only a verified current capability: Job status, supported notes, supported checklist/inspection items, or an already staged test-only photo path. Do not improvise unsupported media behavior. Observe thumb reach, status, notes/checklist comprehension, completion, and expected next step.

## Task 7 - Invoice the work

Move to the completed-work checkpoint. Read:

> The work is complete. Bill the customer.

Observe Job-to-Invoice continuity, amount/context preservation, Invoice Draft comprehension, and send/payment expectations. Do not imply online collection.

## Task 8 - Record payment

Give the fictional offline payment card. Read:

> The customer paid this invoice using the method shown. Record that payment.

Observe action discovery, balance and paid-state clarity, payment-history comprehension, and duplicate-action expectations. Production online card/ACH collection is outside this study.

## Task 9 - Historical Customer record

Use the prepared historical state. Read:

> Several months later, the customer calls and asks what work you previously completed and what they paid. Find that information.

Observe search burden, Customer history, Jobs, Estimates, Invoices, paid state, and navigation continuity.

## Task 10 - Mobile-only core task

Choose one task not already completed entirely at phone size: find Customer, open/update Job, review billing, or find history. Read only its real-world goal. Record viewport/device, keyboard obstruction, horizontal overflow, reachability, and recovery behavior.

## After each task

Record outcome and behavior, then ask:

> From 1 to 5, how confident are you that you completed that correctly?

> From 1 to 5, where 1 is very difficult and 5 is very easy, how would you rate that task?

Avoid explaining errors until the task's observation is closed.

## Post-session questions

- What felt most clear?
- What took more effort than you expected?
- What, if anything, felt risky or uncertain?
- What would you expect to happen next after the final task?
- Was anything important missing from this workflow?

For competitor-experienced participants only, after all tasks ask the neutral comparison questions in the recruitment guide. Record the named product and experience level, but do not generalize one person's answer.

Close by thanking the participant, signing out, and immediately following exact cleanup and verification.
