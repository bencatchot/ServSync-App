import type { EstimateDraftLibraryBundle } from '../../types';

export const wholeHomeSurgeProtectorInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "whole_home_surge_protector_installation",
  "display_name": "Whole-home surge protector installation",
  "aliases": [
    "whole home surge protector installation",
    "Whole-home surge protector installation",
    "Whole-home surge protection",
    "Panel surge protector",
    "Surge device",
    "Equipment protection",
    "Use when the customer requests surge protection for the home’s electrical system.",
    "Use when adding surge protection during panel work or as a standalone upgrade."
  ],
  "scope_summary": "Install a whole-home surge protection device at the electrical panel where compatible.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install a whole-home surge protection device at the electrical panel where compatible.",
      "items": [
        {
          "id": "whole-home-surge-protection-device",
          "title": "Whole-home surge protection device",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a surge protection device at the electrical panel where compatible.",
          "match_terms": [
            "Whole-home surge protection device",
            "panel_component",
            "primary",
            "Whole-home surge protection",
            "Panel surge protector",
            "Surge device",
            "Equipment protection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "safety",
            "code"
          ],
          "editor_note": "Confirm panel space, breaker requirement, manufacturer instructions, grounding/bonding condition, and local code requirements."
        },
        {
          "id": "panel-connection-and-breaker-space-verification",
          "title": "Panel connection and breaker space verification",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Verify panel compatibility and connect the surge protection device.",
          "match_terms": [
            "Panel connection and breaker space verification",
            "labor",
            "standard",
            "Whole-home surge protection",
            "Panel surge protector",
            "Surge device",
            "Equipment protection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "May require a dedicated breaker or alternate connection method depending on device and panel."
        },
        {
          "id": "surge-device-labeling-and-indicator-check",
          "title": "Surge device labeling and indicator check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Label the surge protection device and confirm indicator status.",
          "match_terms": [
            "Surge device labeling and indicator check",
            "labor",
            "standard",
            "Whole-home surge protection",
            "Panel surge protector",
            "Surge device",
            "Equipment protection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Show customer where the device indicator is located if applicable."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Whole-home surge protector installation",
      "text": "Install a whole-home surge protection device at the electrical panel where compatible.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as panel full, panel incompatible, service equipment damage are included only when listed.",
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
      "detail": "Use when the customer requests surge protection for the home’s electrical system. Use when adding surge protection during panel work or as a standalone upgrade. Do not use when the panel lacks space or compatibility without adding the required panel modifications. Do not present as protection from every possible electrical event.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Panel full",
    "Panel incompatible",
    "Service equipment damage",
    "Utility-side surge device"
  ]
} satisfies EstimateDraftLibraryBundle;
