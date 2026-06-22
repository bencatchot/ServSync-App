import type { EstimateDraftLibraryBundle } from '../../types';

export const capacitorReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "capacitor_replacement",
  "display_name": "AC Capacitor Replacement",
  "aliases": [
    "replace capacitor",
    "bad capacitor",
    "AC hums but will not start",
    "outdoor fan not starting",
    "compressor not starting",
    "capacitor failed"
  ],
  "scope_summary": "Replacement of a failed capacitor in approved HVAC equipment.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard capacitor confirmation, replacement, and testing items.",
      "items": [
        {
          "id": "confirm_capacitor_failure",
          "title": "Confirm capacitor failure",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Confirm the failed capacitor included in the approved repair scope.",
          "match_terms": [
            "bad capacitor",
            "capacitor failed",
            "AC hums"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm diagnosis before replacing."
        },
        {
          "id": "replace_capacitor",
          "title": "Replace capacitor",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the failed capacitor with a compatible replacement part.",
          "match_terms": [
            "run capacitor",
            "start capacitor",
            "dual capacitor"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm rating and equipment compatibility."
        },
        {
          "id": "test_equipment_operation",
          "title": "Test equipment operation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the affected HVAC equipment for basic operation after the approved repair.",
          "match_terms": [
            "test AC",
            "startup check",
            "operation check"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Basic operation check only."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_capacitor_replacement",
      "label": "Standard capacitor replacement",
      "text": "Replace the failed capacitor and test basic equipment operation.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "related_repairs_note",
      "text": "Additional electrical, motor, compressor, or system repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "capacitor_terms",
      "text": "Final repair scope may change if related motor, compressor, wiring, or equipment issues are found.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_rating",
      "label": "Confirm capacitor rating",
      "detail": "Confirm capacitor type, rating, wiring condition, and affected motor or compressor condition.",
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Fan motor replacement unless listed",
    "Compressor replacement unless listed",
    "Electrical circuit repair unless listed",
    "Full system replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
