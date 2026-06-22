import type { EstimateDraftLibraryBundle } from '../../types';

export const outletOrSwitchReplacementBundle = {
  "trade": "electrical",
  "work_category": "replace",
  "job_bundle": "outlet_or_switch_replacement",
  "display_name": "Outlet or Switch Replacement",
  "aliases": [
    "replace outlet",
    "replace switch",
    "bad outlet",
    "bad switch",
    "loose outlet",
    "cracked outlet",
    "burned outlet",
    "light switch not working",
    "outlet not working"
  ],
  "scope_summary": "Replace an existing outlet or switch at the same location using the appropriate replacement device for the approved scope.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement",
      "description": "Standard outlet or switch replacement tasks.",
      "items": [
        {
          "id": "turn_off_and_verify_power",
          "title": "Turn off and verify power",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Shut off and verify power to the affected outlet or switch location.",
          "match_terms": [
            "replace outlet",
            "replace switch",
            "verify power"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "licensing"
          ],
          "editor_note": "Core safety step for electrical work."
        },
        {
          "id": "install_replacement_device",
          "title": "Install replacement outlet or switch",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a replacement outlet or switch at the existing location.",
          "match_terms": [
            "install outlet",
            "install switch",
            "replace receptacle"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Device type must match circuit and intended use."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_device_replacement",
      "label": "Standard device replacement",
      "text": "Replace the existing outlet or switch at the same location and test basic operation.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "wiring_condition_note",
      "text": "Damaged wiring, loose boxes, or hidden electrical issues are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety",
        "structural"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "existing_wiring_terms",
      "text": "Final scope may change if existing wiring, device box, or circuit conditions are not suitable for the planned replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_device_type",
      "label": "Confirm device type",
      "detail": "Confirm standard, GFCI, AFCI, tamper-resistant, weather-resistant, dimmer, smart, single-pole, three-way, or four-way device needs.",
      "review_flags": [
        "electrical",
        "code",
        "manufacturer"
      ]
    }
  ],
  "excluded_items": [
    "New circuit wiring",
    "Panel repair",
    "Drywall repair",
    "Paint or finish repair",
    "Hidden wiring repair unless listed",
    "Fixture replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
