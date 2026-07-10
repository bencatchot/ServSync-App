import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('homeowner filed invoice Home History next step', () => {
  test('filed invoice cards show the Home History next action without requiring paid status', () => {
    const source = appSource();
    const invoiceCardSource = sourceBetween(source, 'const renderHomeownerInvoiceCard =', 'const renderHomeownerEstimateCard =');
    const invoiceActionsSource = sourceBetween(invoiceCardSource, '<div className={`mt-3 ${mobileActionRowClass()}`}>', '{isOpen && (');

    expect(invoiceCardSource).toContain('const filedInvoiceHomeHistoryEntry = maintenanceLog.find(entry => entry.invoice_id === invoice.id) ?? null;');
    expect(invoiceCardSource).toContain('const invoiceFiled = Boolean(filedInvoiceHomeHistoryEntry);');
    expect(invoiceActionsSource).toContain('{invoiceFiled && (');
    expect(invoiceActionsSource).toContain('data-testid="homeowner-view-filed-invoice-home-history"');
    expect(invoiceActionsSource).toContain('View Home History');
    expect(invoiceActionsSource).not.toContain("invoice.status === 'paid' && (");
  });

  test('filed invoice helper copy is compact and points to manual Home History reminders', () => {
    const source = appSource();
    const invoiceCardSource = sourceBetween(source, 'const renderHomeownerInvoiceCard =', 'const renderHomeownerEstimateCard =');
    const helperCopySource = sourceBetween(invoiceCardSource, 'data-testid="homeowner-invoice-filed-next-step-copy"', '</p>');

    expect(invoiceCardSource).toContain('data-testid="homeowner-invoice-filed-next-step-copy"');
    expect(helperCopySource).toContain('This invoice is saved in Home History. You can add a follow-up reminder there for future service.');
    expect(helperCopySource).toContain('text-xs leading-5');
    expect(helperCopySource).not.toContain('automatic reminder');
    expect(helperCopySource).not.toContain('recurring reminder');
    expect(helperCopySource).not.toContain('email');
    expect(helperCopySource).not.toContain('SMS');
    expect(helperCopySource).not.toContain('push');
  });

  test('View Home History uses existing navigation and does not create reminders or re-file invoices', () => {
    const source = appSource();
    const invoiceCardSource = sourceBetween(source, 'const renderHomeownerInvoiceCard =', 'const renderHomeownerEstimateCard =');
    const nextActionSource = sourceBetween(invoiceCardSource, 'const openFiledInvoiceHomeHistory = () => {', '};\n\n    return');

    expect(nextActionSource).toContain("setHomeownerTab('log')");
    expect(nextActionSource).toContain("setHomeownerMaintenancePropertyScope(filedHomeId ? 'all' : 'unassigned')");
    expect(nextActionSource).not.toContain('fileInvoiceToHomeHistory');
    expect(nextActionSource).not.toContain('openHomeReminderComposer');
    expect(nextActionSource).not.toContain(".from('home_reminders')");
    expect(nextActionSource).not.toContain('servsync_file_invoice_to_home_history');
    expect(source).toContain('data-testid="home-history-add-follow-up-reminder"');
  });

  test('eligible unfiled invoices keep the existing File to Home History action', () => {
    const source = appSource();
    const invoiceCardSource = sourceBetween(source, 'const renderHomeownerInvoiceCard =', 'const renderHomeownerEstimateCard =');

    expect(invoiceCardSource).toContain("const invoiceFileable = invoice.status !== 'draft' && invoice.status !== 'void';");
    expect(invoiceCardSource).toContain('data-testid="homeowner-file-invoice-to-home-history"');
    expect(invoiceCardSource).toContain("invoiceFiled ? 'Filed to Home History' : filingInvoiceId === invoice.id ? 'Filing...' : 'File to Home History'");
    expect(invoiceCardSource).toContain('onClick={() => void fileInvoiceToHomeHistory(invoice)}');
  });
});
