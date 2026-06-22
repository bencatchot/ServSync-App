import type { EstimateDraftLibraryBundle } from '../../types';

export const waterHeaterRepairOrComponentReplacementBundle = {
  "trade": "plumbing",
  "work_category": "repair",
  "job_bundle": "water_heater_repair_or_component_replacement",
  "display_name": "Water heater repair or component replacement",
  "aliases": [
    "water heater repair or component replacement",
    "Water heater repair or component replacement",
    "Repair an existing water heater by replacing approved serviceable components.",
    "Repair existing water heater where serviceable.",
    "Replace approved failed component.",
    "Test for visible leaks after repair.",
    "Water heater diagnostic and repair",
    "Replace approved water heater component",
    "Leak and operation test"
  ],
  "scope_summary": "Repair an existing water heater by replacing approved serviceable components.",
  "sections": [
    {
      "id": "water_heater_repair",
      "title": "Water heater repair",
      "description": "Repair an existing water heater by replacing approved serviceable components.",
      "items": [
        {
          "id": "water-heater-diagnostic-and-repair",
          "title": "Water heater diagnostic and repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Diagnose and repair the approved water heater issue.",
          "match_terms": [
            "Water heater diagnostic and repair",
            "labor",
            "primary",
            "Water heater repair or component replacement",
            "water heater repair or component replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "gas",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm tank condition, fuel type, warranty status, electrical/gas requirements, venting, leak source, and whether replacement is safer than repair."
        },
        {
          "id": "replace-approved-water-heater-component",
          "title": "Replace approved water heater component",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the approved water heater component needed for the repair.",
          "match_terms": [
            "Replace approved water heater component",
            "material",
            "conditional",
            "Water heater repair or component replacement",
            "water heater repair or component replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Examples may include T&P valve, supply connector, drain valve, element, thermostat, expansion tank, or other serviceable parts. Contractor must confirm compatibility."
        },
        {
          "id": "leak-and-operation-test",
          "title": "Leak and operation test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Test for visible leaks and basic water heater operation after the repair.",
          "match_terms": [
            "Leak and operation test",
            "labor",
            "standard",
            "Water heater repair or component replacement",
            "water heater repair or component replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Do not guarantee tank life after component repair on an aging or corroded tank."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Repair existing water heater where serviceable.",
      "text": "Repair existing water heater where serviceable.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Replace approved failed component.",
      "text": "Replace approved failed component.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Test for visible leaks after repair.",
      "text": "Test for visible leaks after repair.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "If the tank itself is leaking or severely corroded, replacement may be recommended instead of repair.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Gas, venting, electrical, or code issues may require additional work.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes full water heater replacement unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes permit or code upgrades unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm whether repair is appropriate based on ag...",
      "detail": "Confirm whether repair is appropriate based on age and tank condition.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm fuel type and safety requirements.",
      "detail": "Confirm fuel type and safety requirements.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Review T&P valve, expansion tank, venting, and sh...",
      "detail": "Review T&P valve, expansion tank, venting, and shutoff condition.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
