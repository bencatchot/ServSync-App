import type { EstimateDraftLibraryBundle } from '../../types';

export const seasonalHvacMaintenanceVisitBundle = {
  "trade": "hvac",
  "work_category": "service",
  "job_bundle": "seasonal_hvac_maintenance_visit",
  "display_name": "Seasonal HVAC Maintenance Visit",
  "aliases": [
    "HVAC maintenance",
    "AC tune up",
    "furnace tune up",
    "seasonal service",
    "preventive maintenance",
    "spring AC check",
    "fall furnace check"
  ],
  "scope_summary": "Seasonal service visit for accessible residential HVAC equipment, with basic cleaning, checks, and customer-safe recommendations.",
  "sections": [
    {
      "id": "core_maintenance",
      "title": "Core Maintenance",
      "description": "Common seasonal maintenance items.",
      "items": [
        {
          "id": "maintenance_service_visit",
          "title": "Maintenance service visit",
          "line_type": "fee",
          "suggestion_behavior": "default_candidate",
          "unit": "visit",
          "quantity": "1",
          "customer_description": "Seasonal HVAC maintenance visit for the listed equipment.",
          "match_terms": [
            "HVAC maintenance",
            "AC tune up",
            "furnace tune up"
          ],
          "contractor_review_required": false,
          "review_flags": [],
          "editor_note": "Use if contractor charges a service visit line."
        },
        {
          "id": "filter_and_airflow_check",
          "title": "Filter and airflow check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Check filter condition and basic airflow at accessible equipment.",
          "match_terms": [
            "filter check",
            "airflow check",
            "dirty filter"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Do not guarantee system performance."
        },
        {
          "id": "accessible_coil_and_cabinet_check",
          "title": "Accessible coil and cabinet check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Check accessible coil and cabinet areas and clean where included in the approved scope.",
          "match_terms": [
            "coil cleaning",
            "dirty coil",
            "AC maintenance"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "safety"
          ],
          "editor_note": "Clarify cleaning depth."
        },
        {
          "id": "condensate_drain_check",
          "title": "Condensate drain check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Check the accessible condensate drain for visible restriction or overflow concerns.",
          "match_terms": [
            "condensate drain",
            "AC drain line",
            "float switch"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "May point to separate drain cleaning recipe."
        },
        {
          "id": "thermostat_and_startup_check",
          "title": "Thermostat and startup check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Check thermostat operation and run the system through a basic startup cycle.",
          "match_terms": [
            "thermostat check",
            "system startup",
            "maintenance test"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer"
          ],
          "editor_note": "Basic function check only."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_maintenance_scope",
      "label": "Standard seasonal maintenance",
      "text": "Perform seasonal maintenance checks on accessible HVAC equipment listed in the estimate.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "maintenance_limit_note",
      "text": "Maintenance service does not include repair parts, refrigerant, gas repairs, or electrical repairs unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "refrigerant",
        "gas",
        "electrical",
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "maintenance_terms",
      "text": "Final recommendations may change if damaged, dirty, restricted, or unsafe conditions are found during service.",
      "contractor_review_required": true,
      "review_flags": [
        "safety",
        "manufacturer"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_equipment_list",
      "label": "Confirm equipment list",
      "detail": "Confirm which systems, zones, thermostats, filters, and equipment locations are included.",
      "review_flags": [
        "manufacturer"
      ]
    },
    {
      "id": "confirm_seasonal_focus",
      "label": "Confirm seasonal focus",
      "detail": "Clarify whether the visit is cooling-only, heating-only, heat pump, gas furnace, or multi-system maintenance.",
      "review_flags": [
        "gas",
        "electrical",
        "refrigerant",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Repair parts unless listed",
    "Refrigerant service unless listed",
    "Gas repair unless listed",
    "Duct cleaning unless listed",
    "Deep coil cleaning unless listed",
    "Equipment replacement unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
