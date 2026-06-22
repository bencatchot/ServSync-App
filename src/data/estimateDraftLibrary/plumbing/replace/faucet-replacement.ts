import type { EstimateDraftLibraryBundle } from '../../types';

export const faucetReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "faucet_replacement",
  "display_name": "Faucet Replacement",
  "aliases": [
    "replace faucet",
    "install faucet",
    "kitchen faucet replacement",
    "bathroom faucet replacement",
    "leaking faucet replacement",
    "customer supplied faucet"
  ],
  "scope_summary": "Remove an existing faucet and install a replacement faucet at the same sink location.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard faucet removal, installation, connection, and testing.",
      "items": [
        {
          "id": "remove_existing_faucet",
          "title": "Remove existing faucet",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Disconnect and remove the existing faucet from the approved sink location.",
          "match_terms": [
            "remove faucet",
            "old faucet removal",
            "faucet replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Check for corrosion and tight access."
        },
        {
          "id": "install_replacement_faucet",
          "title": "Install replacement faucet",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement faucet at the existing sink location.",
          "match_terms": [
            "install faucet",
            "replace faucet",
            "new faucet"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm hole count, deck plate, and fixture type."
        },
        {
          "id": "connect_supply_lines",
          "title": "Connect faucet supply lines",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Connect the faucet to existing hot and cold water supplies where suitable.",
          "match_terms": [
            "connect supply lines",
            "hot and cold supply",
            "faucet water lines"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Add valve or piping items if supplies are damaged."
        },
        {
          "id": "test_faucet",
          "title": "Test faucet operation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test faucet operation and check visible connections for leaks.",
          "match_terms": [
            "test faucet",
            "check leaks",
            "run water"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Basic function test only."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Common add-ons and fit checks.",
      "items": [
        {
          "id": "new_supply_connectors",
          "title": "New faucet supply connectors",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Provide new faucet supply connectors where needed for the installation.",
          "match_terms": [
            "supply connectors",
            "faucet supply lines",
            "braided lines"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Common material."
        },
        {
          "id": "drain_assembly",
          "title": "Pop-up or drain assembly replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the sink drain or pop-up assembly where included in the approved scope.",
          "match_terms": [
            "pop up drain",
            "drain assembly",
            "bathroom sink drain"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Common for bathroom faucets."
        },
        {
          "id": "sink_shutoff_valves",
          "title": "Sink shutoff valve replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace sink shutoff valves where included in the approved scope.",
          "match_terms": [
            "angle stop",
            "shutoff valve",
            "valve leaking"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Use when valves leak, are seized, or unsuitable."
        },
        {
          "id": "minor_sink_adjustment",
          "title": "Minor sink opening adjustment",
          "line_type": "labor",
          "suggestion_behavior": "not_auto_added",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Minor sink opening adjustment may be needed only when included in the approved scope.",
          "match_terms": [
            "hole too small",
            "deck plate issue",
            "sink modification"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural"
          ],
          "editor_note": "Do not auto-add; modification risk depends on material."
        },
        {
          "id": "fixture_fit_review",
          "title": "Faucet fit review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Faucet fit may depend on hole count, clearance, deck plate, and sink or countertop condition.",
          "match_terms": [
            "faucet hole count",
            "deck plate",
            "countertop clearance"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Review before final scope."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_faucet_replacement",
      "label": "Standard faucet replacement",
      "text": "Remove the existing faucet and install a replacement faucet at the same sink location.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "faucet_with_drain",
      "label": "Faucet with drain assembly",
      "text": "Install the replacement faucet and included drain assembly where compatible with the existing sink.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "compatibility_note",
      "text": "Fixture compatibility depends on the selected faucet and existing sink opening.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "valve_note",
      "text": "Damaged or leaking shutoff valves are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "customer_fixture_terms",
      "text": "Customer-supplied faucets must include needed parts and be compatible with the existing sink.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "countertop_terms",
      "text": "Countertop, sink, or cabinet modifications are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_fit",
      "label": "Confirm faucet fit",
      "detail": "Verify hole count, supply connection size, deck plate needs, and drain assembly scope.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "confirm_valves",
      "label": "Confirm shutoff valves",
      "detail": "Check whether hot and cold shutoff valves work and should be replaced.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Sink replacement",
    "Countertop modification",
    "Cabinet repair",
    "Water damage repair",
    "Shutoff valve replacement unless listed",
    "Drain repair unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
