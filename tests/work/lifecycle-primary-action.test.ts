import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  estimateLifecycleNextStep,
  invoiceLifecycleNextStep,
  jobLifecycleNextStep,
  requestLifecycleNextStep,
} from '../../src/features/work/lifecyclePrimaryAction';

test('new requests expose one role-appropriate next step', () => {
  assert.equal(requestLifecycleNextStep({ canRespond: true, canManageJobOperations: true, hasServiceVisit: false }).id, 'respond_to_request');
  assert.equal(requestLifecycleNextStep({ canRespond: false, canManageJobOperations: true, hasServiceVisit: false }).id, 'start_service_visit');
  assert.equal(requestLifecycleNextStep({ canRespond: false, canManageJobOperations: true, hasServiceVisit: true }).id, 'open_service_visit');
  assert.equal(requestLifecycleNextStep({ canRespond: false, canManageJobOperations: false, hasServiceVisit: false }).id, 'review_request');
});

test('estimate next steps follow connection, lifecycle, and role authority', () => {
  assert.equal(estimateLifecycleNextStep({ status: 'draft', canManageEstimate: true, hasConnectedHomeowner: true, canCreateJob: true, hasLinkedJob: false }).id, 'send_estimate');
  assert.equal(estimateLifecycleNextStep({ status: 'draft', canManageEstimate: true, hasConnectedHomeowner: false, canCreateJob: true, hasLinkedJob: false }).id, 'edit_estimate');
  assert.equal(estimateLifecycleNextStep({ status: 'draft', canManageEstimate: false, hasConnectedHomeowner: true, canCreateJob: false, hasLinkedJob: false }).id, 'review_record');
  assert.equal(estimateLifecycleNextStep({ status: 'sent', canManageEstimate: true, hasConnectedHomeowner: true, canCreateJob: true, hasLinkedJob: false }).id, 'wait_for_homeowner');
  assert.equal(estimateLifecycleNextStep({ status: 'accepted', canManageEstimate: true, hasConnectedHomeowner: true, canCreateJob: true, hasLinkedJob: false }).id, 'create_job');
  assert.equal(estimateLifecycleNextStep({ status: 'accepted', canManageEstimate: true, hasConnectedHomeowner: true, canCreateJob: true, hasLinkedJob: true }).id, 'open_job');
  assert.equal(estimateLifecycleNextStep({ status: 'accepted', canManageEstimate: false, hasConnectedHomeowner: true, canCreateJob: false, hasLinkedJob: false }).id, 'review_record');
});

test('job next steps keep operational and billing authority separate', () => {
  assert.equal(jobLifecycleNextStep({ status: 'draft', canManageJobOperations: true, canManageFinancialActions: false, hasLinkedInvoice: false, hasDurableWorkItems: false }).id, 'start_work');
  assert.equal(jobLifecycleNextStep({ status: 'scheduled', canManageJobOperations: true, canManageFinancialActions: false, hasLinkedInvoice: false, hasDurableWorkItems: false }).id, 'continue_work');
  assert.equal(jobLifecycleNextStep({ status: 'in_progress', canManageJobOperations: true, canManageFinancialActions: false, hasLinkedInvoice: false, hasDurableWorkItems: true }).id, 'continue_work');
  assert.equal(jobLifecycleNextStep({ status: 'in_progress', canManageJobOperations: false, canManageFinancialActions: false, hasLinkedInvoice: false, hasDurableWorkItems: true }).id, 'review_record');
  assert.equal(jobLifecycleNextStep({ status: 'completed', canManageJobOperations: true, canManageFinancialActions: true, hasLinkedInvoice: false, hasDurableWorkItems: false }).id, 'create_invoice');
  assert.equal(jobLifecycleNextStep({ status: 'completed', canManageJobOperations: true, canManageFinancialActions: true, hasLinkedInvoice: true, hasDurableWorkItems: false }).id, 'open_invoice');
  assert.equal(jobLifecycleNextStep({ status: 'completed', canManageJobOperations: true, canManageFinancialActions: false, hasLinkedInvoice: false, hasDurableWorkItems: true }).id, 'review_record');
  assert.equal(jobLifecycleNextStep({ status: 'completed', canManageJobOperations: false, canManageFinancialActions: false, hasLinkedInvoice: false, hasDurableWorkItems: true }).id, 'review_record');
});

test('invoice next steps avoid local-recipient and read-only dead ends', () => {
  assert.equal(invoiceLifecycleNextStep({ status: 'draft', canManageFinancialActions: true, canRecordPayment: true, hasConnectedHomeowner: true }).id, 'send_invoice');
  assert.equal(invoiceLifecycleNextStep({ status: 'draft', canManageFinancialActions: true, canRecordPayment: true, hasConnectedHomeowner: false }).id, 'edit_invoice');
  assert.equal(invoiceLifecycleNextStep({ status: 'sent', canManageFinancialActions: true, canRecordPayment: true, hasConnectedHomeowner: true }).id, 'record_payment');
  assert.equal(invoiceLifecycleNextStep({ status: 'partially_paid', canManageFinancialActions: true, canRecordPayment: true, hasConnectedHomeowner: true }).id, 'record_payment');
  assert.equal(invoiceLifecycleNextStep({ status: 'sent', canManageFinancialActions: false, canRecordPayment: false, hasConnectedHomeowner: true }).id, 'review_record');
  assert.equal(invoiceLifecycleNextStep({ status: 'paid', canManageFinancialActions: true, canRecordPayment: true, hasConnectedHomeowner: true }).id, 'review_record');
  assert.equal(invoiceLifecycleNextStep({ status: 'void', canManageFinancialActions: true, canRecordPayment: true, hasConnectedHomeowner: true }).id, 'review_record');
});

test('accepted Estimate billing options remain secondary to the Job handoff', () => {
  const source = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const actionStart = source.indexOf('data-testid="contractor-create-schedule-invoice"');
  assert.notEqual(actionStart, -1);
  const actionMarkup = source.slice(actionStart, actionStart + 300);
  assert.match(actionMarkup, /scheduleButtonClass\('secondary'\)/);
  assert.doesNotMatch(actionMarkup, /scheduleButtonClass\('primary'\)/);
});
