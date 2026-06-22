import type { EstimateDraftLibraryBundle } from '../../types';

export const applianceDisconnectOrWhipInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "appliance_disconnect_or_whip_installation",
  "display_name": "Appliance disconnect or whip installation",
  "aliases": [
    "appliance disconnect or whip installation",
    "Appliance disconnect or whip installation",
    "Appliance disconnect",
    "HVAC disconnect",
    "Water heater connection",
    "Range connection",
    "Equipment whip",
    "Use when connecting or replacing the electrical disconnect or whip for equipment.",
    "Use when the scope is final electrical connection to equipment and not the equipment installation itself."
  ],
  "scope_summary": "Install or replace an electrical disconnect, whip, or final connection for approved residential equipment.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install or replace an electrical disconnect, whip, or final connection for approved residential equipment.",
      "items": [
        {
          "id": "equipment-disconnect-installation",
          "title": "Equipment disconnect installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install or replace the approved electrical disconnect for the equipment.",
          "match_terms": [
            "Equipment disconnect installation",
            "device",
            "primary",
            "Appliance disconnect",
            "HVAC disconnect",
            "Water heater connection",
            "Range connection",
            "Equipment whip"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "manufacturer"
          ],
          "editor_note": "Confirm equipment nameplate requirements, circuit size, disconnect type, location, fuse requirements, and code requirements."
        },
        {
          "id": "equipment-whip-or-final-electrical-connection",
          "title": "Equipment whip or final electrical connection",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install or replace the final electrical connection to the equipment.",
          "match_terms": [
            "Equipment whip or final electrical connection",
            "wiring",
            "standard",
            "Appliance disconnect",
            "HVAC disconnect",
            "Water heater connection",
            "Range connection",
            "Equipment whip"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "manufacturer",
            "code"
          ],
          "editor_note": "Confirm conductor size, flexible conduit requirements, strain relief, grounding, and equipment listing."
        },
        {
          "id": "basic-power-verification",
          "title": "Basic power verification",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Verify power is present after the electrical connection is completed.",
          "match_terms": [
            "Basic power verification",
            "labor",
            "standard",
            "Appliance disconnect",
            "HVAC disconnect",
            "Water heater connection",
            "Range connection",
            "Equipment whip"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical"
          ],
          "editor_note": "Do not imply equipment startup or performance testing unless that service is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Appliance disconnect or whip installation",
      "text": "Install or replace an electrical disconnect, whip, or final connection for approved residential equipment.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as new dedicated circuit, panel upgrade, gas appliance work are included only when listed.",
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
      "detail": "Use when connecting or replacing the electrical disconnect or whip for equipment. Use when the scope is final electrical connection to equipment and not the equipment installation itself. Do not use when a full new circuit is needed unless added separately. Do not include appliance installation, plumbing, refrigerant, gas, or HVAC startup work unless specifically included by the contractor.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "New dedicated circuit",
    "Panel upgrade",
    "Gas appliance work",
    "Equipment installation by another trade"
  ]
} satisfies EstimateDraftLibraryBundle;
