import { createBlankSharedDraftComposerDraft } from '../drafts/draftComposerMappings';
import { createWorkComposerLineDraft, normalizeWorkComposerLineType } from '../work-composer/workComposerDrafts';
import type { PracticeSnapshot } from './contracts';

export function blankPracticeDraft(rate = '') {
  return createBlankSharedDraftComposerDraft({
    intended_output: 'estimate', subject_type: 'local',
    local_contact_id: 'practice-customer', local_home_id: 'practice-property', labor_rate: rate,
  });
}

// Reuse the existing synthetic setup. These are example prices, never advice or
// copied business settings. Starting an example does not save a record.
export function examplePracticeDraft(snapshot: PracticeSnapshot) {
  const template = snapshot.templates[0];
  return {
    ...blankPracticeDraft(snapshot.business.laborRate),
    title: 'Sample — small repair visit',
    scope: template?.scope || 'Complete the agreed small repair and clean up the work area.',
    line_items: [
      createWorkComposerLineDraft({
        line_type: 'labor', line_title: 'Example repair labor', description: 'Example repair labor',
        quantity: '2', unit: 'hour', unit_price: snapshot.business.laborRate,
      }),
      ...(template?.line_items ?? []).map(line => createWorkComposerLineDraft({
        line_type: normalizeWorkComposerLineType(line.line_type), line_title: line.description, description: line.description,
        customer_description: line.customer_description || '', quantity: String(line.quantity), unit: line.unit,
        unit_price: line.unit_price_cents === null ? '' : (line.unit_price_cents / 100).toFixed(2),
      })),
    ],
  };
}
