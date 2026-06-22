import type { EstimateDraftLibraryBundle } from '../../types';

export const zoningSystemInstallBundle = {
  "trade": "hvac",
  "work_category": "install",
  "job_bundle": "zoning_system_install",
  "display_name": "HVAC Zoning System Installation",
  "aliases": [
    "HVAC zoning install",
    "zone control",
    "add zones",
    "hot upstairs cold downstairs",
    "motorized dampers",
    "zone thermostat",
    "comfort zoning"
  ],
  "scope_summary": "Installation of HVAC zoning components for approved zones, dampers, controls, and thermostats.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Common zoning equipment and control installation items.",
      "items": [
        {
          "id": "zoning_site_review",
          "title": "Zoning site review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the approved zones, accessible duct locations, equipment, and control needs.",
          "match_terms": [
            "HVAC zoning",
            "hot room cold room",
            "add zones"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Zoning requires design review."
        },
        {
          "id": "install_zone_control_panel",
          "title": "Install zone control panel",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the zone control panel included in the approved scope.",
          "match_terms": [
            "zone board",
            "zone panel",
            "control panel"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "code"
          ],
          "editor_note": "Compatibility-sensitive."
        },
        {
          "id": "install_zone_dampers",
          "title": "Install zone dampers",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install zone dampers in approved accessible duct locations.",
          "match_terms": [
            "zone damper",
            "motorized damper",
            "duct damper"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Duct access and sizing matter."
        },
        {
          "id": "bypass_or_static_pressure_review",
          "title": "Bypass or static pressure review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Bypass, static pressure, airflow, or equipment compatibility conditions may affect final zoning scope.",
          "match_terms": [
            "static pressure",
            "bypass damper",
            "airflow issue"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Do not imply design guarantee."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_zoning_install",
      "label": "Standard zoning installation",
      "text": "Install the listed HVAC zoning controls, dampers, and thermostats for the approved zones.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "code"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "zoning_limit_note",
      "text": "Duct redesign, equipment replacement, electrical circuit work, or comfort guarantees are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "manufacturer"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "zoning_terms",
      "text": "Final scope depends on equipment compatibility, duct layout, zone design, controls, airflow, and access conditions.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "code",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_zone_design",
      "label": "Confirm zone design",
      "detail": "Review zone count, duct layout, damper locations, thermostat locations, bypass/static pressure needs, and equipment compatibility.",
      "review_flags": [
        "code",
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Equipment replacement unless listed",
    "Duct redesign unless listed",
    "Electrical circuit work unless listed",
    "Drywall repair",
    "Comfort or temperature guarantees",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
