import type { EstimateDraftLibraryBundle } from '../../types';

export const minorCustomWoodRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "minor_custom_wood_repair",
  "display_name": "Minor custom wood repair",
  "aliases": [
    "minor custom wood repair",
    "Minor custom wood repair",
    "Repair a small approved wood component such as trim, casing, shelf support, cabinet part, or decorative wood detail.",
    "Wood, trim, fasteners, or repair materials",
    "Finish-ready prep"
  ],
  "scope_summary": "Repair a small approved wood component such as trim, casing, shelf support, cabinet part, or decorative wood detail.",
  "sections": [
    {
      "id": "minor_custom_wood_repair_repair_scope",
      "title": "Minor custom wood repair",
      "description": "Repair a small approved wood component such as trim, casing, shelf support, cabinet part, or decorative wood detail.",
      "items": [
        {
          "id": "minor_custom_wood_repair",
          "title": "Minor custom wood repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair the approved small wood component.",
          "match_terms": [
            "Minor custom wood repair",
            "minor custom wood repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm material type, damage cause, finish match, repair vs replacement, hardware needs, and whether the repair area is structural or decorative."
        },
        {
          "id": "wood_trim_fasteners_or_repair_materials",
          "title": "Wood, trim, fasteners, or repair materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved materials needed for the wood repair.",
          "match_terms": [
            "Wood, trim, fasteners, or repair materials",
            "Minor custom wood repair",
            "minor custom wood repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm whether material can be matched or whether a close substitute is required."
        },
        {
          "id": "finish_ready_prep",
          "title": "Finish-ready prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Prepare the repaired wood area for finish.",
          "match_terms": [
            "Finish-ready prep",
            "Minor custom wood repair",
            "minor custom wood repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether paint, stain, or clear finish is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair approved small wood component."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Replace or reinforce damaged wood part as approved."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Prepare repaired area for finish."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Exact material or finish match may not be possible on older woodwork."
    },
    {
      "id": "customer_note_2",
      "text": "Painting, staining, or refinishing is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes structural repair, paint, stain, refinishing, and hidden damage repair unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "minor_custom_wood_repair_review",
      "label": "Minor custom wood repair review",
      "detail": "Confirm material type, damage cause, finish match, repair vs replacement, hardware needs, and whether the repair area is structural or decorative.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "wood_trim_fasteners_or_repair_materials_review",
      "label": "Wood, trim, fasteners, or repair materials review",
      "detail": "Confirm whether material can be matched or whether a close substitute is required.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "finish_ready_prep_review",
      "label": "Finish-ready prep review",
      "detail": "Clarify whether paint, stain, or clear finish is included.",
      "review_flags": [
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
