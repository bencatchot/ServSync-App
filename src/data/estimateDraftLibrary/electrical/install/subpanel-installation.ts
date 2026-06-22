import type { EstimateDraftLibraryBundle } from '../../types';

export const subpanelInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "subpanel_installation",
  "display_name": "Subpanel installation",
  "aliases": [
    "subpanel installation",
    "Subpanel installation",
    "Garage subpanel",
    "Workshop subpanel",
    "Addition subpanel",
    "Detached building panel",
    "More circuit space",
    "Use when the customer needs additional circuit capacity from a subpanel.",
    "Use when multiple new circuits are planned in one area."
  ],
  "scope_summary": "Install a subpanel to support additional circuits in an approved area such as a garage, workshop, addition, or detached structure.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install a subpanel to support additional circuits in an approved area such as a garage, workshop, addition, or detached structure.",
      "items": [
        {
          "id": "subpanel-installation",
          "title": "Subpanel installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a subpanel at the approved location.",
          "match_terms": [
            "Subpanel installation",
            "panel",
            "primary",
            "Garage subpanel",
            "Workshop subpanel",
            "Addition subpanel",
            "Detached building panel",
            "More circuit space"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "permit",
            "code",
            "safety"
          ],
          "editor_note": "Confirm feeder size, panel rating, main panel capacity, grounding/bonding, working clearance, location, and permit requirements."
        },
        {
          "id": "feeder-wiring-to-subpanel",
          "title": "Feeder wiring to subpanel",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Run feeder wiring from the source panel to the new subpanel.",
          "match_terms": [
            "Feeder wiring to subpanel",
            "wiring",
            "standard",
            "Garage subpanel",
            "Workshop subpanel",
            "Addition subpanel",
            "Detached building panel",
            "More circuit space"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "code",
            "regional"
          ],
          "editor_note": "Routing, distance, attic/crawl access, conduit needs, trenching, and detached structure rules can change the scope significantly."
        },
        {
          "id": "subpanel-breakers-and-labeling",
          "title": "Subpanel breakers and labeling",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install compatible breakers and label the new subpanel.",
          "match_terms": [
            "Subpanel breakers and labeling",
            "panel_component",
            "standard",
            "Garage subpanel",
            "Workshop subpanel",
            "Addition subpanel",
            "Detached building panel",
            "More circuit space"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm breaker type and circuit plan."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Subpanel installation",
      "text": "Install a subpanel to support additional circuits in an approved area such as a garage, workshop, addition, or detached structure.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as main panel upgrade, single new circuit, temporary power are included only when listed.",
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
      "detail": "Use when the customer needs additional circuit capacity from a subpanel. Use when multiple new circuits are planned in one area. Do not use when a main service upgrade is the correct primary scope. Do not use for detached structures without reviewing feeder, grounding, trenching, and local code requirements.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Main panel upgrade",
    "Single new circuit",
    "Temporary power",
    "Utility service upgrade"
  ]
} satisfies EstimateDraftLibraryBundle;
