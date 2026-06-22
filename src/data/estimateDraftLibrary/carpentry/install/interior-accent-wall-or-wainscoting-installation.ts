import type { EstimateDraftLibraryBundle } from '../../types';

export const interiorAccentWallOrWainscotingInstallationBundle = {
  "trade": "carpentry",
  "work_category": "install",
  "job_bundle": "interior_accent_wall_or_wainscoting_installation",
  "display_name": "Interior Accent Wall or Wainscoting Installation",
  "aliases": [
    "accent wall install",
    "wainscoting install",
    "board and batten",
    "beadboard install",
    "chair rail install",
    "wall paneling install",
    "decorative wall trim",
    "trim accent wall"
  ],
  "scope_summary": "Install decorative wall trim, paneling, board-and-batten, beadboard, chair rail, or wainscoting at an approved interior wall area.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Standard layout, cutting, installation, and finish-prep items.",
      "items": [
        {
          "id": "accent_wall_layout_review",
          "title": "Accent wall layout review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the approved wall area and confirm the decorative trim or panel layout.",
          "match_terms": [
            "accent wall",
            "wainscoting",
            "board and batten",
            "beadboard"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Layout expectations should be clear."
        },
        {
          "id": "install_decorative_wall_trim_or_paneling",
          "title": "Install decorative wall trim or paneling",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install decorative wall trim or paneling in the approved area.",
          "match_terms": [
            "install wainscoting",
            "install board and batten",
            "install beadboard",
            "install wall trim"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Quantity depends on layout."
        },
        {
          "id": "decorative_trim_or_panel_material",
          "title": "Decorative trim or panel material",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Provide decorative trim or panel material selected for the approved scope.",
          "match_terms": [
            "wainscoting material",
            "accent wall trim",
            "board and batten material",
            "beadboard panel"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Material type and profile should be contractor-selected."
        },
        {
          "id": "caulk_nail_fill_finish_prep",
          "title": "Caulk, nail fill, and finish prep",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Caulk, fill nail holes, and prepare installed trim or panels for finish where included.",
          "match_terms": [
            "caulk accent wall",
            "fill nail holes",
            "finish prep",
            "trim prep"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Painting may still be separate."
        },
        {
          "id": "cleanup_accent_wall_area",
          "title": "Clean up work area",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Clean up debris from the immediate work area.",
          "match_terms": [
            "cleanup trim install",
            "accent wall cleanup",
            "job cleanup"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Basic cleanup only."
        }
      ]
    },
    {
      "id": "conditionals_and_review",
      "title": "Conditionals and Review",
      "description": "Painting, outlets, wall condition, and layout changes.",
      "items": [
        {
          "id": "paint_or_finish_accent_wall",
          "title": "Paint or finish accent wall",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Paint or finish the accent wall or wainscoting where included in the approved scope.",
          "match_terms": [
            "paint accent wall",
            "paint wainscoting",
            "finish board and batten",
            "stain wall trim"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Finish should be explicit."
        },
        {
          "id": "outlet_or_switch_extension_review",
          "title": "Outlet or switch extension review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Outlet, switch, or electrical device adjustments are included only when listed.",
          "match_terms": [
            "outlet in accent wall",
            "switch extension",
            "wall plate",
            "electrical device"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety",
            "licensing"
          ],
          "editor_note": "Electrical work is separate."
        },
        {
          "id": "wall_condition_review",
          "title": "Wall condition review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Uneven walls, damaged drywall, or hidden wall conditions may affect final scope.",
          "match_terms": [
            "uneven wall",
            "damaged drywall",
            "wall not flat",
            "wall repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "structural"
          ],
          "editor_note": "Do not include drywall repair by default."
        },
        {
          "id": "custom_design_or_layout_change",
          "title": "Custom design or layout change",
          "line_type": "labor",
          "suggestion_behavior": "not_auto_added",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Custom design changes are included only when listed in the approved scope.",
          "match_terms": [
            "custom accent wall",
            "custom wainscoting layout",
            "change layout",
            "custom trim design"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer"
          ],
          "editor_note": "Do not auto-add custom design."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_accent_wall_installation",
      "label": "Standard accent wall installation",
      "text": "Install decorative trim or paneling on the approved wall area using the listed layout and materials.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "wainscoting_installation",
      "label": "Wainscoting installation",
      "text": "Install wainscoting components in the approved wall area according to the selected layout.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "finish_note",
      "text": "Painting, staining, or finish work is included only when listed.",
      "contractor_review_required": false,
      "review_flags": []
    },
    {
      "id": "wall_condition_note",
      "text": "Wall repair, outlet adjustments, or hidden wall conditions are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "structural"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "accent_wall_terms",
      "text": "Final appearance depends on approved layout, wall condition, selected material, and finish scope.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "electrical_terms",
      "text": "Electrical device adjustments are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "licensing"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_design",
      "label": "Confirm design and layout",
      "detail": "Confirm wall dimensions, spacing, reveal, trim profile, panel type, outlet locations, and finish expectations.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "confirm_electrical_devices",
      "label": "Confirm electrical device impacts",
      "detail": "Identify outlets, switches, thermostats, low-voltage devices, and wall plates affected by the layout.",
      "review_flags": [
        "electrical",
        "code",
        "licensing"
      ]
    }
  ],
  "excluded_items": [
    "Painting or staining unless listed",
    "Drywall repair unless listed",
    "Electrical device adjustments unless listed",
    "Custom design work unless listed",
    "Furniture or decor installation",
    "Flooring or baseboard replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
