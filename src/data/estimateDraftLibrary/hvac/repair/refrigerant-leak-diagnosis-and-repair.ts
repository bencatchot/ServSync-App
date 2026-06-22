import type { EstimateDraftLibraryBundle } from '../../types';

export const refrigerantLeakDiagnosisAndRepairBundle = {
  "trade": "hvac",
  "work_category": "repair",
  "job_bundle": "refrigerant_leak_diagnosis_and_repair",
  "display_name": "Refrigerant Leak Diagnosis and Repair",
  "aliases": [
    "refrigerant leak",
    "low refrigerant",
    "AC low on freon",
    "find refrigerant leak",
    "repair refrigerant leak",
    "system freezing up"
  ],
  "scope_summary": "Diagnosis and approved repair work for suspected refrigerant leak conditions.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Common refrigerant leak diagnosis and repair items.",
      "items": [
        {
          "id": "refrigerant_leak_search",
          "title": "Refrigerant leak search",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Perform refrigerant leak search work included in the approved scope.",
          "match_terms": [
            "leak search",
            "find refrigerant leak",
            "low refrigerant"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "safety",
            "licensing"
          ],
          "editor_note": "Regulated work."
        },
        {
          "id": "refrigerant_system_repair_allowance",
          "title": "Refrigerant system repair allowance",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair an accessible refrigerant leak where included in the approved scope.",
          "match_terms": [
            "repair leak",
            "braze leak",
            "coil leak repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "safety",
            "licensing",
            "manufacturer"
          ],
          "editor_note": "Do not auto-add without confirmed leak location."
        },
        {
          "id": "evacuate_and_recharge_system",
          "title": "Evacuate and recharge system",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Evacuate and recharge the system where included in the approved repair scope.",
          "match_terms": [
            "evacuate system",
            "recharge AC",
            "vacuum pump"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "manufacturer",
            "safety",
            "licensing"
          ],
          "editor_note": "Only when included."
        },
        {
          "id": "replacement_vs_repair_review",
          "title": "Repair versus replacement review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "System age, leak location, refrigerant type, and repair practicality may affect the recommended scope.",
          "match_terms": [
            "old AC",
            "refrigerant type",
            "system replacement",
            "not worth repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "refrigerant",
            "manufacturer",
            "safety"
          ],
          "editor_note": "No monetary assumption or guarantee."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "leak_search_scope",
      "label": "Leak search scope",
      "text": "Perform refrigerant leak search work on the affected system included in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "licensing",
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "refrigerant_note",
      "text": "Refrigerant repair, recharge, recovery, or replacement work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "licensing",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "refrigerant_terms",
      "text": "Final scope depends on leak location, refrigerant type, equipment condition, access, and approved repair method.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_refrigerant_handling",
      "label": "Confirm refrigerant handling requirements",
      "detail": "Confirm licensed or certified handling requirements, refrigerant type, leak location, repair method, and documentation needs.",
      "review_flags": [
        "refrigerant",
        "licensing",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Guaranteed leak elimination",
    "Refrigerant recharge unless listed",
    "Major component replacement unless listed",
    "Full system replacement unless listed",
    "Drywall or access repair"
  ]
} satisfies EstimateDraftLibraryBundle;
