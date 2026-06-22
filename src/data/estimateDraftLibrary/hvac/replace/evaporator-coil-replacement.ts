import type { EstimateDraftLibraryBundle } from '../../types';

export const evaporatorCoilReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "evaporator_coil_replacement",
  "display_name": "Evaporator Coil Replacement",
  "aliases": [
    "replace evaporator coil",
    "evaporator coil leak",
    "frozen coil replacement",
    "indoor coil replacement",
    "AC coil replacement"
  ],
  "scope_summary": "Replacement of an approved indoor evaporator coil or cooling coil component.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard evaporator coil replacement items.",
      "items": [
        {
          "id": "confirm_coil_scope",
          "title": "Confirm evaporator coil replacement scope",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Confirm the evaporator coil replacement scope for the affected HVAC system.",
          "match_terms": [
            "evaporator coil leak",
            "indoor coil replacement",
            "frozen coil"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "safety",
            "code"
          ],
          "editor_note": "Confirm diagnosis and access."
        },
        {
          "id": "remove_existing_evaporator_coil",
          "title": "Remove existing evaporator coil",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Remove the existing evaporator coil included in the approved scope.",
          "match_terms": [
            "remove coil",
            "old evaporator coil",
            "coil cabinet"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "safety"
          ],
          "editor_note": "Refrigerant handling may apply."
        },
        {
          "id": "install_replacement_evaporator_coil",
          "title": "Install replacement evaporator coil",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement evaporator coil included in the approved scope.",
          "match_terms": [
            "install coil",
            "replacement coil",
            "indoor coil"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm coil match and cabinet fit."
        },
        {
          "id": "drain_pan_or_transition_review",
          "title": "Drain pan or transition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Drain pan, plenum, or duct transition conditions may affect final coil replacement scope.",
          "match_terms": [
            "drain pan",
            "plenum",
            "duct transition"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Review-only unless included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_coil_replacement",
      "label": "Standard evaporator coil replacement",
      "text": "Replace the evaporator coil included in the approved repair scope.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "manufacturer",
        "code"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "coil_note",
      "text": "Drain pan, duct transition, refrigerant, or access-related work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "code",
        "manufacturer"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "coil_terms",
      "text": "Final scope may change if coil fit, refrigerant line condition, drain pan condition, plenum condition, or access issues are found.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "manufacturer",
        "code"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_coil_compatibility",
      "label": "Confirm coil compatibility",
      "detail": "Confirm coil match, refrigerant type, metering device, cabinet fit, drain pan, access, and manufacturer requirements.",
      "review_flags": [
        "refrigerant",
        "manufacturer",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Full system replacement unless listed",
    "Duct transition work unless listed",
    "Drain pan replacement unless listed",
    "Line set replacement unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
