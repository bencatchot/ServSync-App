import type { EstimateDraftLibraryBundle } from '../../types';

export const showerValveOrTubShowerTrimReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "shower_valve_or_tub_shower_trim_replacement",
  "display_name": "Shower valve or tub/shower trim replacement",
  "aliases": [
    "shower valve or tub shower trim replacement",
    "Shower valve or tub/shower trim replacement",
    "Replace a shower valve, cartridge, or tub/shower trim to correct operation or update the fixture.",
    "Replace shower cartridge or trim.",
    "Replace tub/shower valve where required and accessible.",
    "Test fixture operation after completion.",
    "Shower cartridge or trim replacement",
    "Shower valve replacement",
    "Water test after repair"
  ],
  "scope_summary": "Replace a shower valve, cartridge, or tub/shower trim to correct operation or update the fixture.",
  "sections": [
    {
      "id": "tub_shower_fixture_work",
      "title": "Tub/shower fixture work",
      "description": "Replace a shower valve, cartridge, or tub/shower trim to correct operation or update the fixture.",
      "items": [
        {
          "id": "shower-cartridge-or-trim-replacement",
          "title": "Shower cartridge or trim replacement",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the approved shower cartridge, handle, trim, or tub/shower control parts.",
          "match_terms": [
            "Shower cartridge or trim replacement",
            "labor",
            "primary",
            "Shower valve or tub/shower trim replacement",
            "shower valve or tub shower trim replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm brand, valve type, cartridge availability, access, finish, and whether the valve body is serviceable."
        },
        {
          "id": "shower-valve-replacement",
          "title": "Shower valve replacement",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the shower valve if the existing valve cannot be properly repaired.",
          "match_terms": [
            "Shower valve replacement",
            "labor",
            "conditional",
            "Shower valve or tub/shower trim replacement",
            "shower valve or tub shower trim replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "permit",
            "safety"
          ],
          "editor_note": "Confirm wall access, tile/surround risk, pressure balancing requirements, permit/code requirements, and finish repair exclusions."
        },
        {
          "id": "water-test-after-repair",
          "title": "Water test after repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Test the shower or tub/shower fixture after completion.",
          "match_terms": [
            "Water test after repair",
            "labor",
            "standard",
            "Shower valve or tub/shower trim replacement",
            "shower valve or tub shower trim replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Check hot/cold orientation, leaks, temperature control, diverter operation, and trim seal."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Replace shower cartridge or trim.",
      "text": "Replace shower cartridge or trim.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Replace tub/shower valve where required and acces...",
      "text": "Replace tub/shower valve where required and accessible.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Test fixture operation after completion.",
      "text": "Test fixture operation after completion.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Wall, tile, or surround repairs are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Older valves may require additional work if parts are unavailable or the valve body is damaged.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes tile, drywall, paint, and finish repairs unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Customer-selected trim finish must be confirmed before installation.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm valve brand and part availability.",
      "detail": "Confirm valve brand and part availability.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm access and surface damage risk.",
      "detail": "Confirm access and surface damage risk.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Review pressure-balance or anti-scald requirements.",
      "detail": "Review pressure-balance or anti-scald requirements.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
