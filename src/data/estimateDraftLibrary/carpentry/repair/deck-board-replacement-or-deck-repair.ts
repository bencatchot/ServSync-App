import type { EstimateDraftLibraryBundle } from '../../types';

export const deckBoardReplacementOrDeckRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "deck_board_replacement_or_deck_repair",
  "display_name": "Deck board replacement or deck repair",
  "aliases": [
    "deck board replacement or deck repair",
    "Deck board replacement or deck repair",
    "Replace damaged deck boards and perform approved minor deck surface repairs.",
    "Deck board replacement",
    "Deck board material and fasteners",
    "Deck safety check during repair"
  ],
  "scope_summary": "Replace damaged deck boards and perform approved minor deck surface repairs.",
  "sections": [
    {
      "id": "deck_board_replacement_or_deck_repair_repair_scope",
      "title": "Deck board replacement or deck repair",
      "description": "Replace damaged deck boards and perform approved minor deck surface repairs.",
      "items": [
        {
          "id": "deck_board_replacement",
          "title": "Deck board replacement",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove and replace approved damaged deck boards.",
          "match_terms": [
            "Deck board replacement",
            "Deck board replacement or deck repair",
            "deck board replacement or deck repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "structural",
            "safety"
          ],
          "editor_note": "Confirm board size, material, fastener type, joist condition, rot, spacing, coating, and whether structural framing repair is needed."
        },
        {
          "id": "deck_board_material_and_fasteners",
          "title": "Deck board material and fasteners",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved deck boards and fasteners for the repair.",
          "match_terms": [
            "Deck board material and fasteners",
            "Deck board replacement or deck repair",
            "deck board replacement or deck repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Confirm pressure-treated wood, composite, matching profile, hidden fasteners, stainless/coated fasteners, and color match limitations."
        },
        {
          "id": "deck_safety_check_during_repair",
          "title": "Deck safety check during repair",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Check the repaired deck area for visible safety concerns.",
          "match_terms": [
            "Deck safety check during repair",
            "Deck board replacement or deck repair",
            "deck board replacement or deck repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "structural"
          ],
          "editor_note": "Document loose framing, rot, ledger concerns, railing issues, or stair concerns as separate recommendations."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Replace approved damaged deck boards."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install matching or approved deck material."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Check repaired area for visible safety concerns."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Hidden rot or structural damage may require additional repair."
    },
    {
      "id": "customer_note_2",
      "text": "Staining, sealing, or full deck refinishing is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes structural framing repair, railing repair, stairs, staining, sealing, and permit fees unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "deck_board_replacement_review",
      "label": "Deck board replacement review",
      "detail": "Confirm board size, material, fastener type, joist condition, rot, spacing, coating, and whether structural framing repair is needed.",
      "review_flags": [
        "regional",
        "structural",
        "safety"
      ]
    },
    {
      "id": "deck_board_material_and_fasteners_review",
      "label": "Deck board material and fasteners review",
      "detail": "Confirm pressure-treated wood, composite, matching profile, hidden fasteners, stainless/coated fasteners, and color match limitations.",
      "review_flags": [
        "manufacturer",
        "regional"
      ]
    },
    {
      "id": "deck_safety_check_during_repair_review",
      "label": "Deck safety check during repair review",
      "detail": "Document loose framing, rot, ledger concerns, railing issues, or stair concerns as separate recommendations.",
      "review_flags": [
        "safety",
        "structural"
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
