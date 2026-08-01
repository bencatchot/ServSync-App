import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractorPriceBookWorkspace, type ContractorPriceBookItemDraft, type PriceBookLoadState } from '../../../src/features/price-book/ContractorPriceBookWorkspace';
import { ContractorWorkDashboard } from '../../../src/features/work/ContractorWorkDashboard';
import type { ContractorPriceBookItem } from '../../../src/types';

function item(index: number): ContractorPriceBookItem {
  return {
    id: `item-${index}`,
    contractor_id: 'contractor-1',
    title: `Item ${String(index).padStart(3, '0')}`,
    customer_description: '',
    internal_notes: '',
    trade: index % 2 === 0 ? 'HVAC' : 'Plumbing',
    category: index % 3 === 0 ? 'Service' : 'Repair',
    line_type: index % 2 === 0 ? 'labor' : 'material',
    unit: 'each',
    default_unit_price_cents: index * 100,
    taxable: true,
    labor_hours: null,
    sku: `SKU-${index}`,
    source: 'manual',
    active: true,
    archived_at: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
  };
}

const blankDraft: ContractorPriceBookItemDraft = {
  title: '',
  customer_description: '',
  internal_notes: '',
  trade: '',
  category: '',
  line_type: 'labor',
  unit: '',
  default_unit_price: '',
  taxable: true,
  labor_hours: '',
  sku: '',
  active: true,
};

export function renderPriceBookWorkspace({
  count = 0,
  canManage = false,
  loadState = 'ready',
  formOpen = false,
}: {
  count?: number;
  canManage?: boolean;
  loadState?: PriceBookLoadState;
  formOpen?: boolean;
} = {}) {
  return renderToStaticMarkup(
    createElement(ContractorPriceBookWorkspace, {
      items: Array.from({ length: count }, (_, index) => item(index)),
      contractorSaved: true,
      canManage,
      loadState,
      loadError: loadState === 'error' ? 'Read failed safely.' : '',
      draft: blankDraft,
      setDraft: () => undefined,
      formOpen,
      editingItemId: null,
      savingItem: false,
      togglingItemId: null,
      csvTools: createElement('div', { 'data-testid': 'csv-controls' }, 'CSV controls'),
      onBack: () => undefined,
      onRetry: () => undefined,
      onOpenAddForm: () => undefined,
      onCancelForm: () => undefined,
      onSave: () => undefined,
      onEdit: () => undefined,
      onToggleActive: () => undefined,
    }),
  );
}

export function renderContractorJobsOverview(canViewPriceBook: boolean) {
  return renderToStaticMarkup(
    createElement(ContractorWorkDashboard, {
      loading: false,
      draftSummary: { status: 'ready', count: 0 },
      canReadDrafts: false,
      canStartDraft: false,
      canUseTemplates: false,
      canUseServicePlans: false,
      canViewPriceBook,
      estimateCount: 0,
      activeJobCount: 0,
      invoiceCount: 0,
      needsAttentionCount: 0,
      onViewNeedsAttention: () => undefined,
      onViewDrafts: () => undefined,
      onViewEstimates: () => undefined,
      onViewActiveJobs: () => undefined,
      onViewInvoices: () => undefined,
      onStartNewDraft: () => undefined,
      onOpenTemplates: () => undefined,
      onOpenServicePlans: () => undefined,
      onOpenCustomPricing: () => undefined,
    }),
  );
}
