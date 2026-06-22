import type { EstimateDraftLibraryBundle } from '../../types';

export const generatorInletOrTransferSwitchInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "generator_inlet_or_transfer_switch_installation",
  "display_name": "Generator inlet or transfer switch installation",
  "aliases": [
    "generator inlet or transfer switch installation",
    "Generator inlet or transfer switch installation",
    "Portable generator inlet",
    "Transfer switch",
    "Generator interlock",
    "Backup power connection",
    "Use when the customer wants a safe connection point for a portable generator.",
    "Use when the scope mentions transfer switch, interlock kit, generator plug, generator inlet, or emergency power."
  ],
  "scope_summary": "Install approved generator connection equipment so a portable generator can be connected more safely.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install approved generator connection equipment so a portable generator can be connected more safely.",
      "items": [
        {
          "id": "generator-inlet-installation",
          "title": "Generator inlet installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install an approved generator inlet at the selected location.",
          "match_terms": [
            "Generator inlet installation",
            "device",
            "primary",
            "Portable generator inlet",
            "Transfer switch",
            "Generator interlock",
            "Backup power connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "permit",
            "code",
            "safety"
          ],
          "editor_note": "Confirm amperage, inlet type, exterior rating, conductor size, panel location, and generator compatibility."
        },
        {
          "id": "transfer-switch-or-interlock-equipment",
          "title": "Transfer switch or interlock equipment",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "panel",
          "quantity": "1",
          "customer_description": "Install approved transfer or interlock equipment for safer generator connection.",
          "match_terms": [
            "Transfer switch or interlock equipment",
            "panel_component",
            "primary",
            "Portable generator inlet",
            "Transfer switch",
            "Generator interlock",
            "Backup power connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "permit",
            "code",
            "regional",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm equipment listing, panel compatibility, utility backfeed prevention, circuit selection, and local approval."
        },
        {
          "id": "generator-circuit-labeling-and-owner-orientation",
          "title": "Generator circuit labeling and owner orientation",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Label the generator connection equipment and review basic operating steps with the customer.",
          "match_terms": [
            "Generator circuit labeling and owner orientation",
            "documentation",
            "standard",
            "Portable generator inlet",
            "Transfer switch",
            "Generator interlock",
            "Backup power connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "manufacturer"
          ],
          "editor_note": "Do not provide unsafe operating guidance. Include manufacturer instructions and limitations."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Generator inlet or transfer switch installation",
      "text": "Install approved generator connection equipment so a portable generator can be connected more safely.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as whole-home standby generator, automatic transfer switch, generator gas line are included only when listed.",
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
      "detail": "Use when the customer wants a safe connection point for a portable generator. Use when the scope mentions transfer switch, interlock kit, generator plug, generator inlet, or emergency power. Do not use for full standby generator installation unless expanded by the contractor. Do not use without contractor review of code, utility safety, panel compatibility, and permit requirements.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Whole-home standby generator",
    "Automatic transfer switch",
    "Generator gas line",
    "Generator pad",
    "Commercial generator"
  ]
} satisfies EstimateDraftLibraryBundle;
