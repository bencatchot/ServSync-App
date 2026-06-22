import type { EstimateDraftLibraryBundle } from '../../types';

export const doorbellOrVideoDoorbellInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "doorbell_or_video_doorbell_installation",
  "display_name": "Doorbell or video doorbell installation",
  "aliases": [
    "doorbell or video doorbell installation",
    "Doorbell or video doorbell installation",
    "Doorbell not working",
    "Video doorbell",
    "Doorbell transformer",
    "Chime replacement",
    "Ring-style doorbell",
    "Use when the customer wants a wired doorbell or video doorbell installed or repaired.",
    "Use when the scope includes transformer replacement or chime compatibility."
  ],
  "scope_summary": "Install or replace a doorbell, video doorbell, chime, or compatible transformer.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install or replace a doorbell, video doorbell, chime, or compatible transformer.",
      "items": [
        {
          "id": "doorbell-or-video-doorbell-installation",
          "title": "Doorbell or video doorbell installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the approved doorbell or video doorbell device.",
          "match_terms": [
            "Doorbell or video doorbell installation",
            "device",
            "primary",
            "Doorbell not working",
            "Video doorbell",
            "Doorbell transformer",
            "Chime replacement",
            "Ring-style doorbell"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Confirm voltage requirements, mounting surface, existing wiring condition, chime compatibility, and manufacturer instructions."
        },
        {
          "id": "doorbell-transformer-replacement",
          "title": "Doorbell transformer replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the doorbell transformer if needed for compatibility.",
          "match_terms": [
            "Doorbell transformer replacement",
            "low_voltage_component",
            "conditional",
            "Doorbell not working",
            "Video doorbell",
            "Doorbell transformer",
            "Chime replacement",
            "Ring-style doorbell"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm transformer location, voltage/VA rating, access, and device requirements."
        },
        {
          "id": "doorbell-chime-test",
          "title": "Doorbell chime test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the doorbell and chime for basic operation.",
          "match_terms": [
            "Doorbell chime test",
            "labor",
            "standard",
            "Doorbell not working",
            "Video doorbell",
            "Doorbell transformer",
            "Chime replacement",
            "Ring-style doorbell"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Smart device app setup may require customer phone, account, and Wi-Fi access."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Doorbell or video doorbell installation",
      "text": "Install or replace a doorbell, video doorbell, chime, or compatible transformer.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as security camera system, network wiring, low-voltage whole-home system are included only when listed.",
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
      "detail": "Use when the customer wants a wired doorbell or video doorbell installed or repaired. Use when the scope includes transformer replacement or chime compatibility. Do not use for full security camera systems. Do not assume Wi-Fi setup or customer account configuration is included unless stated.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Security camera system",
    "Network wiring",
    "Low-voltage whole-home system",
    "Battery-only doorbell"
  ]
} satisfies EstimateDraftLibraryBundle;
