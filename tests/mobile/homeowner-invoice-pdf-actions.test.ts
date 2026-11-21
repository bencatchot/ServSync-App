import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import type { Invoice } from '../../src/types';
import type { InvoicePdfContext } from '../../src/utils/pdfDocuments';
import { HomeownerInvoicePdfActions } from '../../src/features/invoices/HomeownerInvoicePdfActions';

const invoice = { id: 'fictional-invoice' } as Invoice;
const context = { contractorName: 'Fixture contractor', serviceLabel: 'Fixture home' } as InvoicePdfContext;
type ActionButton = ReactElement<{ onClick: () => void; children: ReactElement[] }>;
const settle = () => new Promise(resolve => setImmediate(resolve));

test('homeowner preview and download use the same exact invoice and context but separate actions', async () => {
  const calls: unknown[][] = [];
  const element = HomeownerInvoicePdfActions({
    invoice, context, buttonClass: 'secondary',
    onPreview: async (...args) => { calls.push(['preview', ...args]); },
    onDownload: async (...args) => { calls.push(['download', ...args]); },
    onError: () => assert.fail('unexpected error'),
  });
  const [preview, download] = element.props.children as ActionButton[];
  assert.equal(preview.type, 'button');
  assert.equal(download.type, 'button');
  preview.props.onClick();
  preview.props.onClick();
  await settle();
  assert.deepEqual(calls, [['preview', invoice, context], ['preview', invoice, context]]);
  download.props.onClick();
  await settle();
  assert.deepEqual(calls.at(-1), ['download', invoice, context]);
});

test('a preview failure reports an error and leaves download and a later preview available', async () => {
  let attempts = 0;
  let downloads = 0;
  const error = new Error('Fixture preview failure');
  const errors: unknown[][] = [];
  const element = HomeownerInvoicePdfActions({
    invoice, context, buttonClass: 'secondary',
    onPreview: async () => { if (++attempts === 1) throw error; },
    onDownload: async () => { downloads++; },
    onError: (...args) => { errors.push(args); },
  });
  const [preview, download] = element.props.children as ActionButton[];
  preview.props.onClick();
  await settle();
  assert.deepEqual(errors, [[error, 'Unable to preview invoice PDF.']]);
  download.props.onClick();
  preview.props.onClick();
  await settle();
  assert.equal(downloads, 1);
  assert.equal(attempts, 2);
  assert.equal(errors.length, 1);
});
