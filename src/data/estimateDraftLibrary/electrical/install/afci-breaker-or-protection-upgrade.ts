import type { EstimateDraftLibraryBundle } from '../../types';

export const afciBreakerOrProtectionUpgradeBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "afci_breaker_or_protection_upgrade",
  "display_name": "AFCI breaker or protection upgrade",
  "aliases": [
    "afci breaker or protection upgrade",
    "AFCI breaker or protection upgrade",
    "Bedroom circuit protection",
    "Living area circuit protection",
    "Breaker upgrade",
    "Arc fault protection",
    "Code correction",
    "Use when the customer requests AFCI protection or a circuit needs arc-fault protection as part of a repair or upgrade.",
    "Use when the rough scope mentions AFCI, arc fault, bedroom breaker, or nuisance AFCI issue."
  ],
  "scope_summary": "Add or replace arc-fault protection where required or requested for a residential circuit.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Add or replace arc-fault protection where required or requested for a residential circuit.",
      "items": [
        {
          "id": "afci-breaker-or-device-installation",
          "title": "AFCI breaker or device installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install arc-fault protection for the approved circuit.",
          "match_terms": [
            "AFCI breaker or device installation",
            "panel_component",
            "primary",
            "Bedroom circuit protection",
            "Living area circuit protection",
            "Breaker upgrade",
            "Arc fault protection",
            "Code correction"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "manufacturer"
          ],
          "editor_note": "Confirm panel compatibility, neutral configuration, circuit condition, local code, and manufacturer requirements."
        },
        {
          "id": "circuit-condition-check",
          "title": "Circuit condition check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Check the circuit for visible or testable issues before placing it back in service.",
          "match_terms": [
            "Circuit condition check",
            "labor",
            "standard",
            "Bedroom circuit protection",
            "Living area circuit protection",
            "Breaker upgrade",
            "Arc fault protection",
            "Code correction"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Look for shared neutrals, bootleg grounds, damaged conductors, loose connections, or loads that may cause nuisance trips."
        },
        {
          "id": "protection-test-and-labeling",
          "title": "Protection test and labeling",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the protection device and label the circuit as needed.",
          "match_terms": [
            "Protection test and labeling",
            "labor",
            "standard",
            "Bedroom circuit protection",
            "Living area circuit protection",
            "Breaker upgrade",
            "Arc fault protection",
            "Code correction"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code"
          ],
          "editor_note": "Document device type and circuit served."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "AFCI breaker or protection upgrade",
      "text": "Add or replace arc-fault protection where required or requested for a residential circuit.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as unknown tripping issue, old wiring problem, panel incompatibility are included only when listed.",
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
      "detail": "Use when the customer requests AFCI protection or a circuit needs arc-fault protection as part of a repair or upgrade. Use when the rough scope mentions AFCI, arc fault, bedroom breaker, or nuisance AFCI issue. Do not assume an AFCI breaker alone resolves nuisance tripping without troubleshooting the circuit. Do not use when the panel cannot accept the required breaker type.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Unknown tripping issue",
    "Old wiring problem",
    "Panel incompatibility",
    "Full rewire needed"
  ]
} satisfies EstimateDraftLibraryBundle;
