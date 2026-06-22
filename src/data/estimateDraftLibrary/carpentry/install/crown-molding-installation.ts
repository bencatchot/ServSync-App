import type { EstimateDraftLibraryBundle } from '../../types';

export const crownMoldingInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "crown_molding_installation",
  "display_name": "Crown molding installation",
  "aliases": [
    "crown molding installation",
    "Crown molding installation",
    "Install crown molding to finish the wall and ceiling transition.",
    "Crown molding material",
    "Nail fill, caulk, and finish-ready prep"
  ],
  "scope_summary": "Install crown molding to finish the wall and ceiling transition.",
  "sections": [
    {
      "id": "crown_molding_installation_installation_scope",
      "title": "Crown molding installation",
      "description": "Install crown molding to finish the wall and ceiling transition.",
      "items": [
        {
          "id": "crown_molding_installation",
          "title": "Crown molding installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install approved crown molding in the selected room or area.",
          "match_terms": [
            "Crown molding installation",
            "crown molding installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm profile, linear footage, ceiling height, inside/outside corners, wall/ceiling condition, cabinet returns, and finish requirements."
        },
        {
          "id": "crown_molding_material",
          "title": "Crown molding material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved crown molding material for the installation.",
          "match_terms": [
            "Crown molding material",
            "Crown molding installation",
            "crown molding installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm wood, MDF, PVC, flexible molding, or matching existing profile."
        },
        {
          "id": "nail_fill_caulk_and_finish_ready_prep",
          "title": "Nail fill, caulk, and finish-ready prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Prepare installed molding for final finish.",
          "match_terms": [
            "Nail fill, caulk, and finish-ready prep",
            "Crown molding installation",
            "crown molding installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether painting is included. Crown gaps may reflect wall/ceiling irregularities."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install crown molding in approved area."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Provide matching or selected crown material."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Prepare crown molding for finish."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Painting or staining is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Uneven ceilings or walls may affect fit and may require additional prep."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes paint, stain, drywall repair, ceiling repair, and electrical fixture relocation unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "crown_molding_installation_review",
      "label": "Crown molding installation review",
      "detail": "Confirm profile, linear footage, ceiling height, inside/outside corners, wall/ceiling condition, cabinet returns, and finish requirements.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "crown_molding_material_review",
      "label": "Crown molding material review",
      "detail": "Confirm wood, MDF, PVC, flexible molding, or matching existing profile.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "nail_fill_caulk_and_finish_ready_prep_review",
      "label": "Nail fill, caulk, and finish-ready prep review",
      "detail": "Clarify whether painting is included. Crown gaps may reflect wall/ceiling irregularities.",
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
