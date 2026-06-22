import type { EstimateDraftLibraryBundle } from '../../types';

export const gasFurnaceReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "gas_furnace_replacement",
  "display_name": "Gas Furnace Replacement",
  "aliases": [
    "replace furnace",
    "gas furnace replacement",
    "new furnace",
    "furnace install",
    "old furnace replacement",
    "no heat replace furnace"
  ],
  "scope_summary": "Replacement of an existing residential gas furnace in the approved location.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Common gas furnace removal, installation, connection, and startup items.",
      "items": [
        {
          "id": "remove_existing_furnace",
          "title": "Remove existing furnace",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Disconnect and remove the existing gas furnace included in the approved scope.",
          "match_terms": [
            "remove furnace",
            "old furnace",
            "furnace replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm shutoff and access."
        },
        {
          "id": "install_replacement_furnace",
          "title": "Install replacement gas furnace",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement gas furnace in the approved location.",
          "match_terms": [
            "install furnace",
            "replace furnace",
            "new furnace"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "manufacturer",
            "code",
            "safety"
          ],
          "editor_note": "Follow selected equipment requirements."
        },
        {
          "id": "connect_gas_and_electrical",
          "title": "Connect gas and electrical connections",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Connect existing gas and electrical connections where suitable for the approved furnace installation.",
          "match_terms": [
            "gas connection",
            "furnace wiring",
            "furnace disconnect"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Existing connections may not be suitable."
        },
        {
          "id": "furnace_startup",
          "title": "Startup and heating operation check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Start the replacement furnace and check basic heating operation.",
          "match_terms": [
            "furnace startup",
            "test heat",
            "heating check"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Do not imply safety certification."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Venting, condensate, permit, and gas-sensitive items.",
      "items": [
        {
          "id": "replacement_furnace_equipment",
          "title": "Replacement gas furnace equipment",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide replacement gas furnace equipment selected for the approved scope.",
          "match_terms": [
            "gas furnace",
            "furnace equipment"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "gas"
          ],
          "editor_note": "No brand or size unless selected."
        },
        {
          "id": "venting_or_combustion_air_review",
          "title": "Venting or combustion air review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Existing venting or combustion air conditions may affect final furnace scope.",
          "match_terms": [
            "furnace vent",
            "flue",
            "combustion air"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "code",
            "safety",
            "regional"
          ],
          "editor_note": "Review-only unless specific work is listed."
        },
        {
          "id": "permit_or_inspection_coordination",
          "title": "Permit or inspection coordination",
          "line_type": "fee",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Permit or inspection coordination may be included where applicable.",
          "match_terms": [
            "furnace permit",
            "gas inspection",
            "HVAC inspection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "permit",
            "code",
            "regional",
            "licensing"
          ],
          "editor_note": "Local handling varies."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_furnace_replacement",
      "label": "Standard gas furnace replacement",
      "text": "Remove the existing gas furnace and install a replacement furnace in the approved location.",
      "contractor_review_required": true,
      "review_flags": [
        "gas",
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "furnace_scope_note",
      "text": "Gas piping, venting, electrical repairs, duct changes, or permit items are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "gas",
        "electrical",
        "code",
        "permit",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "furnace_terms",
      "text": "Final scope may change if existing gas, venting, duct, condensate, electrical, or access conditions are not suitable for the planned replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "gas",
        "electrical",
        "code",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_venting",
      "label": "Confirm venting and combustion conditions",
      "detail": "Review venting, combustion air, clearances, condensate, gas connection, and manufacturer requirements.",
      "review_flags": [
        "gas",
        "code",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Gas line replacement unless listed",
    "Venting replacement unless listed",
    "Duct replacement unless listed",
    "Electrical circuit repair unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
