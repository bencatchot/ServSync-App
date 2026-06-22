import type { EstimateDraftLibraryBundle } from '../../types';

export const ductworkReplacementOrModificationBundle = {
  "trade": "hvac",
  "work_category": "replace",
  "job_bundle": "ductwork_replacement_or_modification",
  "display_name": "Ductwork Replacement or Modification",
  "aliases": [
    "replace ductwork",
    "duct modification",
    "new duct run",
    "add return duct",
    "replace flex duct",
    "duct transition",
    "airflow modification"
  ],
  "scope_summary": "Replacement or modification of selected accessible ductwork sections in the approved scope.",
  "sections": [
    {
      "id": "core_replacement",
      "title": "Core Replacement or Modification",
      "description": "Common ductwork replacement and modification items.",
      "items": [
        {
          "id": "ductwork_scope_review",
          "title": "Ductwork scope review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the approved ductwork section, route, and connection points.",
          "match_terms": [
            "duct replacement",
            "duct modification",
            "new duct run"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm design intent."
        },
        {
          "id": "remove_existing_duct_section",
          "title": "Remove existing duct section",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Remove existing ductwork included in the approved scope.",
          "match_terms": [
            "remove duct",
            "old duct",
            "replace flex duct"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "regional"
          ],
          "editor_note": "Quantity should be edited."
        },
        {
          "id": "install_replacement_or_modified_duct",
          "title": "Install replacement or modified ductwork",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Install replacement or modified ductwork included in the approved scope.",
          "match_terms": [
            "install duct",
            "new duct run",
            "modify duct"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Duct sizing and design are review-sensitive."
        },
        {
          "id": "airflow_design_review",
          "title": "Airflow design review",
          "line_type": "other",
          "suggestion_behavior": "review_only",
          "unit": "note",
          "quantity": "1",
          "customer_description": "Duct sizing, airflow, and comfort concerns may affect final scope.",
          "match_terms": [
            "duct sizing",
            "airflow design",
            "hot room",
            "cold room"
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
      "id": "selected_duct_replacement",
      "label": "Selected ductwork replacement",
      "text": "Replace or modify the listed ductwork sections in the approved scope.",
      "contractor_review_required": true,
      "review_flags": [
        "code",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "duct_design_note",
      "text": "Duct sizing, design, balancing, or full-system airflow correction is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "code",
        "manufacturer"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "ductwork_terms",
      "text": "Final scope depends on duct route, access, existing equipment, airflow needs, insulation, and connection conditions.",
      "contractor_review_required": true,
      "review_flags": [
        "code",
        "manufacturer",
        "regional"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "confirm_design_scope",
      "label": "Confirm design scope",
      "detail": "Clarify whether this is like-for-like replacement, added run, return modification, plenum or transition change, or comfort correction.",
      "review_flags": [
        "code",
        "manufacturer"
      ]
    }
  ],
  "excluded_items": [
    "Full duct system replacement unless listed",
    "Air balancing unless listed",
    "Drywall repair",
    "Ceiling repair",
    "Equipment replacement unless listed",
    "Permit fees unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
