import type { EstimateDraftLibraryBundle } from '../../types';

export const customShelvingOrClosetShelvingInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "custom_shelving_or_closet_shelving_installation",
  "display_name": "Custom shelving or closet shelving installation",
  "aliases": [
    "custom shelving or closet shelving installation",
    "Custom shelving or closet shelving installation",
    "Install shelving in a closet, pantry, laundry room, garage, office, or storage area.",
    "Custom shelving installation",
    "Shelf boards and support hardware",
    "Shelf layout confirmation"
  ],
  "scope_summary": "Install shelving in a closet, pantry, laundry room, garage, office, or storage area.",
  "sections": [
    {
      "id": "custom_shelving_or_closet_shelving_installation_installation_scope",
      "title": "Custom shelving or closet shelving installation",
      "description": "Install shelving in a closet, pantry, laundry room, garage, office, or storage area.",
      "items": [
        {
          "id": "custom_shelving_installation",
          "title": "Custom shelving installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install approved shelving in the selected area.",
          "match_terms": [
            "Custom shelving installation",
            "Custom shelving or closet shelving installation",
            "custom shelving or closet shelving installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural"
          ],
          "editor_note": "Confirm shelf depth, span, wall type, stud locations, support brackets, load expectations, finish, and customer layout approval."
        },
        {
          "id": "shelf_boards_and_support_hardware",
          "title": "Shelf boards and support hardware",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide shelf boards and approved support hardware.",
          "match_terms": [
            "Shelf boards and support hardware",
            "Custom shelving or closet shelving installation",
            "custom shelving or closet shelving installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "structural"
          ],
          "editor_note": "Confirm material type, bracket style, cleats, anchors, and finish requirements."
        },
        {
          "id": "shelf_layout_confirmation",
          "title": "Shelf layout confirmation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Confirm shelf layout and placement before installation.",
          "match_terms": [
            "Shelf layout confirmation",
            "Custom shelving or closet shelving installation",
            "custom shelving or closet shelving installation"
          ],
          "contractor_review_required": true,
          "review_flags": [],
          "editor_note": "Document customer-approved heights and spacing before fastening."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install custom shelving in approved area."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Provide shelf material and support hardware."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Confirm shelf layout before installation."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Heavy storage loads may require upgraded supports."
    },
    {
      "id": "customer_note_2",
      "text": "Painting or staining is not included unless listed."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes wall repair, paint, stain, and electrical relocation unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "custom_shelving_installation_review",
      "label": "Custom shelving installation review",
      "detail": "Confirm shelf depth, span, wall type, stud locations, support brackets, load expectations, finish, and customer layout approval.",
      "review_flags": [
        "manufacturer",
        "structural"
      ]
    },
    {
      "id": "shelf_boards_and_support_hardware_review",
      "label": "Shelf boards and support hardware review",
      "detail": "Confirm material type, bracket style, cleats, anchors, and finish requirements.",
      "review_flags": [
        "manufacturer",
        "structural"
      ]
    },
    {
      "id": "shelf_layout_confirmation_review",
      "label": "Shelf layout confirmation review",
      "detail": "Document customer-approved heights and spacing before fastening.",
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
