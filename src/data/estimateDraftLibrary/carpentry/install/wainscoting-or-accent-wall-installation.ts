import type { EstimateDraftLibraryBundle } from '../../types';

export const wainscotingOrAccentWallInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "wainscoting_or_accent_wall_installation",
  "display_name": "Wainscoting or accent wall installation",
  "aliases": [
    "wainscoting or accent wall installation",
    "Wainscoting or accent wall installation",
    "Install decorative wall trim, paneling, board and batten, beadboard, or wainscoting.",
    "Wainscoting or accent wall layout and installation",
    "Trim, panel, or board material",
    "Caulk and finish-ready prep"
  ],
  "scope_summary": "Install decorative wall trim, paneling, board and batten, beadboard, or wainscoting.",
  "sections": [
    {
      "id": "wainscoting_or_accent_wall_installation_installation_scope",
      "title": "Wainscoting or accent wall installation",
      "description": "Install decorative wall trim, paneling, board and batten, beadboard, or wainscoting.",
      "items": [
        {
          "id": "wainscoting_or_accent_wall_layout_and_installation",
          "title": "Wainscoting or accent wall layout and installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install the approved decorative wall treatment in the selected area.",
          "match_terms": [
            "Wainscoting or accent wall layout and installation",
            "Wainscoting or accent wall installation",
            "wainscoting or accent wall installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm design, wall dimensions, trim spacing, outlet/switch conflicts, wall condition, material type, and finish scope."
        },
        {
          "id": "trim_panel_or_board_material",
          "title": "Trim, panel, or board material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide the approved trim, panel, or board material.",
          "match_terms": [
            "Trim, panel, or board material",
            "Wainscoting or accent wall installation",
            "wainscoting or accent wall installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm MDF, wood, PVC, beadboard, paneling, or custom profile."
        },
        {
          "id": "caulk_and_finish_ready_prep",
          "title": "Caulk and finish-ready prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Prepare the installed wall treatment for paint or stain.",
          "match_terms": [
            "Caulk and finish-ready prep",
            "Wainscoting or accent wall installation",
            "wainscoting or accent wall installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify paint/stain responsibility and whether wall skim/repair is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install board and batten, beadboard, paneling, or wainscoting."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Lay out decorative wall trim pattern."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Prepare installed trim for finish."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Painting or staining is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Outlet relocation or electrical work is not included."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes electrical work, drywall repair, paint, and stain unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "wainscoting_or_accent_wall_layout_and_installation_review",
      "label": "Wainscoting or accent wall layout and installation review",
      "detail": "Confirm design, wall dimensions, trim spacing, outlet/switch conflicts, wall condition, material type, and finish scope.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "trim_panel_or_board_material_review",
      "label": "Trim, panel, or board material review",
      "detail": "Confirm MDF, wood, PVC, beadboard, paneling, or custom profile.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "caulk_and_finish_ready_prep_review",
      "label": "Caulk and finish-ready prep review",
      "detail": "Clarify paint/stain responsibility and whether wall skim/repair is included.",
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
