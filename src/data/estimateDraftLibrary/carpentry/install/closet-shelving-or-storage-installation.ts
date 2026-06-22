import type { EstimateDraftLibraryBundle } from '../../types';

export const closetShelvingOrStorageInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "closet_shelving_or_storage_installation",
  "display_name": "Closet Shelving or Storage Installation",
  "aliases": [
    "install closet shelves",
    "closet shelving",
    "pantry shelving",
    "garage shelving",
    "laundry room shelves",
    "storage shelves",
    "custom closet shelf",
    "wood shelving install"
  ],
  "scope_summary": "Install shelving or basic storage components at an approved interior location.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Standard shelving layout, support, installation, and cleanup items.",
      "items": [
        {
          "id": "shelving_layout_review",
          "title": "Shelving layout review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the approved shelving location and confirm the planned layout.",
          "match_terms": [
            "closet shelving",
            "install shelves",
            "storage shelves",
            "pantry shelves"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "Confirm wall type, support, and layout."
        },
        {
          "id": "install_shelving_supports",
          "title": "Install shelving supports",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install shelving supports at the approved location.",
          "match_terms": [
            "shelf brackets",
            "closet cleats",
            "shelf supports",
            "wall supports"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Support method depends on wall and shelf load."
        },
        {
          "id": "install_shelves",
          "title": "Install shelves",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install shelves according to the approved layout.",
          "match_terms": [
            "install shelf",
            "install closet shelf",
            "install pantry shelf",
            "wood shelf"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer"
          ],
          "editor_note": "Quantity and dimensions should be edited."
        },
        {
          "id": "shelving_material",
          "title": "Shelving material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide shelving material selected for the approved scope.",
          "match_terms": [
            "shelf boards",
            "closet shelf material",
            "pantry shelf boards",
            "wood shelving"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural"
          ],
          "editor_note": "Avoid load-rating promises."
        },
        {
          "id": "shelving_hardware",
          "title": "Shelving hardware",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide standard hardware needed for the approved shelving installation.",
          "match_terms": [
            "shelf brackets",
            "screws",
            "anchors",
            "closet rod brackets"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural",
            "safety"
          ],
          "editor_note": "Hardware depends on wall type and load expectations."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Closet rods, finish, wall condition, and load review items.",
      "items": [
        {
          "id": "closet_rod_installation",
          "title": "Closet rod installation",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a closet rod where included in the approved scope.",
          "match_terms": [
            "closet rod",
            "hanging rod",
            "clothes rod"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Support and span should be reviewed."
        },
        {
          "id": "paint_or_finish_shelving",
          "title": "Paint or finish shelving",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Paint or finish shelving where included in the approved scope.",
          "match_terms": [
            "paint shelves",
            "finish shelves",
            "stain shelves"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Finish often separate."
        },
        {
          "id": "wall_repair_or_patching",
          "title": "Wall repair or patching",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Patch minor wall areas where included in the approved scope.",
          "match_terms": [
            "patch wall",
            "old shelf holes",
            "wall repair",
            "drywall patch"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Use only if contractor offers wall patching."
        },
        {
          "id": "load_or_wall_condition_review",
          "title": "Load or wall condition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Wall type, support locations, and intended storage weight may affect final shelving scope.",
          "match_terms": [
            "heavy storage shelves",
            "garage shelves",
            "wall anchors",
            "shelf support"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Do not state weight capacity unless contractor specifies it."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_shelving_installation",
      "label": "Standard shelving installation",
      "text": "Install shelving at the approved interior location using the listed layout and materials.",
      "contractor_review_required": true,
      "review_flags": [
        "structural"
      ]
    },
    {
      "id": "closet_shelf_and_rod",
      "label": "Closet shelf and rod",
      "text": "Install closet shelving and hanging rod components included in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "wall_condition_note",
      "text": "Wall type, support locations, and existing wall condition may affect final installation scope.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "finish_note",
      "text": "Painting, staining, or finish work is included only when listed.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "terms_candidates": [
    {
      "id": "shelving_terms",
      "text": "Final shelving scope depends on approved layout, material selection, wall condition, and support locations.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "load_terms",
      "text": "Special heavy-storage or load-specific requirements are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_layout",
      "label": "Confirm layout",
      "detail": "Confirm shelf count, length, depth, height, closet rod locations, wall type, and support method.",
      "review_flags": [
        "structural",
        "manufacturer"
      ]
    },
    {
      "id": "confirm_load_expectation",
      "label": "Confirm load expectation",
      "detail": "Ask what the customer plans to store and avoid unsupported load-capacity claims.",
      "review_flags": [
        "structural",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Painting or staining unless listed",
    "Drywall repair unless listed",
    "Electrical work",
    "Custom cabinetry unless listed",
    "Flooring repair",
    "Heavy-duty structural storage unless listed",
    "Closet system supply unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
