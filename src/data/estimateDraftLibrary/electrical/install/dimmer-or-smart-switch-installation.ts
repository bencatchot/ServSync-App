import type { EstimateDraftLibraryBundle } from '../../types';

export const dimmerOrSmartSwitchInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "dimmer_or_smart_switch_installation",
  "display_name": "Dimmer or smart switch installation",
  "aliases": [
    "dimmer or smart switch installation",
    "Dimmer or smart switch installation",
    "Dimmer switch",
    "Smart switch",
    "Lighting control upgrade",
    "Timer switch",
    "Motion switch",
    "Use when the customer wants a lighting control upgrade rather than a basic switch replacement.",
    "Use when compatibility needs to be checked before installing a smart or dimmer control."
  ],
  "scope_summary": "Install a dimmer switch or smart switch where the existing wiring and fixture are compatible.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install a dimmer switch or smart switch where the existing wiring and fixture are compatible.",
      "items": [
        {
          "id": "dimmer-or-smart-switch-installation",
          "title": "Dimmer or smart switch installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the approved dimmer, smart switch, timer, or motion control.",
          "match_terms": [
            "Dimmer or smart switch installation",
            "device",
            "primary",
            "Dimmer switch",
            "Smart switch",
            "Lighting control upgrade",
            "Timer switch",
            "Motion switch"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Verify neutral availability, box fill, load type, wattage rating, fixture compatibility, and customer-provided device requirements."
        },
        {
          "id": "switch-setup-and-basic-function-test",
          "title": "Switch setup and basic function test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the switch for basic operation after installation.",
          "match_terms": [
            "Switch setup and basic function test",
            "labor",
            "standard",
            "Dimmer switch",
            "Smart switch",
            "Lighting control upgrade",
            "Timer switch",
            "Motion switch"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Smart app setup may require customer account access and should be scoped clearly."
        },
        {
          "id": "matching-wall-plate",
          "title": "Matching wall plate",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a matching wall plate at the completed switch location.",
          "match_terms": [
            "Matching wall plate",
            "finish_material",
            "standard",
            "Dimmer switch",
            "Smart switch",
            "Lighting control upgrade",
            "Timer switch",
            "Motion switch"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Confirm color and gang configuration."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Dimmer or smart switch installation",
      "text": "Install a dimmer switch or smart switch where the existing wiring and fixture are compatible.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as no neutral available, fixture incompatibility, low-voltage automation system are included only when listed.",
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
      "detail": "Use when the customer wants a lighting control upgrade rather than a basic switch replacement. Use when compatibility needs to be checked before installing a smart or dimmer control. Do not assume smart switch compatibility without verifying neutral, load type, and device requirements. Do not use for full smart-home design or low-voltage automation work.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "No neutral available",
    "Fixture incompatibility",
    "Low-voltage automation system",
    "Whole-home smart system"
  ]
} satisfies EstimateDraftLibraryBundle;
