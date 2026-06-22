import type { EstimateDraftLibraryBundle } from '../../types';

export const sewerCameraInspectionBundle = {
  "trade": "plumbing",
  "work_category": "inspect",
  "job_bundle": "sewer_camera_inspection",
  "display_name": "Sewer camera inspection",
  "aliases": [
    "sewer camera inspection",
    "Sewer camera inspection",
    "Inspect the sewer or drain line with a camera to help identify blockages, damage, or line condition.",
    "Perform sewer camera inspection through accessible cleanout.",
    "Locate visible problem area where included.",
    "Summarize findings and recommended next steps.",
    "Line locating",
    "Inspection findings summary"
  ],
  "scope_summary": "Inspect the sewer or drain line with a camera to help identify blockages, damage, or line condition.",
  "sections": [
    {
      "id": "camera_inspection",
      "title": "Camera inspection",
      "description": "Inspect the sewer or drain line with a camera to help identify blockages, damage, or line condition.",
      "items": [
        {
          "id": "sewer-camera-inspection",
          "title": "Sewer camera inspection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Perform a camera inspection of the accessible sewer or drain line.",
          "match_terms": [
            "Sewer camera inspection",
            "inspection",
            "primary",
            "sewer camera inspection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Confirm accessible cleanout, camera route, line size, inspection limits, and whether locating is included."
        },
        {
          "id": "line-locating",
          "title": "Line locating",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Locate the inspected line or problem area where equipment allows.",
          "match_terms": [
            "Line locating",
            "inspection",
            "conditional",
            "Sewer camera inspection",
            "sewer camera inspection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Clarify whether depth/location marking is included and whether accuracy is guaranteed."
        },
        {
          "id": "inspection-findings-summary",
          "title": "Inspection findings summary",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Provide a summary of visible findings and recommended next steps.",
          "match_terms": [
            "Inspection findings summary",
            "documentation",
            "standard",
            "Sewer camera inspection",
            "sewer camera inspection"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Separate inspection observations from repair recommendations."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Perform sewer camera inspection through accessibl...",
      "text": "Perform sewer camera inspection through accessible cleanout.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Locate visible problem area where included.",
      "text": "Locate visible problem area where included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Summarize findings and recommended next steps.",
      "text": "Summarize findings and recommended next steps.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "A cleanout or proper access point is required for camera inspection.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Heavy blockage may need clearing before a complete camera inspection can be performed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes drain cleaning unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes excavation or pipe repair unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm cleanout access.",
      "detail": "Confirm cleanout access.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Clarify whether locating is included.",
      "detail": "Clarify whether locating is included.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Clarify whether video file delivery is included.",
      "detail": "Clarify whether video file delivery is included.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
