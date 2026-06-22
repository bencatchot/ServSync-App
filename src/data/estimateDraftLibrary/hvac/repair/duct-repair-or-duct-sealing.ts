import type { EstimateDraftLibraryBundle } from '../../types';

export const ductRepairOrDuctSealingBundle = {
  "trade": "hvac",
  "work_category": "repair",
  "job_bundle": "duct_repair_or_duct_sealing",
  "display_name": "Duct Repair or Duct Sealing",
  "aliases": [
    "duct repair",
    "duct sealing",
    "leaky ducts",
    "disconnected duct",
    "damaged flex duct",
    "low airflow room",
    "attic duct repair"
  ],
  "scope_summary": "Repair or seal accessible residential ductwork in the approved repair area.",
  "sections": [
    {
      "id": "core_repair",
      "title": "Core Repair",
      "description": "Common duct repair and sealing items.",
      "items": [
        {
          "id": "duct_area_review",
          "title": "Duct repair area review",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "service",
          "quantity": "1",
          "customer_description": "Review the accessible duct repair area and confirm the planned scope.",
          "match_terms": [
            "duct repair",
            "leaky ducts",
            "low airflow"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "safety",
            "regional"
          ],
          "editor_note": "Attic or crawlspace access may vary."
        },
        {
          "id": "repair_accessible_duct_section",
          "title": "Repair accessible duct section",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair the accessible duct section included in the approved scope.",
          "match_terms": [
            "disconnected duct",
            "damaged duct",
            "duct repair"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "safety"
          ],
          "editor_note": "Quantity should be edited."
        },
        {
          "id": "seal_accessible_duct_joints",
          "title": "Seal accessible duct joints",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Seal accessible duct joints or seams included in the approved scope.",
          "match_terms": [
            "seal ducts",
            "mastic",
            "leaky duct joints"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "manufacturer",
            "regional"
          ],
          "editor_note": "Method selected by contractor."
        },
        {
          "id": "duct_insulation_repair",
          "title": "Duct insulation repair",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "allowance",
          "quantity": "1",
          "customer_description": "Repair duct insulation where included in the approved scope.",
          "match_terms": [
            "duct insulation",
            "sweating duct",
            "damaged insulation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "regional",
            "manufacturer"
          ],
          "editor_note": "Useful in humid climates."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "localized_duct_repair",
      "label": "Localized duct repair",
      "text": "Repair or seal accessible duct sections in the approved repair area.",
      "contractor_review_required": true,
      "review_flags": [
        "safety",
        "manufacturer"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "access_note",
      "text": "Attic, crawlspace, insulation, or difficult-access work is included only when listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety",
        "regional"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "duct_terms",
      "text": "Final scope may change if duct damage, insulation damage, access limitations, or airflow design issues are found.",
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
      "id": "confirm_duct_type",
      "label": "Confirm duct type and access",
      "detail": "Identify flex, metal, duct board, supply, return, insulation, access, and visible damage conditions.",
      "review_flags": [
        "manufacturer",
        "regional",
        "safety"
      ]
    }
  ],
  "excluded_items": [
    "Full duct replacement unless listed",
    "Duct design or balancing unless listed",
    "Insulation replacement unless listed",
    "Drywall repair",
    "Mold remediation",
    "Equipment repair unless listed"
  ]
} satisfies EstimateDraftLibraryBundle;
