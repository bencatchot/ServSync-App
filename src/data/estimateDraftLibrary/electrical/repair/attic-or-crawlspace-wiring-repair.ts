import type { EstimateDraftLibraryBundle } from '../../types';

export const atticOrCrawlspaceWiringRepairBundle = {
  "trade": "electrical",
  "work_category": "repair",
  "job_bundle": "attic_or_crawlspace_wiring_repair",
  "display_name": "Attic or crawlspace wiring repair",
  "aliases": [
    "attic or crawlspace wiring repair",
    "Attic or crawlspace wiring repair",
    "Damaged wire",
    "Open splice",
    "Loose junction box",
    "Attic wiring",
    "Crawlspace wiring",
    "Use when the issue is an accessible wiring repair in a service area.",
    "Use when inspection notes mention open junctions, damaged cable, loose boxes, or exposed wiring."
  ],
  "scope_summary": "Repair accessible wiring issues in an attic, crawlspace, basement, or similar service area.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Repair accessible wiring issues in an attic, crawlspace, basement, or similar service area.",
      "items": [
        {
          "id": "accessible-wiring-repair",
          "title": "Accessible wiring repair",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Repair accessible wiring issues at the identified location.",
          "match_terms": [
            "Accessible wiring repair",
            "wiring",
            "primary",
            "Damaged wire",
            "Open splice",
            "Loose junction box",
            "Attic wiring",
            "Crawlspace wiring"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "code",
            "regional"
          ],
          "editor_note": "Confirm cable type, conductor condition, junction box requirements, support/protection requirements, and whether damage source has been resolved."
        },
        {
          "id": "junction-box-correction",
          "title": "Junction box correction",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install or correct junction boxes where needed for safe wiring connections.",
          "match_terms": [
            "Junction box correction",
            "material",
            "conditional",
            "Damaged wire",
            "Open splice",
            "Loose junction box",
            "Attic wiring",
            "Crawlspace wiring"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code"
          ],
          "editor_note": "Confirm box fill, cover plate, accessibility, cable clamps, and grounding."
        },
        {
          "id": "circuit-verification-after-repair",
          "title": "Circuit verification after repair",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the affected circuit after repair.",
          "match_terms": [
            "Circuit verification after repair",
            "labor",
            "standard",
            "Damaged wire",
            "Open splice",
            "Loose junction box",
            "Attic wiring",
            "Crawlspace wiring"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Verify polarity, grounding, continuity, and proper operation as applicable."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Attic or crawlspace wiring repair",
      "text": "Repair accessible wiring issues in an attic, crawlspace, basement, or similar service area.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as whole-home rewire, hidden wall damage, knob-and-tube wiring are included only when listed.",
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
      "detail": "Use when the issue is an accessible wiring repair in a service area. Use when inspection notes mention open junctions, damaged cable, loose boxes, or exposed wiring. Do not use for broad rewiring or hazardous legacy wiring remediation without contractor review. Do not use where structural, pest, water, or fire damage changes the scope.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Whole-home rewire",
    "Hidden wall damage",
    "Knob-and-tube wiring",
    "Aluminum wiring remediation",
    "Fire damage"
  ]
} satisfies EstimateDraftLibraryBundle;
