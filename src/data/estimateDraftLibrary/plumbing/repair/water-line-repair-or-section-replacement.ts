import type { EstimateDraftLibraryBundle } from '../../types';

export const waterLineRepairOrSectionReplacementBundle = {
  "trade": "plumbing",
  "work_category": "repair",
  "job_bundle": "water_line_repair_or_section_replacement",
  "display_name": "Water line repair or section replacement",
  "aliases": [
    "water line repair or section replacement",
    "Water line repair or section replacement",
    "Repair an accessible damaged or leaking water supply line section.",
    "Repair accessible water supply leak.",
    "Replace damaged pipe section.",
    "Restore water and check for visible leaks.",
    "Accessible water line repair",
    "Pipe and fitting replacement section",
    "Pressure and leak test"
  ],
  "scope_summary": "Repair an accessible damaged or leaking water supply line section.",
  "sections": [
    {
      "id": "water_line_repair",
      "title": "Water line repair",
      "description": "Repair an accessible damaged or leaking water supply line section.",
      "items": [
        {
          "id": "accessible-water-line-repair",
          "title": "Accessible water line repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Repair the approved accessible water line leak or damaged pipe section.",
          "match_terms": [
            "Accessible water line repair",
            "labor",
            "primary",
            "Water line repair or section replacement",
            "water line repair or section replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Confirm pipe material, leak source, access, shutoff method, pressure, corrosion, insulation needs, and whether hidden damage exists."
        },
        {
          "id": "pipe-and-fitting-replacement-section",
          "title": "Pipe and fitting replacement section",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the damaged pipe section and related fittings as needed.",
          "match_terms": [
            "Pipe and fitting replacement section",
            "material",
            "standard",
            "Water line repair or section replacement",
            "water line repair or section replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional"
          ],
          "editor_note": "Confirm approved material transition methods and local code."
        },
        {
          "id": "pressure-and-leak-test",
          "title": "Pressure and leak test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Restore water and check the repaired area for visible leaks.",
          "match_terms": [
            "Pressure and leak test",
            "labor",
            "standard",
            "Water line repair or section replacement",
            "water line repair or section replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Watch for additional leaks after pressure is restored."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Repair accessible water supply leak.",
      "text": "Repair accessible water supply leak.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Replace damaged pipe section.",
      "text": "Replace damaged pipe section.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Restore water and check for visible leaks.",
      "text": "Restore water and check for visible leaks.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Hidden damage or inaccessible piping may require additional work.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Drywall, flooring, cabinet, or finish repair is not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes water damage repair, mold remediation, drywall repair, and finish restoration unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Additional leaks may be discovered after water pressure is restored.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm pipe material.",
      "detail": "Confirm pipe material.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm access and shutdown method.",
      "detail": "Confirm access and shutdown method.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Assess corrosion and likelihood of additional leaks.",
      "detail": "Assess corrosion and likelihood of additional leaks.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
