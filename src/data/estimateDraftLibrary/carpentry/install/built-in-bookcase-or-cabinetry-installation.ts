import type { EstimateDraftLibraryBundle } from '../../types';

export const builtInBookcaseOrCabinetryInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "built_in_bookcase_or_cabinetry_installation",
  "display_name": "Built-in bookcase or cabinetry installation",
  "aliases": [
    "built in bookcase or cabinetry installation",
    "Built-in bookcase or cabinetry installation",
    "Install a built-in bookcase, storage unit, or cabinetry feature in an approved area.",
    "Cabinet, shelf, or built-in materials",
    "Trim integration and finish-ready prep"
  ],
  "scope_summary": "Install a built-in bookcase, storage unit, or cabinetry feature in an approved area.",
  "sections": [
    {
      "id": "built_in_bookcase_or_cabinetry_installation_installation_scope",
      "title": "Built-in bookcase or cabinetry installation",
      "description": "Install a built-in bookcase, storage unit, or cabinetry feature in an approved area.",
      "items": [
        {
          "id": "built_in_bookcase_or_cabinetry_installation",
          "title": "Built-in bookcase or cabinetry installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install the approved built-in bookcase or cabinetry unit.",
          "match_terms": [
            "Built-in bookcase or cabinetry installation",
            "built in bookcase or cabinetry installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm field measurements, design, wall/floor level, anchoring, trim integration, finish scope, and whether unit is custom-built or prebuilt."
        },
        {
          "id": "cabinet_shelf_or_built_in_materials",
          "title": "Cabinet, shelf, or built-in materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved cabinet, shelf, trim, or built-in materials.",
          "match_terms": [
            "Cabinet, shelf, or built-in materials",
            "Built-in bookcase or cabinetry installation",
            "built in bookcase or cabinetry installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm plywood/MDF/solid wood, face frame, doors, hardware, adjustable shelves, and finish requirements."
        },
        {
          "id": "trim_integration_and_finish_ready_prep",
          "title": "Trim integration and finish-ready prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install trim details and prepare the built-in for final finish.",
          "match_terms": [
            "Trim integration and finish-ready prep",
            "Built-in bookcase or cabinetry installation",
            "built in bookcase or cabinetry installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether caulk, filler, paint, stain, or clear coat is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install approved built-in bookcase or cabinetry."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Anchor unit and integrate trim."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Prepare built-in for finish."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Electrical outlet relocation, lighting, painting, or staining is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Custom design changes may affect the final scope."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes electrical work, paint, stain, countertop work, and wall repair unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "built_in_bookcase_or_cabinetry_installation_review",
      "label": "Built-in bookcase or cabinetry installation review",
      "detail": "Confirm field measurements, design, wall/floor level, anchoring, trim integration, finish scope, and whether unit is custom-built or prebuilt.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "cabinet_shelf_or_built_in_materials_review",
      "label": "Cabinet, shelf, or built-in materials review",
      "detail": "Confirm plywood/MDF/solid wood, face frame, doors, hardware, adjustable shelves, and finish requirements.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "trim_integration_and_finish_ready_prep_review",
      "label": "Trim integration and finish-ready prep review",
      "detail": "Clarify whether caulk, filler, paint, stain, or clear coat is included.",
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
