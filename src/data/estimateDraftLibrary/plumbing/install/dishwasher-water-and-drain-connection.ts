import type { EstimateDraftLibraryBundle } from '../../types';

export const dishwasherWaterAndDrainConnectionBundle = {
  "trade": "plumbing",
  "work_category": "install",
  "job_bundle": "dishwasher_water_and_drain_connection",
  "display_name": "Dishwasher water and drain connection",
  "aliases": [
    "dishwasher water and drain connection",
    "Dishwasher water and drain connection",
    "Connect a dishwasher to approved water and drain connections.",
    "Connect dishwasher water supply.",
    "Connect dishwasher drain line.",
    "Check connections for visible leaks.",
    "Dishwasher water supply connection",
    "Dishwasher drain connection",
    "Dishwasher connection leak test"
  ],
  "scope_summary": "Connect a dishwasher to approved water and drain connections.",
  "sections": [
    {
      "id": "dishwasher_plumbing_connection",
      "title": "Dishwasher plumbing connection",
      "description": "Connect a dishwasher to approved water and drain connections.",
      "items": [
        {
          "id": "dishwasher-water-supply-connection",
          "title": "Dishwasher water supply connection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Connect the dishwasher water supply to the approved shutoff connection.",
          "match_terms": [
            "Dishwasher water supply connection",
            "labor",
            "primary",
            "Dishwasher water and drain connection",
            "dishwasher water and drain connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm dishwasher is set in place, supply valve condition, supply line size, access, and whether appliance installation is included or excluded."
        },
        {
          "id": "dishwasher-drain-connection",
          "title": "Dishwasher drain connection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Connect the dishwasher drain line to the approved drain connection.",
          "match_terms": [
            "Dishwasher drain connection",
            "labor",
            "primary",
            "Dishwasher water and drain connection",
            "dishwasher water and drain connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code"
          ],
          "editor_note": "Confirm high loop or air gap requirements, disposal connection, knockout removal, and drain hose routing."
        },
        {
          "id": "dishwasher-connection-leak-test",
          "title": "Dishwasher connection leak test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Run a basic test cycle or fill/drain check to look for visible leaks.",
          "match_terms": [
            "Dishwasher connection leak test",
            "labor",
            "standard",
            "Dishwasher water and drain connection",
            "dishwasher water and drain connection"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Clarify whether appliance startup/programming is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Connect dishwasher water supply.",
      "text": "Connect dishwasher water supply.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Connect dishwasher drain line.",
      "text": "Connect dishwasher drain line.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Check connections for visible leaks.",
      "text": "Check connections for visible leaks.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "This scope covers plumbing connections only unless appliance installation is listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Electrical work or cabinet modification is not included unless specifically stated.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes appliance delivery, appliance leveling, electrical work, and cabinet modifications unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Customer-provided appliance must be compatible with existing space and connections.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm air gap or high loop requirements.",
      "detail": "Confirm air gap or high loop requirements.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm disposal knockout if connecting to disposal.",
      "detail": "Confirm disposal knockout if connecting to disposal.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm appliance installation responsibilities.",
      "detail": "Confirm appliance installation responsibilities.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
