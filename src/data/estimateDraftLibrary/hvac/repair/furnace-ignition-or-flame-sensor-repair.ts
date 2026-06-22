import type { EstimateDraftLibraryBundle } from '../../types';

export const furnaceIgnitionOrFlameSensorRepairBundle = {
  "trade": "hvac",
  "work_category": "repair",
  "job_bundle": "furnace_ignition_or_flame_sensor_repair",
  "display_name": "Furnace Ignition or Flame Sensor Repair",
  "aliases": [
    "furnace will not ignite",
    "flame sensor",
    "igniter replacement",
    "furnace starts then shuts off",
    "no heat ignition issue",
    "pilot or ignition issue"
  ],
  "scope_summary": "Repair of approved furnace ignition or flame-sensing components after diagnosis.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Common ignition and flame sensor repair items.",
      "items": [
        {
          "id": "confirm_ignition_issue",
          "title": "Confirm ignition or flame-sensing issue",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Confirm the affected ignition or flame-sensing component included in the approved scope.",
          "match_terms": [
            "flame sensor",
            "igniter",
            "furnace will not ignite"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "safety"
          ],
          "editor_note": "Diagnosis required."
        },
        {
          "id": "clean_or_replace_flame_sensor",
          "title": "Clean or replace flame sensor",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Clean or replace the flame sensor where included in the approved repair scope.",
          "match_terms": [
            "clean flame sensor",
            "replace flame sensor"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "safety",
            "manufacturer"
          ],
          "editor_note": "Choose clean or replace based on contractor scope."
        },
        {
          "id": "replace_furnace_igniter",
          "title": "Replace furnace igniter",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the furnace igniter where included in the approved scope.",
          "match_terms": [
            "replace igniter",
            "hot surface igniter",
            "ignition repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Compatibility matters."
        },
        {
          "id": "burner_or_combustion_review",
          "title": "Burner or combustion review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Burner, combustion, venting, or gas conditions may require additional approved service or repair.",
          "match_terms": [
            "burner issue",
            "combustion",
            "gas pressure",
            "flame rollout"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "code",
            "safety"
          ],
          "editor_note": "Review-only."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_ignition_repair",
      "label": "Standard ignition repair",
      "text": "Repair the listed furnace ignition or flame-sensing component and test basic heating operation.",
      "contractor_review_required": true,
      "review_flags": [
        "gas",
        "electrical",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "furnace_repair_note",
      "text": "Gas valve, venting, burner, control board, or wiring repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "gas",
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "ignition_terms",
      "text": "Final scope may change if burner, gas, venting, wiring, or control conditions are not suitable for limited repair.",
      "contractor_review_required": true,
      "review_flags": [
        "gas",
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_component",
      "label": "Confirm failed component",
      "detail": "Confirm whether the issue is flame sensor, igniter, gas valve, pressure switch, control board, venting, or another furnace condition.",
      "review_flags": [
        "gas",
        "electrical",
        "safety",
        "manufacturer"
      ]
    }
  ],
  "excluded_items": [
    "Gas valve replacement unless listed",
    "Control board replacement unless listed",
    "Venting repair unless listed",
    "Burner repair unless listed",
    "Full furnace replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
