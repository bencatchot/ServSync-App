import type { EstimateDraftLibraryBundle } from '../../types';

export const furnaceGasValveOrControlBoardRepairBundle = {
  "trade": "hvac",
  "work_category": "repair",
  "job_bundle": "furnace_gas_valve_or_control_board_repair",
  "display_name": "Furnace Gas Valve or Control Board Repair",
  "aliases": [
    "gas valve replacement",
    "furnace control board",
    "furnace board replacement",
    "no heat control board",
    "gas valve not opening",
    "furnace electrical repair"
  ],
  "scope_summary": "Repair or replacement of an approved furnace gas valve or control board component after diagnosis.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Common gas valve or control board repair items.",
      "items": [
        {
          "id": "confirm_furnace_control_issue",
          "title": "Confirm furnace control issue",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Confirm the affected gas valve, control board, or related control component.",
          "match_terms": [
            "gas valve issue",
            "control board issue",
            "furnace no heat"
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
          "id": "replace_gas_valve",
          "title": "Replace furnace gas valve",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the furnace gas valve where included in the approved scope.",
          "match_terms": [
            "replace gas valve",
            "furnace gas valve",
            "gas valve not opening"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "code",
            "safety",
            "manufacturer",
            "licensing"
          ],
          "editor_note": "Use only when included and qualified."
        },
        {
          "id": "replace_control_board",
          "title": "Replace furnace control board",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the furnace control board where included in the approved scope.",
          "match_terms": [
            "control board replacement",
            "furnace board",
            "circuit board"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Compatibility sensitive."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "gas_valve_repair_scope",
      "label": "Gas valve repair",
      "text": "Replace the listed furnace gas valve component included in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "gas",
        "code",
        "safety",
        "licensing"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "gas_electrical_note",
      "text": "Gas, electrical, venting, burner, or thermostat repairs are included only when listed.",
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
      "id": "furnace_control_terms",
      "text": "Final scope depends on confirmed diagnosis, component compatibility, gas conditions, electrical controls, and safe equipment operation.",
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
      "id": "confirm_safe_scope",
      "label": "Confirm gas and electrical scope",
      "detail": "Confirm licensing, gas shutoff, component compatibility, wiring, control sequence, and safety-sensitive conditions.",
      "review_flags": [
        "gas",
        "electrical",
        "code",
        "licensing",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Gas piping repair unless listed",
    "Venting repair unless listed",
    "Thermostat replacement unless listed",
    "Full furnace replacement unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
