import type { EstimateDraftLibraryBundle } from '../../types';

export const exteriorTrimOrWoodRotRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "exterior_trim_or_wood_rot_repair",
  "display_name": "Exterior Trim or Wood Rot Repair",
  "aliases": [
    "wood rot repair",
    "exterior trim repair",
    "rotted trim",
    "fascia repair",
    "soffit repair",
    "window trim rot",
    "door trim rot",
    "rotted wood repair"
  ],
  "scope_summary": "Repair or replace damaged exterior trim, fascia, soffit, or localized non-structural wood components within the approved repair area.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Standard exterior trim and localized wood rot repair items.",
      "items": [
        {
          "id": "exterior_rot_area_review",
          "title": "Exterior wood repair area review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the visible exterior wood repair area and confirm the planned repair scope.",
          "match_terms": [
            "wood rot repair",
            "rotted trim",
            "exterior trim repair",
            "fascia repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "regional",
            "safety"
          ],
          "editor_note": "Exterior rot can indicate hidden water damage."
        },
        {
          "id": "remove_damaged_exterior_wood",
          "title": "Remove damaged exterior wood",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove damaged exterior wood from the approved repair area.",
          "match_terms": [
            "remove rotted wood",
            "remove rotten trim",
            "remove fascia",
            "remove damaged soffit"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "regional",
            "safety"
          ],
          "editor_note": "Hidden damage may be found after removal."
        },
        {
          "id": "install_replacement_exterior_trim",
          "title": "Install replacement exterior trim or wood component",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install replacement exterior trim or wood components in the approved repair area.",
          "match_terms": [
            "replace exterior trim",
            "replace fascia",
            "replace soffit",
            "wood trim replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm material type and exposure conditions."
        },
        {
          "id": "replacement_exterior_material",
          "title": "Replacement exterior material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide replacement exterior material for the approved repair area.",
          "match_terms": [
            "exterior trim material",
            "fascia board",
            "soffit material",
            "rot resistant trim"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Material may be wood, composite, PVC, or other contractor-selected material."
        },
        {
          "id": "seal_or_caulk_repair_area",
          "title": "Seal or caulk repaired area",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Seal or caulk the repaired exterior area where included in the approved scope.",
          "match_terms": [
            "caulk trim",
            "seal exterior trim",
            "seal repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Avoid water-intrusion guarantees."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Paint, hidden damage, siding, and water-management conditionals.",
      "items": [
        {
          "id": "prime_paint_or_finish",
          "title": "Prime, paint, or finish repaired area",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Prime, paint, or finish the repaired exterior area where included in the approved scope.",
          "match_terms": [
            "paint exterior trim",
            "prime fascia",
            "finish wood repair",
            "touch up exterior"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Exterior finish may be separate."
        },
        {
          "id": "siding_or_flashing_review",
          "title": "Siding or flashing review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Nearby siding, flashing, or water-management conditions may affect final repair scope.",
          "match_terms": [
            "siding damage",
            "flashing issue",
            "water intrusion",
            "leaking trim"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "structural",
            "manufacturer",
            "code"
          ],
          "editor_note": "Review-only unless a specific siding/flashing item is added."
        },
        {
          "id": "hidden_structural_rot_review",
          "title": "Hidden structural rot review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Hidden structural rot or water damage may require additional approved repair work.",
          "match_terms": [
            "hidden rot",
            "structural rot",
            "soft framing",
            "water damaged framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "regional"
          ],
          "editor_note": "Do not auto-add structural work."
        },
        {
          "id": "insect_or_moisture_damage_review",
          "title": "Insect or moisture damage review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Moisture or insect-related damage may require additional evaluation or repair scope.",
          "match_terms": [
            "termite damage",
            "moisture damage",
            "wood damage",
            "soft wood"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "regional"
          ],
          "editor_note": "Do not imply pest inspection or remediation."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "localized_exterior_rot_repair",
      "label": "Localized exterior wood repair",
      "text": "Repair or replace damaged exterior wood components in the agreed repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "regional"
      ]
    },
    {
      "id": "trim_rot_replacement",
      "label": "Exterior trim replacement",
      "text": "Remove damaged exterior trim and install replacement trim in the approved repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "hidden_damage_note",
      "text": "Hidden rot, water damage, or damaged framing may require additional approved work.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "regional",
        "safety"
      ]
    },
    {
      "id": "finish_match_note",
      "text": "New exterior materials and finishes may not match existing weathered materials exactly.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "terms_candidates": [
    {
      "id": "exterior_rot_terms",
      "text": "This estimate is limited to the listed exterior wood repair areas and does not include hidden structural repair unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "regional"
      ]
    },
    {
      "id": "water_management_terms",
      "text": "Siding, flashing, roofing, gutter, or water-management repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "regional",
        "structural"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_rot_extent",
      "label": "Confirm rot extent",
      "detail": "Inspect visible trim, adjacent siding, sheathing, framing, fasteners, caulk joints, paint failure, and water paths.",
      "review_flags": [
        "structural",
        "regional",
        "safety"
      ]
    },
    {
      "id": "confirm_material_and_finish",
      "label": "Confirm material and finish",
      "detail": "Confirm replacement material, profile, exposure rating, primer, paint, caulk, and finish responsibilities.",
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    }
  ],
  "excluded_items": [
    "Structural framing repair unless listed",
    "Siding repair unless listed",
    "Flashing repair unless listed",
    "Roofing or gutter repair",
    "Painting unless listed",
    "Pest treatment or remediation",
    "Water damage restoration"
  ]
} satisfies EstimateDraftLibraryBundle;
