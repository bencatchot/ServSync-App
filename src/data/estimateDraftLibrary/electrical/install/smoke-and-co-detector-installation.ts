import type { EstimateDraftLibraryBundle } from '../../types';

export const smokeAndCoDetectorInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "smoke_and_co_detector_installation",
  "display_name": "Smoke and CO detector installation",
  "aliases": [
    "smoke and co detector installation",
    "Smoke and CO detector installation",
    "Smoke detector replacement",
    "CO detector installation",
    "Hardwired detector",
    "Battery backup detector",
    "Home safety upgrade",
    "Use when the customer requests smoke alarms, carbon monoxide alarms, or combination detectors.",
    "Use when detectors are being added, replaced, or brought up to a safer layout."
  ],
  "scope_summary": "Install or replace smoke and carbon monoxide detectors in approved locations.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install or replace smoke and carbon monoxide detectors in approved locations.",
      "items": [
        {
          "id": "smoke-or-co-detector-installation",
          "title": "Smoke or CO detector installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install smoke, carbon monoxide, or combination detectors in the approved locations.",
          "match_terms": [
            "Smoke or CO detector installation",
            "safety_device",
            "primary",
            "Smoke detector replacement",
            "CO detector installation",
            "Hardwired detector",
            "Battery backup detector",
            "Home safety upgrade"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety",
            "regional"
          ],
          "editor_note": "Confirm detector type, placement, interconnect requirements, power source, battery backup, and local code requirements."
        },
        {
          "id": "detector-removal-and-disposal",
          "title": "Detector removal and disposal",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove existing detectors being replaced.",
          "match_terms": [
            "Detector removal and disposal",
            "labor",
            "standard",
            "Smoke detector replacement",
            "CO detector installation",
            "Hardwired detector",
            "Battery backup detector",
            "Home safety upgrade"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Confirm whether old devices are customer-owned, battery-only, hardwired, or interconnected."
        },
        {
          "id": "detector-testing",
          "title": "Detector testing",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test installed detectors for basic operation.",
          "match_terms": [
            "Detector testing",
            "labor",
            "standard",
            "Smoke detector replacement",
            "CO detector installation",
            "Hardwired detector",
            "Battery backup detector",
            "Home safety upgrade"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Verify test function and interconnect operation where applicable."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Smoke and CO detector installation",
      "text": "Install or replace smoke and carbon monoxide detectors in approved locations.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as fire alarm system, commercial alarm system, monitored alarm panel are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "electrical_scope_terms",
      "text": "Final scope may change if existing wiring, panel, access, code, equipment, or site conditions differ from the listed scope.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_scope_fit",
      "label": "Confirm scope fit",
      "detail": "Use when the customer requests smoke alarms, carbon monoxide alarms, or combination detectors. Use when detectors are being added, replaced, or brought up to a safer layout. Do not use for commercial fire alarm systems or monitored alarm system design. Do not use when a licensed fire alarm contractor is required outside the electrician’s scope.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Fire alarm system",
    "Commercial alarm system",
    "Monitored alarm panel",
    "Low-voltage alarm integration"
  ]
} satisfies EstimateDraftLibraryBundle;
