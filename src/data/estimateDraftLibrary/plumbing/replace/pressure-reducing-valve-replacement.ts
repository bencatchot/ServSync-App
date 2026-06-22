import type { EstimateDraftLibraryBundle } from '../../types';

export const pressureReducingValveReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "pressure_reducing_valve_replacement",
  "display_name": "Pressure reducing valve replacement",
  "aliases": [
    "pressure reducing valve replacement",
    "Pressure reducing valve replacement",
    "Replace a pressure reducing valve to help control high or inconsistent water pressure.",
    "Replace pressure reducing valve.",
    "Test water pressure before and after replacement.",
    "Review expansion protection needs.",
    "Water pressure test",
    "Thermal expansion review"
  ],
  "scope_summary": "Replace a pressure reducing valve to help control high or inconsistent water pressure.",
  "sections": [
    {
      "id": "pressure_control",
      "title": "Pressure control",
      "description": "Replace a pressure reducing valve to help control high or inconsistent water pressure.",
      "items": [
        {
          "id": "pressure-reducing-valve-replacement",
          "title": "Pressure reducing valve replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the pressure reducing valve on the home’s water supply piping.",
          "match_terms": [
            "Pressure reducing valve replacement",
            "material",
            "primary",
            "pressure reducing valve replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional",
            "safety"
          ],
          "editor_note": "Confirm incoming pressure, pipe size/material, valve location, expansion tank needs, main shutoff function, and local code requirements."
        },
        {
          "id": "water-pressure-test",
          "title": "Water pressure test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Test water pressure before and after the valve replacement.",
          "match_terms": [
            "Water pressure test",
            "labor",
            "standard",
            "Pressure reducing valve replacement",
            "pressure reducing valve replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Document static pressure and adjusted outlet pressure."
        },
        {
          "id": "thermal-expansion-review",
          "title": "Thermal expansion review",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Review whether thermal expansion protection is needed.",
          "match_terms": [
            "Thermal expansion review",
            "inspection",
            "conditional",
            "Pressure reducing valve replacement",
            "pressure reducing valve replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional",
            "safety"
          ],
          "editor_note": "Closed systems may require an expansion tank or related correction depending on local code and water heater setup."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Replace pressure reducing valve.",
      "text": "Replace pressure reducing valve.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Test water pressure before and after replacement.",
      "text": "Test water pressure before and after replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Review expansion protection needs.",
      "text": "Review expansion protection needs.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "High water pressure can contribute to fixture, appliance, and piping problems.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Additional expansion protection may be recommended depending on the home’s plumbing system.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes expansion tank installation unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes repairs to fixtures or appliances damaged by prior pressure issues.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm pressure readings.",
      "detail": "Confirm pressure readings.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm main shutoff works.",
      "detail": "Confirm main shutoff works.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Review expansion tank/code requirements.",
      "detail": "Review expansion tank/code requirements.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
