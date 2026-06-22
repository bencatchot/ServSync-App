import type { EstimateDraftLibraryBundle } from '../../types';

export const drywallBackingOrMinorWallFramingBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "drywall_backing_or_minor_wall_framing",
  "display_name": "Drywall backing or minor wall framing",
  "aliases": [
    "drywall backing or minor wall framing",
    "Drywall backing or minor wall framing",
    "Install wood backing or minor framing support for cabinets, fixtures, shelves, drywall, or wall-mounted items.",
    "Wood backing or minor framing installation",
    "Framing lumber and fasteners",
    "Access opening and close-up coordination"
  ],
  "scope_summary": "Install wood backing or minor framing support for cabinets, fixtures, shelves, drywall, or wall-mounted items.",
  "sections": [
    {
      "id": "drywall_backing_or_minor_wall_framing_installation_scope",
      "title": "Drywall backing or minor wall framing",
      "description": "Install wood backing or minor framing support for cabinets, fixtures, shelves, drywall, or wall-mounted items.",
      "items": [
        {
          "id": "wood_backing_or_minor_framing_installation",
          "title": "Wood backing or minor framing installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install approved wood backing or minor framing support.",
          "match_terms": [
            "Wood backing or minor framing installation",
            "Drywall backing or minor wall framing",
            "drywall backing or minor wall framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "Confirm purpose, load expectations, wall access, stud layout, plumbing/electrical conflicts, drywall removal, and patching exclusions."
        },
        {
          "id": "framing_lumber_and_fasteners",
          "title": "Framing lumber and fasteners",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide approved framing lumber and fasteners.",
          "match_terms": [
            "Framing lumber and fasteners",
            "Drywall backing or minor wall framing",
            "drywall backing or minor wall framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Confirm lumber size, blocking layout, fastener type, and whether treated lumber is required."
        },
        {
          "id": "access_opening_and_close_up_coordination",
          "title": "Access opening and close-up coordination",
          "line_type": "other",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Coordinate access openings needed for backing or framing installation.",
          "match_terms": [
            "Access opening and close-up coordination",
            "Drywall backing or minor wall framing",
            "drywall backing or minor wall framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Clarify whether drywall patch, texture, paint, or finish restoration is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_wording_1",
      "label": "Scope wording 1",
      "text": "Install wood backing for approved mounted item."
    },
    {
      "id": "scope_wording_2",
      "label": "Scope wording 2",
      "text": "Install minor non-structural framing support."
    },
    {
      "id": "scope_wording_3",
      "label": "Scope wording 3",
      "text": "Prepare area for follow-up finish work."
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Drywall repair, texture, and paint are not included unless listed."
    },
    {
      "id": "customer_note_2",
      "text": "Electrical or plumbing conflicts may require other trades."
    }
  ],
  "terms_candidates": [
    {
      "id": "term_1",
      "text": "Estimate excludes electrical work, plumbing work, drywall finishing, texture, and paint unless specifically included."
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "wood_backing_or_minor_framing_installation_review",
      "label": "Wood backing or minor framing installation review",
      "detail": "Confirm purpose, load expectations, wall access, stud layout, plumbing/electrical conflicts, drywall removal, and patching exclusions.",
      "review_flags": [
        "structural"
      ]
    },
    {
      "id": "framing_lumber_and_fasteners_review",
      "label": "Framing lumber and fasteners review",
      "detail": "Confirm lumber size, blocking layout, fastener type, and whether treated lumber is required.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "access_opening_and_close_up_coordination_review",
      "label": "Access opening and close-up coordination review",
      "detail": "Clarify whether drywall patch, texture, paint, or finish restoration is included.",
      "review_flags": [
        "manufacturer"
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
