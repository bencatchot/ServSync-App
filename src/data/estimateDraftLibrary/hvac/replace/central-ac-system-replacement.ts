import type { EstimateDraftLibraryBundle } from '../../types';

export const centralAcSystemReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "central_ac_system_replacement",
  "display_name": "Central AC System Replacement",
  "aliases": [
    "replace AC system",
    "central air replacement",
    "new AC unit",
    "condenser and coil replacement",
    "air conditioner replacement",
    "split AC replacement"
  ],
  "scope_summary": "Replacement of a residential central air conditioning system or major cooling components in the approved scope.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Common central AC removal, installation, and startup items.",
      "items": [
        {
          "id": "remove_existing_ac_equipment",
          "title": "Remove existing AC equipment",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove existing cooling equipment included in the approved replacement scope.",
          "match_terms": [
            "remove condenser",
            "remove old AC",
            "AC replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm equipment included."
        },
        {
          "id": "install_outdoor_condenser",
          "title": "Install outdoor condenser",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement outdoor condenser at the approved location.",
          "match_terms": [
            "install condenser",
            "outdoor AC unit",
            "new condenser"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "refrigerant",
            "manufacturer",
            "code"
          ],
          "editor_note": "Pad and clearance conditions may affect scope."
        },
        {
          "id": "install_indoor_cooling_component",
          "title": "Install indoor cooling component",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the indoor cooling component included in the approved scope.",
          "match_terms": [
            "evaporator coil",
            "indoor coil",
            "air handler coil"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "manufacturer",
            "code"
          ],
          "editor_note": "Use for coil or matched indoor component."
        },
        {
          "id": "refrigerant_line_connection",
          "title": "Refrigerant line connection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Connect refrigerant lines for the approved replacement system.",
          "match_terms": [
            "line set",
            "refrigerant lines",
            "copper lines"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Regulated refrigerant work."
        },
        {
          "id": "system_startup_and_check",
          "title": "System startup and operation check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Start the replacement system and check basic operation.",
          "match_terms": [
            "AC startup",
            "system startup",
            "test cooling"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Do not imply performance guarantee."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Common materials, permits, duct, and site condition items.",
      "items": [
        {
          "id": "replacement_ac_equipment",
          "title": "Replacement AC equipment",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Provide replacement AC equipment selected for the approved scope.",
          "match_terms": [
            "AC equipment",
            "condenser",
            "coil"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "No brand, efficiency rating, or size unless contractor selects."
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
            "AC permit",
            "HVAC inspection",
            "permit coordination"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "permit",
            "code",
            "regional",
            "licensing"
          ],
          "editor_note": "Local handling varies."
        },
        {
          "id": "line_set_or_electrical_review",
          "title": "Line set or electrical condition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Existing line set, disconnect, wiring, or breaker conditions may affect final scope.",
          "match_terms": [
            "old line set",
            "disconnect box",
            "breaker size",
            "electrical whip"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Review-only unless specific work is listed."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_ac_replacement",
      "label": "Standard central AC replacement",
      "text": "Replace the listed central AC equipment and start the system after installation.",
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
      "id": "permit_note",
      "text": "Permit, inspection, or code-related items are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "permit",
        "code",
        "regional"
      ]
    },
    {
      "id": "duct_note",
      "text": "Duct repairs, duct replacement, or airflow redesign are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "code"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "ac_replacement_terms",
      "text": "Final scope may change if existing refrigerant lines, electrical components, duct transitions, pads, or access conditions are not suitable for the planned replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "code",
        "manufacturer"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_equipment_match",
      "label": "Confirm equipment match",
      "detail": "Confirm outdoor unit, indoor coil or air handler, refrigerant type, thermostat, pad, line set, and manufacturer requirements.",
      "review_flags": [
        "manufacturer",
        "refrigerant",
        "electrical"
      ]
    },
    {
      "id": "confirm_permit_and_regional",
      "label": "Confirm permit and regional conditions",
      "detail": "Review local permit, inspection, wind, elevation, drain, and equipment location requirements.",
      "review_flags": [
        "permit",
        "code",
        "regional",
        "licensing"
      ]
    }
  ],
  "excluded_items": [
    "Duct replacement unless listed",
    "Electrical circuit repair unless listed",
    "Line set replacement unless listed",
    "Thermostat replacement unless listed",
    "Structural platform repair",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
