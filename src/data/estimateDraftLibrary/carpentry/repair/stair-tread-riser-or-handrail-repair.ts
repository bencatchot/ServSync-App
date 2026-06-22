import type { EstimateDraftLibraryBundle } from '../../types';

export const stairTreadRiserOrHandrailRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "stair_tread_riser_or_handrail_repair",
  "display_name": "Interior stair tread, riser, or handrail repair",
  "aliases": [
    "stair tread riser or handrail repair",
    "Interior stair tread, riser, or handrail repair",
    "Repair approved interior stair treads, risers, trim, or handrail components.",
    "Interior stair repair",
    "Stair material and hardware",
    "Stair operation and stability check"
  ],
  "scope_summary": "Repair approved interior stair treads, risers, trim, or handrail components.",
  "sections": [
    {
      "id": "stair_tread_riser_or_handrail_repair_repair_scope",
      "title": "Interior stair tread, riser, or handrail repair",
      "description": "Repair approved interior stair treads, risers, trim, or handrail components.",
      "items": [
        {
          "id": "interior_stair_repair",
          "title": "Interior stair repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair the approved stair tread, riser, trim, or handrail component.",
          "match_terms": [
            "Interior stair repair",
            "Interior stair tread, riser, or handrail repair",
            "stair tread riser or handrail repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "code",
            "structural",
            "manufacturer"
          ],
          "editor_note": "Confirm stair movement, squeaks, tread/riser dimensions, handrail support, baluster spacing, structural concerns, finish, and code requirements."
        },
        {
          "id": "stair_material_and_hardware",
          "title": "Stair material and hardware",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved stair repair material and hardware.",
          "match_terms": [
            "Stair material and hardware",
            "Interior stair tread, riser, or handrail repair",
            "stair tread riser or handrail repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm wood species, finish match, fasteners, brackets, rail hardware, and stain/paint requirements."
        },
        {
          "id": "stair_operation_and_stability_check",
          "title": "Stair operation and stability check",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Check the repaired stair area for basic stability after completion.",
          "match_terms": [
            "Stair operation and stability check",
            "Interior stair tread, riser, or handrail repair",
            "stair tread riser or handrail repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "code"
          ],
          "editor_note": "Do not certify code compliance unless inspection/code review is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair approved stair tread, riser, or handrail."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install approved stair material and hardware."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Check repaired stair area after completion."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Stair and handrail work is safety-sensitive and may require code review."
    },
    {
      "id": "customer_note_2",
      "text": "Finish matching may vary from existing stained or aged wood."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes full stair rebuild, engineering, permit fees, paint, stain, and flooring repair unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "interior_stair_repair_review",
      "label": "Interior stair repair review",
      "detail": "Confirm stair movement, squeaks, tread/riser dimensions, handrail support, baluster spacing, structural concerns, finish, and code requirements.",
      "review_flags": [
        "safety",
        "code",
        "structural",
        "manufacturer"
      ]
    },
    {
      "id": "stair_material_and_hardware_review",
      "label": "Stair material and hardware review",
      "detail": "Confirm wood species, finish match, fasteners, brackets, rail hardware, and stain/paint requirements.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "stair_operation_and_stability_check_review",
      "label": "Stair operation and stability check review",
      "detail": "Do not certify code compliance unless inspection/code review is included.",
      "review_flags": [
        "safety",
        "code"
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
