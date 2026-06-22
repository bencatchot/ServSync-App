import type { EstimateDraftLibraryBundle } from '../../types';

export const windowTrimOrCasingRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "window_trim_or_casing_repair",
  "display_name": "Window trim or casing repair",
  "aliases": [
    "window trim or casing repair",
    "Window trim or casing repair",
    "Repair or replace damaged interior or exterior window trim.",
    "Trim material",
    "Caulk and finish-ready prep"
  ],
  "scope_summary": "Repair or replace damaged interior or exterior window trim.",
  "sections": [
    {
      "id": "window_trim_or_casing_repair_repair_scope",
      "title": "Window trim or casing repair",
      "description": "Repair or replace damaged interior or exterior window trim.",
      "items": [
        {
          "id": "window_trim_or_casing_repair",
          "title": "Window trim or casing repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace approved window trim or casing.",
          "match_terms": [
            "Window trim or casing repair",
            "window trim or casing repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural"
          ],
          "editor_note": "Confirm interior vs exterior trim, profile match, water damage, rot, window operation, and finish requirements."
        },
        {
          "id": "trim_material",
          "title": "Trim material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide trim material for the approved repair.",
          "match_terms": [
            "Trim material",
            "Window trim or casing repair",
            "window trim or casing repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm wood, PVC, composite, finger-joint, or matching profile based on exposure and customer preference."
        },
        {
          "id": "caulk_and_finish_ready_prep",
          "title": "Caulk and finish-ready prep",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Caulk and prepare the repaired trim area for finish work.",
          "match_terms": [
            "Caulk and finish-ready prep",
            "Window trim or casing repair",
            "window trim or casing repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether painting or staining is included. Exterior joints may need weather-rated sealant."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair approved window trim."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Replace damaged casing or trim sections."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Caulk and prepare repaired area for finish."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Painting or staining is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Hidden rot or window damage may require additional work."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes window replacement, glass repair, water damage remediation, paint, and stain unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "window_trim_or_casing_repair_review",
      "label": "Window trim or casing repair review",
      "detail": "Confirm interior vs exterior trim, profile match, water damage, rot, window operation, and finish requirements.",
      "review_flags": [
        "manufacturer",
        "structural"
      ]
    },
    {
      "id": "trim_material_review",
      "label": "Trim material review",
      "detail": "Confirm wood, PVC, composite, finger-joint, or matching profile based on exposure and customer preference.",
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "caulk_and_finish_ready_prep_review",
      "label": "Caulk and finish-ready prep review",
      "detail": "Clarify whether painting or staining is included. Exterior joints may need weather-rated sealant.",
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
