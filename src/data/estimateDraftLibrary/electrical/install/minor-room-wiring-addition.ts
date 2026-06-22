import type { EstimateDraftLibraryBundle } from '../../types';

export const minorRoomWiringAdditionBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "minor_room_wiring_addition",
  "display_name": "Minor room wiring addition",
  "aliases": [
    "minor room wiring addition",
    "Minor room wiring addition",
    "Add outlet in room",
    "Add switch leg",
    "Add light location",
    "Small remodel wiring",
    "Limited wiring addition",
    "Use when a small amount of new wiring is needed inside an existing room.",
    "Use when the project is more than a device replacement but less than a full remodel or rewire."
  ],
  "scope_summary": "Add limited wiring for a small room improvement, such as an added switch leg, outlet location, or lighting point.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Add limited wiring for a small room improvement, such as an added switch leg, outlet location, or lighting point.",
      "items": [
        {
          "id": "minor-branch-wiring-addition",
          "title": "Minor branch wiring addition",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Add limited wiring for the approved outlet, switch, or lighting location.",
          "match_terms": [
            "Minor branch wiring addition",
            "wiring",
            "primary",
            "Add outlet in room",
            "Add switch leg",
            "Add light location",
            "Small remodel wiring",
            "Limited wiring addition"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "regional",
            "permit"
          ],
          "editor_note": "Confirm circuit capacity, routing, box fill, wall/ceiling access, fire blocking, and permit requirements."
        },
        {
          "id": "new-electrical-box-installation",
          "title": "New electrical box installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install an electrical box at the new device or fixture location.",
          "match_terms": [
            "New electrical box installation",
            "material",
            "standard",
            "Add outlet in room",
            "Add switch leg",
            "Add light location",
            "Small remodel wiring",
            "Limited wiring addition"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety"
          ],
          "editor_note": "Use appropriate box type, support, depth, and cover/device compatibility."
        },
        {
          "id": "device-fixture-or-cover-installation",
          "title": "Device, fixture, or cover installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the approved outlet, switch, fixture connection, or cover at the completed location.",
          "match_terms": [
            "Device, fixture, or cover installation",
            "finish_material",
            "standard",
            "Add outlet in room",
            "Add switch leg",
            "Add light location",
            "Small remodel wiring",
            "Limited wiring addition"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Confirm customer-selected device type and finish."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Minor room wiring addition",
      "text": "Add limited wiring for a small room improvement, such as an added switch leg, outlet location, or lighting point.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as full room remodel, kitchen remodel, bathroom remodel are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "electrical_scope_terms",
      "text": "Final scope may change if existing wiring, panel, access, code, equipment, or site conditions differ from the listed scope.",
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
      "id": "confirm_scope_fit",
      "label": "Confirm scope fit",
      "detail": "Use when a small amount of new wiring is needed inside an existing room. Use when the project is more than a device replacement but less than a full remodel or rewire. Do not use for large remodels or full-room rewiring packages. Do not include drywall repair, painting, or finish carpentry unless separately added.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Full room remodel",
    "Kitchen remodel",
    "Bathroom remodel",
    "New service",
    "Whole-home rewire"
  ]
} satisfies EstimateDraftLibraryBundle;
