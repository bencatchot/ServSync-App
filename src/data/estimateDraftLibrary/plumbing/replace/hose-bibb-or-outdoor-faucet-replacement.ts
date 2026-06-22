import type { EstimateDraftLibraryBundle } from '../../types';

export const hoseBibbOrOutdoorFaucetReplacementBundle = {
  "trade": "plumbing",
  "work_category": "replace",
  "job_bundle": "hose_bibb_or_outdoor_faucet_replacement",
  "display_name": "Hose bibb or outdoor faucet replacement",
  "aliases": [
    "hose bibb or outdoor faucet replacement",
    "Hose bibb or outdoor faucet replacement",
    "Replace a leaking, damaged, or outdated outdoor faucet.",
    "Replace leaking outdoor faucet.",
    "Install code-required backflow protection where applicable.",
    "Test hose bibb after replacement.",
    "Hose bibb replacement",
    "Vacuum breaker or backflow protection",
    "Outdoor faucet leak test"
  ],
  "scope_summary": "Replace a leaking, damaged, or outdated outdoor faucet.",
  "sections": [
    {
      "id": "outdoor_faucet_replacement",
      "title": "Outdoor faucet replacement",
      "description": "Replace a leaking, damaged, or outdated outdoor faucet.",
      "items": [
        {
          "id": "hose-bibb-replacement",
          "title": "Hose bibb replacement",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Replace the outdoor faucet at the approved location.",
          "match_terms": [
            "Hose bibb replacement",
            "material",
            "primary",
            "Hose bibb or outdoor faucet replacement",
            "hose bibb or outdoor faucet replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "safety"
          ],
          "editor_note": "Confirm pipe material, wall thickness, frost-free requirement, vacuum breaker requirement, shutoff access, and siding/masonry risk."
        },
        {
          "id": "vacuum-breaker-or-backflow-protection",
          "title": "Vacuum breaker or backflow protection",
          "line_type": "material",
          "suggestion_behavior": "optional_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Install required backflow protection for the outdoor faucet where needed.",
          "match_terms": [
            "Vacuum breaker or backflow protection",
            "material",
            "conditional",
            "Hose bibb or outdoor faucet replacement",
            "hose bibb or outdoor faucet replacement"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code",
            "regional"
          ],
          "editor_note": "Confirm local code and device requirements."
        },
        {
          "id": "outdoor-faucet-leak-test",
          "title": "Outdoor faucet leak test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Test the outdoor faucet for visible leaks after replacement.",
          "match_terms": [
            "Outdoor faucet leak test",
            "labor",
            "standard",
            "Hose bibb or outdoor faucet replacement",
            "hose bibb or outdoor faucet replacement"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Check under load with hose attached if appropriate."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Replace leaking outdoor faucet.",
      "text": "Replace leaking outdoor faucet.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Install code-required backflow protection where a...",
      "text": "Install code-required backflow protection where applicable.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Test hose bibb after replacement.",
      "text": "Test hose bibb after replacement.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Wall access or damaged piping may change the scope.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Backflow protection may be required depending on local rules.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes siding, masonry, drywall, or paint repair unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Estimate excludes concealed pipe repair unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm backflow/vacuum breaker requirements.",
      "detail": "Confirm backflow/vacuum breaker requirements.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm pipe material and wall access.",
      "detail": "Confirm pipe material and wall access.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Check for freeze damage or hidden leaks.",
      "detail": "Check for freeze damage or hidden leaks.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
