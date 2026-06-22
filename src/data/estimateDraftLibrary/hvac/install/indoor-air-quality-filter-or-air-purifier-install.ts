import type { EstimateDraftLibraryBundle } from '../../types';

export const indoorAirQualityFilterOrAirPurifierInstallBundle = {
  "trade": "hvac",
  "work_category": "install",
  "job_bundle": "indoor_air_quality_filter_or_air_purifier_install",
  "display_name": "Indoor Air Quality Filter or Air Purifier Installation",
  "aliases": [
    "air purifier install",
    "media filter cabinet",
    "IAQ install",
    "whole house filter",
    "UV light install",
    "air cleaner install",
    "better filtration"
  ],
  "scope_summary": "Installation of selected indoor air quality filter, media cabinet, purifier, or related accessory in the approved HVAC system.",
  "sections": [
    {
      "id": "core_installation",
      "title": "Core Installation",
      "description": "Common indoor air quality accessory installation items.",
      "items": [
        {
          "id": "iaq_site_review",
          "title": "IAQ installation review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the approved installation location and HVAC equipment connection points.",
          "match_terms": [
            "IAQ install",
            "air purifier",
            "media filter"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "electrical",
            "safety"
          ],
          "editor_note": "Confirm accessory type."
        },
        {
          "id": "install_filter_or_purifier_accessory",
          "title": "Install IAQ accessory",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install the selected indoor air quality accessory included in the approved scope.",
          "match_terms": [
            "install air purifier",
            "install media filter",
            "install air cleaner"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "electrical",
            "code"
          ],
          "editor_note": "Accessory-dependent."
        },
        {
          "id": "iaq_accessory_equipment",
          "title": "IAQ accessory equipment",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Provide the indoor air quality accessory selected for the approved scope.",
          "match_terms": [
            "media cabinet",
            "air purifier",
            "UV light",
            "air cleaner"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "electrical"
          ],
          "editor_note": "Optional because customer may supply equipment."
        },
        {
          "id": "duct_cut_in_or_transition",
          "title": "Duct cut-in or transition work",
          "line_type": "labor",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Modify nearby ductwork where included for the approved IAQ accessory installation.",
          "match_terms": [
            "cut in media cabinet",
            "duct transition",
            "filter rack"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Use if accessory requires duct modification."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_iaq_install",
      "label": "Standard IAQ installation",
      "text": "Install the selected indoor air quality accessory at the approved HVAC system location.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "iaq_limit_note",
      "text": "IAQ accessories, filter media, duct changes, electrical work, or maintenance items are included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical",
        "manufacturer"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "iaq_terms",
      "text": "Final scope depends on selected accessory, HVAC equipment configuration, duct access, power needs, and manufacturer requirements.",
      "contractor_review_required": true,
      "review_flags": [
        "manufacturer",
        "electrical",
        "code"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_accessory_type",
      "label": "Confirm accessory type",
      "detail": "Confirm media filter, air purifier, UV light, electronic air cleaner, filter rack, or other accessory type and manufacturer requirements.",
      "review_flags": [
        "manufacturer",
        "electrical"
      ]
    },
    {
      "id": "avoid_health_claims",
      "label": "Avoid health or performance guarantees",
      "detail": "Do not make health, air-quality, or performance guarantees in customer-facing wording.",
      "review_flags": [
        "manufacturer",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Health or air-quality guarantees",
    "Duct modification unless listed",
    "Electrical circuit work unless listed",
    "Filter replacements unless listed",
    "Maintenance plan unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
