import type { EstimateDraftLibraryBundle } from '../../types';

export const sidingOrFasciaBoardRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "siding_or_fascia_board_repair",
  "display_name": "Siding or fascia board repair",
  "aliases": [
    "siding or fascia board repair",
    "Siding or fascia board repair",
    "Repair or replace approved damaged siding, fascia, soffit, or exterior trim boards.",
    "Siding, fascia, or soffit board repair",
    "Exterior board and fastener materials",
    "Exterior joint sealing"
  ],
  "scope_summary": "Repair or replace approved damaged siding, fascia, soffit, or exterior trim boards.",
  "sections": [
    {
      "id": "siding_or_fascia_board_repair_repair_scope",
      "title": "Siding or fascia board repair",
      "description": "Repair or replace approved damaged siding, fascia, soffit, or exterior trim boards.",
      "items": [
        {
          "id": "siding_fascia_or_soffit_board_repair",
          "title": "Siding, fascia, or soffit board repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace the approved damaged exterior boards.",
          "match_terms": [
            "Siding, fascia, or soffit board repair",
            "Siding or fascia board repair",
            "siding or fascia board repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "structural"
          ],
          "editor_note": "Confirm material type, profile, access height, gutter interaction, roof edge condition, water damage, and paint/stain scope."
        },
        {
          "id": "exterior_board_and_fastener_materials",
          "title": "Exterior board and fastener materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved exterior board and fastener materials.",
          "match_terms": [
            "Exterior board and fastener materials",
            "Siding or fascia board repair",
            "siding or fascia board repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm matching material, fiber cement clearances, PVC movement, wood priming, fastener compatibility, and caulk type."
        },
        {
          "id": "exterior_joint_sealing",
          "title": "Exterior joint sealing",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Seal repaired exterior joints where needed.",
          "match_terms": [
            "Exterior joint sealing",
            "Siding or fascia board repair",
            "siding or fascia board repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "regional"
          ],
          "editor_note": "Do not cover active water intrusion without identifying likely source."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Repair approved siding, fascia, soffit, or exterior trim."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install matching exterior-rated board material."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Seal exterior joints after repair."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Paint matching is not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Roof, gutter, or hidden framing issues may require additional work."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes roof repair, gutter work, hidden framing repair, paint, stain, and water damage remediation unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "siding_fascia_or_soffit_board_repair_review",
      "label": "Siding, fascia, or soffit board repair review",
      "detail": "Confirm material type, profile, access height, gutter interaction, roof edge condition, water damage, and paint/stain scope.",
      "review_flags": [
        "regional",
        "structural"
      ]
    },
    {
      "id": "exterior_board_and_fastener_materials_review",
      "label": "Exterior board and fastener materials review",
      "detail": "Confirm matching material, fiber cement clearances, PVC movement, wood priming, fastener compatibility, and caulk type.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "exterior_joint_sealing_review",
      "label": "Exterior joint sealing review",
      "detail": "Do not cover active water intrusion without identifying likely source.",
      "review_flags": [
        "structural",
        "regional"
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
