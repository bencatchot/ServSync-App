import type { EstimateDraftLibraryBundle } from '../../types';

export const ductlessMiniSplitInstallBundle = {
  "trade": "hvac",
  "work_category": "install",
  "job_bundle": "ductless_mini_split_install",
  "display_name": "Ductless Mini-Split Installation",
  "aliases": [
    "mini split install",
    "ductless install",
    "ductless heat pump",
    "single zone mini split",
    "multi zone mini split",
    "garage mini split",
    "bonus room mini split"
  ],
  "scope_summary": "Installation of ductless mini-split equipment for an approved room, zone, or area.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Common mini-split equipment, line set, drain, and startup items.",
      "items": [
        {
          "id": "mini_split_site_review",
          "title": "Mini-split site review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review indoor and outdoor locations, route, access, and visible installation conditions.",
          "match_terms": [
            "mini split location",
            "ductless install",
            "wall unit location"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "refrigerant",
            "structural",
            "manufacturer"
          ],
          "editor_note": "Confirm mounting and route."
        },
        {
          "id": "install_indoor_head",
          "title": "Install indoor mini-split head",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the indoor mini-split unit at the approved location.",
          "match_terms": [
            "indoor head",
            "wall cassette",
            "mini split head"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural",
            "safety"
          ],
          "editor_note": "Mounting surface matters."
        },
        {
          "id": "install_outdoor_unit",
          "title": "Install outdoor mini-split unit",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the outdoor mini-split unit at the approved location.",
          "match_terms": [
            "outdoor mini split",
            "condenser",
            "heat pump unit"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "refrigerant",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Pad or bracket conditions may apply."
        },
        {
          "id": "install_line_set_and_drain",
          "title": "Install line set and condensate drain",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "set",
          "quantity": "1",
          "customer_description": "Install refrigerant lines and condensate drain routing included in the approved scope.",
          "match_terms": [
            "line set",
            "condensate drain",
            "line hide"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "code",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Drain routing must be reviewed."
        },
        {
          "id": "startup_mini_split",
          "title": "Startup and operation check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Start the mini-split system and check basic operation.",
          "match_terms": [
            "mini split startup",
            "test mini split",
            "operation check"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "electrical",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Basic operation check only."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_mini_split_install",
      "label": "Standard mini-split installation",
      "text": "Install ductless mini-split equipment at the approved indoor and outdoor locations.",
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
      "id": "electrical_note",
      "text": "Electrical circuit, disconnect, breaker, or panel work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "permit",
        "licensing"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "mini_split_terms",
      "text": "Final scope depends on equipment selection, wall conditions, line route, drain route, electrical requirements, and approved mounting locations.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "electrical",
        "manufacturer",
        "regional"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_zone_and_route",
      "label": "Confirm zone and route",
      "detail": "Confirm indoor head location, outdoor unit location, line route, wall penetration, drain routing, and line-hide expectations.",
      "review_flags": [
        "refrigerant",
        "structural",
        "regional",
        "manufacturer"
      ]
    }
  ],
  "excluded_items": [
    "Electrical circuit work unless listed",
    "Panel work unless listed",
    "Wall repair unless listed",
    "Painting unless listed",
    "Drain pump unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
