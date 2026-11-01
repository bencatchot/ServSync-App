import type { SupabaseClient } from '@supabase/supabase-js';
import type { SharedDraftComposerDraft } from '../drafts/draftComposerTypes';
import { createBlankSharedDraftComposerDraft } from '../drafts/draftComposerMappings';
import { createWorkComposerLineDraft } from '../work-composer/workComposerDrafts';
import { sanitizeSnapshot, validatePracticePreview, type PracticeSnapshot } from './contracts';

export type BusinessPracticeSetup = { version: number; capturedAt: string; snapshot: PracticeSnapshot };
export type PracticeHandoffRef = { storageKey: string; recordId: string };
export type PracticeHandoff = { phase: 'prepared' | 'save_started' | 'saved'; draft: SharedDraftComposerDraft; draftId?: string };
export class PracticeHandoffError extends Error {}
export type BusinessPracticeRecord = { handoff?: PracticeHandoff; id: string; setupVersion: number; draft: SharedDraftComposerDraft; handedOff: boolean };
export type BusinessPracticeSession = { schema: 1; setups: BusinessPracticeSetup[]; records: BusinessPracticeRecord[]; activeId: string | null };
export const emptyBusinessPractice = (): BusinessPracticeSession => ({ schema: 1, setups: [], records: [], activeId: null });

// Existing authenticated SELECT/RLS paths only. No customer data, costs, private notes or new RPC.
export async function loadBusinessPracticeSetup(client: SupabaseClient, contractorId: string, ownerId: string): Promise<PracticeSnapshot> {
  const [business, prices, templates] = await Promise.all([
    client.from('contractor_profiles').select('business_name,default_labor_rate_cents').eq('id', contractorId).eq('owner_user_id', ownerId).single(),
    client.from('contractor_price_book_items').select('id,title,customer_description,line_type,unit,default_unit_price_cents,labor_hours').eq('contractor_id', contractorId).eq('active', true).order('id').limit(501),
    client.from('estimate_templates').select('id,name,scope,line_items').eq('contractor_id', contractorId).order('id').limit(51),
  ]);
  if (business.error || prices.error || templates.error || !business.data) throw new Error('Business setup could not be read. Your existing Practice work is unchanged.');
  return sanitizeSnapshot({ business: { name: business.data.business_name, laborRate: business.data.default_labor_rate_cents == null ? '' : String(business.data.default_labor_rate_cents / 100) }, prices: (prices.data || []).map(p => ({ ...p, unit: p.unit || 'each' })), templates: templates.data || [] });
}

export function practiceRealDraft(input: SharedDraftComposerDraft): SharedDraftComposerDraft {
  const { draft } = validatePracticePreview(input);
  return createBlankSharedDraftComposerDraft({
    intended_output: 'estimate', subject_type: 'connected', title: draft.title, scope: draft.scope,
    labor_mode: draft.labor_mode, labor_rate: draft.labor_rate, job_labor_hours: draft.job_labor_hours,
    line_items: draft.line_items.map(line => createWorkComposerLineDraft({ line_type: line.line_type, line_title: line.line_title, description: line.line_title, customer_description: line.customer_description, quantity: line.quantity, unit: line.unit, unit_price: line.unit_price, labor_hours: line.labor_hours })),
  });
}

export function writeBusinessPractice(key: string, value: BusinessPracticeSession): BusinessPracticeSession {
  // Practice stays mounted while Work advances a handoff. Never let an older
  // component render downgrade that durable-in-this-tab Save fence or payload.
  const current = readBusinessPractice(key);
  const rank = { prepared: 0, save_started: 1, saved: 2 };
  const merged = { ...value, records: value.records.map(record => {
    const prior = current.records.find(r => r.id === record.id);
    if (!prior?.handedOff) return record;
    const next = record.handoff;
    const handoff = !prior.handoff || !next || rank[prior.handoff.phase] >= rank[next.phase]
      ? prior.handoff : { ...next, draft: prior.handoff.draft };
    return { ...record, handedOff: true, handoff };
  }) };
  if (current.records.some(r => r.handedOff && !merged.records.some(next => next.id === r.id))) throw new Error('Practice handoff history cannot be removed.');
  const text = JSON.stringify(merged);
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('This tab’s Practice storage limit is reached. Your current changes remain open; transfer is unavailable until storage works.');
  sessionStorage.setItem(key, text);
  return merged;
}

