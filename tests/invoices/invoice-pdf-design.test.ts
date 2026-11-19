import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInvoicePdf, type InvoicePdfContext } from '../../src/utils/pdfDocuments';
import { contractorInvoiceServiceAddress, homeownerInvoiceServiceAddress } from '../../src/features/invoices/invoicePdfAddress';
import type { ContractorConnectedHomeowner, ContractorLocalContact, HomeProfile, Invoice } from '../../src/types';

const date = '2026-11-19T12:00:00Z';
const home = { home_type: '', year_built: '', square_feet: '', notes: '', home_photo_path: '', created_at: date, updated_at: date, id: 'fictional-property-2', nickname: 'Fictional Bay Cottage', address_line1: '82 Demo Lane', address_line2: 'Unit 4', city: 'Spanish Fort', state: 'AL', zip_code: '36527', homeowner_user_id: 'fictional-owner', share_address: true, share_home_overview: true };
const otherHome = { ...home, id: 'fictional-property-1', nickname: 'Other fictional property', address_line1: '99 Wrong Property Road' };
const connection: ContractorConnectedHomeowner = { connection_id: 'fictional-connection', display_name: 'Fictional Jordan', phone: '', city: '', state: '', zip_code: '', created_at: date, updated_at: date, source: 'fictional', homeowner_user_id: 'fictional-owner', status: 'active', permissions: { share_address: true, share_home_overview: true, share_contact: false, share_preferred_vendors: false, share_photos: false }, homes: [otherHome, home], home: otherHome };
const local: ContractorLocalContact = { display_name: 'Fictional Jordan', phone: '', email: '', notes: '', created_at: date, updated_at: date, id: 'fictional-contact', contractor_id: 'fictional-business', homes: [otherHome, home].map(h => ({ ...h, local_contact_id: 'fictional-contact', contractor_id: 'fictional-business' })) };
function invoice(overrides: Partial<Invoice> = {}): Invoice {
  const line_items = [
    ['System diagnostic', 'Checked airflow, controls, and condensate drainage.', 32500, 1],
    ['Air handler repair', 'Replaced the damaged blower assembly.', 54000, 1],
    ['Return air grille', 'Installed customer-approved replacement grilles.', 8500, 2],
    ['Startup and verification', 'Ran the system and verified normal operation.', 9500, 1],
  ].map(([title, detail, price, quantity], index) => ({ id: `fictional-line-${index}`, invoice_id: 'fictional-invoice', line_type: 'material' as const, description: String(title), line_title: String(title), customer_description: String(detail), model_spec: '', supply_status: null, quantity: Number(quantity), unit: 'each', unit_price_cents: Number(price), sort_order: index, created_at: date, updated_at: date }));
  return { id: 'fictional-invoice', contractor_id: 'fictional-business', homeowner_user_id: 'fictional-owner', local_contact_id: null, service_request_id: null, job_id: null, estimate_id: null, home_id: home.id, local_home_id: null, invoice_number: 'DEMO-1048', invoice_type: 'total', title: 'Fictional air handler repair', scope: 'Fictional demonstration only - not for payment.', status: 'partially_paid', subtotal_cents: 113000, total_cents: 117068, tax_cents: 4068, discount_cents: 0, amount_paid_cents: 35000, issued_at: date, due_at: '2026-12-03', paid_at: null, voided_at: null, notes: '', terms: '', created_at: date, updated_at: date, line_items, ...overrides };
}
const context: InvoicePdfContext = { contractorName: 'Fictional Bayline Home Services', contractorPhone: '(251) 555-0142', contractorEmail: 'billing@example.test', contractorAddress: '410 Example Parkway, Suite 100\nFairhope, AL 36532', customerName: 'Fictional Jordan Taylor', ...contractorInvoiceServiceAddress(invoice(), connection) };

