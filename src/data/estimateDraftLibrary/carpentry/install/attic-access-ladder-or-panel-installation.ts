import type { EstimateDraftLibraryBundle } from '../../types';

export const atticAccessLadderOrPanelInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "attic_access_ladder_or_panel_installation",
  "display_name": "Attic access ladder or panel installation",
  "aliases": [
    "attic access ladder or panel installation",
    "Attic access ladder or panel installation",
    "Install or replace an attic access panel or pull-down attic ladder.",
    "Attic ladder or access material",
    "Trim and finish-ready prep"
  ],
  "scope_summary": "Install or replace an attic access panel or pull-down attic ladder.",
  "sections": [
    {
      "id": "attic_access_ladder_or_panel_installation_installation_scope",
      "title": "Attic access ladder or panel installation",
      "description": "Install or replace an attic access panel or pull-down attic ladder.",
      "items": [
        {
          "id": "attic_access_ladder_or_panel_installation",
          "title": "Attic access ladder or panel installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install or replace the approved attic access ladder or panel.",
          "match_terms": [
            "Attic access ladder or panel installation",
            "attic access ladder or panel installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural",
            "safety"
          ],
          "editor_note": "Confirm opening size, ceiling framing, ladder rating, swing clearance, attic clearance, trim, insulation, and whether framing modification is needed."
        },
        {
          "id": "attic_ladder_or_access_material",
          "title": "Attic ladder or access material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved attic ladder, access panel, trim, and hardware.",
          "match_terms": [
            "Attic ladder or access material",
            "Attic access ladder or panel installation",
            "attic access ladder or panel installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm customer-selected model, load rating, ceiling height, rough opening, fire rating if applicable, and trim finish."
        },
        {
          "id": "trim_and_finish_ready_prep",
          "title": "Trim and finish-ready prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install trim around the access opening and prepare for finish.",
          "match_terms": [
            "Trim and finish-ready prep",
            "Attic access ladder or panel installation",
            "attic access ladder or panel installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether drywall repair, paint, or insulation sealing is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install approved attic ladder or access panel."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install trim around attic access opening."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Check ladder operation after installation."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Ceiling framing conditions may affect the final scope."
    },
    {
      "id": "customer_note_2",
      "text": "Drywall repair, insulation, and painting are not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes electrical relocation, HVAC relocation, drywall repair, insulation work, and paint unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "attic_access_ladder_or_panel_installation_review",
      "label": "Attic access ladder or panel installation review",
      "detail": "Confirm opening size, ceiling framing, ladder rating, swing clearance, attic clearance, trim, insulation, and whether framing modification is needed.",
      "review_flags": [
        "manufacturer",
        "structural",
        "safety"
      ]
    },
    {
      "id": "attic_ladder_or_access_material_review",
      "label": "Attic ladder or access material review",
      "detail": "Confirm customer-selected model, load rating, ceiling height, rough opening, fire rating if applicable, and trim finish.",
      "review_flags": [
        "manufacturer",
        "code"
      ]
    },
    {
      "id": "trim_and_finish_ready_prep_review",
      "label": "Trim and finish-ready prep review",
      "detail": "Clarify whether drywall repair, paint, or insulation sealing is included.",
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
