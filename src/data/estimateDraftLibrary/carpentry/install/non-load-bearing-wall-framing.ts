import type { EstimateDraftLibraryBundle } from '../../types';

export const nonLoadBearingWallFramingBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "non_load_bearing_wall_framing",
  "display_name": "Non-load-bearing wall framing",
  "aliases": [
    "non load bearing wall framing",
    "Non-load-bearing wall framing",
    "Frame a non-load-bearing interior wall or partition in an approved area.",
    "Framing lumber and fasteners",
    "Opening framing for door or passage"
  ],
  "scope_summary": "Frame a non-load-bearing interior wall or partition in an approved area.",
  "sections": [
    {
      "id": "non_load_bearing_wall_framing_installation_scope",
      "title": "Non-load-bearing wall framing",
      "description": "Frame a non-load-bearing interior wall or partition in an approved area.",
      "items": [
        {
          "id": "non_load_bearing_wall_framing",
          "title": "Non-load-bearing wall framing",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Frame the approved non-load-bearing wall or partition.",
          "match_terms": [
            "Non-load-bearing wall framing",
            "non load bearing wall framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "permit",
            "code"
          ],
          "editor_note": "Confirm wall is non-load-bearing, layout, ceiling/floor attachment, fire blocking, door openings, electrical/plumbing needs, permit requirements, and finish exclusions."
        },
        {
          "id": "framing_lumber_and_fasteners",
          "title": "Framing lumber and fasteners",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved framing lumber and fasteners.",
          "match_terms": [
            "Framing lumber and fasteners",
            "Non-load-bearing wall framing",
            "non load bearing wall framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm stud size, treated bottom plate needs, anchors, blocking, and opening requirements."
        },
        {
          "id": "opening_framing_for_door_or_passage",
          "title": "Opening framing for door or passage",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Frame approved door or passage openings where included.",
          "match_terms": [
            "Opening framing for door or passage",
            "Non-load-bearing wall framing",
            "non load bearing wall framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm rough opening size, door type, header needs, and whether door installation is included separately."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Frame approved non-load-bearing partition wall."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install framing lumber and blocking."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Frame door or passage opening where included."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "This recipe is only for non-load-bearing framing."
    },
    {
      "id": "customer_note_2",
      "text": "Drywall, insulation, electrical, HVAC, plumbing, paint, and flooring are not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes engineering, structural modification, drywall, insulation, electrical, plumbing, HVAC, flooring, paint, and permit fees unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "non_load_bearing_wall_framing_review",
      "label": "Non-load-bearing wall framing review",
      "detail": "Confirm wall is non-load-bearing, layout, ceiling/floor attachment, fire blocking, door openings, electrical/plumbing needs, permit requirements, and finish exclusions.",
      "review_flags": [
        "structural",
        "permit",
        "code"
      ]
    },
    {
      "id": "framing_lumber_and_fasteners_review",
      "label": "Framing lumber and fasteners review",
      "detail": "Confirm stud size, treated bottom plate needs, anchors, blocking, and opening requirements.",
      "review_flags": [
        "manufacturer",
        "code"
      ]
    },
    {
      "id": "opening_framing_for_door_or_passage_review",
      "label": "Opening framing for door or passage review",
      "detail": "Confirm rough opening size, door type, header needs, and whether door installation is included separately.",
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
