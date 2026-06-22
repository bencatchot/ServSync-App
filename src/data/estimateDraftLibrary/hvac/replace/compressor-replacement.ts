import type { EstimateDraftLibraryBundle } from '../../types';

export const compressorReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "compressor_replacement",
  "display_name": "Compressor Replacement",
  "aliases": [
    "replace compressor",
    "bad compressor",
    "compressor failed",
    "AC compressor replacement",
    "heat pump compressor"
  ],
  "scope_summary": "Replacement of a failed compressor in approved HVAC equipment.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard compressor replacement items.",
      "items": [
        {
          "id": "confirm_compressor_failure",
          "title": "Confirm compressor failure",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Confirm the failed compressor and approved replacement scope.",
          "match_terms": [
            "bad compressor",
            "compressor failed",
            "AC compressor"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm failure and root cause."
        },
        {
          "id": "replace_compressor",
          "title": "Replace compressor",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the failed compressor with a compatible replacement component.",
          "match_terms": [
            "compressor replacement",
            "AC compressor",
            "heat pump compressor"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm compatibility and refrigerant handling requirements."
        },
        {
          "id": "filter_drier_or_refrigerant_components",
          "title": "Filter drier or refrigerant component materials",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide related refrigerant components where included in the approved compressor replacement scope.",
          "match_terms": [
            "filter drier",
            "refrigerant components",
            "compressor burnout"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Use if contractor includes these materials."
        },
        {
          "id": "replacement_vs_system_review",
          "title": "Replacement versus system review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Full system replacement may be recommended depending on age, condition, refrigerant type, or compressor failure cause.",
          "match_terms": [
            "old system",
            "compressor burnout",
            "system replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Do not auto-add."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_compressor_replacement",
      "label": "Standard compressor replacement",
      "text": "Replace the failed compressor included in the approved repair scope.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "compressor_note",
      "text": "Additional refrigerant components, electrical repairs, coil repairs, or system replacement are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "compressor_terms",
      "text": "Final repair scope may change if compressor failure is related to refrigerant, electrical, coil, contamination, or equipment condition issues.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_failure_cause",
      "label": "Confirm failure cause",
      "detail": "Review compressor failure cause, electrical readings, refrigerant condition, contamination, warranty status, and replacement versus system-replacement options.",
      "review_flags": [
        "refrigerant",
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Full system replacement unless listed",
    "Major electrical repair unless listed",
    "Line set replacement unless listed",
    "Coil replacement unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
