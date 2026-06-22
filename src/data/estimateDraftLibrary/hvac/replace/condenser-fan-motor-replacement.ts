import type { EstimateDraftLibraryBundle } from '../../types';

export const condenserFanMotorReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "condenser_fan_motor_replacement",
  "display_name": "Condenser Fan Motor Replacement",
  "aliases": [
    "condenser fan motor",
    "outdoor fan not spinning",
    "AC fan motor replacement",
    "outdoor unit fan failed",
    "replace condenser motor"
  ],
  "scope_summary": "Replacement of a failed outdoor condenser fan motor in approved HVAC equipment.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard condenser fan motor replacement items.",
      "items": [
        {
          "id": "confirm_motor_failure",
          "title": "Confirm condenser fan motor failure",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Confirm the affected condenser fan motor and approved repair scope.",
          "match_terms": [
            "outdoor fan not spinning",
            "condenser fan motor",
            "fan motor failed"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm failure before replacing."
        },
        {
          "id": "replace_condenser_fan_motor",
          "title": "Replace condenser fan motor",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the failed condenser fan motor with a compatible replacement part.",
          "match_terms": [
            "replace fan motor",
            "outdoor fan motor",
            "condenser motor"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm motor specifications and wiring."
        },
        {
          "id": "fan_blade_or_capacitor_review",
          "title": "Fan blade or capacitor review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Fan blade, capacitor, or wiring conditions may affect final repair scope.",
          "match_terms": [
            "fan blade damaged",
            "capacitor failed",
            "motor wiring"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Review-only unless specific items are added."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_condenser_motor_replacement",
      "label": "Standard condenser fan motor replacement",
      "text": "Replace the failed condenser fan motor and test basic equipment operation.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "related_repairs_note",
      "text": "Additional capacitor, fan blade, wiring, or system repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "motor_terms",
      "text": "Final repair scope may change if fan blade, capacitor, wiring, or equipment damage is found.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_motor_specs",
      "label": "Confirm motor specifications",
      "detail": "Confirm motor type, rotation, horsepower, voltage, capacitor needs, fan blade condition, and wiring.",
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Capacitor replacement unless listed",
    "Fan blade replacement unless listed",
    "Compressor repair unless listed",
    "Full system replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
