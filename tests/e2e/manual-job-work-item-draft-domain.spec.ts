import { expect, test } from '@playwright/test';
import type { JobWorkItem } from '../../src/types';
import {
  createBlankManualJobWorkItemDraft,
  manualJobWorkItemDraftFromRecord,
  manualJobWorkItemRpcPayload,
} from '../../src/features/work/manualJobWorkItemDraft';
import { sourceFile } from '../helpers/source-contract.mjs';

function workItem(overrides: Partial<JobWorkItem> = {}): JobWorkItem {
  return {
    id: 'work-item-1',
    inspection_id: 'job-1',
    contractor_id: 'contractor-1',
    source_type: 'manual',
    source_key: null,
    source_room_id: null,
    source_finding_id: null,
    source_estimate_line_item_id: null,
    reserved_invoice_id: null,
    invoiced_invoice_id: null,
    title: 'Replace filter',
    description: 'Replace the filter.',
    customer_description: 'Install a new filter.',
    internal_notes: 'Use truck stock.',
    line_type: 'material',
    quantity: 2,
    unit: 'each',
    unit_price_cents: 1_250,
    labor_hours: 0.5,
    billable: true,
    completion_status: 'open',
    billing_status: 'unbilled',
    work_state: 'open',
    approval_required: false,
    approval_status: 'not_required',
    sort_order: 0,
    created_at: '2026-08-18T12:00:00.000Z',
    updated_at: '2026-08-18T12:00:00.000Z',
    ...overrides,
  };
}

test.describe('Manual Job work-item draft domain', () => {
  test('owns draft hydration and RPC payload policy outside the App shell', () => {
    const appSource = sourceFile('src/App.tsx');
    const domainSource = sourceFile('src/features/work/manualJobWorkItemDraft.ts');

    expect(appSource).toContain("from './features/work/manualJobWorkItemDraft'");
    expect(appSource).not.toContain('function parseManualJobWorkItemNumber(');
    expect(appSource).not.toContain('const manualWorkItemRpcPayload =');
    expect(domainSource).toContain('export function manualJobWorkItemDraftFromRecord(');
    expect(domainSource).toContain('export function manualJobWorkItemRpcPayload(');
  });

  test('starts a new manual work item with the existing billable each-item defaults', () => {
    expect(createBlankManualJobWorkItemDraft()).toEqual({
      title: '',
      customer_description: '',
      internal_notes: '',
      line_type: 'other',
      quantity: '1',
      unit: 'each',
      unit_price: '',
      labor_hours: '',
      billable: true,
      completion_status: 'open',
    });
  });

  test('hydrates editable persisted values while preserving blank price and status semantics', () => {
    expect(manualJobWorkItemDraftFromRecord(workItem())).toMatchObject({
      title: 'Replace filter',
      customer_description: 'Install a new filter.',
      line_type: 'material',
      quantity: '2',
      unit_price: '12.50',
      labor_hours: '0.5',
      billable: true,
      completion_status: 'open',
    });

    expect(manualJobWorkItemDraftFromRecord(workItem({
      customer_description: '',
      description: 'Fallback description.',
      line_type: 'equipment',
      unit_price_cents: null,
      labor_hours: null,
      billable: true,
      billing_status: 'not_billable',
      completion_status: 'removed',
    }))).toMatchObject({
      customer_description: 'Fallback description.',
      line_type: 'material',
      unit_price: '',
      labor_hours: '',
      billable: false,
      completion_status: 'removed',
    });
  });

  test('maps one valid draft to the exact normalized RPC payload', () => {
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({
      title: '  Replace  filter  ',
      customer_description: 'install the new filter',
      internal_notes: 'use truck stock',
      line_type: 'material',
      quantity: '1.239',
      unit: '  filter  ',
      unit_price: ' $1,234.50 ',
      labor_hours: '0.256',
      completion_status: 'completed',
    }))).toEqual({
      payload: {
        p_title: 'Replace filter',
        p_customer_description: 'Install the new filter.',
        p_internal_notes: 'Use truck stock.',
        p_line_type: 'material',
        p_quantity: 1.24,
        p_unit: 'filter',
        p_unit_price_cents: 123_450,
        p_labor_hours: 0.26,
        p_billable: true,
        p_completion_status: 'completed',
      },
    });
  });

  test('keeps blank and zero price distinct and retains the default unit', () => {
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Unpriced work', unit: ' ' }))).toMatchObject({
      payload: { p_unit: 'each', p_unit_price_cents: null },
    });
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Included work', unit_price: '0' }))).toMatchObject({
      payload: { p_unit_price_cents: 0 },
    });
  });

  test('blocks missing and malformed required quantities with unchanged copy', () => {
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Work', quantity: '' }))).toEqual({ error: 'Quantity is required.' });
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Work', quantity: 'one' }))).toEqual({ error: 'Quantity must be a positive number or 0.' });
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Work', quantity: '-1' }))).toEqual({ error: 'Quantity cannot be negative.' });
  });

  test('blocks blank titles and invalid price inputs with unchanged copy', () => {
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft())).toEqual({ error: 'Enter a work item title.' });
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Work', unit_price: '1.234' }))).toEqual({
      error: 'Unit price must be blank, 0, or a positive dollar amount.',
    });
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Work', unit_price: '-1' }))).toEqual({
      error: 'Unit price cannot be negative.',
    });
  });

  test('blocks invalid optional labor hours and never sends removed as an update state', () => {
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Work', labor_hours: '-0.5' }))).toEqual({
      error: 'Labor hours cannot be negative.',
    });
    expect(manualJobWorkItemRpcPayload(createBlankManualJobWorkItemDraft({ title: 'Work', completion_status: 'removed' }))).toMatchObject({
      payload: { p_completion_status: 'open' },
    });
  });
});
