# ServSync FB-040A TUT-005 Source Acceptance — 2026-09-01

## Status

Source preparation in progress; not recorded, approved, or published. TUT-005 **How to connect and request service** is the primary active Launch Roadmap outcome at `homeowner.service`.

## Truthful workflow boundary

- Start with the fictional Demo homeowner and Demo Bay Home, with no Gulf Coast Home Services connection.
- Use the real homeowner connection request UI to choose the exact home, share only the bounded service-relevant details, and submit the original message.
- Use the real contractor acceptance action behind a frozen homeowner frame; do not imply automatic acceptance.
- Return to the homeowner Service Requests workspace, select the same home and connected contractor, and submit useful water-heater work details.
- End with the submitted homeowner Request while separately verifying that the contractor can retrieve the same Request title, work description, and home after acceptance.

This workflow does not claim in-app general messaging, automatic scheduling, online payment collection, notification delivery, provider automation, or any downstream Estimate, Job, Invoice, or Home History action.

## Source and fixture contract

- Recorder scenario: `homeowner-connect-service-request`.
- Initial/final checkpoints: `contractor_discovery_ready` -> `connected_request_ready` -> `request_ready`.
- Durable environment: exact ServSync Demo project `bdytwgejqnlblhrnqxkp` and `https://servsync-demo.vercel.app` only.
- Fixture data: fictional/resettable identities, Demo Bay Home, Gulf Coast Home Services, and the canonical water-heater Request.
- Adoption: exact homeowner/contractor/home match, `homeowner_request` source, active status, one contextual shared-property row, exact permissions, exact original message, one submission event, one acceptance event, and the established exact Request/message adoption.
- Cleanup: registry-owned rows only, dependency ordered; interrupted pending or active connection residue is reconciled without user-, title-, or timestamp-wide deletion.

## Protected completion standard

Any future media candidate must use the shared human-paced 1440×900 recorder profile; pass desktop plus 390×844 contextual placement; contain no visible credential/token, browser error, or `5xx`; preserve exact lineage and zero disposable residue; and be reviewed fully at `1x` with sound on and sound off. The narrated derivative must use OpenAI `gpt-4o-mini-tts` with Cedar, synchronized top-safe captions, a matching durable transcript, exact checksums/provenance, and the disclosure **AI-generated voiceover using OpenAI's Cedar voice.**

## Separate owner gates

This source work does not authorize retrieving or creating an OpenAI credential, recording protected media with credentials requiring fresh authorization, creating or attaching a Production Help request, approving narration/captions, publishing Help, merging the PR, or changing Production data/configuration. Each remains separately gated.

## Tutorial freshness

`UPDATE REQUIRED`. TUT-005 is the named bounded tutorial. It remains incomplete until an approved narrated/captioned revision is published and role-aware `homeowner.service` retrieval, full playback, homeowner-only audience, desktop/mobile context, transcript/disclosure, browser health, and zero external effects are verified.
