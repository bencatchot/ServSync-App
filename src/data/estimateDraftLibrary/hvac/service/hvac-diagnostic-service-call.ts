import type { EstimateDraftLibraryBundle } from '../../types';

export const hvacDiagnosticServiceCallBundle = {
  "trade": "hvac",
  "work_category": "service",
  "job_bundle": "hvac_diagnostic_service_call",
  "display_name": "HVAC Diagnostic Service Call",
  "aliases": [
    "HVAC diagnostic",
    "AC not cooling",
    "heat not working",
    "system not running",
    "HVAC service call",
    "air conditioner troubleshooting",
    "furnace troubleshooting",
    "heat pump troubleshooting"
  ],
  "scope_summary": "Service visit to troubleshoot a reported heating or cooling issue and recommend repair or replacement options based on accessible findings.",
  "sections": [
    {
      "id": "core_diagnostic",
      "title": "Core Diagnostic",
      "description": "Standard troubleshooting and findings items.",
      "items": [
        {
          "id": "hvac_service_visit",
          "title": "HVAC service visit",
          "line_type": "fee",
          "suggestion_behavior": "default_candidate",
          "unit": "visit",
          "quantity": "1",
          "customer_description": "Service visit for a reported heating or cooling issue at the property.",
          "match_terms": [
            "HVAC service call",
            "AC service visit",
            "heat not working",
            "system not running"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Useful as a default visit fee if contractor uses a service-call structure."
        },
        {
          "id": "system_operation_check",
          "title": "System operation check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Check basic operation of the affected heating or cooling system.",
          "match_terms": [
            "AC not cooling",
            "heat pump issue",
            "furnace not heating",
            "system not running"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "gas",
            "refrigerant",
            "safety"
          ],
          "editor_note": "Confirm equipment type and symptoms before editing."
        },
        {
          "id": "accessible_component_testing",
          "title": "Accessible component testing",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Test accessible components related to the reported issue.",
          "match_terms": [
            "capacitor test",
            "blower not running",
            "fan motor issue",
            "thermostat issue"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "refrigerant",
            "gas",
            "safety"
          ],
          "editor_note": "Limit to accessible components unless broader diagnostic scope is included."
        },
        {
          "id": "diagnostic_findings",
          "title": "Diagnostic findings and recommendations",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Provide findings and recommended next steps for the reported HVAC issue.",
          "match_terms": [
            "diagnostic findings",
            "repair recommendation",
            "system evaluation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "manufacturer"
          ],
          "editor_note": "Use customer-safe findings language only."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Common follow-up recommendations and review-only items.",
      "items": [
        {
          "id": "emergency_or_after_hours_fee",
          "title": "Emergency or after-hours service fee",
          "line_type": "fee",
          "suggestion_behavior": "optional_candidate",
          "unit": "visit",
          "quantity": "1",
          "customer_description": "Emergency or after-hours service fee where applicable.",
          "match_terms": [
            "after hours HVAC",
            "emergency AC",
            "same day HVAC"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Emergency is a condition or fee, not a work category."
        },
        {
          "id": "regulated_work_review",
          "title": "Refrigerant, gas, or electrical review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Refrigerant, gas, or electrical conditions may require separate approved repair work.",
          "match_terms": [
            "low refrigerant",
            "gas furnace issue",
            "electrical fault"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "gas",
            "electrical",
            "safety",
            "licensing"
          ],
          "editor_note": "Do not add regulated work automatically."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_diagnostic_scope",
      "label": "Standard diagnostic visit",
      "text": "Troubleshoot the reported HVAC issue and provide recommended repair options based on accessible findings.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "diagnostic_limit_note",
      "text": "Additional repair work, replacement parts, refrigerant work, gas work, or electrical work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "gas",
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "diagnostic_terms",
      "text": "Final repair scope may change if additional HVAC issues are found during troubleshooting.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_equipment_type",
      "label": "Confirm equipment type",
      "detail": "Clarify whether the issue involves a split AC system, heat pump, gas furnace, air handler, package unit, mini split, or thermostat.",
      "review_flags": [
        "manufacturer",
        "electrical",
        "gas",
        "refrigerant"
      ]
    },
    {
      "id": "confirm_regulated_work",
      "label": "Confirm regulated work",
      "detail": "Identify whether refrigerant, gas, electrical, permit, or licensing-sensitive work is involved.",
      "review_flags": [
        "refrigerant",
        "gas",
        "electrical",
        "permit",
        "licensing",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Replacement parts unless listed",
    "Refrigerant work unless listed",
    "Gas piping or combustion repair unless listed",
    "Electrical circuit repair unless listed",
    "Duct repair unless listed",
    "Full system replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
