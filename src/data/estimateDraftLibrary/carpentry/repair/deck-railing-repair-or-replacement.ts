import type { EstimateDraftLibraryBundle } from '../../types';

export const deckRailingRepairOrReplacementBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "deck_railing_repair_or_replacement",
  "display_name": "Deck railing repair or replacement",
  "aliases": [
    "deck railing repair or replacement",
    "Deck railing repair or replacement",
    "Repair or replace approved deck railing sections to improve safety and appearance.",
    "Railing posts, rails, balusters, and hardware",
    "Railing stability check"
  ],
  "scope_summary": "Repair or replace approved deck railing sections to improve safety and appearance.",
  "sections": [
    {
      "id": "deck_railing_repair_or_replacement_repair_scope",
      "title": "Deck railing repair or replacement",
      "description": "Repair or replace approved deck railing sections to improve safety and appearance.",
      "items": [
        {
          "id": "deck_railing_repair_or_replacement",
          "title": "Deck railing repair or replacement",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace the approved deck railing section.",
          "match_terms": [
            "Deck railing repair or replacement",
            "deck railing repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety",
            "structural",
            "manufacturer"
          ],
          "editor_note": "Confirm rail height, spacing, post condition, attachment method, guardrail requirements, local code, and whether deck framing is sound."
        },
        {
          "id": "railing_posts_rails_balusters_and_hardware",
          "title": "Railing posts, rails, balusters, and hardware",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved railing materials and hardware.",
          "match_terms": [
            "Railing posts, rails, balusters, and hardware",
            "Deck railing repair or replacement",
            "deck railing repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm wood, composite, metal, cable, glass, or matching material. Review code restrictions before using decorative rail systems."
        },
        {
          "id": "railing_stability_check",
          "title": "Railing stability check",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Check the repaired railing for basic stability after completion.",
          "match_terms": [
            "Railing stability check",
            "Deck railing repair or replacement",
            "deck railing repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "code"
          ],
          "editor_note": "Do not certify code compliance unless inspection/code review is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair or replace approved deck railing."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install railing posts, rails, balusters, and hardware."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Check railing stability after repair."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Deck railing work may be subject to local code requirements."
    },
    {
      "id": "customer_note_2",
      "text": "Underlying deck framing damage may require additional repair."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes permit fees, structural deck repair, stair repair, staining, and sealing unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "deck_railing_repair_or_replacement_review",
      "label": "Deck railing repair or replacement review",
      "detail": "Confirm rail height, spacing, post condition, attachment method, guardrail requirements, local code, and whether deck framing is sound.",
      "review_flags": [
        "code",
        "safety",
        "structural",
        "manufacturer"
      ]
    },
    {
      "id": "railing_posts_rails_balusters_and_hardware_review",
      "label": "Railing posts, rails, balusters, and hardware review",
      "detail": "Confirm wood, composite, metal, cable, glass, or matching material. Review code restrictions before using decorative rail systems.",
      "review_flags": [
        "manufacturer",
        "code"
      ]
    },
    {
      "id": "railing_stability_check_review",
      "label": "Railing stability check review",
      "detail": "Do not certify code compliance unless inspection/code review is included.",
      "review_flags": [
        "safety",
        "code"
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
