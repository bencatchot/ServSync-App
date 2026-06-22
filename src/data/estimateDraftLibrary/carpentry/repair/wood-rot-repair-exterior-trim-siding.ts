import type { EstimateDraftLibraryBundle } from '../../types';

export const woodRotRepairExteriorTrimSidingBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "wood_rot_repair_exterior_trim_siding",
  "display_name": "Exterior wood rot repair",
  "aliases": [
    "wood rot repair exterior trim siding",
    "Exterior wood rot repair",
    "Repair approved exterior wood rot at trim, siding, fascia, soffit, or related wood components.",
    "Exterior wood rot removal and repair",
    "Exterior-rated replacement material",
    "Sealant and finish-ready prep"
  ],
  "scope_summary": "Repair approved exterior wood rot at trim, siding, fascia, soffit, or related wood components.",
  "sections": [
    {
      "id": "wood_rot_repair_exterior_trim_siding_repair_scope",
      "title": "Exterior wood rot repair",
      "description": "Repair approved exterior wood rot at trim, siding, fascia, soffit, or related wood components.",
      "items": [
        {
          "id": "exterior_wood_rot_removal_and_repair",
          "title": "Exterior wood rot removal and repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove damaged wood and repair the approved exterior area.",
          "match_terms": [
            "Exterior wood rot removal and repair",
            "Exterior wood rot repair",
            "wood rot repair exterior trim siding"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "regional"
          ],
          "editor_note": "Confirm rot extent, water source, siding/trim profile, flashing needs, substrate condition, pest damage, and finish scope."
        },
        {
          "id": "exterior_rated_replacement_material",
          "title": "Exterior-rated replacement material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved exterior-rated replacement material.",
          "match_terms": [
            "Exterior-rated replacement material",
            "Exterior wood rot repair",
            "wood rot repair exterior trim siding"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm wood, PVC, composite, fiber cement, or matching existing material."
        },
        {
          "id": "sealant_and_finish_ready_prep",
          "title": "Sealant and finish-ready prep",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Seal repaired joints and prepare the area for finish.",
          "match_terms": [
            "Sealant and finish-ready prep",
            "Exterior wood rot repair",
            "wood rot repair exterior trim siding"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "manufacturer"
          ],
          "editor_note": "Clarify painting/staining. Seal all exposed cuts and joints appropriate to material."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Remove rotted exterior wood."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install exterior-rated replacement material."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Seal repaired area for weather exposure."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Rot repairs can expand once damaged material is removed."
    },
    {
      "id": "customer_note_2",
      "text": "Painting, staining, or full water-intrusion correction is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes hidden framing repair, pest remediation, water damage remediation, paint, stain, and roofing repair unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "exterior_wood_rot_removal_and_repair_review",
      "label": "Exterior wood rot removal and repair review",
      "detail": "Confirm rot extent, water source, siding/trim profile, flashing needs, substrate condition, pest damage, and finish scope.",
      "review_flags": [
        "structural",
        "regional"
      ]
    },
    {
      "id": "exterior_rated_replacement_material_review",
      "label": "Exterior-rated replacement material review",
      "detail": "Confirm wood, PVC, composite, fiber cement, or matching existing material.",
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "sealant_and_finish_ready_prep_review",
      "label": "Sealant and finish-ready prep review",
      "detail": "Clarify painting/staining. Seal all exposed cuts and joints appropriate to material.",
      "review_flags": [
        "regional",
        "manufacturer"
      ]
    }
  ],
  "excluded_items": [
    "monetary assumptions",
    "guaranteed code or permit requirements",
    "structural conclusions without contractor review",
    "paint, stain, or finish work unless listed",
    "hidden condition repairs unless approved"
  ]
} satisfies EstimateDraftLibraryBundle;
