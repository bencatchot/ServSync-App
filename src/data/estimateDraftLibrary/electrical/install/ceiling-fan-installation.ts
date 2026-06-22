import type { EstimateDraftLibraryBundle } from '../../types';

export const ceilingFanInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "ceiling_fan_installation",
  "display_name": "Ceiling Fan Installation",
  "aliases": [
    "install ceiling fan",
    "replace ceiling light with fan",
    "ceiling fan with light",
    "fan install",
    "customer supplied ceiling fan",
    "bedroom fan install",
    "porch fan install"
  ],
  "scope_summary": "Install a ceiling fan at an existing approved ceiling box location or replace an existing ceiling fan where suitable.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Standard ceiling fan installation tasks.",
      "items": [
        {
          "id": "remove_existing_fixture_or_fan",
          "title": "Remove existing light fixture or ceiling fan",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove the existing light fixture or ceiling fan at the approved location.",
          "match_terms": [
            "remove light fixture",
            "remove old fan",
            "replace light with fan"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "structural"
          ],
          "editor_note": "Confirm existing box support after removal."
        },
        {
          "id": "install_ceiling_fan",
          "title": "Install ceiling fan",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the ceiling fan at the approved ceiling location.",
          "match_terms": [
            "install ceiling fan",
            "mount fan",
            "ceiling fan installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "structural",
            "manufacturer",
            "licensing"
          ],
          "editor_note": "Fan-rated support must be confirmed."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "existing_box_installation",
      "label": "Existing ceiling location",
      "text": "Install the ceiling fan at the existing approved ceiling location using existing wiring where suitable.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety",
        "structural"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "fan_box_note",
      "text": "Additional ceiling box, support, switch, or wiring work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "structural",
        "code"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "fan_support_terms",
      "text": "Final installation depends on suitable ceiling support, wiring, controls, and product compatibility.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "structural",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_box_rating",
      "label": "Confirm fan-rated support",
      "detail": "Verify ceiling box, brace, mounting support, ceiling height, and fan weight requirements.",
      "review_flags": [
        "electrical",
        "structural",
        "code",
        "safety",
        "manufacturer"
      ]
    }
  ],
  "excluded_items": [
    "New circuit wiring unless listed",
    "New switch wiring unless listed",
    "Ceiling box replacement unless listed",
    "Ceiling repair",
    "Paint or finish work",
    "Attic access repair",
    "Structural framing repair"
  ]
} satisfies EstimateDraftLibraryBundle;
