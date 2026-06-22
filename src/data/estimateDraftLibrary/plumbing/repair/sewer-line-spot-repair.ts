import type { EstimateDraftLibraryBundle } from '../../types';

export const sewerLineSpotRepairBundle = {
  "trade": "plumbing",
  "work_category": "repair",
  "job_bundle": "sewer_line_spot_repair",
  "display_name": "Sewer line spot repair",
  "aliases": [
    "sewer line spot repair",
    "Sewer line spot repair",
    "Repair a defined damaged section of sewer line after inspection or diagnosis.",
    "Repair identified sewer line section.",
    "Replace damaged pipe and fittings.",
    "Check line after repair.",
    "Pipe and fitting replacement section",
    "Post-repair flow test or camera check"
  ],
  "scope_summary": "Repair a defined damaged section of sewer line after inspection or diagnosis.",
  "sections": [
    {
      "id": "sewer_repair",
      "title": "Sewer repair",
      "description": "Repair a defined damaged section of sewer line after inspection or diagnosis.",
      "items": [
        {
          "id": "sewer-line-spot-repair",
          "title": "Sewer line spot repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Repair the approved damaged section of sewer line.",
          "match_terms": [
            "Sewer line spot repair",
            "labor",
            "primary",
            "sewer line spot repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "permit",
            "structural",
            "regional",
            "safety"
          ],
          "editor_note": "Confirm location, depth, pipe material, access, excavation needs, utility locates, permits, bedding/backfill, and restoration exclusions."
        },
        {
          "id": "pipe-and-fitting-replacement-section",
          "title": "Pipe and fitting replacement section",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the damaged sewer pipe section and approved fittings.",
          "match_terms": [
            "Pipe and fitting replacement section",
            "material",
            "standard",
            "Sewer line spot repair",
            "sewer line spot repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Confirm approved transition couplings, slope, material, and inspection requirements."
        },
        {
          "id": "post-repair-flow-test-or-camera-check",
          "title": "Post-repair flow test or camera check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Check the repaired sewer line after completion.",
          "match_terms": [
            "Post-repair flow test or camera check",
            "inspection",
            "standard",
            "Sewer line spot repair",
            "sewer line spot repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Clarify whether post-repair camera documentation is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Repair identified sewer line section.",
      "text": "Repair identified sewer line section.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Replace damaged pipe and fittings.",
      "text": "Replace damaged pipe and fittings.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Check line after repair.",
      "text": "Check line after repair.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Excavation depth, access, utilities, and restoration can significantly affect the final scope.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Landscape, concrete, driveway, flooring, and surface restoration are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes surface restoration unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes utility fees, permit fees, and additional hidden damage unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm utility locates before excavation.",
      "detail": "Confirm utility locates before excavation.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm permit/inspection requirements.",
      "detail": "Confirm permit/inspection requirements.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm restoration exclusions clearly.",
      "detail": "Confirm restoration exclusions clearly.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
