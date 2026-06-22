import type { EstimateDraftLibraryBundle } from '../../types';

export const waterFiltrationOrSoftenerInstallationBundle = {
  "trade": "plumbing",
  "work_category": "install",
  "job_bundle": "water_filtration_or_softener_installation",
  "display_name": "Water filtration or softener installation",
  "aliases": [
    "water filtration or softener installation",
    "Water filtration or softener installation",
    "Install a customer-approved water filter, softener, or treatment system where plumbing conditions allow.",
    "Install approved water filter or softener.",
    "Connect to existing plumbing where suitable.",
    "Check visible connections after startup.",
    "Water filter or softener installation",
    "Bypass valve and connection materials",
    "Basic startup and leak check"
  ],
  "scope_summary": "Install a customer-approved water filter, softener, or treatment system where plumbing conditions allow.",
  "sections": [
    {
      "id": "water_treatment_installation",
      "title": "Water treatment installation",
      "description": "Install a customer-approved water filter, softener, or treatment system where plumbing conditions allow.",
      "items": [
        {
          "id": "water-filter-or-softener-installation",
          "title": "Water filter or softener installation",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Install the approved water filtration or softener system.",
          "match_terms": [
            "Water filter or softener installation",
            "labor",
            "primary",
            "Water filtration or softener installation",
            "water filtration or softener installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm water source, pipe material, system size, bypass valve, drain requirement, electrical outlet, space, pressure, and manufacturer instructions."
        },
        {
          "id": "bypass-valve-and-connection-materials",
          "title": "Bypass valve and connection materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Install required connection materials and bypass valve where applicable.",
          "match_terms": [
            "Bypass valve and connection materials",
            "material",
            "standard",
            "Water filtration or softener installation",
            "water filtration or softener installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code"
          ],
          "editor_note": "Confirm supplied kit contents and approved transition materials."
        },
        {
          "id": "basic-startup-and-leak-check",
          "title": "Basic startup and leak check",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Start the system according to the approved scope and check visible connections for leaks.",
          "match_terms": [
            "Basic startup and leak check",
            "labor",
            "standard",
            "Water filtration or softener installation",
            "water filtration or softener installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Do not imply water-quality guarantee unless testing/treatment design is included."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Install approved water filter or softener.",
      "text": "Install approved water filter or softener.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Connect to existing plumbing where suitable.",
      "text": "Connect to existing plumbing where suitable.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Check visible connections after startup.",
      "text": "Check visible connections after startup.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Water testing or treatment design is not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Drain, power, space, or code requirements may affect installation.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes electrical work unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes water testing, salt/media, cartridge replacement plans, and treatment performance guarantees unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm system sizing and manufacturer instructions.",
      "detail": "Confirm system sizing and manufacturer instructions.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm drain and electrical needs.",
      "detail": "Confirm drain and electrical needs.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm local discharge/backflow requirements.",
      "detail": "Confirm local discharge/backflow requirements.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
