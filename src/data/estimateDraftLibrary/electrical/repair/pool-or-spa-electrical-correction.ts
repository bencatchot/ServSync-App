import type { EstimateDraftLibraryBundle } from '../../types';

export const poolOrSpaElectricalCorrectionBundle = {
  "trade": "electrical",
  "work_category": "repair",
  "job_bundle": "pool_or_spa_electrical_correction",
  "display_name": "Pool or spa electrical correction",
  "aliases": [
    "pool or spa electrical correction",
    "Pool or spa electrical correction",
    "Pool equipment electrical",
    "Spa disconnect",
    "Hot tub wiring issue",
    "Pool pump power",
    "GFCI protection for spa",
    "Use when the customer needs limited electrical repair or correction for pool, spa, or hot tub equipment.",
    "Use only as a review-required recipe because this work is highly code- and safety-sensitive."
  ],
  "scope_summary": "Correct limited electrical issues related to pool, spa, or hot tub equipment where the contractor is qualified to perform the work.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Correct limited electrical issues related to pool, spa, or hot tub equipment where the contractor is qualified to perform the work.",
      "items": [
        {
          "id": "pool-or-spa-electrical-correction",
          "title": "Pool or spa electrical correction",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Correct the approved electrical issue related to pool, spa, or hot tub equipment.",
          "match_terms": [
            "Pool or spa electrical correction",
            "safety_repair",
            "primary",
            "Pool equipment electrical",
            "Spa disconnect",
            "Hot tub wiring issue",
            "Pool pump power",
            "GFCI protection for spa"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "permit",
            "code",
            "safety",
            "manufacturer"
          ],
          "editor_note": "Confirm bonding, grounding, GFCI protection, disconnect location, equipment nameplate, wet-location rules, and local code before estimating."
        },
        {
          "id": "spa-or-equipment-disconnect-review",
          "title": "Spa or equipment disconnect review",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Review the equipment disconnect and protection requirements for the affected equipment.",
          "match_terms": [
            "Spa or equipment disconnect review",
            "inspection",
            "conditional",
            "Pool equipment electrical",
            "Spa disconnect",
            "Hot tub wiring issue",
            "Pool pump power",
            "GFCI protection for spa"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "manufacturer"
          ],
          "editor_note": "May require replacement or relocation depending on local code and equipment instructions."
        },
        {
          "id": "electrical-safety-test-after-correction",
          "title": "Electrical safety test after correction",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the corrected electrical connection for basic safe operation.",
          "match_terms": [
            "Electrical safety test after correction",
            "labor",
            "standard",
            "Pool equipment electrical",
            "Spa disconnect",
            "Hot tub wiring issue",
            "Pool pump power",
            "GFCI protection for spa"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Use contractor-approved test procedure for wet-location equipment."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Pool or spa electrical correction",
      "text": "Correct limited electrical issues related to pool, spa, or hot tub equipment where the contractor is qualified to perform the work.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as pool plumbing, pool equipment replacement, new pool construction are included only when listed.",
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
      "detail": "Use when the customer needs limited electrical repair or correction for pool, spa, or hot tub equipment. Use only as a review-required recipe because this work is highly code- and safety-sensitive. Do not use for full pool construction or equipment installation by other trades. Do not use without contractor review of bonding, grounding, GFCI protection, equipment requirements, and local code.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Pool plumbing",
    "Pool equipment replacement",
    "New pool construction",
    "Commercial pool",
    "Unknown bonding issue"
  ]
} satisfies EstimateDraftLibraryBundle;
