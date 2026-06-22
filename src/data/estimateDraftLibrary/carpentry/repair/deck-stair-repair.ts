import type { EstimateDraftLibraryBundle } from '../../types';

export const deckStairRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "deck_stair_repair",
  "display_name": "Deck stair repair",
  "aliases": [
    "deck stair repair",
    "Deck stair repair",
    "Repair approved deck stairs, treads, risers, stringers, or stair railing components.",
    "Stair tread, riser, stringer, or hardware materials",
    "Stair safety review after repair"
  ],
  "scope_summary": "Repair approved deck stairs, treads, risers, stringers, or stair railing components.",
  "sections": [
    {
      "id": "deck_stair_repair_repair_scope",
      "title": "Deck stair repair",
      "description": "Repair approved deck stairs, treads, risers, stringers, or stair railing components.",
      "items": [
        {
          "id": "deck_stair_repair",
          "title": "Deck stair repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair the approved deck stair components.",
          "match_terms": [
            "Deck stair repair",
            "deck stair repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety",
            "structural"
          ],
          "editor_note": "Confirm tread depth, riser height, stringer condition, landing condition, rail/handrail requirements, rot, fasteners, and local code."
        },
        {
          "id": "stair_tread_riser_stringer_or_hardware_materials",
          "title": "Stair tread, riser, stringer, or hardware materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved stair repair materials and hardware.",
          "match_terms": [
            "Stair tread, riser, stringer, or hardware materials",
            "Deck stair repair",
            "deck stair repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm pressure-treated lumber, composite compatibility, connectors, fasteners, and whether full stair replacement is safer than repair."
        },
        {
          "id": "stair_safety_review_after_repair",
          "title": "Stair safety review after repair",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Check repaired stairs for basic stability after completion.",
          "match_terms": [
            "Stair safety review after repair",
            "Deck stair repair",
            "deck stair repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "code"
          ],
          "editor_note": "Document remaining concerns such as uneven risers, poor landing, loose railings, or framing movement."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair approved deck stair components."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Replace damaged treads, risers, or stringers as approved."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Check stair stability after repair."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Stair work is safety-sensitive and may require code review."
    },
    {
      "id": "customer_note_2",
      "text": "Hidden rot or framing damage may require additional work."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes full deck rebuild, permit fees, staining, sealing, and surface restoration unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "deck_stair_repair_review",
      "label": "Deck stair repair review",
      "detail": "Confirm tread depth, riser height, stringer condition, landing condition, rail/handrail requirements, rot, fasteners, and local code.",
      "review_flags": [
        "code",
        "safety",
        "structural"
      ]
    },
    {
      "id": "stair_tread_riser_stringer_or_hardware_materials_review",
      "label": "Stair tread, riser, stringer, or hardware materials review",
      "detail": "Confirm pressure-treated lumber, composite compatibility, connectors, fasteners, and whether full stair replacement is safer than repair.",
      "review_flags": [
        "manufacturer",
        "safety"
      ]
    },
    {
      "id": "stair_safety_review_after_repair_review",
      "label": "Stair safety review after repair review",
      "detail": "Document remaining concerns such as uneven risers, poor landing, loose railings, or framing movement.",
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
