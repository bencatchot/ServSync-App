import type { EstimateDraftLibraryBundle } from '../../types';

export const gasLineRepairOrApplianceConnectionBundle = {
  "trade": "plumbing",
  "work_category": "repair",
  "job_bundle": "gas_line_repair_or_appliance_connection",
  "display_name": "Gas line repair or appliance connection",
  "aliases": [
    "gas line repair or appliance connection",
    "Gas line repair or appliance connection",
    "Repair or connect approved residential gas piping or appliance connection where allowed by licensing and code.",
    "Repair approved gas piping issue.",
    "Connect approved gas appliance where allowed.",
    "Leak test after gas work.",
    "Gas shutoff valve or connector replacement",
    "Gas leak test"
  ],
  "scope_summary": "Repair or connect approved residential gas piping or appliance connection where allowed by licensing and code.",
  "sections": [
    {
      "id": "gas_piping_work",
      "title": "Gas piping work",
      "description": "Repair or connect approved residential gas piping or appliance connection where allowed by licensing and code.",
      "items": [
        {
          "id": "gas-line-repair-or-appliance-connection",
          "title": "Gas line repair or appliance connection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Repair or connect the approved gas line or appliance connection.",
          "match_terms": [
            "Gas line repair or appliance connection",
            "labor",
            "primary",
            "gas line repair or appliance connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "permit",
            "gas",
            "safety"
          ],
          "editor_note": "Confirm licensing, permit requirements, gas type, appliance BTU, pipe sizing, shutoff, sediment trap, connector type, leak test, and inspection requirements."
        },
        {
          "id": "gas-shutoff-valve-or-connector-replacement",
          "title": "Gas shutoff valve or connector replacement",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace approved gas shutoff valve or connector where needed.",
          "match_terms": [
            "Gas shutoff valve or connector replacement",
            "material",
            "conditional",
            "Gas line repair or appliance connection",
            "gas line repair or appliance connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "gas",
            "manufacturer",
            "regional",
            "safety"
          ],
          "editor_note": "Use only approved gas-rated materials and follow local code/manufacturer requirements."
        },
        {
          "id": "gas-leak-test",
          "title": "Gas leak test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Perform a gas leak test after the approved work.",
          "match_terms": [
            "Gas leak test",
            "inspection",
            "standard",
            "Gas line repair or appliance connection",
            "gas line repair or appliance connection"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "gas",
            "safety"
          ],
          "editor_note": "Document test method and do not restore unsafe equipment to service."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Repair approved gas piping issue.",
      "text": "Repair approved gas piping issue.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Connect approved gas appliance where allowed.",
      "text": "Connect approved gas appliance where allowed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Leak test after gas work.",
      "text": "Leak test after gas work.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Gas work is safety-sensitive and may require permit, inspection, or utility coordination.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Appliance startup or manufacturer service is not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes appliance repair, appliance conversion kits, and utility fees unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Work is subject to local code, permit, and inspection requirements.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm licensing and permit rules.",
      "detail": "Confirm licensing and permit rules.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm gas type and appliance BTU load.",
      "detail": "Confirm gas type and appliance BTU load.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm approved pressure/leak test procedure.",
      "detail": "Confirm approved pressure/leak test procedure.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
