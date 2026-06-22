import type { EstimateDraftLibraryBundle } from '../../types';

export const stairOrHandrailRepairBundle = {
  "trade": "carpentry",
  "work_category": "repair",
  "job_bundle": "stair_or_handrail_repair",
  "display_name": "Stair or Handrail Repair",
  "aliases": [
    "stair repair",
    "handrail repair",
    "loose railing",
    "wobbly handrail",
    "replace stair tread",
    "repair steps",
    "stair rail repair",
    "loose stair tread"
  ],
  "scope_summary": "Repair damaged or loose stair, tread, riser, handrail, or guardrail components in the approved repair area.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Standard stair or handrail review, repair, fastening, and adjustment items.",
      "items": [
        {
          "id": "stair_rail_repair_review",
          "title": "Stair or handrail repair review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the visible stair or handrail repair area and confirm the planned repair scope.",
          "match_terms": [
            "stair repair",
            "handrail repair",
            "loose railing",
            "wobbly handrail"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Stair and rail work is safety-sensitive."
        },
        {
          "id": "secure_loose_stair_or_rail_components",
          "title": "Secure loose stair or rail components",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Secure loose stair or rail components included in the approved repair scope.",
          "match_terms": [
            "secure handrail",
            "tighten railing",
            "loose stair tread",
            "wobbly rail"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Only use for limited repair, not guaranteed compliance."
        },
        {
          "id": "replace_damaged_tread_or_riser",
          "title": "Replace damaged stair tread or riser",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace a damaged stair tread or riser where included in the approved scope.",
          "match_terms": [
            "replace stair tread",
            "broken step",
            "damaged riser",
            "step repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Quantity should be edited."
        },
        {
          "id": "replace_handrail_or_bracket",
          "title": "Replace handrail or bracket",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Replace damaged handrail or bracket components where included in the approved scope.",
          "match_terms": [
            "replace handrail",
            "handrail bracket",
            "broken railing",
            "new rail bracket"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code",
            "manufacturer"
          ],
          "editor_note": "Mounting substrate and height/spacing considerations require review."
        },
        {
          "id": "stair_rail_fasteners",
          "title": "Stair or rail fasteners",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide fasteners needed for the approved stair or handrail repair.",
          "match_terms": [
            "rail fasteners",
            "stair screws",
            "secure railing",
            "handrail hardware"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "manufacturer"
          ],
          "editor_note": "Fastener type depends on substrate and component."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Stringer, framing, code-sensitive, and finish-related conditions.",
      "items": [
        {
          "id": "stringer_or_support_review",
          "title": "Stringer or support review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Damaged stair supports or framing may require additional approved repair work.",
          "match_terms": [
            "damaged stringer",
            "stair support",
            "soft stair",
            "structural stair repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code"
          ],
          "editor_note": "Do not auto-add structural repair."
        },
        {
          "id": "code_sensitive_layout_review",
          "title": "Stair or rail layout review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Stair, guardrail, or handrail layout may affect final scope.",
          "match_terms": [
            "handrail height",
            "guardrail spacing",
            "stair code",
            "rail layout"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety",
            "regional"
          ],
          "editor_note": "Do not state compliance."
        },
        {
          "id": "paint_stain_or_finish",
          "title": "Paint, stain, or finish repaired area",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Paint, stain, or finish the repaired stair or rail area where included in the approved scope.",
          "match_terms": [
            "paint handrail",
            "stain stairs",
            "finish stair repair",
            "touch up railing"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Finish work should be explicit."
        },
        {
          "id": "full_stair_or_rail_replacement",
          "title": "Full stair or rail replacement review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Full stair or rail replacement may be recommended if limited repair is not suitable.",
          "match_terms": [
            "replace stairs",
            "replace railing",
            "unsafe stairs",
            "major stair repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "safety",
            "code",
            "permit"
          ],
          "editor_note": "Review-only; do not auto-add full replacement."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "limited_stair_repair",
      "label": "Limited stair repair",
      "text": "Repair the listed stair components in the approved repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety"
      ]
    },
    {
      "id": "limited_handrail_repair",
      "label": "Limited handrail repair",
      "text": "Repair or secure the listed handrail components in the approved repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety",
        "code"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "safety_scope_note",
      "text": "Additional stair, rail, framing, or layout work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety",
        "code"
      ]
    },
    {
      "id": "finish_match_note",
      "text": "New materials and finish repairs may not match existing aged or finished materials exactly.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "terms_candidates": [
    {
      "id": "stair_rail_terms",
      "text": "Final scope may change if existing stair, rail, support, or framing conditions are not suitable for limited repair.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "safety",
        "code"
      ]
    },
    {
      "id": "finish_terms",
      "text": "Painting, staining, or finish matching is included only when listed.",
      "contractor_review_required": false,
      "review_flags": []
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_safety_condition",
      "label": "Confirm safety condition",
      "detail": "Check whether stairs, handrails, guardrails, brackets, treads, risers, stringers, posts, and fasteners are suitable for limited repair.",
      "review_flags": [
        "structural",
        "safety",
        "code"
      ]
    },
    {
      "id": "confirm_local_requirements",
      "label": "Confirm local requirements",
      "detail": "Review local requirements when repair affects stair layout, rail height, guardrails, load-bearing support, or exterior stairs.",
      "review_flags": [
        "code",
        "regional",
        "permit",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Full stair replacement unless listed",
    "Full rail replacement unless listed",
    "Structural framing repair unless listed",
    "Permit fees unless listed",
    "Painting, staining, or finish work unless listed",
    "Flooring repair unless listed",
    "Wall repair unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
