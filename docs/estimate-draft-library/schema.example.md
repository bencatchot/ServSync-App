# Estimate Draft Library Schema Example

```ts
import type { EstimateDraftLibraryBundle } from '../../src/data/estimateDraftLibrary/types';

export const exampleBundle = {
  trade: 'hvac',
  work_category: 'replace',
  job_bundle: 'hvac_system_replacement',
  display_name: 'HVAC System Replacement',
  aliases: ['replace hvac system'],
  scope_summary: 'Short customer-safe summary after contractor review.',
  sections: [
    {
      id: 'equipment_materials',
      title: 'Equipment and materials',
      items: [
        {
          id: 'indoor_equipment',
          title: 'Indoor HVAC equipment',
          line_type: 'material',
          unit: 'each',
          contractor_review_required: true,
          review_flags: ['manufacturer', 'regional'],
          editor_note: 'Confirm equipment selection and requirements before sending.',
        },
      ],
    },
  ],
  scope_wording_helpers: [
    {
      id: 'accessible_review',
      label: 'Accessible review',
      text: 'Review accessible equipment and visible site conditions.',
      contractor_review_required: true,
      review_flags: ['safety'],
    },
  ],
  customer_note_candidates: [
    {
      id: 'hidden_conditions',
      text: 'Hidden or concealed conditions are excluded unless approved separately.',
      contractor_review_required: true,
      review_flags: ['safety'],
    },
  ],
  terms_candidates: [
    {
      id: 'listed_scope_only',
      text: 'This estimate includes only the listed scope and line items.',
    },
  ],
  contractor_review_reminders: [
    {
      id: 'permit_review',
      label: 'Permit/code review',
      detail: 'Confirm local permit or inspection requirements.',
      review_flags: ['permit', 'code', 'regional'],
    },
  ],
  excluded_items: ['pricing'],
} satisfies EstimateDraftLibraryBundle;
```
