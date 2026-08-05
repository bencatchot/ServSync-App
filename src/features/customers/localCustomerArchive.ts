import type { ContractorLocalContact } from '../../types';
import { normalizeLocalCustomerSummaries } from './localCustomerDirectory';

export type LocalCustomerArchiveImpact = {
  draftCount: number;
  jobCount: number;
  estimateCount: number;
  unpaidInvoiceCount: number;
  inspectionCount: number;
  futureCalendarCount: number;
  projectCount: number;
  pendingInvitationCount: number;
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function boundedCount(value: unknown) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Archive impact response was invalid.');
  }
  return count;
}

export function normalizeLocalCustomerArchiveImpact(payload: unknown): LocalCustomerArchiveImpact {
  const row = asObject(payload);
  if (!row) throw new Error('Archive impact response was invalid.');
  return {
    draftCount: boundedCount(row.draft_count),
    jobCount: boundedCount(row.job_count),
    estimateCount: boundedCount(row.estimate_count),
    unpaidInvoiceCount: boundedCount(row.unpaid_invoice_count),
    inspectionCount: boundedCount(row.inspection_count),
    futureCalendarCount: boundedCount(row.future_calendar_count),
    projectCount: boundedCount(row.project_count),
    pendingInvitationCount: boundedCount(row.pending_invitation_count),
  };
}

export function normalizeArchivedLocalCustomers(payload: unknown, contractorId: string) {
  return normalizeLocalCustomerSummaries(payload, contractorId).filter(contact => (
    Boolean(contact.archived_at) || (contact.homes ?? []).some(home => Boolean(home.archived_at))
  ));
}

export function mergeLocalCustomerContext(
  active: ContractorLocalContact[],
  historical: ContractorLocalContact[],
  archived: ContractorLocalContact[],
) {
  const byId = new Map<string, ContractorLocalContact>();
  for (const contact of [...archived, ...historical, ...active]) {
    const existing = byId.get(contact.id);
    if (!existing) {
      byId.set(contact.id, contact);
      continue;
    }
    const homes = new Map((existing.homes ?? []).map(home => [home.id, home]));
    for (const home of contact.homes ?? []) homes.set(home.id, { ...homes.get(home.id), ...home });
    byId.set(contact.id, { ...existing, ...contact, homes: [...homes.values()] });
  }
  return [...byId.values()];
}

export function localCustomerIsEffectivelyArchived(contact: ContractorLocalContact, homeId?: string | null) {
  if (contact.archived_at) return true;
  if (!homeId) return false;
  return Boolean(contact.homes?.find(home => home.id === homeId)?.archived_at);
}

export function archiveImpactItems(impact: LocalCustomerArchiveImpact) {
  return [
    ['Saved Drafts', impact.draftCount],
    ['Open Jobs', impact.jobCount],
    ['Estimates', impact.estimateCount],
    ['Unpaid invoices', impact.unpaidInvoiceCount],
    ['Open inspections', impact.inspectionCount],
    ['Future calendar items', impact.futureCalendarCount],
    ['Active projects', impact.projectCount],
    ['Pending invitations', impact.pendingInvitationCount],
  ] as const;
}
