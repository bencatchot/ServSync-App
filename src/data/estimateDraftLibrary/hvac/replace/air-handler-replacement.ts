import type { EstimateDraftLibraryBundle } from '../../types';

export const airHandlerReplacementBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "air_handler_replacement",
  "display_name": "Air Handler Replacement",
  "aliases": [
    "air handler replacement",
    "replace air handler",
    "indoor unit replacement",
    "heat pump air handler",
    "attic air handler",
    "closet air handler"
  ],
  "scope_summary": "Replacement of an existing residential air handler in the approved location.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Common air handler removal, installation, connection, and startup items.",
      "items": [
        {
          "id": "remove_existing_air_handler",
          "title": "Remove existing air handler",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Disconnect and remove the existing air handler included in the approved scope.",
          "match_terms": [
            "remove air handler",
            "old indoor unit",
            "air handler replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "safety"
          ],
          "editor_note": "Access may vary."
        },
        {
          "id": "install_replacement_air_handler",
          "title": "Install replacement air handler",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the replacement air handler at the approved location.",
          "match_terms": [
            "install air handler",
            "new air handler",
            "indoor unit replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm fit and support."
        },
        {
          "id": "connect_refrigerant_drain_and_controls",
          "title": "Connect refrigerant, drain, and controls",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Connect refrigerant, condensate drain, and control components where suitable for the approved installation.",
          "match_terms": [
            "refrigerant lines",
            "condensate drain",
            "control wiring"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Regulated and review-sensitive."
        },
        {
          "id": "drain_pan_or_float_switch",
          "title": "Drain pan or float switch",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install or replace drain pan or float switch components where included in the approved scope.",
          "match_terms": [
            "drain pan",
            "float switch",
            "secondary pan"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional",
            "manufacturer"
          ],
          "editor_note": "Often location-dependent."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_air_handler_replacement",
      "label": "Standard air handler replacement",
      "text": "Remove the existing air handler and install replacement equipment in the approved location.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "air_handler_note",
      "text": "Drain pan, float switch, auxiliary heat, duct transition, electrical, or permit items are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "permit"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "air_handler_terms",
      "text": "Final scope may change if access, support, duct transitions, refrigerant lines, drain routing, or electrical components are not suitable.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "code",
        "manufacturer"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_location_and_access",
      "label": "Confirm location and access",
      "detail": "Review attic, closet, platform, drain pan, float switch, support, duct connection, and service access conditions.",
      "review_flags": [
        "safety",
        "code",
        "regional"
      ]
    }
  ],
  "excluded_items": [
    "Outdoor unit replacement unless listed",
    "Duct replacement unless listed",
    "Electrical circuit upgrades unless listed",
    "Line set replacement unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
