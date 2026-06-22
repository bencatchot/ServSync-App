import type { EstimateDraftLibraryBundle } from '../../types';

export const fencePanelOrPostRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "fence_panel_or_post_repair",
  "display_name": "Fence panel or post repair",
  "aliases": [
    "fence panel or post repair",
    "Fence panel or post repair",
    "Repair damaged fence panels, rails, pickets, or posts.",
    "Fence boards, rails, posts, and fasteners",
    "Post setting or reset"
  ],
  "scope_summary": "Repair damaged fence panels, rails, pickets, or posts.",
  "sections": [
    {
      "id": "fence_panel_or_post_repair_repair_scope",
      "title": "Fence panel or post repair",
      "description": "Repair damaged fence panels, rails, pickets, or posts.",
      "items": [
        {
          "id": "fence_panel_or_post_repair",
          "title": "Fence panel or post repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair approved damaged fence panels, rails, pickets, or posts.",
          "match_terms": [
            "Fence panel or post repair",
            "fence panel or post repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm fence type, property line concerns, post condition, concrete footing, gate interaction, HOA requirements, and material match."
        },
        {
          "id": "fence_boards_rails_posts_and_fasteners",
          "title": "Fence boards, rails, posts, and fasteners",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved fence repair materials and fasteners.",
          "match_terms": [
            "Fence boards, rails, posts, and fasteners",
            "Fence panel or post repair",
            "fence panel or post repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm pressure-treated lumber, cedar, pine, composite, picket style, fastener type, and finish scope."
        },
        {
          "id": "post_setting_or_reset",
          "title": "Post setting or reset",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Reset or replace fence posts where included.",
          "match_terms": [
            "Post setting or reset",
            "Fence panel or post repair",
            "fence panel or post repair"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Confirm underground utilities, digging depth, concrete needs, soil condition, and property line responsibility."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair approved fence panel or post."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Replace damaged pickets, rails, or posts."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Reset fence post where included."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Property line, HOA, or utility locate requirements may affect the work."
    },
    {
      "id": "customer_note_2",
      "text": "Staining or sealing is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes surveying, utility locate fees, HOA approval, staining, sealing, and full fence replacement unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "fence_panel_or_post_repair_review",
      "label": "Fence panel or post repair review",
      "detail": "Confirm fence type, property line concerns, post condition, concrete footing, gate interaction, HOA requirements, and material match.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "fence_boards_rails_posts_and_fasteners_review",
      "label": "Fence boards, rails, posts, and fasteners review",
      "detail": "Confirm pressure-treated lumber, cedar, pine, composite, picket style, fastener type, and finish scope.",
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "post_setting_or_reset_review",
      "label": "Post setting or reset review",
      "detail": "Confirm underground utilities, digging depth, concrete needs, soil condition, and property line responsibility.",
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
