// Shared UI contract. The fixture implements this in memory; production authorization
// must use the authenticated server subject, never a client role, job ID or this UI.
export const categories = ['Materials', 'Labor', 'Subcontractors', 'Equipment', 'Permits', 'Other'] as const;
export type Category = typeof categories[number];
export type Scope = { kind: 'estimate' | 'job'; id: string };
export type Entry = { id: string; amountCents: number; vendor: string; day: string; category: Category; hasReceipt: boolean; cursor?: string };
export type Submission = Omit<Entry, 'id' | 'hasReceipt'> & { requestId: string; receipt?: File };
export type LedgerView = { kind: 'unavailable' } | { kind: 'capture' } | {
  kind: 'manage'; entries: Entry[]; costsCents: number; acceptedPreTaxCents: number | null; projectedGrossCents: number | null; loadMore?: () => Promise<void>;
};
export const receiptLimit = 3 * 1024 * 1024;

export function centsFromText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [dollars, fraction = ''] = trimmed.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 && cents <= 2147483647 ? cents : null;
}

export function validateSubmission(s: Submission) {
  if (!Number.isSafeInteger(s.amountCents) || s.amountCents <= 0 || s.amountCents > 2147483647) throw Error('Enter a positive amount with up to two decimal places.');
  const date = new Date(s.day + 'T12:00:00Z');
  if (!/^\d{4}-\d\d-\d\d$/.test(s.day) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== s.day) throw Error('Choose a valid purchase date.');
  if (!categories.includes(s.category) || s.vendor.length > 140 || !s.requestId.trim()) throw Error('Check the category and vendor.');
  if (s.receipt && (!['image/jpeg','image/png'].includes(s.receipt.type) || s.receipt.size < 1 || s.receipt.size > receiptLimit)) throw Error('Use a JPG or PNG receipt at most 3 MB.');
}

export interface ExpenseGateway {
  read(scope: Scope): LedgerView;
  submit(scope: Scope, input: Submission): void | Promise<void>;
  receipt(scope: Scope, entryId: string): File | null | Promise<File | null>;
  void(scope: Scope, entryId: string): void | Promise<void>;
}
