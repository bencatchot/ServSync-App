import type { EstimateDraftLibraryBundle } from '../../types';

export const breakerReplacementOrPanelRepairBundle = {
  "trade": "electrical",
  "work_category": "repair",
  "job_bundle": "breaker_replacement_or_panel_repair",
  "display_name": "Breaker replacement or minor panel repair",
  "aliases": [
    "breaker replacement or panel repair",
    "Breaker replacement or minor panel repair",
    "Breaker will not reset",
    "Breaker trips repeatedly",
    "Damaged breaker",
    "Breaker feels loose",
    "Minor panel repair",
    "Use when the scope is limited to replacing or correcting a breaker or small panel component.",
    "Use when troubleshooting has identified the breaker or panel connection as the likely issue."
  ],
  "scope_summary": "Replace a faulty breaker or perform minor repair work inside the electrical panel.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Replace a faulty breaker or perform minor repair work inside the electrical panel.",
      "items": [
        {
          "id": "breaker-replacement",
          "title": "Breaker replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the faulty breaker with a compatible breaker for the existing panel.",
          "match_terms": [
            "Breaker replacement",
            "panel_component",
            "primary",
            "Breaker will not reset",
            "Breaker trips repeatedly",
            "Damaged breaker",
            "Breaker feels loose",
            "Minor panel repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety"
          ],
          "editor_note": "Confirm breaker type, panel listing, wire size, load, AFCI/GFCI requirements, and signs of heat damage before replacement."
        },
        {
          "id": "panel-connection-inspection",
          "title": "Panel connection inspection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Inspect the related panel connection for visible damage or loose connection issues.",
          "match_terms": [
            "Panel connection inspection",
            "labor",
            "standard",
            "Breaker will not reset",
            "Breaker trips repeatedly",
            "Damaged breaker",
            "Breaker feels loose",
            "Minor panel repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Check lug condition, conductor condition, torque requirements, and panel bus condition where visible."
        },
        {
          "id": "circuit-test-after-breaker-replacement",
          "title": "Circuit test after breaker replacement",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the circuit after the breaker replacement to confirm proper operation.",
          "match_terms": [
            "Circuit test after breaker replacement",
            "labor",
            "standard",
            "Breaker will not reset",
            "Breaker trips repeatedly",
            "Damaged breaker",
            "Breaker feels loose",
            "Minor panel repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Verify load condition and do not treat a tripping breaker as solved until load-side issues are ruled out."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Breaker replacement or minor panel repair",
      "text": "Replace a faulty breaker or perform minor repair work inside the electrical panel.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as full panel replacement, service upgrade, burned panel bus are included only when listed.",
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
      "detail": "Use when the scope is limited to replacing or correcting a breaker or small panel component. Use when troubleshooting has identified the breaker or panel connection as the likely issue. Do not use when the entire panel should be replaced or upgraded. Do not use when overheating, arcing, or service equipment damage requires a larger repair scope.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Full panel replacement",
    "Service upgrade",
    "Burned panel bus",
    "Utility disconnect required",
    "Major code correction"
  ]
} satisfies EstimateDraftLibraryBundle;
