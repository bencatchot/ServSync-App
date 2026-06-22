import type { EstimateDraftLibraryBundle } from '../../types';

export const woodFloorTransitionOrThresholdInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "wood_floor_transition_or_threshold_installation",
  "display_name": "Wood floor transition or threshold installation",
  "aliases": [
    "wood floor transition or threshold installation",
    "Wood floor transition or threshold installation",
    "Install or replace a wood threshold or transition strip between rooms or flooring surfaces.",
    "Threshold or transition installation",
    "Transition or threshold material",
    "Fit and fastening adjustment"
  ],
  "scope_summary": "Install or replace a wood threshold or transition strip between rooms or flooring surfaces.",
  "sections": [
    {
      "id": "wood_floor_transition_or_threshold_installation_installation_scope",
      "title": "Wood floor transition or threshold installation",
      "description": "Install or replace a wood threshold or transition strip between rooms or flooring surfaces.",
      "items": [
        {
          "id": "threshold_or_transition_installation",
          "title": "Threshold or transition installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install the approved threshold or floor transition.",
          "match_terms": [
            "Threshold or transition installation",
            "Wood floor transition or threshold installation",
            "wood floor transition or threshold installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm flooring heights, doorway width, material, fastening method, subfloor condition, trip hazard risk, and finish match."
        },
        {
          "id": "transition_or_threshold_material",
          "title": "Transition or threshold material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved transition or threshold material.",
          "match_terms": [
            "Transition or threshold material",
            "Wood floor transition or threshold installation",
            "wood floor transition or threshold installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm wood species, stain match, metal/composite option, reducer/T-mold/threshold style, and finish requirements."
        },
        {
          "id": "fit_and_fastening_adjustment",
          "title": "Fit and fastening adjustment",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Fit and secure the transition for basic use.",
          "match_terms": [
            "Fit and fastening adjustment",
            "Wood floor transition or threshold installation",
            "wood floor transition or threshold installation"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Check door swing clearance and edge movement after fastening."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install approved floor threshold or transition."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Fit transition to existing flooring heights."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Secure transition for basic use."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Flooring repair or refinishing is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Existing uneven flooring may affect final fit."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes flooring repair, sanding, staining, refinishing, and subfloor repair unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "threshold_or_transition_installation_review",
      "label": "Threshold or transition installation review",
      "detail": "Confirm flooring heights, doorway width, material, fastening method, subfloor condition, trip hazard risk, and finish match.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "transition_or_threshold_material_review",
      "label": "Transition or threshold material review",
      "detail": "Confirm wood species, stain match, metal/composite option, reducer/T-mold/threshold style, and finish requirements.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "fit_and_fastening_adjustment_review",
      "label": "Fit and fastening adjustment review",
      "detail": "Check door swing clearance and edge movement after fastening.",
      "review_flags": [
        "safety"
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
