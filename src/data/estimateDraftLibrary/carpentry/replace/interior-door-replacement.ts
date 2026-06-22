import type { EstimateDraftLibraryBundle } from '../../types';

export const interiorDoorReplacementBundle = {
  "trade": "carpentry",
  "work_category": "replace",
  "job_bundle": "interior_door_replacement",
  "display_name": "Interior Door Replacement",
  "aliases": [
    "replace interior door",
    "install bedroom door",
    "install bathroom door",
    "door slab replacement",
    "prehung interior door",
    "closet door replacement",
    "damaged interior door"
  ],
  "scope_summary": "Replace an interior door slab or prehung interior door at an existing opening.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard interior door removal, fitting, installation, and hardware items.",
      "items": [
        {
          "id": "remove_existing_interior_door",
          "title": "Remove existing interior door",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove the existing interior door from the approved opening.",
          "match_terms": [
            "remove interior door",
            "old bedroom door",
            "replace door slab"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Works for slab or prehung replacement depending on scope."
        },
        {
          "id": "install_replacement_interior_door",
          "title": "Install replacement interior door",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a replacement interior door at the existing opening.",
          "match_terms": [
            "install interior door",
            "replace bedroom door",
            "new interior door"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural"
          ],
          "editor_note": "Confirm slab versus prehung and opening condition."
        },
        {
          "id": "fit_and_adjust_door",
          "title": "Fit and adjust door",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Fit and adjust the replacement door for basic swing and closure.",
          "match_terms": [
            "adjust door",
            "door sticks",
            "door fit",
            "door swing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer"
          ],
          "editor_note": "Settlement or out-of-square openings may require more work."
        },
        {
          "id": "install_door_hardware",
          "title": "Install door hardware",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Install standard door hardware included in the approved scope.",
          "match_terms": [
            "door knob",
            "door handle",
            "hinges",
            "latch"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Hardware may be customer-supplied or contractor-supplied."
        },
        {
          "id": "replacement_interior_door_material",
          "title": "Replacement interior door",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide a replacement interior door selected for the approved scope.",
          "match_terms": [
            "interior door slab",
            "prehung door",
            "hollow core door",
            "solid core door"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Optional because customer may supply the door."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Opening, trim, hardware, and finish conditionals.",
      "items": [
        {
          "id": "door_casing_trim_rework",
          "title": "Door casing or trim rework",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Modify or replace door casing or trim where included in the approved scope.",
          "match_terms": [
            "door casing",
            "door trim",
            "replace trim around door"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Often needed for prehung replacement."
        },
        {
          "id": "frame_or_jamb_repair",
          "title": "Door frame or jamb repair",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair the door frame or jamb where included in the approved scope.",
          "match_terms": [
            "door jamb repair",
            "damaged frame",
            "split jamb",
            "loose door frame"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "Add when the frame is damaged or not suitable for the new door."
        },
        {
          "id": "paint_or_finish_door",
          "title": "Paint or finish door",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Paint or finish the replacement door where included in the approved scope.",
          "match_terms": [
            "paint door",
            "finish door",
            "prime door"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Keep separate because many carpenters exclude painting."
        },
        {
          "id": "opening_condition_review",
          "title": "Opening condition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Out-of-square openings, damaged framing, or settling may require additional approved work.",
          "match_terms": [
            "door opening out of square",
            "settling",
            "door does not close",
            "rough opening problem"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "Review-only unless specific framing or jamb work is added."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_interior_door_replacement",
      "label": "Standard interior door replacement",
      "text": "Remove the existing interior door and install a replacement door at the existing opening.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "door_slab_replacement",
      "label": "Door slab replacement",
      "text": "Install a replacement door slab using the existing frame where suitable.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "structural"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "door_fit_note",
      "text": "Door fit depends on the selected door, existing frame, hardware, and opening condition.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "structural"
      ]
    },
    {
      "id": "paint_note",
      "text": "Painting, staining, or finish work is included only when listed.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "terms_candidates": [
    {
      "id": "door_terms",
      "text": "Final scope may change if the existing frame, opening, trim, or hardware is not suitable for the planned replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "manufacturer"
      ]
    },
    {
      "id": "customer_door_terms",
      "text": "Customer-supplied doors and hardware must be complete, available, and suitable for the approved opening.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_door_type",
      "label": "Confirm door type",
      "detail": "Confirm slab versus prehung, swing direction, hinge layout, bore location, door size, and hardware type.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "confirm_opening_condition",
      "label": "Confirm opening condition",
      "detail": "Check for out-of-square openings, damaged jambs, loose trim, uneven floors, and settling.",
      "review_flags": [
        "structural"
      ]
    }
  ],
  "excluded_items": [
    "Painting or staining unless listed",
    "Major framing repair unless listed",
    "Trim replacement unless listed",
    "Hardware supply unless listed",
    "Exterior door work",
    "Floor repair",
    "Wall repair"
  ]
} satisfies EstimateDraftLibraryBundle;
