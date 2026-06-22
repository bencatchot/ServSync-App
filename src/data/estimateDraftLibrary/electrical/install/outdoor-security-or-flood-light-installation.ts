import type { EstimateDraftLibraryBundle } from '../../types';

export const outdoorSecurityOrFloodLightInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "outdoor_security_or_flood_light_installation",
  "display_name": "Outdoor security or flood light installation",
  "aliases": [
    "outdoor security or flood light installation",
    "Outdoor security or flood light installation",
    "Flood light",
    "Security light",
    "Motion light",
    "Exterior fixture",
    "Garage exterior light",
    "Use when the customer requests exterior lighting for visibility, safety, or security.",
    "Use for one-for-one replacement or new fixture locations when wiring requirements are clear."
  ],
  "scope_summary": "Install or replace exterior security lighting, flood lighting, or motion-activated lighting.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install or replace exterior security lighting, flood lighting, or motion-activated lighting.",
      "items": [
        {
          "id": "outdoor-light-fixture-installation",
          "title": "Outdoor light fixture installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the approved outdoor light fixture at the selected location.",
          "match_terms": [
            "Outdoor light fixture installation",
            "lighting",
            "primary",
            "Flood light",
            "Security light",
            "Motion light",
            "Exterior fixture",
            "Garage exterior light"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "manufacturer"
          ],
          "editor_note": "Confirm wet/damp rating, mounting box, gasket/seal, switch control, motion sensor setup, and fixture height."
        },
        {
          "id": "exterior-fixture-box-or-mounting-support",
          "title": "Exterior fixture box or mounting support",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install or correct the fixture mounting support as needed.",
          "match_terms": [
            "Exterior fixture box or mounting support",
            "material",
            "conditional",
            "Flood light",
            "Security light",
            "Motion light",
            "Exterior fixture",
            "Garage exterior light"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm box rating and support. Surface repair is excluded unless included separately."
        },
        {
          "id": "motion-sensor-aiming-and-function-test",
          "title": "Motion sensor aiming and function test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Aim and test the light after installation.",
          "match_terms": [
            "Motion sensor aiming and function test",
            "labor",
            "standard",
            "Flood light",
            "Security light",
            "Motion light",
            "Exterior fixture",
            "Garage exterior light"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "regional"
          ],
          "editor_note": "Customer preferences for sensitivity, timer, and aiming should be confirmed before completion."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Outdoor security or flood light installation",
      "text": "Install or replace exterior security lighting, flood lighting, or motion-activated lighting.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as landscape lighting system, low-voltage lighting, pole light are included only when listed.",
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
      "detail": "Use when the customer requests exterior lighting for visibility, safety, or security. Use for one-for-one replacement or new fixture locations when wiring requirements are clear. Do not use for low-voltage landscape lighting systems. Do not use for large exterior lighting projects needing trenching, poles, or engineered lighting layout.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Landscape lighting system",
    "Low-voltage lighting",
    "Pole light",
    "Detached structure wiring"
  ]
} satisfies EstimateDraftLibraryBundle;