export function readBusinessPractice(key: string): BusinessPracticeSession {
  const raw = sessionStorage.getItem(key);
  if (!raw) return emptyBusinessPractice();
  if (raw.length > 1024 * 1024) throw new Error('Stored Practice data exceeds the supported limit.');
  const value = JSON.parse(raw) as BusinessPracticeSession;
  if (value.schema !== 1 || !Array.isArray(value.setups) || !Array.isArray(value.records) || value.setups.length > 10 || value.records.length > 20) throw new Error('Stored Practice data cannot be read. It has not been overwritten.');
  const setups = value.setups.map(setup => {
    if (!Number.isInteger(setup.version) || setup.version < 1 || !Number.isFinite(Date.parse(setup.capturedAt))) throw new Error('Invalid Practice setup version.');
    return { version: setup.version, capturedAt: setup.capturedAt, snapshot: sanitizeSnapshot(setup.snapshot) };
  });
  const records = value.records.map(record => {
    if (typeof record.id !== 'string' || !setups.some(s => s.version === record.setupVersion) || typeof record.handedOff !== 'boolean') throw new Error('Invalid Practice record.');
    if (record.handoff && (!['prepared', 'save_started', 'saved'].includes(record.handoff.phase) || !record.handoff.draft || (record.handoff.phase === 'saved' && !record.handoff.draftId))) throw new Error('Invalid Practice handoff.');
    const base = createBlankSharedDraftComposerDraft();
    if (!record.draft || Object.entries(base).some(([key, value]) => typeof value === 'string' && typeof record.draft[key as keyof SharedDraftComposerDraft] !== 'string') || !Array.isArray(record.draft.line_items) || record.draft.line_items.length > 100) throw new Error('Invalid Practice draft.');
    const lineShape = createWorkComposerLineDraft();
    if (record.draft.line_items.some(line => !line || Object.keys(lineShape).some(key => typeof line[key as keyof typeof line] !== 'string'))) throw new Error('Invalid Practice line.');
    return { ...record, handoff: record.handoff ? { ...record.handoff, draft: practiceRealDraft(record.handoff.draft) } : undefined, draft: { ...record.draft, intended_output: 'estimate' as const, work_format: 'standard' as const, subject_type: 'local' as const, local_contact_id: 'practice-customer', local_home_id: 'practice-property', homeowner_user_id: '', home_id: '', service_request_id: '', notes: '', checklist_source: null } };
  });
  if (new Set(records.map(r => r.id)).size !== records.length || new Set(setups.map(s => s.version)).size !== setups.length) throw new Error('Duplicate Practice identities.');
  return { schema: 1, setups, records, activeId: records.some(r => r.id === value.activeId) ? value.activeId : null };
}

// A same-tab journal, not a server importer or cross-device receipt. Persist the
// fence before the first real Save RPC; ambiguous outcomes must never replay it.
export function beginPracticeHandoffSave(ref: PracticeHandoffRef) {
  try {
    const session = readBusinessPractice(ref.storageKey);
    const record = session.records.find(r => r.id === ref.recordId);
    if (!record?.handoff || record.handoff.phase !== 'prepared') throw new Error('fenced');
    writeBusinessPractice(ref.storageKey, { ...session, records: session.records.map(r => r.id === ref.recordId ? { ...r, handoff: { ...record.handoff!, phase: 'save_started' } } : r) });
  } catch {
    throw new PracticeHandoffError('This Practice handoff cannot safely start another save. Check saved Drafts in Work before proceeding; the earlier save may have completed, or tab storage is unavailable.');
  }
}
export function completePracticeHandoffSave(ref: PracticeHandoffRef, draftId: string) {
  // If storage fails after a successful server response, retain the earlier
  // save_started fence. The canonical editor can still show the saved Draft.
  try {
    const session = readBusinessPractice(ref.storageKey);
    writeBusinessPractice(ref.storageKey, { ...session, records: session.records.map(r => r.id === ref.recordId && r.handoff ? { ...r, handoff: { ...r.handoff, phase: 'saved', draftId } } : r) });
  } catch { /* Existing fence prevents a duplicate initial save. */ }
}
