import type { EstimateDraftLibraryBundle } from '../../types';

export const mantelOrFireplaceSurroundInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "mantel_or_fireplace_surround_installation",
  "display_name": "Mantel or fireplace surround installation",
  "aliases": [
    "mantel or fireplace surround installation",
    "Mantel or fireplace surround installation",
    "Install a wood mantel, surround, or decorative fireplace trim feature.",
    "Mantel, surround, trim, and mounting materials",
    "Finish-ready prep"
  ],
  "scope_summary": "Install a wood mantel, surround, or decorative fireplace trim feature.",
  "sections": [
    {
      "id": "mantel_or_fireplace_surround_installation_installation_scope",
      "title": "Mantel or fireplace surround installation",
      "description": "Install a wood mantel, surround, or decorative fireplace trim feature.",
      "items": [
        {
          "id": "mantel_or_fireplace_surround_installation",
          "title": "Mantel or fireplace surround installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install the approved mantel or fireplace surround.",
          "match_terms": [
            "Mantel or fireplace surround installation",
            "mantel or fireplace surround installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer"
          ],
          "editor_note": "Confirm wall material, anchoring, fireplace type, clearance requirements, mantel dimensions, finish, and customer-approved layout."
        },
        {
          "id": "mantel_surround_trim_and_mounting_materials",
          "title": "Mantel, surround, trim, and mounting materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved mantel, surround, trim, and mounting materials.",
          "match_terms": [
            "Mantel, surround, trim, and mounting materials",
            "Mantel or fireplace surround installation",
            "mantel or fireplace surround installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm combustible material clearances, manufacturer fireplace instructions, and anchoring method."
        },
        {
          "id": "finish_ready_prep",
          "title": "Finish-ready prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Prepare the installed mantel or surround for finish.",
          "match_terms": [
            "Finish-ready prep",
            "Mantel or fireplace surround installation",
            "mantel or fireplace surround installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether paint, stain, or clear coat is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install approved fireplace mantel or surround."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Anchor mantel or surround to approved surface."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Prepare installed feature for finish."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Fireplace clearance requirements must be reviewed before installation."
    },
    {
      "id": "customer_note_2",
      "text": "Painting, staining, stonework, tile, and electrical work are not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes fireplace service, gas work, electrical work, tile, stone, paint, and stain unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "mantel_or_fireplace_surround_installation_review",
      "label": "Mantel or fireplace surround installation review",
      "detail": "Confirm wall material, anchoring, fireplace type, clearance requirements, mantel dimensions, finish, and customer-approved layout.",
      "review_flags": [
        "code",
        "manufacturer"
      ]
    },
    {
      "id": "mantel_surround_trim_and_mounting_materials_review",
      "label": "Mantel, surround, trim, and mounting materials review",
      "detail": "Confirm combustible material clearances, manufacturer fireplace instructions, and anchoring method.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "finish_ready_prep_review",
      "label": "Finish-ready prep review",
      "detail": "Clarify whether paint, stain, or clear coat is included.",
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
