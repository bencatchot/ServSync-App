import type { EstimateDraftLibraryBundle } from '../../types';

export const accessibleFixtureOrSupplyLeakRepairBundle = {
  "trade": "plumbing",
  "work_category": "repair",
  "job_bundle": "accessible_fixture_or_supply_leak_repair",
  "display_name": "Accessible Fixture or Supply Leak Repair",
  "aliases": [
    "leak under sink",
    "supply line leak",
    "fixture leak repair",
    "pipe leaking under cabinet",
    "toilet supply leak",
    "faucet connection leak",
    "visible plumbing leak"
  ],
  "scope_summary": "Repair a visible and accessible leak at a fixture, supply connector, valve, trap, or exposed plumbing connection.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Core visible leak repair steps.",
      "items": [
        {
          "id": "locate_visible_leak",
          "title": "Locate visible leak source",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Inspect the visible plumbing area to locate the apparent leak source.",
          "match_terms": [
            "find leak under sink",
            "visible leak",
            "leak source"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "This is not hidden leak detection."
        },
        {
          "id": "isolate_water_supply",
          "title": "Isolate water supply",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Shut off the affected water supply where accessible for the repair.",
          "match_terms": [
            "shut off water",
            "isolate leak",
            "turn off valve"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm shutoff valves work."
        },
        {
          "id": "repair_accessible_connection",
          "title": "Repair accessible plumbing connection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair the accessible leaking connection included in the approved scope.",
          "match_terms": [
            "repair leaking connection",
            "fix supply leak",
            "trap leak repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Keep flexible if exact repair is unknown."
        },
        {
          "id": "test_repaired_area",
          "title": "Test repaired area",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Restore water service and check the repaired area for visible leaks.",
          "match_terms": [
            "test leak repair",
            "check for leaks",
            "run water after repair"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Visible leak check only."
        }
      ]
    },
    {
      "id": "materials_conditionals_review",
      "title": "Materials, Conditionals, and Review",
      "description": "Common repair parts and hidden-condition cautions.",
      "items": [
        {
          "id": "supply_connector_replacement",
          "title": "Supply connector replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace a leaking or worn supply connector where included in the approved scope.",
          "match_terms": [
            "replace supply line",
            "braided connector",
            "toilet supply leak"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Common fixture leak material."
        },
        {
          "id": "trap_or_drain_part",
          "title": "Trap or drain part replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace a leaking trap or drain component where included in the approved scope.",
          "match_terms": [
            "p trap leak",
            "sink drain leak",
            "trap replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "For drain-side leaks."
        },
        {
          "id": "fixture_shutoff_valve",
          "title": "Fixture shutoff valve replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace a leaking or non-working fixture shutoff valve where included in the approved scope.",
          "match_terms": [
            "angle stop leaking",
            "shutoff valve leak",
            "valve won't turn"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Often discovered during repair."
        },
        {
          "id": "minor_accessible_pipe_repair",
          "title": "Minor accessible pipe section repair",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace a minor accessible pipe section where included in the approved scope.",
          "match_terms": [
            "exposed pipe leak",
            "small pipe repair",
            "visible pipe leak"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Pipe material and repair method require review."
        },
        {
          "id": "hidden_leak_review",
          "title": "Hidden leak review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Leaks inside walls, ceilings, slabs, or concealed areas require separate access and repair scope.",
          "match_terms": [
            "hidden leak",
            "wall leak",
            "ceiling leak",
            "slab leak"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Do not auto-add concealed access work."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "accessible_leak_scope",
      "label": "Accessible leak repair",
      "text": "Repair the visible and accessible plumbing leak described in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "fixture_leak_scope",
      "label": "Fixture-area leak repair",
      "text": "Repair the accessible leak at the fixture connection, supply line, valve, trap, or drain component listed in this estimate.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "accessible_only",
      "text": "This estimate is limited to visible and accessible plumbing unless additional access work is listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "damage_note",
      "text": "Drywall, cabinet, flooring, and water damage repairs are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "hidden_conditions_terms",
      "text": "Hidden conditions may change the final scope if additional plumbing damage is found.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "approval_terms",
      "text": "Additional repair work requires homeowner approval unless included in the listed scope.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_visible_access",
      "label": "Confirm visibility and access",
      "detail": "Clarify whether the leak is visible and accessible or requires opening walls, floors, ceilings, or cabinets.",
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "confirm_material_type",
      "label": "Confirm material type",
      "detail": "Identify pipe, connector, valve, or trap material before final repair scope.",
      "review_flags": [
        "code",
        "licensing"
      ]
    }
  ],
  "excluded_items": [
    "Hidden leak detection",
    "Wall or ceiling opening",
    "Drywall repair",
    "Cabinet repair",
    "Flooring repair",
    "Mold remediation",
    "Water damage restoration"
  ]
} satisfies EstimateDraftLibraryBundle;