// No real records, network, credentials, or persistence are used.
test('exact connected property and per-property consent beat default, snapshot and aggregate permission', () => {
  assert.equal(context.serviceLabel, home.nickname);
  assert.equal(context.serviceAddress, '82 Demo Lane\nUnit 4\nSpanish Fort, AL 36527');
  for (const changes of [{ home_id: null }, { home_id: 'missing' }, { homeowner_user_id: 'someone-else' }]) assert.deepEqual(contractorInvoiceServiceAddress(invoice(changes), connection), { serviceAddress: '', serviceLabel: '' });
  assert.equal(contractorInvoiceServiceAddress(invoice(), { ...connection, status: 'revoked' }).serviceAddress, '');
  const withheld = { ...connection, homes: [{ ...home, share_address: false, share_home_overview: false }] };
  assert.deepEqual(contractorInvoiceServiceAddress(invoice({ home_address: 'Stale private snapshot' }), withheld), { serviceAddress: '', serviceLabel: '' });
  const partial = { ...connection, homes: [{ ...home, address_line1: '', address_line2: '', zip_code: '' }] };
  assert.equal(contractorInvoiceServiceAddress(invoice(), partial).serviceAddress, 'Spanish Fort, AL');
});
test('local and homeowner lookup enforce the exact customer and property owner', () => {
  const record = invoice({ homeowner_user_id: null, home_id: null, local_contact_id: local.id, local_home_id: home.id });
  assert.equal(contractorInvoiceServiceAddress(record, null, local).serviceAddress, context.serviceAddress);
  assert.equal(contractorInvoiceServiceAddress({ ...record, local_contact_id: 'wrong-contact' }, null, local).serviceAddress, '');
  assert.equal(contractorInvoiceServiceAddress({ ...record, contractor_id: 'wrong-business' }, null, local).serviceAddress, '');
  assert.equal(contractorInvoiceServiceAddress({ ...record, local_home_id: null }, null, local).serviceAddress, '');
  assert.equal(homeownerInvoiceServiceAddress(invoice(), [otherHome, home] as HomeProfile[], 'fictional-owner').serviceAddress, context.serviceAddress);
  assert.equal(homeownerInvoiceServiceAddress(invoice(), [home] as HomeProfile[], 'wrong-owner').serviceAddress, '');
  assert.equal(homeownerInvoiceServiceAddress(invoice(), [{ ...home, homeowner_user_id: 'wrong-owner' }] as HomeProfile[], 'fictional-owner').serviceAddress, '');
});

test('actual Letter PDFs preserve amounts, full details, statuses and address semantics', async () => {
  const output = process.env.INVOICE_PDF_OUTPUT || await mkdtemp(join(tmpdir(), 'servsync-invoice-pdf-'));
  await mkdir(output, { recursive: true });
  const multiLines = Array.from({ length: 16 }, (_, i) => ({ ...invoice().line_items![i % 4], id: `fictional-long-${i}`, line_title: `Fictional work item ${i + 1}`, customer_description: `Detail ${i + 1}: Preserve this complete customer-visible description without truncation.`, model_spec: 'Fictional model 24', supply_status: 'contractor_supplied' as const, sort_order: i }));
  const multiSubtotal = multiLines.reduce((sum, line) => sum + line.quantity * line.unit_price_cents!, 0);
  const cases: Array<[string, Invoice, InvoicePdfContext]> = [
    ['short', invoice(), context],
    ['multiple-pages', invoice({ line_items: multiLines, subtotal_cents: multiSubtotal, total_cents: multiSubtotal + 4068 }), context],
    ['missing-address', invoice({ home_id: null }), { ...context, ...contractorInvoiceServiceAddress(invoice({ home_id: null }), connection) }],
    ['withheld-address', invoice(), { ...context, ...contractorInvoiceServiceAddress(invoice(), { ...connection, homes: [{ ...home, share_address: false }] }) }],
    ['paid', invoice({ status: 'paid', amount_paid_cents: 117068, paid_at: date }), context],
    ['void', invoice({ status: 'void', voided_at: date }), context],
    ['distinct-billing', invoice(), { ...context, billingAddress: '24 Sample Court\nFairhope, AL 36532' }],
  ];
  for (const [name, record, ctx] of cases) {
    const before = JSON.stringify(record);
    const result = await createInvoicePdf(record, ctx);
    assert.equal(JSON.stringify(record), before);
    const path = join(output, `fictional-invoice-${name}.pdf`);
    await writeFile(path, Buffer.from(await result.blob.arrayBuffer()));
    const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
    const normal = text.replace(/\s+/g, ' ');
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
    assert.match(info, /612 x 792 pts \(letter\)/);
    assert.ok(normal.includes('Invoice Total'));
    assert.ok(normal.includes((record.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })));
    assert.ok(normal.includes('Amount Paid'));
    assert.ok(normal.includes('Powered by ServSync'));
    assert.ok(!normal.includes('coming soon'));
    assert.ok(!normal.includes('99 Wrong Property Road'));
    if (name === 'missing-address' || name === 'withheld-address') assert.ok(!normal.includes('82 Demo Lane') && !normal.includes('36527') && !normal.includes('Unit 4'));
    else assert.ok(normal.includes('82 Demo Lane') && normal.includes('Unit 4') && normal.includes('36527'));
    assert.equal(normal.includes('24 Sample Court'), name === 'distinct-billing');
    if (name === 'paid') { assert.match(info, /Pages:\s+1/); assert.match(normal, /PAID/); assert.match(normal, /No balance remains/); }
    if (name === 'void') { assert.match(normal, /VOID - NO PAYMENT DUE/); assert.match(normal, /No payment is due/); assert.ok(!normal.includes('Contact Fictional')); }
    if (name === 'multiple-pages') { assert.match(normal, /Continued/); assert.match(normal, /Fictional work item 16/); assert.match(normal, /Detail 16:/); assert.match(normal, /Model\/spec: Fictional model 24/); }
    if (name === 'short') { assert.match(info, /Pages:\s+1/); assert.match(normal, /820\.68/); }
  }
});

