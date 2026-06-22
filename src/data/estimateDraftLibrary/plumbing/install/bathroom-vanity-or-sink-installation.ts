import type { EstimateDraftLibraryBundle } from '../../types';

export const bathroomVanityOrSinkInstallationBundle = {
  "trade": "plumbing",
  "work_category": "install",
  "job_bundle": "bathroom_vanity_or_sink_installation",
  "display_name": "Bathroom vanity or sink plumbing installation",
  "aliases": [
    "bathroom vanity or sink installation",
    "Bathroom vanity or sink plumbing installation",
    "Connect bathroom vanity or sink plumbing after the fixture or cabinet is ready for plumbing connections.",
    "Connect bathroom vanity plumbing.",
    "Install faucet, supply lines, and drain connections.",
    "Test for visible leaks.",
    "Bathroom sink faucet and drain connection",
    "P-trap and tubular drain materials",
    "Vanity plumbing leak test"
  ],
  "scope_summary": "Connect bathroom vanity or sink plumbing after the fixture or cabinet is ready for plumbing connections.",
  "sections": [
    {
      "id": "vanity_sink_plumbing",
      "title": "Vanity/sink plumbing",
      "description": "Connect bathroom vanity or sink plumbing after the fixture or cabinet is ready for plumbing connections.",
      "items": [
        {
          "id": "bathroom-sink-faucet-and-drain-connection",
          "title": "Bathroom sink faucet and drain connection",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Connect the bathroom sink faucet, drain, and supply lines at the approved vanity or sink.",
          "match_terms": [
            "Bathroom sink faucet and drain connection",
            "labor",
            "primary",
            "Bathroom vanity or sink plumbing installation",
            "bathroom vanity or sink installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "manufacturer",
            "safety"
          ],
          "editor_note": "Confirm vanity/sink is set, faucet compatibility, drain alignment, trap location, overflow requirements, and shutoff condition."
        },
        {
          "id": "p-trap-and-tubular-drain-materials",
          "title": "P-trap and tubular drain materials",
          "line_type": "material",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Install required drain materials below the bathroom sink.",
          "match_terms": [
            "P-trap and tubular drain materials",
            "material",
            "standard",
            "Bathroom vanity or sink plumbing installation",
            "bathroom vanity or sink installation"
          ],
          "contractor_review_required": true,
          "review_flags": [
            "code"
          ],
          "editor_note": "Confirm wall drain height, offset, trap adapter condition, and code-compliant trap configuration."
        },
        {
          "id": "vanity-plumbing-leak-test",
          "title": "Vanity plumbing leak test",
          "line_type": "labor",
          "suggestion_behavior": "default_candidate",
          "unit": "item",
          "quantity": "1",
          "customer_description": "Test the sink, faucet, and drain connections for visible leaks.",
          "match_terms": [
            "Vanity plumbing leak test",
            "labor",
            "standard",
            "Bathroom vanity or sink plumbing installation",
            "bathroom vanity or sink installation"
          ],
          "contractor_review_required": false,
          "review_flags": [
            "safety"
          ],
          "editor_note": "Check faucet operation, pop-up function, supply connections, and drain connections."
        }
      ]
    }
  ],
  "scope_wording_helpers": [
    {
      "id": "scope_helper_1",
      "label": "Connect bathroom vanity plumbing.",
      "text": "Connect bathroom vanity plumbing.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_2",
      "label": "Install faucet, supply lines, and drain connections.",
      "text": "Install faucet, supply lines, and drain connections.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "scope_helper_3",
      "label": "Test for visible leaks.",
      "text": "Test for visible leaks.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "customer_note_candidates": [
    {
      "id": "customer_note_1",
      "text": "Cabinet, countertop, and fixture setting are not included unless listed.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "customer_note_2",
      "text": "Drain or water line relocation may require additional work.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "terms_candidates": [
    {
      "id": "terms_1",
      "text": "Estimate excludes vanity installation, countertop work, cabinet modification, tile, drywall, and paint unless specifically included.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "terms_2",
      "text": "Customer-provided fixtures must be compatible with existing plumbing conditions.",
      "contractor_review_required": true,
      "review_flags": [
        "safety"
      ]
    }
  ],
  "contractor_review_reminders": [
    {
      "id": "review_reminder_1",
      "label": "Confirm vanity and sink are installed or included.",
      "detail": "Confirm vanity and sink are installed or included.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_2",
      "label": "Confirm drain alignment and shutoff condition.",
      "detail": "Confirm drain alignment and shutoff condition.",
      "review_flags": [
        "safety"
      ]
    },
    {
      "id": "review_reminder_3",
      "label": "Confirm who supplies faucet and drain assembly.",
      "detail": "Confirm who supplies faucet and drain assembly.",
      "review_flags": [
        "safety"
      ]
    }
  ],
  "excluded_items": []
} satisfies EstimateDraftLibraryBundle;
