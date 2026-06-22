import type { EstimateDraftLibraryBundle } from '../../types';

export const tanklessWaterHeaterServiceBundle = {
  "trade": "plumbing",
  "work_category": "service",
  "job_bundle": "tankless_water_heater_service",
  "display_name": "Tankless water heater service",
  "aliases": [
    "tankless water heater service",
    "Tankless water heater service",
    "Service a tankless water heater to help maintain performance and address normal maintenance needs.",
    "Service existing tankless water heater.",
    "Flush/descale tankless water heater where accessible and serviceable.",
    "Verify basic operation after service.",
    "Tankless water heater flush/descale service",
    "Service valve and connection check",
    "Basic operation verification"
  ],
  "scope_summary": "Service a tankless water heater to help maintain performance and address normal maintenance needs.",
  "sections": [
    {
      "id": "tankless_water_heater_service",
      "title": "Tankless water heater service",
      "description": "Service a tankless water heater to help maintain performance and address normal maintenance needs.",
      "items": [
        {
          "id": "tankless-water-heater-flush-descale-service",
          "title": "Tankless water heater flush/descale service",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Flush and service the tankless water heater according to the approved service scope.",
          "match_terms": [
            "Tankless water heater flush/descale service",
            "labor",
            "primary",
            "Tankless water heater service",
            "tankless water heater service"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm fuel type, manufacturer requirements, isolation valves, venting condition, age, error codes, and whether descaling solution is appropriate."
        },
        {
          "id": "service-valve-and-connection-check",
          "title": "Service valve and connection check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Check accessible service valves and water connections during the visit.",
          "match_terms": [
            "Service valve and connection check",
            "labor",
            "standard",
            "Tankless water heater service",
            "tankless water heater service"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Document leaks, corrosion, missing isolation valves, or improper installation conditions separately."
        },
        {
          "id": "basic-operation-verification",
          "title": "Basic operation verification",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Verify basic water heater operation after service.",
          "match_terms": [
            "Basic operation verification",
            "labor",
            "standard",
            "Tankless water heater service",
            "tankless water heater service"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "manufacturer",
            "safety"
          ],
          "editor_note": "Do not imply full manufacturer certification unless the contractor provides that service."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Service existing tankless water heater.",
      "text": "Service existing tankless water heater.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Flush/descale tankless water heater where accessi...",
      "text": "Flush/descale tankless water heater where accessible and serviceable.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Verify basic operation after service.",
      "text": "Verify basic operation after service.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Additional repairs may be recommended if leaks, error codes, venting issues, or installation concerns are found.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Service access and existing valve condition can affect the final scope.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes replacement parts unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes gas, venting, electrical, or code corrections unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm manufacturer service procedure.",
      "detail": "Confirm manufacturer service procedure.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm fuel type and venting condition.",
      "detail": "Confirm fuel type and venting condition.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm whether unit condition supports service o...",
      "detail": "Confirm whether unit condition supports service or replacement recommendation.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
