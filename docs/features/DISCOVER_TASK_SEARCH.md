# Task-based contractor search

Approved November 13, 2026. Branch `codex/discover-task-search` begins at main `111c3097f0d8982518256d99c80da0c052ecc121`, including released PR #594. Source and protected Preview delivery only; no Production merge is part of this increment.

## Behavior

In Discover's existing **Find a contractor** panel, enter **What do you need done?** and press **Suggest service** or Enter. A single suggestion selects the existing Service filter and explains the matched phrase; change the menu to correct it. Multiple service matches present buttons with no automatic service selection. Unknown wording shows an explicit no-match message with manual selection still available. Results are explicitly labeled as all services until a service is chosen.

Examples: **replace a faucet → Plumbing**, **repair a deck → Decks**, **AC not cooling → HVAC**. **a leak** offers Plumbing, Roofing and HVAC; **repair deck and paint it** offers Decks and Painting. The map uses whole words/phrases, supports case/punctuation and A/C, and has no confidence score or paid/remote AI call.

Editing or clearing the task removes stale suggestions and service choices. Location and saved-list scope remain unchanged. A suggestion stays selectable even when no listed contractor has that category, yielding an honest empty result rather than broadening service or area. The existing explicit Browse all action clears all filters. Contractor listing remains alphabetical.

Task text is transient component state, not stored or sent to a provider and not inserted into a request. The directory reuses its existing loaded contractor list and private save controls. Profile links and the released public-project inquiry flow are unchanged. No automatic save, connection, acceptance, submission, permission change or hosted record mutation is added.

## Limits and validation

This is a deliberately small English phrase map, not language understanding, diagnosis or a comprehensive service catalog. Unsupported phrases require manual selection. A matched broad service does not confirm exact-task capability, credentials, availability or geographic coverage beyond the contractor's existing listed city/ZIPs; users must confirm scope and address with the contractor.

Focused domain tests cover phrase matching, ambiguous/multiple services, unsupported/partial words and unchanged exact location/category predicates. Browser regressions cover desktop/mobile edits, repeated searches, correction, ambiguity/no match, no available suppliers, area and saved-list preservation, private saves and existing profile/inquiry paths. Local fixtures do not prove hosted persistence. Final test counts, screenshots, exact-head CI, protected Preview and post-validation tutorial freshness evidence belong in the PR.

No backend/schema changes or rollout migrations are required. Retained Demo showcase `8eca0d41-866d-4448-80cd-ba1c93da5e4d` and all seven pending cleanup records must remain untouched.
