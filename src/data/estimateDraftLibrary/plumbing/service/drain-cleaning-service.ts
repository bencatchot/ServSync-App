import type { EstimateDraftLibraryBundle } from '../../types';

export const drainCleaningServiceBundle = {
  "trade": "plumbing",
  "work_category": "service",
  "job_bundle": "drain_cleaning_service",
  "display_name": "Drain Cleaning Service",
  "aliases": [
    "clogged drain",
    "slow drain",
    "main line clog",
    "sink clogged",
    "tub clogged",
    "shower clogged",
    "toilet clog",
    "rooter service",
    "snake drain"
  ],
  "scope_summary": "Service visit to clear a clogged or slow drain using accessible drain-cleaning methods.",
  "sections": [
    {
      "id": "core_service",
      "title": "Core Service",
      "description": "Standard drain cleaning visit and clearing attempt.",
      "items": [
        {
          "id": "drain_cleaning_visit",
          "title": "Drain cleaning service visit",
          "line_type": "fee",
          "suggestion_behavior": "default_candidate",
          "unit": "visit",
          "quantity": "1",
          "customer_description": "Service visit for a clogged or slow drain.",
          "match_terms": [
            "clogged drain",
            "slow drain",
            "drain cleaning",
            "rooter service"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Useful as default fee item if contractor uses a visit-based service structure."
        },
        {
          "id": "mechanical_drain_clearing",
          "title": "Mechanical drain clearing",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Attempt to clear the affected drain using accessible mechanical drain-cleaning methods.",
          "match_terms": [
            "snake drain",
            "auger drain",
            "clear clog",
            "rooter"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Keep scope as attempt unless contractor confirms stronger language."
        },
        {
          "id": "test_drain_flow",
          "title": "Test drain flow",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Run water through the affected drain to check visible flow after service.",
          "match_terms": [
            "test drain",
            "check flow",
            "run water"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Basic flow check only."
        },
        {
          "id": "basic_cleanup",
          "title": "Basic cleanup of work area",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Perform basic cleanup of the immediate work area after drain cleaning.",
          "match_terms": [
            "cleanup after drain cleaning",
            "clean work area"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Do not imply remediation or deep cleaning."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Access, camera, hydro jetting, and recurring clog concerns.",
      "items": [
        {
          "id": "fixture_removal_access",
          "title": "Fixture removal and reinstall for access",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove and reinstall a fixture where needed to access the drain opening.",
          "match_terms": [
            "remove toilet for clog",
            "remove trap",
            "fixture access"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Applies when normal access is not available."
        },
        {
          "id": "cleanout_access",
          "title": "Cleanout access work",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Access and use an available cleanout for drain service where applicable.",
          "match_terms": [
            "cleanout access",
            "main cleanout",
            "outside cleanout"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Add only where access is known."
        },
        {
          "id": "camera_inspection_add_on",
          "title": "Camera inspection add-on",
          "line_type": "other",
          "suggestion_behavior": "optional_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Perform a camera inspection where included to review drain or sewer line conditions.",
          "match_terms": [
            "camera inspection",
            "sewer camera",
            "inspect drain line"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Can point to sewer camera inspection recipe."
        },
        {
          "id": "hydro_jetting_add_on",
          "title": "Hydro jetting add-on",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Provide hydro jetting where included in the approved drain service scope.",
          "match_terms": [
            "hydro jetting",
            "jet drain",
            "heavy buildup"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "regional"
          ],
          "editor_note": "Do not default-add unless contractor offers it."
        },
        {
          "id": "recurring_clog_review",
          "title": "Recurring clog review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Recurring clogs may indicate pipe damage, root intrusion, heavy buildup, or venting issues.",
          "match_terms": [
            "recurring clog",
            "keeps backing up",
            "clog returns"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Use as review guidance and possible inspection upsell."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_drain_cleaning",
      "label": "Standard drain cleaning",
      "text": "Provide drain cleaning service for the affected accessible drain and test flow after service.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "main_line_cleaning",
      "label": "Main line drain cleaning",
      "text": "Provide drain cleaning service through an accessible cleanout or approved access point.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "drain_limit_note",
      "text": "Drain cleaning is intended to restore flow where possible. Additional inspection or repair may be recommended if the blockage returns or pipe damage is found.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "chemical_note",
      "text": "Chemical drain treatment is not included unless specifically listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "access_terms",
      "text": "Service depends on available access to the affected drain or cleanout.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "recurring_terms",
      "text": "Recurring blockages may require separate inspection or repair work.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_access_point",
      "label": "Confirm access point",
      "detail": "Identify whether access is through fixture opening, trap, toilet, roof vent, or cleanout.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "confirm_line_type",
      "label": "Confirm affected line",
      "detail": "Clarify whether this is a fixture drain, branch line, main sewer, or exterior line.",
      "review_flags": [
        "safety",
        "regional"
      ]
    }
  ],
  "excluded_items": [
    "Sewer line repair",
    "Pipe replacement",
    "Excavation",
    "Septic service",
    "Water damage cleanup",
    "Fixture replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
