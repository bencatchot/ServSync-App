import type { EstimateDraftLibraryBundle } from '../../types';

export const sumpPumpReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "sump_pump_replacement",
  "display_name": "Sump pump replacement",
  "aliases": [
    "sump pump replacement",
    "Sump pump replacement",
    "Replace a failed or aging sump pump and verify basic pump operation.",
    "Replace existing sump pump.",
    "Replace check valve where included.",
    "Test sump pump operation after installation.",
    "Check valve replacement",
    "Sump pump test"
  ],
  "scope_summary": "Replace a failed or aging sump pump and verify basic pump operation.",
  "sections": [
    {
      "id": "sump_pump_replacement",
      "title": "Sump pump replacement",
      "description": "Replace a failed or aging sump pump and verify basic pump operation.",
      "items": [
        {
          "id": "sump-pump-replacement",
          "title": "Sump pump replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Remove the existing sump pump and install an approved replacement pump.",
          "match_terms": [
            "Sump pump replacement",
            "material",
            "primary",
            "sump pump replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional"
          ],
          "editor_note": "Confirm pit size, pump capacity, float type, discharge size, check valve condition, power source, and local discharge rules."
        },
        {
          "id": "check-valve-replacement",
          "title": "Check valve replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the sump pump check valve as part of the pump installation.",
          "match_terms": [
            "Check valve replacement",
            "material",
            "standard",
            "Sump pump replacement",
            "sump pump replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm flow direction, pipe size, and discharge condition."
        },
        {
          "id": "sump-pump-test",
          "title": "Sump pump test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Test the sump pump for basic operation after installation.",
          "match_terms": [
            "Sump pump test",
            "labor",
            "standard",
            "Sump pump replacement",
            "sump pump replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Test float activation and discharge where possible."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Replace existing sump pump.",
      "text": "Replace existing sump pump.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Replace check valve where included.",
      "text": "Replace check valve where included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Test sump pump operation after installation.",
      "text": "Test sump pump operation after installation.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Existing discharge piping problems may require additional repair.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Battery backup systems are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes electrical outlet work unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes exterior drainage correction unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm discharge routing and local rules.",
      "detail": "Confirm discharge routing and local rules.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm electrical outlet/GFCI condition.",
      "detail": "Confirm electrical outlet/GFCI condition.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm pump capacity and check valve needs.",
      "detail": "Confirm pump capacity and check valve needs.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
