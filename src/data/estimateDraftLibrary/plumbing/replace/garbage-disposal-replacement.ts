import type { EstimateDraftLibraryBundle } from '../../types';

export const garbageDisposalReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "garbage_disposal_replacement",
  "display_name": "Garbage Disposal Replacement",
  "aliases": [
    "replace garbage disposal",
    "disposal not working",
    "install garbage disposal",
    "garbage disposer replacement",
    "kitchen disposal leaking",
    "jammed disposal replacement"
  ],
  "scope_summary": "Remove an existing garbage disposal and install a replacement disposal at the same kitchen sink location.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard disposal replacement tasks.",
      "items": [
        {
          "id": "disconnect_existing_disposal",
          "title": "Disconnect existing disposal",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Disconnect and remove the existing garbage disposal.",
          "match_terms": [
            "remove disposal",
            "disconnect garbage disposal",
            "old disposal"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm power source and safe disconnect method."
        },
        {
          "id": "install_replacement_disposal",
          "title": "Install replacement disposal",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement garbage disposal at the existing sink location.",
          "match_terms": [
            "install garbage disposal",
            "replace disposal",
            "new disposer"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "electrical"
          ],
          "editor_note": "Confirm unit type and mounting assembly."
        },
        {
          "id": "connect_discharge_drain",
          "title": "Connect disposal discharge drain",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Connect the disposal discharge to existing drain piping where suitable.",
          "match_terms": [
            "disposal drain connection",
            "discharge tube",
            "kitchen sink drain"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Add drain correction if existing piping is unsuitable."
        },
        {
          "id": "reconnect_existing_power",
          "title": "Reconnect existing power connection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Reconnect to the existing power connection where suitable for the replacement disposal.",
          "match_terms": [
            "disposal power",
            "hardwired disposal",
            "plug in disposal"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Electrical conditions vary."
        },
        {
          "id": "test_disposal",
          "title": "Test disposal operation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test disposal operation and check visible drain connections for leaks.",
          "match_terms": [
            "test disposal",
            "run disposal",
            "check leak"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Basic operation test only."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Related materials and non-plumbing caution items.",
      "items": [
        {
          "id": "replacement_disposal_unit",
          "title": "Replacement garbage disposal unit",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide a replacement garbage disposal unit selected for the approved scope.",
          "match_terms": [
            "garbage disposal unit",
            "disposer unit",
            "replacement disposal"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Do not include brand or horsepower unless selected."
        },
        {
          "id": "mounting_hardware",
          "title": "Mounting gasket and hardware",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Provide standard mounting gasket and hardware needed for the disposal installation.",
          "match_terms": [
            "mounting gasket",
            "disposal hardware",
            "sink flange"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Verify customer-supplied units are complete."
        },
        {
          "id": "dishwasher_drain_connection",
          "title": "Dishwasher drain connection",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Connect the dishwasher drain hose to the disposal where included in the approved scope.",
          "match_terms": [
            "dishwasher drain",
            "knockout plug",
            "disposal dishwasher connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm knockout plug and hose routing."
        },
        {
          "id": "trap_or_drain_correction",
          "title": "Trap or drain piping correction",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Correct nearby sink drain piping where included in the approved scope.",
          "match_terms": [
            "trap correction",
            "drain piping issue",
            "kitchen sink drain repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code"
          ],
          "editor_note": "Use only when needed."
        },
        {
          "id": "electrical_repair_review",
          "title": "Electrical repair review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Outlet, switch, wiring, or breaker issues are separate from standard disposal replacement.",
          "match_terms": [
            "disposal outlet not working",
            "switch problem",
            "breaker trips"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Do not auto-add electrical repair to plumbing scope."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_disposal_replacement",
      "label": "Standard disposal replacement",
      "text": "Remove the existing garbage disposal and install a replacement unit at the same sink location.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer"
      ]
    },
    {
      "id": "with_dishwasher",
      "label": "With dishwasher connection",
      "text": "Install the replacement disposal and reconnect the dishwasher drain where included in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "electrical_note",
      "text": "Electrical outlet, switch, wiring, or breaker repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "licensing"
      ]
    },
    {
      "id": "parts_note",
      "text": "Customer-supplied disposal units must include required mounting parts and be compatible with the existing sink.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "fit_terms",
      "text": "Final installation depends on the selected disposal unit and existing sink, drain, and power conditions.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "electrical"
      ]
    },
    {
      "id": "drain_terms",
      "text": "Drain piping corrections are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "code"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_power",
      "label": "Confirm power condition",
      "detail": "Verify plug-in or hardwired setup and whether electrical work is outside plumbing scope.",
      "review_flags": [
        "electrical",
        "code",
        "licensing",
        "safety"
      ]
    },
    {
      "id": "confirm_dishwasher",
      "label": "Confirm dishwasher connection",
      "detail": "Check whether dishwasher drain reconnect is included and knockout plug is removed where applicable.",
      "review_flags": [
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Electrical outlet repair",
    "Switch or breaker repair",
    "Sink replacement",
    "Cabinet repair",
    "Major drain piping repair",
    "Water damage repair"
  ]
} satisfies EstimateDraftLibraryBundle;
