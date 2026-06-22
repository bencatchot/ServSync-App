import type { EstimateDraftLibraryBundle } from '../../types';

export const exteriorDoorReplacementBundle = {
  "trade": "carpentry",
  "work_category": "replace",
  "job_bundle": "exterior_door_replacement",
  "display_name": "Exterior Door Replacement",
  "aliases": [
    "replace exterior door",
    "front door replacement",
    "back door replacement",
    "patio door replacement",
    "entry door replacement",
    "exterior door install",
    "rotted exterior door frame",
    "damaged exterior door"
  ],
  "scope_summary": "Replace an exterior entry door or exterior door unit at an existing opening.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard exterior door removal, installation, fastening, weatherproofing, and hardware items.",
      "items": [
        {
          "id": "remove_existing_exterior_door",
          "title": "Remove existing exterior door",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove the existing exterior door from the approved opening.",
          "match_terms": [
            "remove exterior door",
            "remove front door",
            "old entry door"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Exterior openings may reveal hidden rot or framing conditions."
        },
        {
          "id": "install_exterior_door_unit",
          "title": "Install exterior door unit",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement exterior door unit at the existing opening.",
          "match_terms": [
            "install exterior door",
            "entry door installation",
            "front door replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm door type, handing, threshold, and opening condition."
        },
        {
          "id": "shim_fastening_and_alignment",
          "title": "Shim, fasten, and align door",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Shim, fasten, and align the door for basic operation.",
          "match_terms": [
            "door alignment",
            "shim door",
            "door does not close",
            "door swing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer"
          ],
          "editor_note": "Poor opening conditions may require additional work."
        },
        {
          "id": "seal_exterior_door_perimeter",
          "title": "Seal exterior door perimeter",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Seal the exterior door perimeter where included in the approved installation scope.",
          "match_terms": [
            "seal door",
            "caulk exterior door",
            "weatherproof door"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Avoid guarantees about water intrusion."
        },
        {
          "id": "install_lockset_or_hardware",
          "title": "Install lockset or door hardware",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Install exterior door hardware included in the approved scope.",
          "match_terms": [
            "install lockset",
            "deadbolt",
            "door handle",
            "entry hardware"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm hardware compatibility and customer expectations."
        },
        {
          "id": "replacement_exterior_door_material",
          "title": "Replacement exterior door unit",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide a replacement exterior door unit selected for the approved scope.",
          "match_terms": [
            "entry door unit",
            "prehung exterior door",
            "front door unit"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Optional because customer may supply door."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Threshold, trim, flashing, rot, and opening condition items.",
      "items": [
        {
          "id": "threshold_or_sill_repair",
          "title": "Threshold or sill repair",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace threshold or sill components where included in the approved scope.",
          "match_terms": [
            "rotted sill",
            "threshold repair",
            "door sill rot",
            "water damage at door"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "regional",
            "safety"
          ],
          "editor_note": "Often discovered during exterior door removal."
        },
        {
          "id": "exterior_trim_replacement",
          "title": "Exterior door trim replacement",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Replace exterior door trim where included in the approved scope.",
          "match_terms": [
            "brickmold replacement",
            "door casing",
            "exterior trim rot"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Trim material and finish should be selected."
        },
        {
          "id": "weatherstripping_or_sweep",
          "title": "Weatherstripping or door sweep",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Install weatherstripping or a door sweep where included in the approved scope.",
          "match_terms": [
            "door sweep",
            "weatherstripping",
            "drafty door",
            "air gap under door"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Good optional line for draft complaints."
        },
        {
          "id": "flashing_or_water_management_review",
          "title": "Flashing or water-management review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Water-management conditions may affect final exterior door scope.",
          "match_terms": [
            "door leaks",
            "water intrusion",
            "flashing",
            "rotted door frame"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "structural",
            "manufacturer",
            "code"
          ],
          "editor_note": "Do not guarantee leak prevention."
        },
        {
          "id": "hidden_rot_or_framing_review",
          "title": "Hidden rot or framing review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Hidden rot or framing damage may require additional approved repair work.",
          "match_terms": [
            "hidden rot",
            "rotted frame",
            "water damaged framing",
            "soft sill"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "regional"
          ],
          "editor_note": "Keep as review-only unless specific repairs are added."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_exterior_door_replacement",
      "label": "Standard exterior door replacement",
      "text": "Remove the existing exterior door and install a replacement exterior door unit at the existing opening.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "exterior_door_with_trim",
      "label": "Exterior door with trim",
      "text": "Install the replacement exterior door and included trim components listed in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "hidden_condition_note",
      "text": "Hidden rot, water damage, or framing issues may require additional approved work.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "regional",
        "safety"
      ]
    },
    {
      "id": "finish_note",
      "text": "Painting, staining, or finish matching is included only when listed.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "terms_candidates": [
    {
      "id": "exterior_door_terms",
      "text": "Final scope may change if the existing opening, threshold, trim, framing, or water-management conditions are not suitable for the planned replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "hardware_terms",
      "text": "Customer-supplied doors and hardware must be complete, available, and suitable for the approved opening.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_door_specs",
      "label": "Confirm door specifications",
      "detail": "Confirm size, swing, handing, threshold, jamb depth, hardware, glass, weather exposure, and customer-supplied parts.",
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "confirm_opening_and_rot",
      "label": "Confirm opening and rot conditions",
      "detail": "Inspect sill, threshold, side jambs, header area, trim, sheathing, and nearby water damage.",
      "review_flags": [
        "structural",
        "safety",
        "regional"
      ]
    }
  ],
  "excluded_items": [
    "Painting or staining unless listed",
    "Major framing repair unless listed",
    "Water damage repair unless listed",
    "Siding repair unless listed",
    "Flooring repair unless listed",
    "Alarm or smart lock setup unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
