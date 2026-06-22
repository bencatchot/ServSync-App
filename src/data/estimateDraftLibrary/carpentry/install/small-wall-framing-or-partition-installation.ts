import type { EstimateDraftLibraryBundle } from '../../types';

export const smallWallFramingOrPartitionInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "small_wall_framing_or_partition_installation",
  "display_name": "Small Wall Framing or Partition Installation",
  "aliases": [
    "small framing repair",
    "build partition wall",
    "frame small wall",
    "closet wall framing",
    "interior wall framing",
    "add non load bearing wall",
    "framing for drywall",
    "small carpentry framing"
  ],
  "scope_summary": "Frame a small non-load-bearing wall, partition, backing, or interior carpentry framing section within the approved scope.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Standard small interior framing layout and installation items.",
      "items": [
        {
          "id": "framing_area_review",
          "title": "Framing area review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the approved framing area and confirm the planned layout.",
          "match_terms": [
            "frame wall",
            "partition wall",
            "small framing",
            "closet wall"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "code",
            "safety"
          ],
          "editor_note": "Confirm non-load-bearing scope."
        },
        {
          "id": "layout_small_wall_or_partition",
          "title": "Layout small wall or partition",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Lay out the approved wall, partition, or framing area.",
          "match_terms": [
            "layout wall",
            "partition layout",
            "frame layout"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "code"
          ],
          "editor_note": "Layout should match approved dimensions."
        },
        {
          "id": "install_framing_members",
          "title": "Install framing members",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install framing members for the approved wall, partition, or backing scope.",
          "match_terms": [
            "install studs",
            "frame partition",
            "framing members",
            "wood framing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "code",
            "safety"
          ],
          "editor_note": "Do not imply load-bearing structural design."
        },
        {
          "id": "framing_lumber_material",
          "title": "Framing lumber",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide framing lumber for the approved framing scope.",
          "match_terms": [
            "studs",
            "framing lumber",
            "wood framing",
            "partition lumber"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer"
          ],
          "editor_note": "Material and dimensions should be selected by contractor."
        },
        {
          "id": "framing_fasteners",
          "title": "Framing fasteners",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide fasteners needed for the approved framing scope.",
          "match_terms": [
            "framing nails",
            "framing screws",
            "construction fasteners"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "manufacturer"
          ],
          "editor_note": "Fastener type depends on framing method and substrate."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Drywall, electrical, load-bearing, permit, and finish conditionals.",
      "items": [
        {
          "id": "drywall_backing_or_blocking",
          "title": "Drywall backing or blocking",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install backing or blocking where included in the approved scope.",
          "match_terms": [
            "blocking",
            "drywall backing",
            "mounting backing",
            "wood backing"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "Useful for TV, cabinets, shelves, or drywall edges."
        },
        {
          "id": "drywall_install_or_finish_review",
          "title": "Drywall install or finish review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Drywall installation, finish, texture, and paint are included only when listed.",
          "match_terms": [
            "drywall install",
            "drywall finish",
            "texture wall",
            "paint wall"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Separate from carpentry framing."
        },
        {
          "id": "electrical_or_mechanical_review",
          "title": "Electrical or mechanical review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Electrical, plumbing, HVAC, or low-voltage work is included only when listed.",
          "match_terms": [
            "outlet in new wall",
            "switch relocation",
            "plumbing in wall",
            "HVAC vent"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "permit",
            "safety",
            "licensing"
          ],
          "editor_note": "Do not include other trade work by default."
        },
        {
          "id": "load_bearing_or_structural_review",
          "title": "Load-bearing or structural review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Load-bearing or structural framing work requires separate approved scope.",
          "match_terms": [
            "load bearing wall",
            "structural wall",
            "header",
            "beam",
            "remove wall"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural",
            "code",
            "permit",
            "safety"
          ],
          "editor_note": "Strong review flag; do not auto-add."
        },
        {
          "id": "permit_or_code_review",
          "title": "Permit or code-sensitive review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Permit or local requirement review may be needed depending on the framing scope.",
          "match_terms": [
            "building permit",
            "framing permit",
            "interior wall permit",
            "code review"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "permit",
            "code",
            "regional",
            "structural"
          ],
          "editor_note": "No permit guarantee."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "small_non_load_bearing_partition",
      "label": "Small non-load-bearing partition",
      "text": "Frame a small non-load-bearing wall or partition in the approved location.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "code"
      ]
    },
    {
      "id": "blocking_or_backing_scope",
      "label": "Blocking or backing",
      "text": "Install wood backing or blocking in the approved location for the listed use.",
      "contractor_review_required": true,
      "review_flags": [
        "structural"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "other_trades_note",
      "text": "Electrical, plumbing, HVAC, drywall, paint, or finish work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "licensing"
      ]
    },
    {
      "id": "structural_note",
      "text": "Load-bearing or structural work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "code",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "framing_scope_terms",
      "text": "Final framing scope depends on approved layout, existing conditions, wall type, and whether other trade work is required.",
      "contractor_review_required": true,
      "review_flags": [
        "structural",
        "code"
      ]
    },
    {
      "id": "permit_terms",
      "text": "Permit, inspection, engineering, or other trade work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "permit",
        "code",
        "regional",
        "licensing"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_non_load_bearing",
      "label": "Confirm non-load-bearing scope",
      "detail": "Confirm the work is non-load-bearing or obtain appropriate structural review before finalizing structural scope.",
      "review_flags": [
        "structural",
        "code",
        "safety"
      ]
    },
    {
      "id": "confirm_other_trades",
      "label": "Confirm other trade work",
      "detail": "Check whether electrical, plumbing, HVAC, low-voltage, drywall, paint, flooring, or trim work must be separately scoped.",
      "review_flags": [
        "electrical",
        "code",
        "permit",
        "licensing"
      ]
    }
  ],
  "excluded_items": [
    "Load-bearing structural work unless listed",
    "Engineering unless listed",
    "Permit fees unless listed",
    "Drywall installation unless listed",
    "Drywall finishing unless listed",
    "Painting unless listed",
    "Electrical, plumbing, or HVAC work unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
