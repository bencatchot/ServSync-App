import type { EstimateDraftLibraryBundle } from '../../types';

export const interiorTrimRepairOrReplacementBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "interior_trim_repair_or_replacement",
  "display_name": "Interior Trim Repair or Replacement",
  "aliases": [
    "trim repair",
    "replace baseboard",
    "replace door casing",
    "crown molding repair",
    "quarter round replacement",
    "damaged trim",
    "interior molding repair"
  ],
  "scope_summary": "Repair or replace damaged interior trim, baseboard, casing, molding, or small finish carpentry sections.",
  "sections": [
    {
      "id": "core_trim_work",
      "title": "Core Trim Work",
      "description": "Standard trim removal, replacement, fastening, and finish-prep items.",
      "items": [
        {
          "id": "trim_repair_area_review",
          "title": "Trim repair area review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the trim repair area and confirm the trim sections included in the approved scope.",
          "match_terms": [
            "trim repair",
            "baseboard repair",
            "damaged molding",
            "door casing repair"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Useful for confirming linear footage or pieces."
        },
        {
          "id": "remove_damaged_trim",
          "title": "Remove damaged trim",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove damaged trim from the agreed repair area.",
          "match_terms": [
            "remove baseboard",
            "remove damaged trim",
            "remove casing"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Quantity should be edited."
        },
        {
          "id": "install_replacement_trim",
          "title": "Install replacement trim",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install replacement trim in the agreed repair area.",
          "match_terms": [
            "install baseboard",
            "replace trim",
            "install casing",
            "install molding"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Profile matching can be uncertain."
        },
        {
          "id": "replacement_trim_material",
          "title": "Replacement trim material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide replacement trim material for the approved repair area.",
          "match_terms": [
            "baseboard material",
            "trim material",
            "molding material",
            "door casing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Exact profile match may not be available."
        },
        {
          "id": "caulk_nail_fill_prep",
          "title": "Caulk, nail fill, and finish prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Caulk, fill nail holes, and prepare repaired trim for finish where included.",
          "match_terms": [
            "caulk trim",
            "fill nail holes",
            "finish prep",
            "trim prep"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Painting may still be separate."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Finish matching, painting, wall damage, and profile conditionals.",
      "items": [
        {
          "id": "paint_or_finish_trim",
          "title": "Paint or finish trim",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Paint or finish the repaired trim where included in the approved scope.",
          "match_terms": [
            "paint trim",
            "finish baseboard",
            "touch up paint",
            "stain trim"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Often excluded by carpentry-only contractors."
        },
        {
          "id": "profile_match_review",
          "title": "Trim profile match review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Replacement trim may not match existing trim exactly if the original profile is unavailable.",
          "match_terms": [
            "match existing trim",
            "old trim profile",
            "custom molding",
            "profile match"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Customer-safe note."
        },
        {
          "id": "wall_or_floor_damage_review",
          "title": "Wall or floor damage review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Wall, flooring, or hidden damage behind trim may require additional approved repair work.",
          "match_terms": [
            "wall damage behind trim",
            "floor damage",
            "water damage trim",
            "hidden damage"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Do not include drywall or flooring repair by default."
        },
        {
          "id": "custom_molding_setup",
          "title": "Custom molding setup",
          "line_type": "labor",
          "suggestion_behavior": "not_auto_added",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Custom molding work is included only when listed in the approved scope.",
          "match_terms": [
            "custom molding",
            "special trim profile",
            "millwork",
            "custom trim"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Should not auto-add because custom trim can change scope significantly."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_trim_repair",
      "label": "Standard trim repair",
      "text": "Repair or replace the listed interior trim sections in the approved repair area.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "baseboard_replacement",
      "label": "Baseboard replacement",
      "text": "Remove damaged baseboard and install replacement baseboard in the approved area.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "customer_note_candidates": [
    {
      "id": "match_note",
      "text": "New trim may not match existing aged, painted, stained, or discontinued trim exactly.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "finish_note",
      "text": "Painting, staining, and touch-up work are included only when listed.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "terms_candidates": [
    {
      "id": "trim_scope_terms",
      "text": "This estimate is limited to the listed trim repair or replacement areas.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "hidden_damage_terms",
      "text": "Wall, flooring, or hidden damage repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_trim_profile",
      "label": "Confirm trim profile",
      "detail": "Confirm trim style, dimensions, material, reveal, finish condition, and whether an exact profile match is expected.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "confirm_finish_scope",
      "label": "Confirm finish scope",
      "detail": "Clarify whether caulk, nail fill, primer, paint, stain, or touch-up is included.",
      "review_flags": []
    }
  ],
  "excluded_items": [
    "Painting or staining unless listed",
    "Drywall repair unless listed",
    "Flooring repair unless listed",
    "Custom milling unless listed",
    "Water damage repair unless listed",
    "Full-room trim replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
