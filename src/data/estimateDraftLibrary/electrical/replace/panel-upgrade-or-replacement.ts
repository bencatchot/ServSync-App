import type { EstimateDraftLibraryBundle } from '../../types';

export const panelUpgradeOrReplacementBundle = {
  "trade": "electrical",
  "work_category": "replace",
  "job_bundle": "panel_upgrade_or_replacement",
  "display_name": "Electrical panel upgrade or replacement",
  "aliases": [
    "panel upgrade or replacement",
    "Electrical panel upgrade or replacement",
    "Panel replacement",
    "Panel upgrade",
    "Old panel",
    "Full panel",
    "Damaged panel",
    "Service capacity upgrade",
    "Use when the customer needs the main panel replaced or upgraded.",
    "Use when the rough scope mentions a panel upgrade, larger panel, unsafe panel, obsolete panel, or full breaker box replacement."
  ],
  "scope_summary": "Replace or upgrade an electrical panel to improve capacity, safety, or serviceability.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Replace or upgrade an electrical panel to improve capacity, safety, or serviceability.",
      "items": [
        {
          "id": "electrical-panel-replacement-or-upgrade",
          "title": "Electrical panel replacement or upgrade",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "panel",
          "quantity": "1",
          "customer_description": "Replace or upgrade the electrical panel as approved.",
          "match_terms": [
            "Electrical panel replacement or upgrade",
            "panel",
            "primary",
            "Panel replacement",
            "Panel upgrade",
            "Old panel",
            "Full panel",
            "Damaged panel",
            "Service capacity upgrade"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "permit",
            "code",
            "regional",
            "safety"
          ],
          "editor_note": "Requires review of service size, load calculation needs, utility coordination, grounding/bonding, permit requirements, panel location, working clearance, and local code."
        },
        {
          "id": "breaker-replacement-set",
          "title": "Breaker replacement set",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "circuit",
          "quantity": "1",
          "customer_description": "Install compatible breakers for the updated panel.",
          "match_terms": [
            "Breaker replacement set",
            "panel_component",
            "standard",
            "Panel replacement",
            "Panel upgrade",
            "Old panel",
            "Full panel",
            "Damaged panel",
            "Service capacity upgrade"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm AFCI/GFCI requirements, circuit count, breaker type, and panel manufacturer requirements."
        },
        {
          "id": "panel-labeling",
          "title": "Panel labeling",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "panel",
          "quantity": "1",
          "customer_description": "Label the panel circuits after installation.",
          "match_terms": [
            "Panel labeling",
            "documentation",
            "standard",
            "Panel replacement",
            "Panel upgrade",
            "Old panel",
            "Full panel",
            "Damaged panel",
            "Service capacity upgrade"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Circuit tracing may require extra time if existing labels are missing or inaccurate."
        },
        {
          "id": "permit-and-inspection-coordination",
          "title": "Permit and inspection coordination",
          "line_type": "other",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Coordinate required permit or inspection steps where applicable.",
          "match_terms": [
            "Permit and inspection coordination",
            "admin",
            "conditional",
            "Panel replacement",
            "Panel upgrade",
            "Old panel",
            "Full panel",
            "Damaged panel",
            "Service capacity upgrade"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "permit",
            "regional",
            "code"
          ],
          "editor_note": "Permit rules vary by jurisdiction. Keep this as review-required and contractor-confirmed."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Electrical panel upgrade or replacement",
      "text": "Replace or upgrade an electrical panel to improve capacity, safety, or serviceability.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as single breaker replacement, minor panel repair, subpanel only are included only when listed.",
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
      "detail": "Use when the customer needs the main panel replaced or upgraded. Use when the rough scope mentions a panel upgrade, larger panel, unsafe panel, obsolete panel, or full breaker box replacement. Do not use for small breaker-only repairs. Do not use without contractor review for utility coordination, permitting, grounding, bonding, and load requirements.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Single breaker replacement",
    "Minor panel repair",
    "Subpanel only",
    "Troubleshooting only"
  ]
} satisfies EstimateDraftLibraryBundle;
