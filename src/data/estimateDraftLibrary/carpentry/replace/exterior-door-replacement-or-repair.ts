import type { EstimateDraftLibraryBundle } from '../../types';

export const exteriorDoorReplacementOrRepairBundle = {
  "trade": "carpentry",
  "work_category": "replace",
  "job_bundle": "exterior_door_replacement_or_repair",
  "display_name": "Exterior door replacement or repair",
  "aliases": [
    "exterior door replacement or repair",
    "Exterior door replacement or repair",
    "Repair or replace an exterior door to improve fit, security, and weather protection.",
    "Exterior trim and weather seal",
    "Door hardware installation"
  ],
  "scope_summary": "Repair or replace an exterior door to improve fit, security, and weather protection.",
  "sections": [
    {
      "id": "exterior_door_replacement_or_repair_replacement_scope",
      "title": "Exterior door replacement or repair",
      "description": "Repair or replace an exterior door to improve fit, security, and weather protection.",
      "items": [
        {
          "id": "exterior_door_replacement_or_repair",
          "title": "Exterior door replacement or repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair or replace the approved exterior door.",
          "match_terms": [
            "Exterior door replacement or repair",
            "exterior door replacement or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "regional",
            "safety",
            "structural"
          ],
          "editor_note": "Confirm prehung unit size, swing, threshold, sill condition, jamb rot, flashing, weatherstripping, lockset/deadbolt prep, and exterior finish requirements."
        },
        {
          "id": "exterior_trim_and_weather_seal",
          "title": "Exterior trim and weather seal",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install required exterior trim, weatherstripping, and sealant at the door opening.",
          "match_terms": [
            "Exterior trim and weather seal",
            "Exterior door replacement or repair",
            "exterior door replacement or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "structural"
          ],
          "editor_note": "Confirm casing/brickmold style, sill pan or flashing needs, caulk compatibility, and water intrusion risk."
        },
        {
          "id": "door_hardware_installation",
          "title": "Door hardware installation",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install approved lockset, deadbolt, or handle hardware.",
          "match_terms": [
            "Door hardware installation",
            "Exterior door replacement or repair",
            "exterior door replacement or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm hardware is customer-provided or contractor-supplied and compatible with the door prep."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Replace approved exterior door unit."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Seal and trim exterior door opening."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Install approved door hardware."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Hidden rot, framing damage, or water damage may require additional repair."
    },
    {
      "id": "customer_note_2",
      "text": "Painting or staining is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes structural framing repair, siding repair, drywall repair, paint, and stain unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "exterior_door_replacement_or_repair_review",
      "label": "Exterior door replacement or repair review",
      "detail": "Confirm prehung unit size, swing, threshold, sill condition, jamb rot, flashing, weatherstripping, lockset/deadbolt prep, and exterior finish requirements.",
      "review_flags": [
        "manufacturer",
        "regional",
        "safety",
        "structural"
      ]
    },
    {
      "id": "exterior_trim_and_weather_seal_review",
      "label": "Exterior trim and weather seal review",
      "detail": "Confirm casing/brickmold style, sill pan or flashing needs, caulk compatibility, and water intrusion risk.",
      "review_flags": [
        "regional",
        "structural"
      ]
    },
    {
      "id": "door_hardware_installation_review",
      "label": "Door hardware installation review",
      "detail": "Confirm hardware is customer-provided or contractor-supplied and compatible with the door prep.",
      "review_flags": [
        "manufacturer",
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
