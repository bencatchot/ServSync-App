import type { EstimateDraftLibraryBundle } from '../../types';

export const gateRepairOrReplacementBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "gate_repair_or_replacement",
  "display_name": "Gate repair or replacement",
  "aliases": [
    "gate repair or replacement",
    "Gate repair or replacement",
    "Repair or replace a wood gate so it opens, closes, and latches properly.",
    "Gate hardware replacement",
    "Gate adjustment and latch test"
  ],
  "scope_summary": "Repair or replace a wood gate so it opens, closes, and latches properly.",
  "sections": [
    {
      "id": "gate_repair_or_replacement_repair_scope",
      "title": "Gate repair or replacement",
      "description": "Repair or replace a wood gate so it opens, closes, and latches properly.",
      "items": [
        {
          "id": "gate_repair_or_replacement",
          "title": "Gate repair or replacement",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace the approved gate.",
          "match_terms": [
            "Gate repair or replacement",
            "gate repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm gate size, sag, post condition, hinge side, latch side, clearance, swing direction, ground slope, and material match."
        },
        {
          "id": "gate_hardware_replacement",
          "title": "Gate hardware replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install approved hinges, latch, handle, or gate hardware.",
          "match_terms": [
            "Gate hardware replacement",
            "Gate repair or replacement",
            "gate repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm hardware weight rating, outdoor rating, self-closing needs, lock needs, and customer-selected finish."
        },
        {
          "id": "gate_adjustment_and_latch_test",
          "title": "Gate adjustment and latch test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Adjust and test the gate after repair or replacement.",
          "match_terms": [
            "Gate adjustment and latch test",
            "Gate repair or replacement",
            "gate repair or replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Check latch alignment, hinge bind, sag, ground clearance, and post movement."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair or replace approved gate."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install gate hinges and latch hardware."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Adjust gate for basic operation."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Gate repair may require post repair if the existing post is loose or damaged."
    },
    {
      "id": "customer_note_2",
      "text": "Staining or sealing is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes post replacement, fence replacement, staining, sealing, and lock hardware unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "gate_repair_or_replacement_review",
      "label": "Gate repair or replacement review",
      "detail": "Confirm gate size, sag, post condition, hinge side, latch side, clearance, swing direction, ground slope, and material match.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "gate_hardware_replacement_review",
      "label": "Gate hardware replacement review",
      "detail": "Confirm hardware weight rating, outdoor rating, self-closing needs, lock needs, and customer-selected finish.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "gate_adjustment_and_latch_test_review",
      "label": "Gate adjustment and latch test review",
      "detail": "Check latch alignment, hinge bind, sag, ground clearance, and post movement.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "monetary assumptions",
    "guaranteed code or permit requirements",
    "structural conclusions without contractor review",
    "paint, stain, or finish work unless listed",
    "hidden condition repairs unless approved"
  ]
} satisfies EstimateDraftLibraryBundle;
