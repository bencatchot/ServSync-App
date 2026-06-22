import type { EstimateDraftLibraryBundle } from '../../types';

export const cabinetRepairOrHardwareAdjustmentBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "cabinet_repair_or_hardware_adjustment",
  "display_name": "Cabinet repair or hardware adjustment",
  "aliases": [
    "cabinet repair or hardware adjustment",
    "Cabinet repair or hardware adjustment",
    "Repair cabinet doors, drawers, hinges, slides, handles, or minor cabinet damage.",
    "Cabinet repair or adjustment",
    "Cabinet hardware replacement",
    "Door and drawer operation test"
  ],
  "scope_summary": "Repair cabinet doors, drawers, hinges, slides, handles, or minor cabinet damage.",
  "sections": [
    {
      "id": "cabinet_repair_or_hardware_adjustment_repair_scope",
      "title": "Cabinet repair or hardware adjustment",
      "description": "Repair cabinet doors, drawers, hinges, slides, handles, or minor cabinet damage.",
      "items": [
        {
          "id": "cabinet_repair_or_adjustment",
          "title": "Cabinet repair or adjustment",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or adjust approved cabinet doors, drawers, or cabinet components.",
          "match_terms": [
            "Cabinet repair or adjustment",
            "Cabinet repair or hardware adjustment",
            "cabinet repair or hardware adjustment"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm cabinet material, hinge type, drawer slide type, face frame condition, water damage, and hardware compatibility."
        },
        {
          "id": "cabinet_hardware_replacement",
          "title": "Cabinet hardware replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Replace approved cabinet hinges, drawer slides, pulls, knobs, or related hardware.",
          "match_terms": [
            "Cabinet hardware replacement",
            "Cabinet repair or hardware adjustment",
            "cabinet repair or hardware adjustment"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm hole spacing, soft-close requirements, overlay/inset style, and customer-selected finish."
        },
        {
          "id": "door_and_drawer_operation_test",
          "title": "Door and drawer operation test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Test repaired cabinet doors and drawers for basic operation.",
          "match_terms": [
            "Door and drawer operation test",
            "Cabinet repair or hardware adjustment",
            "cabinet repair or hardware adjustment"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Check alignment, rubbing, slide function, and pull/knob tightness."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair cabinet doors or drawers."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Replace approved hinges, slides, or handles."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Adjust cabinet operation after repair."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Matching older cabinet hardware may require special order or alternate hardware."
    },
    {
      "id": "customer_note_2",
      "text": "Painting, refinishing, or cabinet resurfacing is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes cabinet refinishing, repainting, countertop work, and water damage repair unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "cabinet_repair_or_adjustment_review",
      "label": "Cabinet repair or adjustment review",
      "detail": "Confirm cabinet material, hinge type, drawer slide type, face frame condition, water damage, and hardware compatibility.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "cabinet_hardware_replacement_review",
      "label": "Cabinet hardware replacement review",
      "detail": "Confirm hole spacing, soft-close requirements, overlay/inset style, and customer-selected finish.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "door_and_drawer_operation_test_review",
      "label": "Door and drawer operation test review",
      "detail": "Check alignment, rubbing, slide function, and pull/knob tightness.",
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
