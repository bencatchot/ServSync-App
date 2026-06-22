import type { EstimateDraftLibraryBundle } from '../../types';

export const slabLeakDetectionOrRepairBundle = {
  "trade": "plumbing",
  "work_category": "inspect",
  "job_bundle": "slab_leak_detection_or_repair",
  "display_name": "Slab leak detection or repair planning",
  "aliases": [
    "slab leak detection or repair",
    "Slab leak detection or repair planning",
    "Investigate a suspected slab leak and recommend the appropriate repair plan.",
    "Investigate suspected slab leak.",
    "Locate likely leak area where possible.",
    "Provide repair recommendation based on findings.",
    "Slab leak detection",
    "Repair option review",
    "Access and damage limitation note"
  ],
  "scope_summary": "Investigate a suspected slab leak and recommend the appropriate repair plan.",
  "sections": [
    {
      "id": "slab_leak_investigation",
      "title": "Slab leak investigation",
      "description": "Investigate a suspected slab leak and recommend the appropriate repair plan.",
      "items": [
        {
          "id": "slab-leak-detection",
          "title": "Slab leak detection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Investigate a suspected under-slab plumbing leak.",
          "match_terms": [
            "Slab leak detection",
            "inspection",
            "primary",
            "Slab leak detection or repair planning",
            "slab leak detection or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Confirm symptoms, meter movement, pressure loss, hot spots, flooring damage, acoustic/location method, and limitations."
        },
        {
          "id": "repair-option-review",
          "title": "Repair option review",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Review repair options based on the findings.",
          "match_terms": [
            "Repair option review",
            "documentation",
            "standard",
            "Slab leak detection or repair planning",
            "slab leak detection or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "structural",
            "safety"
          ],
          "editor_note": "Options may include spot repair, reroute, isolation, or other contractor-approved method. Do not auto-select repair method without review."
        },
        {
          "id": "access-and-damage-limitation-note",
          "title": "Access and damage limitation note",
          "line_type": "other",
          "suggestion_behavior": "default_candidate",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Document access needs and areas that may be affected by repair.",
          "match_terms": [
            "Access and damage limitation note",
            "documentation",
            "standard",
            "Slab leak detection or repair planning",
            "slab leak detection or repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety"
          ],
          "editor_note": "Clarify exclusions for flooring, concrete, drywall, cabinets, remediation, and finish restoration."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Investigate suspected slab leak.",
      "text": "Investigate suspected slab leak.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Locate likely leak area where possible.",
      "text": "Locate likely leak area where possible.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Provide repair recommendation based on findings.",
      "text": "Provide repair recommendation based on findings.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Slab leak repair method depends on location, pipe condition, access, and home construction.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Surface demolition or restoration is not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes flooring, concrete, drywall, cabinetry, paint, and remediation unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Leak location may be approximate depending on conditions.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm detection method and limitations.",
      "detail": "Confirm detection method and limitations.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Do not estimate final repair without contractor r...",
      "detail": "Do not estimate final repair without contractor review.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Clarify homeowner insurance/documentation needs i...",
      "detail": "Clarify homeowner insurance/documentation needs if relevant.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
