import type { EstimateDraftLibraryBundle } from '../../types';

export const deckRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "deck_repair",
  "display_name": "Deck Repair",
  "aliases": [
    "deck repair",
    "replace deck boards",
    "rotted deck boards",
    "loose deck boards",
    "deck railing repair",
    "deck stair repair",
    "soft deck boards",
    "damaged deck"
  ],
  "scope_summary": "Repair damaged, loose, or rotted deck components within the approved repair area.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Standard deck repair inspection, removal, replacement, and fastening items.",
      "items": [
        {
          "id": "deck_repair_area_review",
          "title": "Deck repair area review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the visible deck repair area and confirm the planned repair scope.",
          "match_terms": [
            "deck repair",
            "soft deck boards",
            "rotted deck",
            "loose deck boards"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Use as a review-sensitive opening item because visible deck damage may hide framing issues."
        },
        {
          "id": "remove_damaged_decking",
          "title": "Remove damaged deck boards",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove damaged deck boards from the agreed repair area.",
          "match_terms": [
            "remove deck boards",
            "rotted boards",
            "broken deck boards",
            "damaged decking"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Quantity should be adjusted by contractor."
        },
        {
          "id": "install_replacement_decking",
          "title": "Install replacement deck boards",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install replacement deck boards in the agreed repair area.",
          "match_terms": [
            "replace deck boards",
            "new deck boards",
            "deck board repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "manufacturer"
          ],
          "editor_note": "Confirm board material, thickness, spacing, and fastening method."
        },
        {
          "id": "replacement_decking_material",
          "title": "Replacement decking material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide replacement decking material for the approved repair area.",
          "match_terms": [
            "deck boards",
            "decking material",
            "wood decking",
            "composite decking"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural"
          ],
          "editor_note": "Avoid brand-specific or exact material claims unless contractor selects them."
        },
        {
          "id": "deck_fasteners",
          "title": "Deck fasteners",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide appropriate fasteners for the approved deck repair.",
          "match_terms": [
            "deck screws",
            "deck fasteners",
            "secure deck boards"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural",
            "regional"
          ],
          "editor_note": "Fastener type may depend on material and exposure conditions."
        },
        {
          "id": "cleanup_deck_repair_area",
          "title": "Clean up deck repair area",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Clean up debris from the immediate deck repair area.",
          "match_terms": [
            "deck repair cleanup",
            "remove deck debris",
            "job cleanup"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Basic cleanup only."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Common deck repair conditionals and structural review reminders.",
      "items": [
        {
          "id": "joist_or_framing_repair",
          "title": "Deck joist or framing repair",
          "line_type": "labor",
          "suggestion_behavior": "not_auto_added",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair deck framing only where included in the approved scope.",
          "match_terms": [
            "rotted joist",
            "deck framing repair",
            "soft framing",
            "structural deck repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code",
            "permit"
          ],
          "editor_note": "Do not auto-add structural framing repair."
        },
        {
          "id": "deck_railing_repair",
          "title": "Deck railing repair",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair loose or damaged deck railing components where included in the approved scope.",
          "match_terms": [
            "deck railing repair",
            "loose railing",
            "wobbly rail",
            "damaged handrail"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Railing work can be safety and code sensitive."
        },
        {
          "id": "deck_stair_repair",
          "title": "Deck stair repair",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair damaged deck stair components where included in the approved scope.",
          "match_terms": [
            "deck stair repair",
            "loose steps",
            "rotted stair tread",
            "stair stringer"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Stair repair should be reviewed carefully before customer approval."
        },
        {
          "id": "stain_or_seal_repair_area",
          "title": "Stain or seal repaired deck area",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Stain or seal the repaired deck area where included in the approved scope.",
          "match_terms": [
            "stain deck repair",
            "seal deck boards",
            "finish deck boards"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional"
          ],
          "editor_note": "Finish matching may not be exact."
        },
        {
          "id": "hidden_rot_review",
          "title": "Hidden rot or structural condition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Hidden rot or structural issues may require additional approved repair work.",
          "match_terms": [
            "hidden rot",
            "structural deck damage",
            "widespread rot",
            "unsafe deck"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code",
            "permit"
          ],
          "editor_note": "Review-only reminder; do not imply the deck is safe or code-compliant."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "localized_deck_repair",
      "label": "Localized deck repair",
      "text": "Repair the damaged deck components in the agreed repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "deck_board_replacement",
      "label": "Deck board replacement",
      "text": "Remove damaged deck boards and install replacement boards in the approved repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "hidden_rot_note",
      "text": "Hidden rot, framing damage, or unsafe conditions may require additional approved work.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "finish_match_note",
      "text": "New materials and finish repairs may not match existing weathered materials exactly.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "terms_candidates": [
    {
      "id": "deck_scope_terms",
      "text": "This estimate is limited to the listed deck repair scope and does not include full deck replacement unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "deck_finish_terms",
      "text": "Staining, sealing, painting, or finish matching is included only when listed.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_structural_condition",
      "label": "Confirm structural condition",
      "detail": "Check visible decking, joists, beams, posts, ledger area, stairs, railings, and fasteners before finalizing scope.",
      "review_flags": [
        "structural",
        "safety",
        "code"
      ]
    },
    {
      "id": "confirm_repair_vs_replace",
      "label": "Confirm repair versus replacement",
      "detail": "If rot or damage is widespread, consider whether limited repair is appropriate or whether replacement should be discussed.",
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "confirm_permit_conditions",
      "label": "Confirm permit or code-sensitive work",
      "detail": "Review local requirements when deck work affects structure, stairs, railings, height, attachment, or load-bearing components.",
      "review_flags": [
        "permit",
        "code",
        "regional",
        "structural"
      ]
    }
  ],
  "excluded_items": [
    "Full deck replacement unless listed",
    "Structural framing repair unless listed",
    "Railing replacement unless listed",
    "Stair replacement unless listed",
    "Ledger repair unless listed",
    "Permit fees unless listed",
    "Painting, staining, or sealing unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
