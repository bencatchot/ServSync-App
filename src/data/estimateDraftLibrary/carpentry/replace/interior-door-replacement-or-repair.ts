import type { EstimateDraftLibraryBundle } from '../../types';

export const interiorDoorReplacementOrRepairBundle = {
  "trade": "carpentry",
  "work_category": "replace",
  "job_bundle": "interior_door_replacement_or_repair",
  "display_name": "Interior door replacement or repair",
  "aliases": [
    "interior door replacement or repair",
    "Interior door replacement or repair",
    "Repair or replace an interior door so it opens, closes, and latches properly.",
    "Door hardware transfer or installation",
    "Door adjustment and latch test"
  ],
  "scope_summary": "Repair or replace an interior door so it opens, closes, and latches properly.",
  "sections": [
    {
      "id": "interior_door_replacement_or_repair_replacement_scope",
      "title": "Interior door replacement or repair",
      "description": "Repair or replace an interior door so it opens, closes, and latches properly.",
      "items": [
        {
          "id": "interior_door_replacement_or_repair",
          "title": "Interior door replacement or repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace the approved interior door.",
          "match_terms": [
            "Interior door replacement or repair",
            "interior door replacement or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm slab vs prehung, swing direction, jamb condition, hinge size, latch bore, door thickness, floor clearance, and paint/stain scope."
        },
        {
          "id": "door_hardware_transfer_or_installation",
          "title": "Door hardware transfer or installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install or transfer approved door hardware.",
          "match_terms": [
            "Door hardware transfer or installation",
            "Interior door replacement or repair",
            "interior door replacement or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm knob/lever, latch, privacy/passage function, strike plate fit, and customer-selected finish."
        },
        {
          "id": "door_adjustment_and_latch_test",
          "title": "Door adjustment and latch test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Adjust the door and test basic operation after installation.",
          "match_terms": [
            "Door adjustment and latch test",
            "Interior door replacement or repair",
            "interior door replacement or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Check reveals, hinge bind, latch alignment, and rubbing at floor or jamb."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Replace approved interior door."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install or transfer door hardware."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Adjust door for basic operation."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Painting, staining, or finish repair is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Existing jamb or trim damage may require additional repair."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes paint, stain, drywall repair, and flooring modification unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "interior_door_replacement_or_repair_review",
      "label": "Interior door replacement or repair review",
      "detail": "Confirm slab vs prehung, swing direction, jamb condition, hinge size, latch bore, door thickness, floor clearance, and paint/stain scope.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "door_hardware_transfer_or_installation_review",
      "label": "Door hardware transfer or installation review",
      "detail": "Confirm knob/lever, latch, privacy/passage function, strike plate fit, and customer-selected finish.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "door_adjustment_and_latch_test_review",
      "label": "Door adjustment and latch test review",
      "detail": "Check reveals, hinge bind, latch alignment, and rubbing at floor or jamb.",
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
