import type { EstimateDraftLibraryBundle } from '../../types';

export const condensateDrainCleaningOrRepairBundle = {
  "trade": "hvac",
  "work_category": "service",
  "job_bundle": "condensate_drain_cleaning_or_repair",
  "display_name": "Condensate Drain Cleaning or Repair",
  "aliases": [
    "AC drain clogged",
    "condensate drain cleaning",
    "drain line clogged",
    "float switch tripped",
    "water around air handler",
    "AC leaking water"
  ],
  "scope_summary": "Service or repair of accessible HVAC condensate drain components in the approved scope.",
  "sections": [
    {
      "id": "core_service",
      "title": "Core Service",
      "description": "Common condensate drain clearing and testing items.",
      "items": [
        {
          "id": "condensate_drain_service_visit",
          "title": "Condensate drain service visit",
          "line_type": "fee",
          "suggestion_behavior": "default_candidate",
          "unit": "visit",
          "quantity": "1",
          "customer_description": "Service visit for an accessible HVAC condensate drain issue.",
          "match_terms": [
            "AC drain clogged",
            "float switch tripped",
            "water at air handler"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Use when contractor uses visit fee."
        },
        {
          "id": "clear_accessible_condensate_drain",
          "title": "Clear accessible condensate drain",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Clear the accessible condensate drain line included in the approved scope.",
          "match_terms": [
            "clear AC drain",
            "flush condensate line",
            "drain cleaning"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Method varies."
        },
        {
          "id": "inspect_pan_and_float_switch",
          "title": "Inspect drain pan and float switch",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Check accessible drain pan and float switch components for visible concerns.",
          "match_terms": [
            "drain pan",
            "float switch",
            "overflow switch"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Do not imply full water damage inspection."
        },
        {
          "id": "minor_pvc_drain_repair",
          "title": "Minor condensate drain repair",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair minor accessible condensate drain piping where included in the approved scope.",
          "match_terms": [
            "PVC drain repair",
            "broken drain line",
            "condensate pipe"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional"
          ],
          "editor_note": "Use if damaged piping is found."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_condensate_service",
      "label": "Standard condensate drain service",
      "text": "Clear the accessible condensate drain and test visible flow after service.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "water_damage_note",
      "text": "Water damage cleanup, drywall repair, flooring repair, or remediation is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "condensate_terms",
      "text": "Final scope may change if the drain line, pan, pump, float switch, or surrounding materials are damaged or inaccessible.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_drain_route",
      "label": "Confirm drain route",
      "detail": "Identify primary drain, secondary drain, pan, float switch, pump, attic location, and access limitations.",
      "review_flags": [
        "regional",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Drywall repair",
    "Flooring repair",
    "Water damage restoration",
    "Condensate pump replacement unless listed",
    "Drain pan replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
