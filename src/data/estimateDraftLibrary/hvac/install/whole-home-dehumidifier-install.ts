import type { EstimateDraftLibraryBundle } from '../../types';

export const wholeHomeDehumidifierInstallBundle = {
  "trade": "hvac",
  "work_category": "install",
  "job_bundle": "whole_home_dehumidifier_install",
  "display_name": "Whole-Home Dehumidifier Installation",
  "aliases": [
    "whole home dehumidifier",
    "dehumidifier install",
    "humidity control",
    "house too humid",
    "HVAC dehumidifier",
    "crawlspace humidity"
  ],
  "scope_summary": "Installation of whole-home dehumidifier equipment connected to approved HVAC, drain, control, and power locations.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Common whole-home dehumidifier installation items.",
      "items": [
        {
          "id": "dehumidifier_site_review",
          "title": "Dehumidifier site review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the approved equipment location, duct connection, drain route, and access conditions.",
          "match_terms": [
            "whole home dehumidifier",
            "humidity control",
            "dehumidifier location"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "regional",
            "safety"
          ],
          "editor_note": "Humidity issues can be regional."
        },
        {
          "id": "install_dehumidifier_equipment",
          "title": "Install dehumidifier equipment",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the dehumidifier equipment at the approved location.",
          "match_terms": [
            "install dehumidifier",
            "whole house dehumidifier"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "code",
            "safety"
          ],
          "editor_note": "Mounting and access matter."
        },
        {
          "id": "connect_duct_or_airflow_path",
          "title": "Connect duct or airflow path",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Connect duct or airflow components included in the approved dehumidifier scope.",
          "match_terms": [
            "ducted dehumidifier",
            "return duct",
            "supply duct"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer"
          ],
          "editor_note": "Duct design-sensitive."
        },
        {
          "id": "route_condensate_drain",
          "title": "Route condensate drain",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Route condensate drainage where included in the approved scope.",
          "match_terms": [
            "dehumidifier drain",
            "condensate drain",
            "drain pump"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional",
            "manufacturer"
          ],
          "editor_note": "Drain path must be reviewed."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_dehumidifier_install",
      "label": "Standard whole-home dehumidifier installation",
      "text": "Install the selected whole-home dehumidifier with approved duct, drain, control, and power connections.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "regional"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "humidity_note",
      "text": "Dehumidifier installation does not include repairs to building moisture sources, drainage, crawlspace, or ventilation unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "regional",
        "structural"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "dehumidifier_terms",
      "text": "Final scope depends on equipment selection, duct connection, drain route, control wiring, power availability, and access conditions.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer",
        "regional"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_moisture_context",
      "label": "Confirm humidity context",
      "detail": "Clarify customer complaint, target area, equipment location, drain route, duct connection, and possible moisture sources.",
      "review_flags": [
        "regional",
        "structural",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Electrical circuit work unless listed",
    "Crawlspace encapsulation",
    "Drainage repair",
    "Mold remediation",
    "Duct redesign unless listed",
    "Humidity performance guarantees"
  ]
} satisfies EstimateDraftLibraryBundle;
