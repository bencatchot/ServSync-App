import type { EstimateDraftLibraryBundle } from '../../types';

export const fenceOrGateRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "fence_or_gate_repair",
  "display_name": "Fence or Gate Repair",
  "aliases": [
    "fence repair",
    "gate repair",
    "replace fence pickets",
    "sagging gate",
    "broken fence post",
    "wood fence repair",
    "privacy fence repair",
    "loose fence boards"
  ],
  "scope_summary": "Repair damaged wood fence or gate components within the approved repair area.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Standard fence or gate repair tasks.",
      "items": [
        {
          "id": "fence_repair_area_review",
          "title": "Fence or gate repair area review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the fence or gate repair area and confirm the planned repair scope.",
          "match_terms": [
            "fence repair",
            "gate repair",
            "sagging gate",
            "broken fence"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "regional"
          ],
          "editor_note": "Check posts, rails, pickets, hinges, latch, and property constraints."
        },
        {
          "id": "remove_damaged_fence_components",
          "title": "Remove damaged fence components",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove damaged fence or gate components from the approved repair area.",
          "match_terms": [
            "remove broken pickets",
            "remove fence boards",
            "remove damaged gate"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "Quantity should be adjusted."
        },
        {
          "id": "install_replacement_fence_components",
          "title": "Install replacement fence components",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install replacement fence or gate components in the approved repair area.",
          "match_terms": [
            "replace pickets",
            "replace fence rail",
            "repair gate",
            "install fence boards"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer"
          ],
          "editor_note": "Material and layout should be confirmed."
        },
        {
          "id": "replacement_fence_material",
          "title": "Replacement fence material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide replacement fence or gate material for the approved repair area.",
          "match_terms": [
            "fence pickets",
            "fence rail",
            "gate material",
            "wood fence material"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Avoid exact matching guarantees."
        },
        {
          "id": "fence_fasteners_and_hardware",
          "title": "Fence fasteners and hardware",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide fasteners or standard hardware needed for the approved fence or gate repair.",
          "match_terms": [
            "fence screws",
            "gate hinges",
            "gate latch",
            "fence hardware"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Gate hardware should be selected by contractor."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Post repair, gate adjustment, finish, and property condition reminders.",
      "items": [
        {
          "id": "fence_post_replacement",
          "title": "Fence post replacement",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace a damaged fence post where included in the approved scope.",
          "match_terms": [
            "broken fence post",
            "rotted post",
            "leaning fence post",
            "replace post"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "regional",
            "safety"
          ],
          "editor_note": "May involve digging, concrete, utilities, and property line review."
        },
        {
          "id": "gate_adjustment",
          "title": "Gate adjustment",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Adjust the gate for basic swing and latch operation where included in the approved scope.",
          "match_terms": [
            "sagging gate",
            "gate won't latch",
            "adjust gate",
            "gate dragging"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "May require post or hinge replacement."
        },
        {
          "id": "stain_or_seal_fence_repair",
          "title": "Stain or seal repaired fence area",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Stain or seal the repaired fence or gate area where included in the approved scope.",
          "match_terms": [
            "stain fence",
            "seal fence",
            "finish fence repair"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Finish matching should not be guaranteed."
        },
        {
          "id": "property_line_or_utility_review",
          "title": "Property line or utility review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Fence layout, property lines, or underground utilities may affect repair scope.",
          "match_terms": [
            "property line",
            "underground utilities",
            "fence location",
            "post digging"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "safety",
            "structural"
          ],
          "editor_note": "Review-only; do not make survey or utility clearance claims."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "localized_fence_repair",
      "label": "Localized fence repair",
      "text": "Repair the damaged fence components in the agreed repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "structural"
      ]
    },
    {
      "id": "gate_repair_scope",
      "label": "Gate repair",
      "text": "Repair or adjust the gate components listed in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "structural"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "material_match_note",
      "text": "New fence materials may not match existing aged or weathered materials exactly.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "post_condition_note",
      "text": "Damaged posts, concrete footings, or hidden ground conditions may require additional approved work.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "regional",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "fence_scope_terms",
      "text": "This estimate is limited to the listed fence or gate repair areas.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "property_terms",
      "text": "Property line, utility location, survey, or permitting items are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "regional",
        "permit",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_fence_components",
      "label": "Confirm fence components",
      "detail": "Confirm whether repair includes pickets, rails, posts, panels, gate frame, hinges, latch, or concrete.",
      "review_flags": [
        "structural",
        "manufacturer"
      ]
    },
    {
      "id": "confirm_digging_conditions",
      "label": "Confirm digging conditions",
      "detail": "If posts are replaced, review underground utilities, property constraints, access, and local requirements.",
      "review_flags": [
        "regional",
        "safety",
        "permit"
      ]
    }
  ],
  "excluded_items": [
    "Full fence replacement unless listed",
    "Post replacement unless listed",
    "Survey or property-line verification",
    "Utility location services unless listed",
    "Painting, staining, or sealing unless listed",
    "Gate hardware supply unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
