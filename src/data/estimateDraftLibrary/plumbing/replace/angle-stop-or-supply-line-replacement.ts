import type { EstimateDraftLibraryBundle } from '../../types';

export const angleStopOrSupplyLineReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "angle_stop_or_supply_line_replacement",
  "display_name": "Angle stop or supply line replacement",
  "aliases": [
    "angle stop or supply line replacement",
    "Angle stop or supply line replacement",
    "Replace leaking, stuck, or outdated fixture shutoff valves and supply lines.",
    "Replace fixture shutoff valve.",
    "Replace fixture supply line.",
    "Check for visible leaks after water is restored.",
    "Angle stop replacement",
    "Fixture supply line replacement",
    "Fixture water test"
  ],
  "scope_summary": "Replace leaking, stuck, or outdated fixture shutoff valves and supply lines.",
  "sections": [
    {
      "id": "fixture_shutoff_and_supply_replacement",
      "title": "Fixture shutoff and supply replacement",
      "description": "Replace leaking, stuck, or outdated fixture shutoff valves and supply lines.",
      "items": [
        {
          "id": "angle-stop-replacement",
          "title": "Angle stop replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the fixture shutoff valve at the approved location.",
          "match_terms": [
            "Angle stop replacement",
            "material",
            "primary",
            "Angle stop or supply line replacement",
            "angle stop or supply line replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm pipe material, valve type, compression/sweat/threaded connection, access, corrosion, and whether water must be shut off to the home."
        },
        {
          "id": "fixture-supply-line-replacement",
          "title": "Fixture supply line replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the flexible supply line connected to the fixture.",
          "match_terms": [
            "Fixture supply line replacement",
            "material",
            "standard",
            "Angle stop or supply line replacement",
            "angle stop or supply line replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm length, connection size, fixture type, and whether braided stainless or other approved supply is preferred."
        },
        {
          "id": "fixture-water-test",
          "title": "Fixture water test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Turn water back on and check for visible leaks.",
          "match_terms": [
            "Fixture water test",
            "labor",
            "standard",
            "Angle stop or supply line replacement",
            "angle stop or supply line replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Verify valve operation and customer understands shutoff location."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Replace fixture shutoff valve.",
      "text": "Replace fixture shutoff valve.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Replace fixture supply line.",
      "text": "Replace fixture supply line.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Check for visible leaks after water is restored.",
      "text": "Check for visible leaks after water is restored.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Old or corroded piping may require additional repair.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Water service may need to be temporarily shut off during the work.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes hidden piping repairs unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Additional work may be needed if existing pipe or fittings are brittle, corroded, or damaged.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm pipe material before estimating.",
      "detail": "Confirm pipe material before estimating.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Assess corrosion and breakage risk.",
      "detail": "Assess corrosion and breakage risk.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm main shutoff works before starting.",
      "detail": "Confirm main shutoff works before starting.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
