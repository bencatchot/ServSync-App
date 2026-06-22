import type { EstimateDraftLibraryBundle } from '../../types';

export const panelLabelingAndCircuitMappingBundle = {
  "trade": "electrical",
  "work_category": "service",
  "job_bundle": "panel_labeling_and_circuit_mapping",
  "display_name": "Panel labeling and circuit mapping",
  "aliases": [
    "panel labeling and circuit mapping",
    "Panel labeling and circuit mapping",
    "Panel labels missing",
    "Breaker labels wrong",
    "Circuit mapping",
    "New homeowner",
    "Home inspection follow-up",
    "Use when the customer wants the panel identified, corrected, or labeled.",
    "Use when previous panel labels are missing, inaccurate, or unclear."
  ],
  "scope_summary": "Trace and label electrical panel circuits to make the panel easier to understand and service.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Trace and label electrical panel circuits to make the panel easier to understand and service.",
      "items": [
        {
          "id": "circuit-tracing-and-panel-labeling",
          "title": "Circuit tracing and panel labeling",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "panel",
          "quantity": "1",
          "customer_description": "Trace accessible circuits and update the electrical panel labels.",
          "match_terms": [
            "Circuit tracing and panel labeling",
            "labor",
            "primary",
            "Panel labels missing",
            "Breaker labels wrong",
            "Circuit mapping",
            "New homeowner",
            "Home inspection follow-up"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "regional",
            "safety"
          ],
          "editor_note": "Occupied homes may require customer coordination to access rooms, receptacles, appliances, and lighting."
        },
        {
          "id": "panel-directory-update",
          "title": "Panel directory update",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "panel",
          "quantity": "1",
          "customer_description": "Update the panel directory with clearer circuit descriptions.",
          "match_terms": [
            "Panel directory update",
            "documentation",
            "standard",
            "Panel labels missing",
            "Breaker labels wrong",
            "Circuit mapping",
            "New homeowner",
            "Home inspection follow-up"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Use practical room/load descriptions and note unknown circuits if not fully verified."
        },
        {
          "id": "circuit-issue-notes",
          "title": "Circuit issue notes",
          "line_type": "other",
          "suggestion_behavior": "optional_candidate",
          "unit": "as needed",
          "quantity": "1",
          "customer_description": "Note visible concerns discovered during circuit mapping.",
          "match_terms": [
            "Circuit issue notes",
            "documentation",
            "conditional",
            "Panel labels missing",
            "Breaker labels wrong",
            "Circuit mapping",
            "New homeowner",
            "Home inspection follow-up"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Separate labeling work from repair recommendations. Do not include repairs unless added as separate line items."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Panel labeling and circuit mapping",
      "text": "Trace and label electrical panel circuits to make the panel easier to understand and service.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as troubleshooting only, panel replacement, full rewire are included only when listed.",
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
      "detail": "Use when the customer wants the panel identified, corrected, or labeled. Use when previous panel labels are missing, inaccurate, or unclear. Do not use when the customer needs electrical repair rather than labeling. Do not guarantee every hidden or shared circuit can be fully identified without added diagnostic time.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Troubleshooting only",
    "Panel replacement",
    "Full rewire",
    "Hidden circuit tracing"
  ]
} satisfies EstimateDraftLibraryBundle;
