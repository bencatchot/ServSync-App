import type { EstimateDraftLibraryBundle } from '../../types';

export const tankStyleWaterHeaterReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "tank_style_water_heater_replacement",
  "display_name": "Tank-Style Water Heater Replacement",
  "aliases": [
    "replace water heater",
    "leaking water heater",
    "tank water heater replacement",
    "gas water heater replacement",
    "electric water heater replacement",
    "no hot water replace tank"
  ],
  "scope_summary": "Replacement of an existing residential tank-style water heater in the same general location.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Core removal, installation, and startup items.",
      "items": [
        {
          "id": "shut_down_and_drain",
          "title": "Shut down and drain existing water heater",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Shut down and drain the existing tank-style water heater for removal.",
          "match_terms": [
            "drain existing water heater",
            "remove old tank",
            "water heater replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm fuel type and safe shutoff method."
        },
        {
          "id": "remove_existing_tank",
          "title": "Remove existing water heater",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Disconnect and remove the existing tank-style water heater.",
          "match_terms": [
            "remove water heater",
            "disconnect existing tank",
            "old water heater"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm access, stairs, attic/platform location, and drain path."
        },
        {
          "id": "install_replacement_tank",
          "title": "Install replacement tank-style water heater",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a replacement tank-style water heater in the agreed location.",
          "match_terms": [
            "install water heater",
            "replacement tank",
            "new tank water heater"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "permit",
            "manufacturer"
          ],
          "editor_note": "Contractor should confirm local requirements and manufacturer instructions."
        },
        {
          "id": "connect_water_lines",
          "title": "Connect water lines",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Connect the replacement water heater to existing hot and cold water piping where suitable.",
          "match_terms": [
            "water heater connections",
            "hot and cold lines",
            "supply connectors"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code"
          ],
          "editor_note": "Add separate piping repair items if existing piping is damaged or unsuitable."
        },
        {
          "id": "startup_function_check",
          "title": "Startup and function check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Start the replacement water heater and check for basic operation and visible leaks.",
          "match_terms": [
            "startup water heater",
            "test hot water",
            "check for leaks"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "safety"
          ],
          "editor_note": "Functional check only; no code or safety guarantee."
        }
      ]
    },
    {
      "id": "materials_fees_review",
      "title": "Materials, Fees, and Review",
      "description": "Common materials, chargeable conditionals, and review-only cautions.",
      "items": [
        {
          "id": "replacement_water_heater",
          "title": "Replacement tank-style water heater",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide a replacement tank-style water heater selected for the approved scope.",
          "match_terms": [
            "water heater unit",
            "replacement tank",
            "tank-style water heater"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Do not include brand or size unless selected by contractor."
        },
        {
          "id": "water_supply_connectors",
          "title": "Water supply connectors",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Provide new water supply connectors where needed for the replacement installation.",
          "match_terms": [
            "supply connectors",
            "water heater flex lines",
            "water connections"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code"
          ],
          "editor_note": "Common replacement material."
        },
        {
          "id": "haul_away_old_tank",
          "title": "Disposal / haul-away of existing water heater",
          "line_type": "fee",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove and haul away the existing water heater from the property.",
          "match_terms": [
            "haul away water heater",
            "dispose old tank"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Confirm contractor default."
        },
        {
          "id": "permit_admin_coordination",
          "title": "Permit or administrative coordination",
          "line_type": "fee",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Permit or administrative coordination may be included where applicable.",
          "match_terms": [
            "water heater permit",
            "inspection fee",
            "permit coordination"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "permit",
            "code",
            "regional",
            "licensing"
          ],
          "editor_note": "Only use when contractor includes permit/admin scope."
        },
        {
          "id": "expansion_or_drain_pan_item",
          "title": "Expansion control or drain pan item",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Add expansion control, drain pan, or drain routing items where included in the approved scope.",
          "match_terms": [
            "expansion tank",
            "drain pan",
            "pan drain",
            "thermal expansion"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional",
            "safety"
          ],
          "editor_note": "May depend on site conditions and local requirements."
        },
        {
          "id": "venting_or_power_review",
          "title": "Venting, fuel, or power review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Existing venting, fuel, or power conditions may affect final scope.",
          "match_terms": [
            "gas vent",
            "combustion air",
            "electric connection",
            "gas connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "gas",
            "electrical",
            "code",
            "safety"
          ],
          "editor_note": "Review only unless a specific repair item is added."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "same_location_replacement",
      "label": "Same-location replacement",
      "text": "Replace the existing tank-style water heater in the same general location using the approved replacement unit.",
      "contractor_review_required": true,
      "review_flags": [
        "code",
        "permit",
        "gas",
        "electrical"
      ]
    },
    {
      "id": "existing_connections",
      "label": "Existing connection reuse",
      "text": "Reconnect to existing water, fuel, vent, and power connections where they are suitable for reuse.",
      "contractor_review_required": true,
      "review_flags": [
        "code",
        "gas",
        "electrical",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "permit_note",
      "text": "Permit, inspection, or code-related items are included only when listed in the estimate.",
      "contractor_review_required": true,
      "review_flags": [
        "permit",
        "code",
        "regional"
      ]
    },
    {
      "id": "connection_note",
      "text": "Repairs to damaged or unsuitable piping, venting, wiring, or supports are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "code",
        "safety",
        "structural",
        "electrical",
        "gas"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "water_heater_terms",
      "text": "Final scope may change if existing connections, venting, drainage, or access conditions are not suitable for the planned replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "code",
        "safety",
        "gas",
        "electrical"
      ]
    },
    {
      "id": "equipment_terms",
      "text": "Equipment model, size, and options should match the approved estimate details.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_fuel_type",
      "label": "Confirm fuel type",
      "detail": "Confirm gas, electric, or other fuel type and related labor requirements.",
      "review_flags": [
        "gas",
        "electrical",
        "safety"
      ]
    },
    {
      "id": "confirm_permit",
      "label": "Confirm permit and inspection handling",
      "detail": "Review local permit and inspection requirements for water heater replacement.",
      "review_flags": [
        "permit",
        "code",
        "regional",
        "licensing"
      ]
    },
    {
      "id": "confirm_location",
      "label": "Confirm location conditions",
      "detail": "Check attic, platform, closet, garage, drain pan, expansion control, and access conditions.",
      "review_flags": [
        "code",
        "regional",
        "safety",
        "structural"
      ]
    }
  ],
  "excluded_items": [
    "Major piping reroute unless listed",
    "Gas line replacement unless listed",
    "Electrical circuit repair unless listed",
    "Venting replacement unless listed",
    "Water damage repair",
    "Structural platform repair"
  ]
} satisfies EstimateDraftLibraryBundle;
