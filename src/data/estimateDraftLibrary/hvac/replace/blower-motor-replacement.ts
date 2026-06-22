import type { EstimateDraftLibraryBundle } from '../../types';

export const blowerMotorReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "blower_motor_replacement",
  "display_name": "Blower Motor Replacement",
  "aliases": [
    "blower motor replacement",
    "air handler fan not running",
    "furnace blower failed",
    "weak airflow",
    "blower not working"
  ],
  "scope_summary": "Replacement of a failed blower motor in approved furnace or air handler equipment.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard blower motor replacement items.",
      "items": [
        {
          "id": "confirm_blower_motor_failure",
          "title": "Confirm blower motor failure",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Confirm the affected blower motor and approved repair scope.",
          "match_terms": [
            "blower not working",
            "air handler fan not running",
            "furnace blower failed"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm diagnosis before replacement."
        },
        {
          "id": "replace_blower_motor",
          "title": "Replace blower motor",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the failed blower motor with a compatible replacement part.",
          "match_terms": [
            "blower motor",
            "air handler motor",
            "ECM motor"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm motor type and controls."
        },
        {
          "id": "blower_wheel_review",
          "title": "Blower wheel review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Blower wheel, cabinet, wiring, or control conditions may affect final repair scope.",
          "match_terms": [
            "blower wheel",
            "dirty blower",
            "airflow issue"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Add cleaning or related repair only if included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_blower_motor_replacement",
      "label": "Standard blower motor replacement",
      "text": "Replace the failed blower motor and test basic system operation.",
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
      "text": "Additional blower wheel, control board, wiring, capacitor, or airflow repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "blower_terms",
      "text": "Final repair scope may change if related wiring, controls, blower wheel, airflow, or cabinet issues are found.",
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
      "id": "confirm_motor_type",
      "label": "Confirm motor type",
      "detail": "Confirm PSC, ECM, module, capacitor, rotation, horsepower, voltage, speed taps, and control compatibility.",
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Control board replacement unless listed",
    "Blower wheel cleaning unless listed",
    "Duct repair unless listed",
    "Full system replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
