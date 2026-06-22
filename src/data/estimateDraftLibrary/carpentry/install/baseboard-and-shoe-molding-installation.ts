import type { EstimateDraftLibraryBundle } from '../../types';

export const baseboardAndShoeMoldingInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "baseboard_and_shoe_molding_installation",
  "display_name": "Baseboard and shoe molding installation",
  "aliases": [
    "baseboard and shoe molding installation",
    "Baseboard and shoe molding installation",
    "Install baseboard or shoe molding to finish the lower wall and floor transition.",
    "Baseboard installation",
    "Shoe molding or quarter round installation",
    "Nail fill and caulk prep"
  ],
  "scope_summary": "Install baseboard or shoe molding to finish the lower wall and floor transition.",
  "sections": [
    {
      "id": "baseboard_and_shoe_molding_installation_installation_scope",
      "title": "Baseboard and shoe molding installation",
      "description": "Install baseboard or shoe molding to finish the lower wall and floor transition.",
      "items": [
        {
          "id": "baseboard_installation",
          "title": "Baseboard installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install approved baseboard trim in the selected area.",
          "match_terms": [
            "Baseboard installation",
            "Baseboard and shoe molding installation",
            "baseboard and shoe molding installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm linear footage, trim height/profile, inside/outside corners, wall condition, flooring condition, and paint/stain scope."
        },
        {
          "id": "shoe_molding_or_quarter_round_installation",
          "title": "Shoe molding or quarter round installation",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install shoe molding or quarter round where needed at the floor edge.",
          "match_terms": [
            "Shoe molding or quarter round installation",
            "Baseboard and shoe molding installation",
            "baseboard and shoe molding installation"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Confirm flooring gaps, cabinet toe kicks, transitions, and customer preference."
        },
        {
          "id": "nail_fill_and_caulk_prep",
          "title": "Nail fill and caulk prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Fill nail holes and caulk trim joints where included.",
          "match_terms": [
            "Nail fill and caulk prep",
            "Baseboard and shoe molding installation",
            "baseboard and shoe molding installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether finish paint or stain is included or excluded."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install baseboard trim."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install shoe molding where needed."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Prepare trim for paint or stain."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Painting or staining is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Uneven floors or walls may affect final trim fit."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes flooring repair, drywall repair, paint, and stain unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "baseboard_installation_review",
      "label": "Baseboard installation review",
      "detail": "Confirm linear footage, trim height/profile, inside/outside corners, wall condition, flooring condition, and paint/stain scope.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "shoe_molding_or_quarter_round_installation_review",
      "label": "Shoe molding or quarter round installation review",
      "detail": "Confirm flooring gaps, cabinet toe kicks, transitions, and customer preference.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "nail_fill_and_caulk_prep_review",
      "label": "Nail fill and caulk prep review",
      "detail": "Clarify whether finish paint or stain is included or excluded.",
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
