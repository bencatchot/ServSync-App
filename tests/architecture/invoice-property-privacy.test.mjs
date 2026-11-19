import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = await readFile(new URL('../../src/features/invoices/invoicePdfAddress.ts', import.meta.url), 'utf8');
const { connectedInvoiceHomeDisplay, contractorInvoiceServiceAddress } = await import(
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);
const home = { id: 'fictional-home', nickname: 'Private fictional nickname', address_line1: '10 Fictional Street', address_line2: 'Unit 2', city: 'Example', state: 'AL', zip_code: '00000' };
const connection = { status: 'active', homeowner_user_id: 'fictional-owner', permissions: { share_address: true, share_home_overview: true }, homes: [home] };
const invoice = { homeowner_user_id: 'fictional-owner', home_id: home.id };
const empty = { serviceLabel: '', serviceAddress: '' };

test('explicit per-property false hides stale label and address despite aggregate true', () => {
  const withheld = { ...home, share_address: false, share_home_overview: false };
  assert.deepEqual(connectedInvoiceHomeDisplay(withheld, connection), empty);
  assert.deepEqual(contractorInvoiceServiceAddress(invoice, { ...connection, homes: [withheld] }), empty);
  const display = connectedInvoiceHomeDisplay(withheld, connection);
  assert.equal(display.serviceLabel || display.serviceAddress.split('\n')[0] || 'Property 1', 'Property 1');
});

test('nickname and address consent remain independent and legacy fallback is retained', () => {
  assert.equal(connectedInvoiceHomeDisplay({ ...home, share_address: false }, connection).serviceAddress, '');
  assert.equal(connectedInvoiceHomeDisplay({ ...home, share_home_overview: false }, connection).serviceLabel, '');
  assert.equal(connectedInvoiceHomeDisplay({ ...home, share_home_overview: false }, connection).serviceAddress.split('\n')[0], home.address_line1);
  assert.equal(connectedInvoiceHomeDisplay(home, connection).serviceLabel, home.nickname);
  assert.deepEqual(connectedInvoiceHomeDisplay(home, { ...connection, permissions: { share_address: false, share_home_overview: false } }), empty);
  assert.deepEqual(connectedInvoiceHomeDisplay(home, { ...connection, permissions: {} }), empty);
  assert.deepEqual(connectedInvoiceHomeDisplay(home, { ...connection, status: 'revoked' }), empty);
});

test('selector uses the same privacy-filtered display as PDFs and a neutral fallback', async () => {
  const ui = await readFile(new URL('../../src/features/invoices/InvoicePropertyField.tsx', import.meta.url), 'utf8');
  assert.match(ui, /connection \? connectedInvoiceHomeDisplay\(home, connection\) : null/);
  assert.ok(ui.includes('display.serviceLabel || display.serviceAddress.split'));
  assert.ok(ui.includes('label || `Property ${index + 1}`'));
});
