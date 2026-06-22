import type { EstimateDraftLibraryBundle } from '../../types';

export const sinkDrainOrPTrapRepairBundle = {
  "trade": "plumbing",
  "work_category": "repair",
  "job_bundle": "sink_drain_or_p_trap_repair",
  "display_name": "Sink drain or P-trap repair",
  "aliases": [
    "sink drain or p trap repair",
    "Sink drain or P-trap repair",
    "Repair or replace leaking or damaged sink drain piping under a kitchen or bathroom sink.",
    "Repair under-sink drain leak.",
    "Replace P-trap or tubular drain components.",
    "Test sink drain after repair.",
    "P-trap or tubular drain replacement",
    "Sink basket strainer or pop-up assembly replacement",
    "Drain leak test"
  ],
  "scope_summary": "Repair or replace leaking or damaged sink drain piping under a kitchen or bathroom sink.",
  "sections": [
    {
      "id": "sink_drain_repair",
      "title": "Sink drain repair",
      "description": "Repair or replace leaking or damaged sink drain piping under a kitchen or bathroom sink.",
      "items": [
        {
          "id": "p-trap-or-tubular-drain-replacement",
          "title": "P-trap or tubular drain replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace leaking or damaged under-sink drain piping.",
          "match_terms": [
            "P-trap or tubular drain replacement",
            "material",
            "primary",
            "Sink drain or P-trap repair",
            "sink drain or p trap repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm pipe size, material, trap configuration, wall connection condition, disposal/dishwasher connection, and whether the drain arm is serviceable."
        },
        {
          "id": "sink-basket-strainer-or-pop-up-assembly-replacement",
          "title": "Sink basket strainer or pop-up assembly replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the sink drain assembly if needed to stop leaks or restore proper drainage.",
          "match_terms": [
            "Sink basket strainer or pop-up assembly replacement",
            "material",
            "conditional",
            "Sink drain or P-trap repair",
            "sink drain or p trap repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Confirm sink type, finish, overflow requirements, and whether parts are customer-selected."
        },
        {
          "id": "drain-leak-test",
          "title": "Drain leak test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Run water and check the repaired drain for visible leaks.",
          "match_terms": [
            "Drain leak test",
            "labor",
            "standard",
            "Sink drain or P-trap repair",
            "sink drain or p trap repair"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Check with basin full and draining where appropriate."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Repair under-sink drain leak.",
      "text": "Repair under-sink drain leak.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Replace P-trap or tubular drain components.",
      "text": "Replace P-trap or tubular drain components.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Test sink drain after repair.",
      "text": "Test sink drain after repair.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Hidden wall piping issues are not included unless discovered and approved.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Cabinet damage or mold cleanup is not included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes cabinet repair, wall repair, and remediation work.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Additional repairs may be needed if the wall drain connection is damaged.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Check trap configuration.",
      "detail": "Check trap configuration.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm disposal and dishwasher connections.",
      "detail": "Confirm disposal and dishwasher connections.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Inspect wall stub-out condition.",
      "detail": "Inspect wall stub-out condition.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
