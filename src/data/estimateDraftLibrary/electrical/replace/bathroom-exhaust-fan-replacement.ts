import type { EstimateDraftLibraryBundle } from '../../types';

export const bathroomExhaustFanReplacementBundle = {
  "trade": "electrical",
  "work_category": "replace",
  "job_bundle": "bathroom_exhaust_fan_replacement",
  "display_name": "Bathroom exhaust fan replacement",
  "aliases": [
    "bathroom exhaust fan replacement",
    "Bathroom exhaust fan replacement",
    "Bathroom fan replacement",
    "Noisy bath fan",
    "Fan not working",
    "Fan/light combo",
    "Humidity fan",
    "Use when replacing an existing bathroom exhaust fan.",
    "Use when the electrical contractor is handling the fan wiring and device replacement."
  ],
  "scope_summary": "Replace an existing bathroom exhaust fan with a compatible new unit.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Replace an existing bathroom exhaust fan with a compatible new unit.",
      "items": [
        {
          "id": "bathroom-exhaust-fan-replacement",
          "title": "Bathroom exhaust fan replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove the existing bathroom exhaust fan and install the approved replacement fan.",
          "match_terms": [
            "Bathroom exhaust fan replacement",
            "fixture",
            "primary",
            "Bathroom fan replacement",
            "Noisy bath fan",
            "Fan not working",
            "Fan/light combo",
            "Humidity fan"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm fan size, housing fit, duct connection, switch control, fan/light/heater configuration, and wet-location requirements."
        },
        {
          "id": "fan-wiring-connection",
          "title": "Fan wiring connection",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Connect the replacement fan to the existing approved wiring.",
          "match_terms": [
            "Fan wiring connection",
            "wiring",
            "standard",
            "Bathroom fan replacement",
            "Noisy bath fan",
            "Fan not working",
            "Fan/light combo",
            "Humidity fan"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Confirm circuit capacity and switch leg configuration before installation."
        },
        {
          "id": "fan-operation-test",
          "title": "Fan operation test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the fan after installation for basic operation.",
          "match_terms": [
            "Fan operation test",
            "labor",
            "standard",
            "Bathroom fan replacement",
            "Noisy bath fan",
            "Fan not working",
            "Fan/light combo",
            "Humidity fan"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Confirm fan, light, heater, humidity sensor, or timer functions as applicable."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Bathroom exhaust fan replacement",
      "text": "Replace an existing bathroom exhaust fan with a compatible new unit.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as new duct route, roof vent installation, major drywall repair are included only when listed.",
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
      "detail": "Use when replacing an existing bathroom exhaust fan. Use when the electrical contractor is handling the fan wiring and device replacement. Do not assume ducting, roof work, or drywall repair is included. Do not use when the scope is primarily HVAC ventilation design.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "New duct route",
    "Roof vent installation",
    "Major drywall repair",
    "New bathroom circuit"
  ]
} satisfies EstimateDraftLibraryBundle;
