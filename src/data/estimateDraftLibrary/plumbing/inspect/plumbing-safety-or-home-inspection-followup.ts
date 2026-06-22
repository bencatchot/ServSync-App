import type { EstimateDraftLibraryBundle } from '../../types';

export const plumbingSafetyOrHomeInspectionFollowupBundle = {
  "trade": "plumbing",
  "work_category": "inspect",
  "job_bundle": "plumbing_safety_or_home_inspection_followup",
  "display_name": "Plumbing safety or home inspection follow-up",
  "aliases": [
    "plumbing safety or home inspection followup",
    "Plumbing safety or home inspection follow-up",
    "Inspect visible plumbing concerns from a homeowner request, real estate inspection, or safety review.",
    "Inspect visible plumbing concerns.",
    "Review items from home inspection report.",
    "Provide plumbing repair recommendations.",
    "Visible plumbing inspection",
    "Fixture, valve, and drain review",
    "Findings and repair recommendations"
  ],
  "scope_summary": "Inspect visible plumbing concerns from a homeowner request, real estate inspection, or safety review.",
  "sections": [
    {
      "id": "plumbing_inspection_follow_up",
      "title": "Plumbing inspection follow-up",
      "description": "Inspect visible plumbing concerns from a homeowner request, real estate inspection, or safety review.",
      "items": [
        {
          "id": "visible-plumbing-inspection",
          "title": "Visible plumbing inspection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Inspect visible plumbing components related to the customer’s concern or inspection report.",
          "match_terms": [
            "Visible plumbing inspection",
            "inspection",
            "primary",
            "Plumbing safety or home inspection follow-up",
            "plumbing safety or home inspection followup"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Clarify inspection limits. This is not destructive investigation, engineering review, mold inspection, or full code certification unless provided separately."
        },
        {
          "id": "fixture-valve-and-drain-review",
          "title": "Fixture, valve, and drain review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Review accessible fixtures, valves, and drains included in the approved inspection scope.",
          "match_terms": [
            "Fixture, valve, and drain review",
            "inspection",
            "standard",
            "Plumbing safety or home inspection follow-up",
            "plumbing safety or home inspection followup"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Document visible leaks, corrosion, missing shutoffs, slow drains, trap issues, water heater concerns, and code-sensitive items for review."
        },
        {
          "id": "findings-and-repair-recommendations",
          "title": "Findings and repair recommendations",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Provide a summary of findings and recommended plumbing corrections.",
          "match_terms": [
            "Findings and repair recommendations",
            "documentation",
            "standard",
            "Plumbing safety or home inspection follow-up",
            "plumbing safety or home inspection followup"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Separate urgent repairs, safety concerns, maintenance, and optional upgrades."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Inspect visible plumbing concerns.",
      "text": "Inspect visible plumbing concerns.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Review items from home inspection report.",
      "text": "Review items from home inspection report.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Provide plumbing repair recommendations.",
      "text": "Provide plumbing repair recommendations.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "This inspection is limited to visible and accessible plumbing components.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Hidden leaks, concealed piping, and destructive investigation are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes destructive investigation, remediation, drywall repair, and finish restoration unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Code findings are subject to local jurisdiction and contractor review.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Clarify inspection limits.",
      "detail": "Clarify inspection limits.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Separate repair estimate from inspection findings.",
      "detail": "Separate repair estimate from inspection findings.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Flag permit/code-sensitive items clearly.",
      "detail": "Flag permit/code-sensitive items clearly.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