test('long single rows and backlog wrap without dropping the end of their text', async () => {
  const record = invoice({ line_items: [{ ...invoice().line_items![0], customer_description: 'Fictional long detail. '.repeat(500) + 'END OF LONG DETAIL' }], backlog_items: [{ id: 'fictional-backlog', title: 'Not yet done', description: 'Fictional backlog detail. '.repeat(200) + 'END OF BACKLOG', completion_status: 'open', billing_status: 'not_billable', not_included_reason: 'Not billed', sort_order: 0 } as NonNullable<Invoice['backlog_items']>[number]], notes: 'Fictional notes end', terms: 'Fictional terms end' });
  const result = await createInvoicePdf(record, context);
  const path = join(await mkdtemp(join(tmpdir(), 'servsync-long-pdf-')), 'long.pdf');
  await writeFile(path, Buffer.from(await result.blob.arrayBuffer()));
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
  for (const marker of ['END OF LONG DETAIL', 'END OF BACKLOG', 'Fictional notes end', 'Fictional terms end', 'not included in total']) assert.ok(text.includes(marker), marker);
});

test('all PDF action call sites use the exact resolver and no implicit invoice default remains', async () => {
  const source = await readFile('src/App.tsx', 'utf8');
  assert.match(source, /homeownerInvoiceServiceAddress\(invoice, homes, profile.id\)/);
  assert.match(source, /contractorInvoiceServiceAddress\(invoice, connection, local\)/);
  assert.equal((source.match(/\.\.\.service,/g) || []).length, 2);
  const begin = source.slice(source.indexOf('const beginInvoiceDraftForCustomer'), source.indexOf('const defaultEstimateDraftBuilderTrade'));
  const save = source.slice(source.indexOf('const invoiceSourceProperty'), source.indexOf('const openJobsForSelectedCustomer'));
  assert.ok(!begin.includes('defaultConnectedHomeId') && !begin.includes('defaultLocalHomeId'));
  assert.ok(!save.includes('defaultConnectedHomeId') && !save.includes('defaultLocalHomeId'));
});

test('discount, labor hours, fees, tax, backlog and unpriced lines keep their existing financial meaning', async () => {
  const record = invoice({ labor_mode: 'line_specific', labor_rate_cents: 10000, material_total_cents: 70000, labor_total_cents: 30000, fee_total_cents: 4000, other_total_cents: 0, subtotal_cents: 104000, tax_cents: 8000, discount_cents: 10000, total_cents: 102000, amount_paid_cents: 20000, line_items: [{ ...invoice().line_items![0], unit_price_cents: null, labor_hours: 3, model_spec: 'Fictional model', supply_status: 'customer_supplied' }] });
  const result = await createInvoicePdf(record, context);
  const path = join(await mkdtemp(join(tmpdir(), 'servsync-financial-pdf-')), 'financial.pdf');
  await writeFile(path, Buffer.from(await result.blob.arrayBuffer()));
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
  for (const marker of ['Price to be confirmed', '3 labor hrs', 'Labor hours: 3', 'Customer supplied', 'Discount', '$-100.00', '$1,020.00', '$200.00', '$820.00', '$80.00', '$40.00']) assert.ok(text.includes(marker), marker);
});
