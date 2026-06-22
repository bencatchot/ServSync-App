import type { EstimateDraftLibraryBundle } from '../../types';

export const electricalDiagnosticServiceCallBundle = {
  "trade": "electrical",
  "work_category": "service",
  "job_bundle": "electrical_diagnostic_service_call",
  "display_name": "Electrical Diagnostic Service Call",
  "aliases": [
    "electrical diagnostic",
    "troubleshoot electrical issue",
    "breaker keeps tripping",
    "outlets not working",
    "lights flickering",
    "partial power outage",
    "burning smell from outlet",
    "electrical service call"
  ],
  "scope_summary": "Service visit to troubleshoot a reported residential electrical issue and recommend repair scope based on findings.",
  "sections": [
    {
      "id": "core_diagnostic",
      "title": "Core Diagnostic",
      "description": "Standard troubleshooting and issue identification items.",
      "items": [
        {
          "id": "electrical_service_visit",
          "title": "Electrical service visit",
          "line_type": "fee",
          "suggestion_behavior": "default_candidate",
          "unit": "visit",
          "quantity": "1",
          "customer_description": "Service visit for a reported electrical issue at the property.",
          "match_terms": [
            "electrical service call",
            "electrician visit",
            "troubleshoot electrical issue"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "licensing"
          ],
          "editor_note": "Useful as a default visit fee if contractor uses a service-call structure."
        },
        {
          "id": "initial_issue_review",
          "title": "Initial issue review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the reported electrical issue and inspect accessible related components.",
          "match_terms": [
            "outlet not working",
            "switch not working",
            "lights flickering",
            "breaker tripping"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "licensing"
          ],
          "editor_note": "Limit to accessible visual and functional review unless broader diagnostic scope is added."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_diagnostic_scope",
      "label": "Standard diagnostic visit",
      "text": "Troubleshoot the reported electrical issue and provide recommended repair options based on accessible findings.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety",
        "licensing"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "diagnostic_limit_note",
      "text": "Additional repair work, concealed wiring access, or replacement parts are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety",
        "structural"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "diagnostic_terms",
      "text": "Final repair scope may change if additional electrical issues are found during troubleshooting.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety",
        "code"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_symptoms",
      "label": "Confirm reported symptoms",
      "detail": "Clarify whether the customer reports tripping breakers, dead outlets, flickering lights, burning smell, buzzing, partial outage, or device failure.",
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Panel replacement unless listed",
    "Breaker replacement unless listed",
    "New circuit wiring unless listed",
    "Concealed wiring repair unless listed",
    "Drywall repair",
    "Utility-side repairs",
    "Whole-home electrical inspection unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
