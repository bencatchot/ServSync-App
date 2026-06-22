import type { EstimateDraftLibraryBundle } from '../../types';

export const screenDoorOrStormDoorInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "screen_door_or_storm_door_installation",
  "display_name": "Screen door or storm door installation",
  "aliases": [
    "screen door or storm door installation",
    "Screen door or storm door installation",
    "Install or replace a screen door or storm door at an approved opening.",
    "Door hardware and closer setup",
    "Door operation test"
  ],
  "scope_summary": "Install or replace a screen door or storm door at an approved opening.",
  "sections": [
    {
      "id": "screen_door_or_storm_door_installation_installation_scope",
      "title": "Screen door or storm door installation",
      "description": "Install or replace a screen door or storm door at an approved opening.",
      "items": [
        {
          "id": "screen_door_or_storm_door_installation",
          "title": "Screen door or storm door installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install the approved screen door or storm door.",
          "match_terms": [
            "Screen door or storm door installation",
            "screen door or storm door installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm opening size, hinge side, handle side, door swing, closer location, jamb condition, threshold condition, and manufacturer requirements."
        },
        {
          "id": "door_hardware_and_closer_setup",
          "title": "Door hardware and closer setup",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install and adjust included door hardware and closer.",
          "match_terms": [
            "Door hardware and closer setup",
            "Screen door or storm door installation",
            "screen door or storm door installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm handle height, latch alignment, closer pressure, wind chain, and customer-selected hardware finish."
        },
        {
          "id": "door_operation_test",
          "title": "Door operation test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Test the installed door for basic operation.",
          "match_terms": [
            "Door operation test",
            "Screen door or storm door installation",
            "screen door or storm door installation"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Check swing, latch, closer, reveal, and clearance."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install approved screen door or storm door."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install door hardware and closer."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Adjust door for basic operation."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Existing jamb damage may require additional repair."
    },
    {
      "id": "customer_note_2",
      "text": "Painting, staining, or exterior trim repair is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes door opening repair, exterior trim repair, paint, and stain unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "screen_door_or_storm_door_installation_review",
      "label": "Screen door or storm door installation review",
      "detail": "Confirm opening size, hinge side, handle side, door swing, closer location, jamb condition, threshold condition, and manufacturer requirements.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "door_hardware_and_closer_setup_review",
      "label": "Door hardware and closer setup review",
      "detail": "Confirm handle height, latch alignment, closer pressure, wind chain, and customer-selected hardware finish.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "door_operation_test_review",
      "label": "Door operation test review",
      "detail": "Check swing, latch, closer, reveal, and clearance.",
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
