import type { EstimateDraftLibraryBundle } from '../../types';

export const recessedLightingInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "recessed_lighting_installation",
  "display_name": "Recessed lighting installation",
  "aliases": [
    "recessed lighting installation",
    "Recessed lighting installation",
    "Can lights",
    "Recessed lights",
    "LED wafer lights",
    "Room lighting upgrade",
    "Kitchen lighting",
    "Use when the customer wants recessed lights added or replaced.",
    "Use when the rough scope mentions can lights, wafer lights, pot lights, or LED recessed lights."
  ],
  "scope_summary": "Install recessed lighting in a room, hallway, kitchen, bathroom, porch, or other approved area.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install recessed lighting in a room, hallway, kitchen, bathroom, porch, or other approved area.",
      "items": [
        {
          "id": "recessed-light-installation",
          "title": "Recessed light installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install recessed light fixtures in the approved locations.",
          "match_terms": [
            "Recessed light installation",
            "lighting",
            "primary",
            "Can lights",
            "Recessed lights",
            "LED wafer lights",
            "Room lighting upgrade",
            "Kitchen lighting"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Confirm ceiling access, insulation contact rating, wet/damp rating, switch control, dimmer compatibility, and spacing."
        },
        {
          "id": "lighting-switch-or-control-connection",
          "title": "Lighting switch or control connection",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Connect the new lighting to the approved switch or control.",
          "match_terms": [
            "Lighting switch or control connection",
            "device",
            "standard",
            "Can lights",
            "Recessed lights",
            "LED wafer lights",
            "Room lighting upgrade",
            "Kitchen lighting"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Confirm whether existing switch leg can be used or whether new wiring/control work is needed."
        },
        {
          "id": "cut-in-layout-and-fixture-placement",
          "title": "Cut-in layout and fixture placement",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "room",
          "quantity": "1",
          "customer_description": "Lay out and cut openings for the recessed lights.",
          "match_terms": [
            "Cut-in layout and fixture placement",
            "labor",
            "standard",
            "Can lights",
            "Recessed lights",
            "LED wafer lights",
            "Room lighting upgrade",
            "Kitchen lighting"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "regional",
            "safety"
          ],
          "editor_note": "Confirm customer-approved placement before cutting. Note that patching/painting is excluded unless included separately."
        },
        {
          "id": "dimmer-compatible-switch",
          "title": "Dimmer-compatible switch",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Add a compatible dimmer switch for the new recessed lights.",
          "match_terms": [
            "Dimmer-compatible switch",
            "optional_add_on",
            "optional",
            "Can lights",
            "Recessed lights",
            "LED wafer lights",
            "Room lighting upgrade",
            "Kitchen lighting"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Confirm fixture and bulb compatibility before installing dimmer."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Recessed lighting installation",
      "text": "Install recessed lighting in a room, hallway, kitchen, bathroom, porch, or other approved area.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as decorative fixture only, landscape lighting, major ceiling repair are included only when listed.",
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
      "detail": "Use when the customer wants recessed lights added or replaced. Use when the rough scope mentions can lights, wafer lights, pot lights, or LED recessed lights. Do not use for a simple one-for-one light fixture replacement. Do not include drywall repair unless the contractor provides it.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Decorative fixture only",
    "Landscape lighting",
    "Major ceiling repair",
    "New circuit only"
  ]
} satisfies EstimateDraftLibraryBundle;
