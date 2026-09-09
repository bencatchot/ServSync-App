# Native PDF guidance — review draft

Status: wording grounded in September 9 simulator/emulator evidence; not published. Recording, narrated/captioned media, approval and Production Help publication remain separate protected work. This is guidance for the authorized Demo native prototype, not a public app announcement.

## Proposed guidance

Open an existing saved estimate or invoice and check its title and total. Select **Preview PDF**, then **Open or share PDF**. Your phone shows the system sharing options for that PDF. Available destinations depend on the apps installed on your device.

On the tested iPhone, select **Preview** to read the PDF. Use the return-to-ServSync control to return to the app.

On the tested Android emulator, select **Print** to open the system document preview. You can read the PDF there without choosing a printer or submitting a print job. Use Android **Back** to return to ServSync. Other Android devices may offer different viewing or saving destinations; those paths have not yet been verified.

To leave without sharing, dismiss the system sheet. ServSync keeps the saved estimate or invoice unchanged. You can select **Open or share PDF** again to retry, or **Close** to leave the PDF dialog. Android Back also dismisses the idle PDF dialog. Closing the dialog removes the temporary PDF file created by ServSync; this does not delete the saved estimate or invoice.

The cancellation notice can also appear when a destination is unavailable or PDF preparation fails. It is not confirmation that a recipient received the document. No external delivery, save-to-device completion, printer submission or payment was tested in this acceptance pass.

## Evidence and recording boundaries

- Existing fictional records: `AUDIT 2026-09-07 — estimate save and reload` and `AUDIT 2026-09-07 — invoice draft check`, both Draft and $250. Invoice paid $0 / balance $250.
- iPhone Apple Preview and Android system Print preview rendered the one-page documents with correct title, customer, line items and totals. Both platforms returned to ServSync, retried the sheet, canceled, and dismissed the dialog. Cached PDF counts returned to zero after dialog dismissal.
- Android retry reused one temporary file path. Adapter regressions cover duplicate-click prevention, active-dialog protection, failure recovery, cleanup and focus restoration. These tests supplement device evidence.
- Record iPhone and Android separately; label Print preview accurately. Do not imply a universal Android viewer or claim that an external save/delivery was verified.
- Use existing approved Demo identities and records. Do not create or send business records or select a recipient solely for a recording.
- Physical camera, touch/accessibility acceptance and VoiceOver/TalkBack are separate checks. Screenshots do not establish screen-reader usability.
- Follow the existing narrated/captioned/transcript publication standard. This document does not authorize provider generation, Production recording requests, media upload or publication.

TUT-002's required replacement remains separate: correct the service-request-to-estimate instructions and produce its narrated/captioned replacement under the existing brief. This draft does not satisfy that tutorial freshness gate.
