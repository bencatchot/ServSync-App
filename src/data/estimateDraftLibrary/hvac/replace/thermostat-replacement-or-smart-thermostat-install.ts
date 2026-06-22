import type { EstimateDraftLibraryBundle } from '../../types';

export const thermostatReplacementOrSmartThermostatInstallBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "thermostat_replacement_or_smart_thermostat_install",
  "display_name": "Thermostat Replacement or Smart Thermostat Installation",
  "aliases": [
    "replace thermostat",
    "install thermostat",
    "smart thermostat install",
    "wifi thermostat",
    "thermostat not working",
    "heat pump thermostat"
  ],
  "scope_summary": "Replacement or installation of a thermostat at an approved existing control location.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard thermostat removal, installation, setup, and testing items.",
      "items": [
        {
          "id": "remove_existing_thermostat",
          "title": "Remove existing thermostat",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove the existing thermostat from the approved location.",
          "match_terms": [
            "remove thermostat",
            "old thermostat",
            "thermostat replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Low-voltage control work."
        },
        {
          "id": "install_replacement_thermostat",
          "title": "Install replacement thermostat",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement thermostat at the approved location.",
          "match_terms": [
            "install thermostat",
            "replace thermostat",
            "smart thermostat"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Confirm compatibility."
        },
        {
          "id": "thermostat_device",
          "title": "Thermostat device",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide a thermostat selected for the approved scope.",
          "match_terms": [
            "thermostat",
            "smart thermostat",
            "wifi thermostat"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "electrical"
          ],
          "editor_note": "Optional because customer may supply device."
        },
        {
          "id": "test_heating_and_cooling_call",
          "title": "Test heating and cooling call",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test basic heating or cooling calls from the thermostat after installation.",
          "match_terms": [
            "test thermostat",
            "call for cooling",
            "call for heat"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "gas",
            "refrigerant",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Basic operation check only."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_thermostat_replacement",
      "label": "Standard thermostat replacement",
      "text": "Replace the existing thermostat at the approved location and test basic system response.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "compatibility_note",
      "text": "Thermostat compatibility depends on the HVAC system, existing wiring, and selected thermostat.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "thermostat_terms",
      "text": "Final scope may change if existing wiring, control board, equipment type, or thermostat compatibility issues are found.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_system_type",
      "label": "Confirm system type",
      "detail": "Confirm conventional, heat pump, auxiliary heat, multistage, zoning, humidifier, dehumidifier, or accessory control needs.",
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "New thermostat wiring unless listed",
    "Control board repair unless listed",
    "Wi-Fi troubleshooting unless listed",
    "Customer account setup unless listed",
    "Zoning control repair unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
