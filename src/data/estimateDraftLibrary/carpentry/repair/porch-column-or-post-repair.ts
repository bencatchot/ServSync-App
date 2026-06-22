import type { EstimateDraftLibraryBundle } from '../../types';

export const porchColumnOrPostRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "porch_column_or_post_repair",
  "display_name": "Porch Column or Post Repair",
  "aliases": [
    "porch column repair",
    "column base rot",
    "replace porch post",
    "rotted porch post",
    "porch support repair",
    "decorative column repair",
    "front porch column",
    "post base repair"
  ],
  "scope_summary": "Repair or replace damaged porch column, post, or column trim components within the approved scope.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Standard column or post review, removal, replacement, and finish-prep items.",
      "items": [
        {
          "id": "column_post_condition_review",
          "title": "Column or post condition review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the visible column or post repair area and confirm the planned repair scope.",
          "match_terms": [
            "porch column repair",
            "rotted post",
            "column base rot",
            "porch support repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Columns/posts may be load-bearing or decorative."
        },
        {
          "id": "remove_damaged_column_material",
          "title": "Remove damaged column or post material",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove damaged column or post material included in the approved repair scope.",
          "match_terms": [
            "remove rotted column",
            "remove post base",
            "remove damaged post"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Do not imply temporary support unless scoped."
        },
        {
          "id": "install_replacement_column_or_post_component",
          "title": "Install replacement column or post component",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install replacement column or post components included in the approved scope.",
          "match_terms": [
            "replace porch post",
            "replace column base",
            "install column trim",
            "post repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm whether work is decorative or structural."
        },
        {
          "id": "replacement_column_material",
          "title": "Replacement column or post material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide replacement column or post material for the approved repair scope.",
          "match_terms": [
            "porch column material",
            "post material",
            "column wrap",
            "trim material"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Material and load-bearing requirements must be selected by contractor."
        },
        {
          "id": "seal_column_repair_area",
          "title": "Seal repaired column or post area",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Seal the repaired column or post area where included in the approved scope.",
          "match_terms": [
            "seal column base",
            "caulk porch column",
            "seal post repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Avoid guarantees about future water intrusion."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Structural support, finish, water damage, and permit-sensitive items.",
      "items": [
        {
          "id": "temporary_support_or_load_review",
          "title": "Temporary support or load review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Load-bearing conditions may require additional support or repair planning.",
          "match_terms": [
            "load bearing column",
            "support post",
            "roof support",
            "temporary support"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code",
            "permit"
          ],
          "editor_note": "Review-only; do not auto-add structural support work."
        },
        {
          "id": "paint_or_finish_column",
          "title": "Paint or finish column repair",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Paint or finish the repaired column or post area where included in the approved scope.",
          "match_terms": [
            "paint column",
            "finish post",
            "paint porch post"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Finish work should be explicit."
        },
        {
          "id": "porch_framing_or_slab_review",
          "title": "Porch framing or base condition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Porch framing, base, or water-damage conditions may require additional approved repair work.",
          "match_terms": [
            "porch framing damage",
            "rotted base",
            "column base water damage",
            "post footing issue"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "regional"
          ],
          "editor_note": "Do not include slab, footing, or framing repairs by default."
        },
        {
          "id": "permit_or_code_review",
          "title": "Permit or code-sensitive review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Permit or local requirement review may be needed for structural column or post work.",
          "match_terms": [
            "structural column",
            "permit for porch post",
            "load bearing post",
            "porch support"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "permit",
            "code",
            "regional",
            "structural",
            "safety"
          ],
          "editor_note": "Do not make permit claims."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "localized_column_repair",
      "label": "Localized column repair",
      "text": "Repair the listed porch column or post components in the approved repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "decorative_column_trim_repair",
      "label": "Decorative column trim repair",
      "text": "Repair or replace decorative column trim components listed in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "load_bearing_note",
      "text": "Additional support, framing, or structural repair work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety",
        "code"
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
      "id": "column_scope_terms",
      "text": "Final scope may change if the column, post, framing, base, or surrounding structure is not suitable for limited repair.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety",
        "code"
      ]
    },
    {
      "id": "water_damage_terms",
      "text": "Water damage, footing, slab, framing, or roof support repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "regional",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_load_bearing",
      "label": "Confirm load-bearing status",
      "detail": "Determine whether the column or post is decorative, partially structural, or load-bearing before finalizing scope.",
      "review_flags": [
        "structural",
        "safety",
        "code"
      ]
    },
    {
      "id": "confirm_water_damage",
      "label": "Confirm water damage extent",
      "detail": "Inspect column base, porch surface, trim, framing, roof load path, fasteners, and adjacent rot.",
      "review_flags": [
        "structural",
        "regional",
        "safety"
      ]
    },
    {
      "id": "confirm_permit_need",
      "label": "Confirm permit or code-sensitive work",
      "detail": "Review local requirements before performing structural post, column, porch, or load-path work.",
      "review_flags": [
        "permit",
        "code",
        "regional",
        "structural"
      ]
    }
  ],
  "excluded_items": [
    "Structural engineering",
    "Temporary shoring unless listed",
    "Footing repair unless listed",
    "Porch framing repair unless listed",
    "Roof support repair unless listed",
    "Painting unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
