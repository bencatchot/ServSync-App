import type { EstimateDraftLibraryBundle } from '../../types';

export const heatPumpSystemReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "heat_pump_system_replacement",
  "display_name": "Heat Pump System Replacement",
  "aliases": [
    "replace heat pump",
    "heat pump replacement",
    "new heat pump system",
    "heat pump and air handler",
    "outdoor heat pump replacement"
  ],
  "scope_summary": "Replacement of a residential heat pump system or major heat pump components in the approved scope.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Common heat pump removal, installation, and startup items.",
      "items": [
        {
          "id": "remove_existing_heat_pump_equipment",
          "title": "Remove existing heat pump equipment",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove existing heat pump equipment included in the approved replacement scope.",
          "match_terms": [
            "remove heat pump",
            "old heat pump",
            "heat pump replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm indoor and outdoor scope."
        },
        {
          "id": "install_outdoor_heat_pump",
          "title": "Install outdoor heat pump",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement outdoor heat pump at the approved location.",
          "match_terms": [
            "install heat pump",
            "outdoor heat pump",
            "new heat pump"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "manufacturer",
            "code"
          ],
          "editor_note": "Pad or stand conditions may affect scope."
        },
        {
          "id": "install_indoor_air_handler_or_coil",
          "title": "Install indoor air handler or coil",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the indoor air handler or coil included in the approved scope.",
          "match_terms": [
            "air handler",
            "indoor coil",
            "heat pump indoor unit"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "refrigerant",
            "manufacturer",
            "code"
          ],
          "editor_note": "Auxiliary heat may need review."
        },
        {
          "id": "heat_pump_startup",
          "title": "Heat pump startup and operation check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Start the replacement heat pump and check basic heating and cooling operation.",
          "match_terms": [
            "heat pump startup",
            "test heating",
            "test cooling"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Basic operation check only."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Auxiliary heat, thermostat, permit, and site-condition items.",
      "items": [
        {
          "id": "replacement_heat_pump_equipment",
          "title": "Replacement heat pump equipment",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Provide replacement heat pump equipment selected for the approved scope.",
          "match_terms": [
            "heat pump equipment",
            "air handler",
            "heat strip"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "electrical"
          ],
          "editor_note": "Do not include capacity or brand unless selected."
        },
        {
          "id": "auxiliary_heat_review",
          "title": "Auxiliary heat review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Auxiliary heat equipment and wiring may affect final heat pump scope.",
          "match_terms": [
            "heat strip",
            "aux heat",
            "emergency heat"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Review-only unless included."
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
            "heat pump permit",
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
      "id": "standard_heat_pump_replacement",
      "label": "Standard heat pump replacement",
      "text": "Replace the listed heat pump equipment and start the system after installation.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "heat_pump_note",
      "text": "Thermostat, auxiliary heat, electrical, permit, or duct changes are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "permit"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "heat_pump_terms",
      "text": "Final scope may change if refrigerant lines, controls, auxiliary heat, duct transitions, electrical components, or equipment location conditions are not suitable.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "manufacturer",
        "code"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_aux_heat",
      "label": "Confirm auxiliary heat",
      "detail": "Review auxiliary heat, thermostat compatibility, electrical capacity, and control wiring needs.",
      "review_flags": [
        "electrical",
        "manufacturer",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Duct replacement unless listed",
    "Electrical circuit upgrades unless listed",
    "Line set replacement unless listed",
    "Thermostat replacement unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
