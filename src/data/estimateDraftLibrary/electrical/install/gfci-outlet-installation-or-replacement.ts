import type { EstimateDraftLibraryBundle } from '../../types';

export const gfciOutletInstallationOrReplacementBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "gfci_outlet_installation_or_replacement",
  "display_name": "GFCI outlet installation or replacement",
  "aliases": [
    "gfci outlet installation or replacement",
    "GFCI outlet installation or replacement",
    "Bathroom outlet",
    "Kitchen outlet",
    "Garage outlet",
    "Laundry outlet",
    "Exterior outlet",
    "Unfinished basement outlet",
    "Use when the customer needs a GFCI outlet replaced or added at an existing suitable outlet location.",
    "Use when the rough scope mentions GFI, GFCI, bathroom plug, kitchen plug, garage plug, or exterior plug."
  ],
  "scope_summary": "Install or replace a GFCI-protected outlet in an area where added shock protection is needed.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install or replace a GFCI-protected outlet in an area where added shock protection is needed.",
      "items": [
        {
          "id": "gfci-outlet-replacement-or-installation",
          "title": "GFCI outlet replacement or installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install or replace a GFCI-protected outlet at the approved location.",
          "match_terms": [
            "GFCI outlet replacement or installation",
            "device",
            "primary",
            "Bathroom outlet",
            "Kitchen outlet",
            "Garage outlet",
            "Laundry outlet",
            "Exterior outlet",
            "Unfinished basement outlet"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety"
          ],
          "editor_note": "Confirm line/load wiring, box condition, grounding, amperage, weather rating if exterior, and local code requirements."
        },
        {
          "id": "outlet-cover-plate",
          "title": "Outlet cover plate",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a matching outlet cover plate.",
          "match_terms": [
            "Outlet cover plate",
            "finish_material",
            "standard",
            "Bathroom outlet",
            "Kitchen outlet",
            "Garage outlet",
            "Laundry outlet",
            "Exterior outlet",
            "Unfinished basement outlet"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "regional"
          ],
          "editor_note": "Use weather-resistant in-use cover where required for exterior or wet locations."
        },
        {
          "id": "outlet-testing-and-reset-verification",
          "title": "Outlet testing and reset verification",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the outlet for proper operation after installation.",
          "match_terms": [
            "Outlet testing and reset verification",
            "labor",
            "standard",
            "Bathroom outlet",
            "Kitchen outlet",
            "Garage outlet",
            "Laundry outlet",
            "Exterior outlet",
            "Unfinished basement outlet"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Verify trip/reset function and downstream protection if load terminals are used."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "GFCI outlet installation or replacement",
      "text": "Install or replace a GFCI-protected outlet in an area where added shock protection is needed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as new circuit required, panel work required, hidden wiring damage are included only when listed.",
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
      "detail": "Use when the customer needs a GFCI outlet replaced or added at an existing suitable outlet location. Use when the rough scope mentions GFI, GFCI, bathroom plug, kitchen plug, garage plug, or exterior plug. Do not use as the main recipe when a new branch circuit must be installed. Do not use for broad troubleshooting unless the failed outlet has already been identified.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "New circuit required",
    "Panel work required",
    "Hidden wiring damage",
    "Multiple rooms being rewired"
  ]
} satisfies EstimateDraftLibraryBundle;
