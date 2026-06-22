import type { EstimateDraftLibraryBundle } from '../../types';

export const electricalSafetyInspectionBundle = {
  "trade": "electrical",
  "work_category": "inspect",
  "job_bundle": "electrical_safety_inspection",
  "display_name": "Electrical safety inspection",
  "aliases": [
    "electrical safety inspection",
    "Electrical safety inspection",
    "Home safety check",
    "Pre-sale inspection follow-up",
    "New homeowner inspection",
    "Insurance concern",
    "Visible electrical concerns",
    "Use when the customer requests a general electrical safety review.",
    "Use when the scope is inspection/reporting rather than a single known repair."
  ],
  "scope_summary": "Inspect visible electrical components and identify safety concerns or recommended corrections.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Inspect visible electrical components and identify safety concerns or recommended corrections.",
      "items": [
        {
          "id": "visible-electrical-safety-inspection",
          "title": "Visible electrical safety inspection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "home",
          "quantity": "1",
          "customer_description": "Inspect visible outlets, switches, fixtures, panel areas, and accessible electrical components.",
          "match_terms": [
            "Visible electrical safety inspection",
            "inspection",
            "primary",
            "Home safety check",
            "Pre-sale inspection follow-up",
            "New homeowner inspection",
            "Insurance concern",
            "Visible electrical concerns"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Clarify inspection limits. This should not imply hidden wiring, destructive testing, or engineering certification."
        },
        {
          "id": "panel-and-breaker-review",
          "title": "Panel and breaker review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "panel",
          "quantity": "1",
          "customer_description": "Review the accessible electrical panel for visible concerns.",
          "match_terms": [
            "Panel and breaker review",
            "inspection",
            "standard",
            "Home safety check",
            "Pre-sale inspection follow-up",
            "New homeowner inspection",
            "Insurance concern",
            "Visible electrical concerns"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety"
          ],
          "editor_note": "Check labeling, breaker condition, open knockouts, double taps where visible, signs of overheating, and general compatibility concerns."
        },
        {
          "id": "inspection-findings-summary",
          "title": "Inspection findings summary",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide a summary of observed issues and recommended next steps.",
          "match_terms": [
            "Inspection findings summary",
            "documentation",
            "standard",
            "Home safety check",
            "Pre-sale inspection follow-up",
            "New homeowner inspection",
            "Insurance concern",
            "Visible electrical concerns"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Separate urgent safety concerns from optional upgrades. Avoid code guarantees unless verified locally."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Electrical safety inspection",
      "text": "Inspect visible electrical components and identify safety concerns or recommended corrections.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as invasive wall inspection, engineering report, full load calculation only are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "electrical_scope_terms",
      "text": "Final scope may change if existing wiring, panel, access, code, equipment, or site conditions differ from the listed scope.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_scope_fit",
      "label": "Confirm scope fit",
      "detail": "Use when the customer requests a general electrical safety review. Use when the scope is inspection/reporting rather than a single known repair. Do not use when destructive investigation is required. Do not present as a certified engineering inspection unless the contractor provides that service.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Invasive wall inspection",
    "Engineering report",
    "Full load calculation only",
    "Thermal scan only"
  ]
} satisfies EstimateDraftLibraryBundle;
