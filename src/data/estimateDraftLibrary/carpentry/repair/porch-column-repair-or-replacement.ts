import type { EstimateDraftLibraryBundle } from '../../types';

export const porchColumnRepairOrReplacementBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "porch_column_repair_or_replacement",
  "display_name": "Porch column repair or replacement",
  "aliases": [
    "porch column repair or replacement",
    "Porch column repair or replacement",
    "Repair or replace an approved porch column or post.",
    "Column, post, base, or trim materials",
    "Exterior sealing and finish-ready prep"
  ],
  "scope_summary": "Repair or replace an approved porch column or post.",
  "sections": [
    {
      "id": "porch_column_repair_or_replacement_repair_scope",
      "title": "Porch column repair or replacement",
      "description": "Repair or replace an approved porch column or post.",
      "items": [
        {
          "id": "porch_column_repair_or_replacement",
          "title": "Porch column repair or replacement",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace the approved porch column or post.",
          "match_terms": [
            "Porch column repair or replacement",
            "porch column repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "permit"
          ],
          "editor_note": "Confirm whether column is decorative or load-bearing, rot extent, temporary support needs, footing/base condition, roof load, and permit/code requirements."
        },
        {
          "id": "column_post_base_or_trim_materials",
          "title": "Column, post, base, or trim materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved column, post, base, or trim materials.",
          "match_terms": [
            "Column, post, base, or trim materials",
            "Porch column repair or replacement",
            "porch column repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm wood, fiberglass, PVC wrap, pressure-treated post, base hardware, and exterior-rated materials."
        },
        {
          "id": "exterior_sealing_and_finish_ready_prep",
          "title": "Exterior sealing and finish-ready prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Seal and prepare the repaired column area for finish.",
          "match_terms": [
            "Exterior sealing and finish-ready prep",
            "Porch column repair or replacement",
            "porch column repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "manufacturer"
          ],
          "editor_note": "Clarify whether painting/staining is included. Review water-shedding details at base and cap."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair or replace approved porch column."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install approved post, base, wrap, or trim material."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Seal exterior column area for finish."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Load-bearing columns require contractor review before work begins."
    },
    {
      "id": "customer_note_2",
      "text": "Hidden rot, roof movement, or footing issues may require additional repair."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes engineering, permit fees, roofing repair, structural framing repair, paint, and stain unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "porch_column_repair_or_replacement_review",
      "label": "Porch column repair or replacement review",
      "detail": "Confirm whether column is decorative or load-bearing, rot extent, temporary support needs, footing/base condition, roof load, and permit/code requirements.",
      "review_flags": [
        "structural",
        "safety",
        "permit"
      ]
    },
    {
      "id": "column_post_base_or_trim_materials_review",
      "label": "Column, post, base, or trim materials review",
      "detail": "Confirm wood, fiberglass, PVC wrap, pressure-treated post, base hardware, and exterior-rated materials.",
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "exterior_sealing_and_finish_ready_prep_review",
      "label": "Exterior sealing and finish-ready prep review",
      "detail": "Clarify whether painting/staining is included. Review water-shedding details at base and cap.",
      "review_flags": [
        "regional",
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
