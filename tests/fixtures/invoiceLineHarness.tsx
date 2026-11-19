import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { WorkComposerLineDraft } from '../../src/features/work-composer/types';
import { InvoiceLineItems } from '../../src/features/invoices/InvoiceLineItems';
import { ContractorDraftComposer } from '../../src/features/drafts/ContractorDraftComposer';
import { WorkComposerLineItemRow } from '../../src/features/work-composer/WorkComposerLineItemRow';
import { createWorkComposerLineDraft as line } from '../../src/features/work-composer/workComposerDrafts';
import { createBlankSharedDraftComposerDraft } from '../../src/features/drafts/draftComposerMappings';

export type InvoiceFixtureOptions = { shared?: boolean; empty?: boolean; linked?: boolean; disabled?: boolean; intent?: 'estimate' | 'invoice' | 'job' };
export function mountInvoiceFixture(options: InvoiceFixtureOptions) {
  const initial = () => createBlankSharedDraftComposerDraft({ intended_output: options.intent ?? 'invoice', line_items: options.empty ? [] : [line({ line_title: 'Existing work', description: 'Existing work', unit_price: '35', job_work_item_id: options.linked ? 'fictional-linked-item' : null })] });
  const h = React.createElement;
  function Harness() {
    const [draft, setDraft] = React.useState(initial);
    const [open, setOpen] = React.useState(true);
    const [saves, setSaves] = React.useState(0);
    return h('main', { style: { padding: '16px' } },
      h('button', { onClick: () => { setOpen(!open); setDraft(initial()); } }, open ? 'Dismiss fixture' : 'Reopen fixture'),
      h('output', { 'data-testid': 'saves' }, saves),
      h('output', { 'data-testid': 'lines-state', hidden: true }, JSON.stringify(draft.line_items)),
      open && (options.shared ? h(ContractorDraftComposer, {
        draft, onChange: setDraft, customerOptions: [], canSave: true, saving: false,
        interactionDisabled: options.disabled, invoiceOutputAvailable: true,
        onSave: () => setSaves(saves + 1), onBack: () => setOpen(false), onRemovePersistedLine: () => {},
      }) : h(InvoiceLineItems<WorkComposerLineDraft>, {
        lines: draft.line_items, disabled: Boolean(options.disabled),
        onAddLine: () => { const added = line(); setDraft((d: typeof draft) => ({ ...d, line_items: [...d.line_items, added] })); return added.id; },
        renderLine: (item: typeof draft.line_items[number], index: number) => h(WorkComposerLineItemRow, {
          key: item.id, line: item, index, itemLabel: 'invoice',
          onChange: (updates: object) => setDraft((d: typeof draft) => ({ ...d, line_items: d.line_items.map((old: typeof item) => old.id === item.id ? { ...old, ...updates } : old) })),
          onRemove: () => setDraft((d: typeof draft) => ({ ...d, line_items: d.line_items.filter((old: typeof item) => old.id !== item.id) })),
        }),
      })),
    );
  }
  const host = document.createElement('div');
  // Keep the application root separate: its async startup cannot replace the fixture.
  document.body.replaceChildren(host);
  createRoot(host).render(h(React.StrictMode, null, h(Harness)));
}
