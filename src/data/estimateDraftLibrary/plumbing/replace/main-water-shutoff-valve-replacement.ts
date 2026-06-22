import type { EstimateDraftLibraryBundle } from '../../types';

export const mainWaterShutoffValveReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "main_water_shutoff_valve_replacement",
  "display_name": "Main water shutoff valve replacement",
  "aliases": [
    "main water shutoff valve replacement",
    "Main water shutoff valve replacement",
    "Replace the main water shutoff valve to improve control of the home’s water supply.",
    "Replace main water shutoff valve.",
    "Coordinate water shutoff as needed.",
    "Test valve and nearby piping after installation.",
    "Water service shutdown and restore",
    "Pressure and leak check"
  ],
  "scope_summary": "Replace the main water shutoff valve to improve control of the home’s water supply.",
  "sections": [
    {
      "id": "main_shutoff_replacement",
      "title": "Main shutoff replacement",
      "description": "Replace the main water shutoff valve to improve control of the home’s water supply.",
      "items": [
        {
          "id": "main-water-shutoff-valve-replacement",
          "title": "Main water shutoff valve replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the main water shutoff valve at the approved location.",
          "match_terms": [
            "Main water shutoff valve replacement",
            "material",
            "primary",
            "main water shutoff valve replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional",
            "safety"
          ],
          "editor_note": "Confirm water source, meter/curb stop access, pipe material, valve size, pressure, corrosion, and whether utility coordination is needed."
        },
        {
          "id": "water-service-shutdown-and-restore",
          "title": "Water service shutdown and restore",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Shut off and restore water service for the valve replacement.",
          "match_terms": [
            "Water service shutdown and restore",
            "labor",
            "standard",
            "Main water shutoff valve replacement",
            "main water shutoff valve replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional",
            "safety"
          ],
          "editor_note": "Confirm whether shutdown is controlled by customer, plumber, property manager, or utility."
        },
        {
          "id": "pressure-and-leak-check",
          "title": "Pressure and leak check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Check the new valve and nearby piping for visible leaks after water is restored.",
          "match_terms": [
            "Pressure and leak check",
            "labor",
            "standard",
            "Main water shutoff valve replacement",
            "main water shutoff valve replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Document any pressure issues or additional valve/piping concerns."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Replace main water shutoff valve.",
      "text": "Replace main water shutoff valve.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Coordinate water shutoff as needed.",
      "text": "Coordinate water shutoff as needed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Test valve and nearby piping after installation.",
      "text": "Test valve and nearby piping after installation.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Utility coordination may be required depending on shutoff access.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Older or corroded piping can change the final repair scope.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes utility fees, permit fees, and concealed piping repairs unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Additional repairs may be required if existing piping is damaged during removal.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm water source and shutdown method.",
      "detail": "Confirm water source and shutdown method.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm pipe material and valve size.",
      "detail": "Confirm pipe material and valve size.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Review local requirements before replacing main s...",
      "detail": "Review local requirements before replacing main service components.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
