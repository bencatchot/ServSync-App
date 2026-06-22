import type { EstimateDraftLibraryBundle } from '../../types';

export const toiletReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "toilet_replacement",
  "display_name": "Toilet Replacement",
  "aliases": [
    "replace toilet",
    "toilet install",
    "old toilet leaking",
    "new toilet installation",
    "toilet swap",
    "install customer supplied toilet"
  ],
  "scope_summary": "Remove an existing toilet and install a replacement toilet at the same rough-in location.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard toilet removal and replacement items.",
      "items": [
        {
          "id": "remove_existing_toilet",
          "title": "Remove existing toilet",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Disconnect and remove the existing toilet from the approved bathroom location.",
          "match_terms": [
            "remove toilet",
            "old toilet removal",
            "toilet replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Confirm disposal separately."
        },
        {
          "id": "install_replacement_toilet",
          "title": "Install replacement toilet",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement toilet at the existing toilet location.",
          "match_terms": [
            "install toilet",
            "replace toilet",
            "new toilet"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm rough-in and fixture fit."
        },
        {
          "id": "toilet_seal_hardware",
          "title": "Toilet seal and mounting hardware",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Install a new toilet seal and standard mounting hardware.",
          "match_terms": [
            "wax ring",
            "toilet seal",
            "closet bolts"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Neutral wording covers wax and wax-free seals."
        },
        {
          "id": "connect_supply_test",
          "title": "Connect water supply and test toilet",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Connect the toilet water supply and test for flushing and visible leaks.",
          "match_terms": [
            "connect supply line",
            "test toilet",
            "check for leaks"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Basic function test only."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Common condition-based items and review-only concerns.",
      "items": [
        {
          "id": "toilet_supply_connector",
          "title": "Toilet supply connector",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide a toilet supply connector where needed for the replacement.",
          "match_terms": [
            "toilet supply line",
            "supply connector",
            "water connector"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Often replaced during toilet work."
        },
        {
          "id": "haul_away_toilet",
          "title": "Toilet disposal / haul-away",
          "line_type": "fee",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove and haul away the existing toilet from the property.",
          "match_terms": [
            "haul away toilet",
            "dispose old toilet"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Contractor default may vary."
        },
        {
          "id": "toilet_shutoff_valve",
          "title": "Toilet shutoff valve replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace the toilet shutoff valve where included in the approved scope.",
          "match_terms": [
            "toilet shutoff valve",
            "angle stop",
            "valve leaking"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Use when valve is leaking, seized, or unsuitable."
        },
        {
          "id": "flange_repair",
          "title": "Toilet flange repair",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace the toilet flange where included in the approved scope.",
          "match_terms": [
            "broken flange",
            "toilet flange repair",
            "loose toilet"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "structural"
          ],
          "editor_note": "May not be known until toilet removal."
        },
        {
          "id": "floor_condition_review",
          "title": "Floor or subfloor condition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Soft flooring, rot, or damaged subfloor may require additional repair.",
          "match_terms": [
            "soft floor around toilet",
            "rotted subfloor",
            "water damage floor"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Do not include floor repair unless separately scoped."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_toilet_swap",
      "label": "Standard toilet swap",
      "text": "Remove the existing toilet and install a replacement toilet at the same location.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "conditional_repairs",
      "label": "Condition-based repairs",
      "text": "Additional flange, valve, or floor repairs are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "code"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "hidden_toilet_conditions",
      "text": "Hidden flange, floor, or valve issues may require additional approved work.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "customer_fixture_note",
      "text": "Customer-supplied fixtures must be complete, compatible, and available at the time of installation.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "fixture_fit_terms",
      "text": "Fixture fit depends on the selected toilet and existing rough-in location.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "floor_repair_terms",
      "text": "Repairs to flooring, subfloor, or hidden plumbing are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "code"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_rough_in",
      "label": "Confirm rough-in",
      "detail": "Verify toilet rough-in, flange condition, shutoff condition, and fixture dimensions.",
      "review_flags": [
        "manufacturer",
        "code"
      ]
    },
    {
      "id": "confirm_floor",
      "label": "Confirm floor condition",
      "detail": "Check for soft flooring, rot, or water damage during removal.",
      "review_flags": [
        "structural",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Flooring repair",
    "Subfloor repair",
    "Wall repair",
    "Major drain line repair",
    "Toilet relocation",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
