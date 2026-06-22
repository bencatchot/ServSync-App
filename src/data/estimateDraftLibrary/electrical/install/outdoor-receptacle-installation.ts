import type { EstimateDraftLibraryBundle } from '../../types';

export const outdoorReceptacleInstallationBundle = {
  "trade": "electrical",
  "work_category": "install",
  "job_bundle": "outdoor_receptacle_installation",
  "display_name": "Outdoor receptacle installation",
  "aliases": [
    "outdoor receptacle installation",
    "Outdoor receptacle installation",
    "Outdoor outlet",
    "Porch outlet",
    "Patio outlet",
    "Deck outlet",
    "Exterior plug",
    "Use when the customer needs a new or replacement exterior receptacle.",
    "Use when the scope mentions outdoor power for tools, décor, patio use, or general convenience."
  ],
  "scope_summary": "Install an exterior outlet with proper outdoor-rated protection.",
  "sections": [
    {
      "id": "recommended_scope_items",
      "title": "Recommended scope items",
      "description": "Install an exterior outlet with proper outdoor-rated protection.",
      "items": [
        {
          "id": "outdoor-rated-receptacle-installation",
          "title": "Outdoor-rated receptacle installation",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install an outdoor-rated outlet at the approved exterior location.",
          "match_terms": [
            "Outdoor-rated receptacle installation",
            "device",
            "primary",
            "Outdoor outlet",
            "Porch outlet",
            "Patio outlet",
            "Deck outlet",
            "Exterior plug"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "code",
            "safety"
          ],
          "editor_note": "Confirm GFCI protection, weather-resistant device, in-use cover, mounting surface, wiring method, and local code requirements."
        },
        {
          "id": "weatherproof-outlet-box-and-cover",
          "title": "Weatherproof outlet box and cover",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Install a weatherproof box and protective outlet cover.",
          "match_terms": [
            "Weatherproof outlet box and cover",
            "material",
            "standard",
            "Outdoor outlet",
            "Porch outlet",
            "Patio outlet",
            "Deck outlet",
            "Exterior plug"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety",
            "code"
          ],
          "editor_note": "Use an in-use cover where required and match box type to wall surface."
        },
        {
          "id": "exterior-outlet-testing",
          "title": "Exterior outlet testing",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "each",
          "quantity": "1",
          "customer_description": "Test the completed exterior outlet for basic operation and protection.",
          "match_terms": [
            "Exterior outlet testing",
            "labor",
            "standard",
            "Outdoor outlet",
            "Porch outlet",
            "Patio outlet",
            "Deck outlet",
            "Exterior plug"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "electrical",
            "safety"
          ],
          "editor_note": "Verify GFCI trip/reset behavior and weather cover fit."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "standard_scope_summary",
      "label": "Outdoor receptacle installation",
      "text": "Install an exterior outlet with proper outdoor-rated protection.",
      "contractor_review_required": true,
      "review_flags": [
        "electrical"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "scope_limit_note",
      "text": "This estimate includes only the listed electrical scope. Additional conditions such as dedicated equipment circuit, pool equipment, hot tub are included only when listed.",
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
      "detail": "Use when the customer needs a new or replacement exterior receptacle. Use when the scope mentions outdoor power for tools, décor, patio use, or general convenience. Do not use for high-load outdoor equipment or specialty circuits. Do not use where trenching or detached structure wiring is the main scope unless added separately.",
      "review_flags": [
        "electrical",
        "code",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Dedicated equipment circuit",
    "Pool equipment",
    "Hot tub",
    "Generator inlet",
    "EV charger"
  ]
} satisfies EstimateDraftLibraryBundle;
